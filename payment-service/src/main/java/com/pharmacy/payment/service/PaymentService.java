package com.pharmacy.payment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.pharmacy.common.PaymentStatus;
import com.pharmacy.payment.config.RazorpayConfig;
import com.pharmacy.payment.dto.PaymentOrderRequest;
import com.pharmacy.payment.dto.PaymentOrderResponse;
import com.pharmacy.payment.dto.PaymentVerificationRequest;
import com.pharmacy.payment.entity.PaymentEntity;
import com.pharmacy.payment.entity.PaymentEntity.Purpose;
import com.pharmacy.payment.repo.PaymentRepository;
import com.razorpay.Order;
import com.razorpay.RazorpayException;
import com.razorpay.Utils;

/**
 * Payments for orders, wallet top-ups and lab tests.
 *
 * <p>Ids tell the purpose apart: {@code WLT_<userId>_<n>} is a wallet top-up,
 * {@code LAB_<userId>_<n>} a lab test, anything else an order in order-service.
 * Order amounts always come from order-service, never from the browser.
 *
 * <p>Money moves only after Razorpay's signature is verified. Follow-up work (marking the
 * order paid, crediting the wallet) is recorded with {@code fulfilled}, so retrying a
 * verification finishes it without charging twice.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private static final long MIN_PAISE = 100;              // ₹1
    private static final long MAX_TOPUP_PAISE = 5_000_000;   // ₹50,000
    private static final Set<String> PAYABLE_ORDER_STATUSES = Set.of("CREATED", "FAILED");
    private static final Set<String> ONLINE_METHODS = Set.of("RAZORPAY", "UPI", "CARD", "NETBANKING", "PAYLATER");

    private final RazorpayConfig razorpay;
    private final PaymentRepository repo;
    private final ServiceClients services;

    public PaymentService(RazorpayConfig razorpay, PaymentRepository repo, ServiceClients services) {
        this.razorpay = razorpay;
        this.repo = repo;
        this.services = services;
    }

    // ------------------------------------------------------------------ create

    /** Creates a Razorpay order (or records a cash-on-delivery order) for the signed-in user. */
    public PaymentOrderResponse createOrder(PaymentOrderRequest request, String userId) throws RazorpayException {
        requireLogin(userId);
        String method = request.getPaymentMethod() == null ? "RAZORPAY" : request.getPaymentMethod().trim().toUpperCase();
        String orderId = request.getOrderId().trim();
        Purpose purpose = purposeOf(orderId);

        if ("WALLET".equals(method)) {
            throw new IllegalArgumentException("Wallet payments use /api/payments/wallet/pay");
        }
        long amountPaise = amountFor(purpose, orderId, request.getAmount(), userId);

        if ("COD".equals(method)) {
            if (purpose != Purpose.ORDER) {
                throw new IllegalArgumentException("Cash on delivery is only available for medicine orders");
            }
            PaymentEntity cod = newPayment(orderId, userId, purpose, "COD", amountPaise);
            repo.save(cod);
            log.info("COD recorded | orderId={} amount={}", orderId, amountPaise);
            return new PaymentOrderResponse("COD_" + orderId, razorpay.keyId(), amountPaise, "INR");
        }
        if (!ONLINE_METHODS.contains(method)) {
            throw new IllegalArgumentException("Unsupported payment method: " + method);
        }

        JSONObject options = new JSONObject();
        options.put("amount", amountPaise);
        options.put("currency", "INR");
        options.put("receipt", receiptFor(orderId));
        options.put("notes", new JSONObject().put("orderId", orderId).put("userId", userId));
        Order rzpOrder = razorpay.client().orders.create(options);
        String rzpOrderId = rzpOrder.get("id");

        PaymentEntity payment = newPayment(orderId, userId, purpose, method, amountPaise);
        payment.setRazorpayOrderId(rzpOrderId);
        repo.save(payment);
        log.info("Razorpay order created | razorpayOrderId={} orderId={} amount={} purpose={}",
                rzpOrderId, orderId, amountPaise, purpose);
        return new PaymentOrderResponse(rzpOrderId, razorpay.keyId(), amountPaise, "INR");
    }

    // ------------------------------------------------------------------ verify

    /**
     * Checks Razorpay's signature, marks the payment successful, then marks the order
     * paid or credits the wallet. Safe to call again for the same payment.
     */
    public PaymentStatus verifyPayment(PaymentVerificationRequest request) {
        PaymentEntity payment = repo.findByRazorpayOrderId(request.getRazorpayOrderId())
                .orElseThrow(() -> new IllegalArgumentException("Payment not found"));

        if (payment.getPaymentStatus() != PaymentStatus.SUCCESS) {
            if (!signatureValid(request)) {
                payment.setPaymentStatus(PaymentStatus.FAILED);
                repo.save(payment);
                log.warn("Signature check failed | razorpayOrderId={}", request.getRazorpayOrderId());
                throw new IllegalArgumentException("We couldn't confirm this payment. If money was taken, it will be refunded by Razorpay.");
            }
            payment.setRazorpayPaymentId(request.getRazorpayPaymentId());
            payment.setRazorpaySignature(request.getRazorpaySignature());
            payment.setPaymentStatus(PaymentStatus.SUCCESS);
            repo.save(payment);
            log.info("Payment verified | paymentId={} orderId={}", request.getRazorpayPaymentId(), payment.getOrderId());
        } else if (!request.getRazorpayPaymentId().equals(payment.getRazorpayPaymentId())) {
            throw new IllegalArgumentException("This order was already paid with a different payment");
        }

        fulfil(payment);
        return payment.getPaymentStatus();
    }

    private boolean signatureValid(PaymentVerificationRequest request) {
        try {
            JSONObject attributes = new JSONObject();
            attributes.put("razorpay_order_id", request.getRazorpayOrderId());
            attributes.put("razorpay_payment_id", request.getRazorpayPaymentId());
            attributes.put("razorpay_signature", request.getRazorpaySignature());
            return Utils.verifyPaymentSignature(attributes, razorpay.keySecret());
        } catch (RazorpayException ex) {
            return false;
        }
    }

    /** Marks the order paid / credits the wallet once. Stock updates are best-effort. */
    private void fulfil(PaymentEntity payment) {
        if (payment.isFulfilled()) {
            return;
        }
        try {
            switch (payment.getPurpose() == null ? purposeOf(payment.getOrderId()) : payment.getPurpose()) {
                case WALLET_TOPUP -> services.creditWallet(walletOwner(payment), rupees(payment.getAmount()));
                case ORDER -> {
                    services.markOrderPaid(payment.getOrderId());
                    reduceStockQuietly(payment.getOrderId());
                }
                case LAB_TEST -> { /* the browser books the slot after a successful payment */ }
            }
        } catch (RuntimeException ex) {
            log.error("Payment {} succeeded but follow-up failed: {}", payment.getId(), ex.getMessage());
            throw new FulfilmentException("Your payment went through, but we couldn't finish updating your "
                    + (payment.getPurpose() == Purpose.WALLET_TOPUP ? "wallet" : "order")
                    + ". Please try again in a moment; you won't be charged twice.");
        }
        payment.setFulfilled(true);
        repo.save(payment);
    }

    // ------------------------------------------------------------------ wallet

    /**
     * Pays an order or lab test from the wallet. {@code amountPaise} is only used for lab
     * tests; orders are charged their total from order-service.
     */
    public PaymentEntity payWithWallet(String orderId, long amountPaise, String userId) {
        requireLogin(userId);
        Purpose purpose = purposeOf(orderId);
        if (purpose == Purpose.WALLET_TOPUP) {
            throw new IllegalArgumentException("A wallet top-up can't be paid from the wallet");
        }
        List<PaymentEntity> paid = repo.findByOrderIdAndPaymentStatus(orderId, PaymentStatus.SUCCESS);
        if (!paid.isEmpty()) {
            return paid.get(0);
        }
        long amount = amountFor(purpose, orderId, amountPaise, userId);

        services.debitWallet(userId, rupees(BigDecimal.valueOf(amount)));
        PaymentEntity payment = newPayment(orderId, userId, purpose, "WALLET", amount);
        payment.setPaymentStatus(PaymentStatus.SUCCESS);
        repo.save(payment);
        log.info("Wallet payment | orderId={} amount={} userId={}", orderId, amount, userId);

        if (purpose == Purpose.ORDER) {
            try {
                services.markOrderPaid(orderId);
            } catch (RuntimeException ex) {
                // Give the money back rather than leave the customer charged for an unpaid order.
                services.creditWallet(userId, rupees(BigDecimal.valueOf(amount)));
                payment.setPaymentStatus(PaymentStatus.FAILED);
                repo.save(payment);
                throw new IllegalStateException("Couldn't complete the wallet payment. Your balance was not charged.");
            }
            reduceStockQuietly(orderId);
        }
        payment.setFulfilled(true);
        return repo.save(payment);
    }

    /** Refunds a cancelled, already-paid order to the customer's wallet. Returns the rupees refunded (0 if nothing was paid). */
    public BigDecimal refundToWallet(String orderId, String userId) {
        requireLogin(userId);
        Map<String, Object> order = services.getOrder(orderId);
        if (!userId.equals(String.valueOf(order.get("userId")))) {
            throw new SecurityException("This order belongs to another account");
        }
        if (!"CANCELLED".equals(String.valueOf(order.get("status")))) {
            throw new IllegalArgumentException("Only cancelled orders can be refunded");
        }
        BigDecimal total = BigDecimal.ZERO;
        for (PaymentEntity p : repo.findByOrderIdAndPaymentStatus(orderId, PaymentStatus.SUCCESS)) {
            // Mark refunded first so a double click can't refund twice.
            p.setPaymentStatus(PaymentStatus.REFUNDED);
            p.setRefundedAt(LocalDateTime.now());
            repo.save(p);
            try {
                services.creditWallet(userId, rupees(p.getAmount()));
            } catch (RuntimeException ex) {
                p.setPaymentStatus(PaymentStatus.SUCCESS);
                p.setRefundedAt(null);
                repo.save(p);
                throw ex;
            }
            total = total.add(rupees(p.getAmount()));
            log.info("Refunded to wallet | orderId={} amount={} userId={}", orderId, p.getAmount(), userId);
        }
        return total;
    }

    // ------------------------------------------------------------------ queries

    public List<PaymentEntity> paymentsOf(String userId) {
        requireLogin(userId);
        return repo.findByUserIdOrOrderIdStartingWithOrOrderIdStartingWithOrderByCreatedAtDesc(
                userId, "WLT_" + userId + "_", "LAB_" + userId + "_");
    }

    public List<PaymentEntity> getAllPayments() {
        return repo.findAll();
    }

    public PaymentEntity getPaymentById(String id) {
        return repo.findById(id).orElseThrow(() -> new IllegalArgumentException("Payment not found: " + id));
    }

    public PaymentEntity getPaymentByOrderId(String orderId) {
        return repo.findFirstByOrderIdOrderByCreatedAtDesc(orderId)
                .orElseThrow(() -> new IllegalArgumentException("No payment for order " + orderId));
    }

    /** Admin correction of a payment record. Does not move money. */
    public PaymentEntity updatePaymentStatus(String id, PaymentStatus newStatus) {
        PaymentEntity payment = getPaymentById(id);
        payment.setPaymentStatus(newStatus);
        return repo.save(payment);
    }

    // ------------------------------------------------------------------ helpers

    /** Amount in paise: the order total for orders, the requested amount for top-ups and lab tests. */
    private long amountFor(Purpose purpose, String orderId, long requestedPaise, String userId) {
        if (purpose == Purpose.ORDER) {
            Map<String, Object> order = services.getOrder(orderId);
            if (!userId.equals(String.valueOf(order.get("userId")))) {
                throw new SecurityException("This order belongs to another account");
            }
            String status = String.valueOf(order.get("status"));
            if (!PAYABLE_ORDER_STATUSES.contains(status)) {
                throw new IllegalArgumentException("CANCELLED".equals(status)
                        ? "This order was cancelled" : "This order is already paid");
            }
            Object total = order.get("totalAmount");
            if (!(total instanceof Number n)) {
                throw new IllegalArgumentException("This order has no total");
            }
            long paise = new BigDecimal(n.toString()).movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
            if (paise < MIN_PAISE) {
                throw new IllegalArgumentException("Order total must be at least ₹1");
            }
            return paise;
        }
        String prefix = (purpose == Purpose.WALLET_TOPUP ? "WLT_" : "LAB_") + userId + "_";
        if (!orderId.startsWith(prefix)) {
            throw new SecurityException("This payment belongs to another account");
        }
        if (requestedPaise < MIN_PAISE || requestedPaise > MAX_TOPUP_PAISE) {
            throw new IllegalArgumentException("Amount must be between ₹1 and ₹50,000");
        }
        return requestedPaise;
    }

    private static Purpose purposeOf(String orderId) {
        if (orderId.startsWith("WLT_")) return Purpose.WALLET_TOPUP;
        if (orderId.startsWith("LAB_")) return Purpose.LAB_TEST;
        return Purpose.ORDER;
    }

    private static String walletOwner(PaymentEntity payment) {
        if (payment.getUserId() != null) {
            return payment.getUserId();
        }
        String[] parts = payment.getOrderId().split("_");   // legacy rows: WLT_<userId>_<n>
        if (parts.length < 3) {
            throw new IllegalStateException("Can't tell whose wallet to credit");
        }
        return parts[1];
    }

    private static PaymentEntity newPayment(String orderId, String userId, Purpose purpose, String method, long paise) {
        PaymentEntity p = new PaymentEntity();
        p.setOrderId(orderId);
        p.setUserId(userId);
        p.setPurpose(purpose);
        p.setPaymentMethod(method);
        p.setAmount(BigDecimal.valueOf(paise));
        p.setCurrency("INR");
        p.setPaymentStatus(PaymentStatus.PENDING);
        return p;
    }

    /** Razorpay receipts are at most 40 characters. */
    private static String receiptFor(String orderId) {
        String tail = orderId.length() > 34 ? orderId.substring(orderId.length() - 34) : orderId;
        return "rcpt_" + tail;
    }

    private static BigDecimal rupees(BigDecimal paise) {
        return paise.movePointLeft(2).setScale(2, RoundingMode.HALF_UP);
    }

    private void reduceStockQuietly(String orderId) {
        try {
            services.reduceStock(orderId);
        } catch (RuntimeException ex) {
            log.warn("Stock not reduced for paid order {}: {}", orderId, ex.getMessage());
        }
    }

    private static void requireLogin(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new SecurityException("Please log in to pay");
        }
    }

    /** The payment succeeded but the order/wallet update did not; retrying finishes it. */
    public static class FulfilmentException extends RuntimeException {
        public FulfilmentException(String message) {
            super(message);
        }
    }
}
