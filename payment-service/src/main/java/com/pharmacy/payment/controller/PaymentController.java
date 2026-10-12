package com.pharmacy.payment.controller;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

import com.pharmacy.common.ApiResponse;
import com.pharmacy.common.PaymentStatus;
import com.pharmacy.payment.dto.PaymentOrderRequest;
import com.pharmacy.payment.dto.PaymentOrderResponse;
import com.pharmacy.payment.dto.PaymentVerificationRequest;
import com.pharmacy.payment.entity.PaymentEntity;
import com.pharmacy.payment.service.PaymentService;
import com.razorpay.RazorpayException;

/**
 * Payments, reached through the API gateway, which sets X-User-Id from the login token.
 * /api/payments/admin/** is restricted to admins by the gateway.
 */
@Tag(name = "Payment Service", description = "Razorpay (UPI, cards, net banking), wallet and cash on delivery")
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);
    private static final String USER = "X-User-Id";

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @Operation(summary = "Create a Razorpay order, or record cash on delivery",
            description = "Body: { orderId, amount (paise), paymentMethod }. For medicine orders the amount is "
                    + "taken from the order; for WLT_ (wallet top-up) and LAB_ (lab test) ids it is the requested amount.")
    @PostMapping("/create-order")
    public ApiResponse<PaymentOrderResponse> createOrder(@Valid @RequestBody PaymentOrderRequest request,
                                                         @RequestHeader(value = USER, required = false) String userId)
            throws RazorpayException {
        log.info("create-order | orderId={} method={} userId={}", request.getOrderId(), request.getPaymentMethod(), userId);
        return ApiResponse.ok("Payment order created", paymentService.createOrder(request, userId));
    }

    @Operation(summary = "Verify a Razorpay payment, then mark the order paid or credit the wallet")
    @PostMapping("/verify")
    public ApiResponse<Map<String, String>> verifyPayment(@Valid @RequestBody PaymentVerificationRequest request) {
        PaymentStatus status = paymentService.verifyPayment(request);
        return ApiResponse.ok("Payment verified", Map.of("status", status.name()));
    }

    @Operation(summary = "Pay an order or lab test from the wallet",
            description = "Body: { orderId, amount (paise, lab tests only) }")
    @PostMapping("/wallet/pay")
    public ApiResponse<PaymentEntity> payWithWallet(@RequestBody Map<String, Object> body,
                                                    @RequestHeader(value = USER, required = false) String userId) {
        String orderId = body == null || body.get("orderId") == null ? null : String.valueOf(body.get("orderId")).trim();
        if (orderId == null || orderId.isEmpty()) {
            throw new IllegalArgumentException("orderId is required");
        }
        long amount = body.get("amount") instanceof Number n ? n.longValue() : 0;
        return ApiResponse.ok("Paid from wallet", paymentService.payWithWallet(orderId, amount, userId));
    }

    @Operation(summary = "Refund a cancelled, paid order to the wallet", description = "Body: { orderId }")
    @PostMapping("/refund-to-wallet")
    public ApiResponse<Map<String, Object>> refundToWallet(@RequestBody Map<String, String> body,
                                                           @RequestHeader(value = USER, required = false) String userId) {
        BigDecimal refunded = paymentService.refundToWallet(body.get("orderId"), userId);
        return ApiResponse.ok(refunded.signum() > 0 ? "Refunded to wallet" : "Nothing was paid for this order",
                Map.of("refunded", refunded));
    }

    @Operation(summary = "The signed-in user's payments")
    @GetMapping("/mine")
    public ApiResponse<List<PaymentEntity>> mine(@RequestHeader(value = USER, required = false) String userId) {
        return ApiResponse.ok("Payments", paymentService.paymentsOf(userId));
    }

    // ------------------------------------------------------------------ admin

    @Operation(summary = "List all payments (admin)")
    @GetMapping("/admin/all")
    public ApiResponse<List<PaymentEntity>> getAllPayments() {
        return ApiResponse.ok("Payments", paymentService.getAllPayments());
    }

    @Operation(summary = "Get a payment by id (admin)")
    @GetMapping("/admin/{id}")
    public ApiResponse<PaymentEntity> getPaymentById(@PathVariable String id) {
        return ApiResponse.ok("Payment found", paymentService.getPaymentById(id));
    }

    @Operation(summary = "Latest payment for an order (admin)")
    @GetMapping("/admin/order/{orderId}")
    public ApiResponse<PaymentEntity> getPaymentByOrderId(@PathVariable String orderId) {
        return ApiResponse.ok("Payment found", paymentService.getPaymentByOrderId(orderId));
    }

    @Operation(summary = "Correct a payment's status (admin). Does not move money.")
    @PutMapping("/admin/{id}/status")
    public ApiResponse<PaymentEntity> updatePaymentStatus(@PathVariable String id, @RequestParam PaymentStatus status) {
        return ApiResponse.ok("Payment status updated", paymentService.updatePaymentStatus(id, status));
    }

    // ----------------------------------------------------------------- errors

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            errors.put(fe.getField(), fe.getDefaultMessage());
        }
        return ResponseEntity.badRequest().body(ApiResponse.fail("Validation failed: " + errors));
    }

    @ExceptionHandler(RazorpayException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleRazorpay(RazorpayException ex) {
        log.error("Razorpay error: {}", ex.getMessage());
        String message = ex.getMessage() != null && ex.getMessage().contains("Authentication failed")
                ? "Online payments are unavailable: the Razorpay keys were rejected."
                : "Razorpay could not start the payment. Please try again.";
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(ApiResponse.fail(message));
    }
}
