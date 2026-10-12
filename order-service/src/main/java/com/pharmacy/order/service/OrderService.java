package com.pharmacy.order.service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.pharmacy.common.OrderStatus;
import com.pharmacy.order.entity.OrderEntity;
import com.pharmacy.order.exception.ForbiddenException;
import com.pharmacy.order.repo.OrderRepository;

/**
 * Order lifecycle. Fulfilment runs:
 * CREATED/PAID → (vendor accepts) CONFIRMED → (vendor packs) PACKED
 * → (delivery partner picks up) SHIPPED → (OTP verified) DELIVERED.
 */
@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Statuses a vendor can pick up from; CREATED only counts for cash on delivery (see readyForVendor). */
    private static final Set<OrderStatus> OPEN_FOR_VENDOR = EnumSet.of(OrderStatus.CREATED, OrderStatus.PAID);
    /** Once the partner has the parcel, only an admin can cancel. */
    private static final Set<OrderStatus> CUSTOMER_CANCELLABLE =
            EnumSet.of(OrderStatus.CREATED, OrderStatus.PAID, OrderStatus.CONFIRMED, OrderStatus.PACKED);

    private final OrderRepository orderRepo;

    public OrderService(OrderRepository orderRepo) {
        this.orderRepo = orderRepo;
    }

    @Transactional
    public OrderEntity createOrder(OrderEntity order) {
        order.setStatus(OrderStatus.CREATED);
        // Fulfilment fields are set by the workflow, never by the customer.
        order.setVendorId(null);
        order.setVendorName(null);
        order.setDeliveryPartnerId(null);
        order.setDeliveryPartnerName(null);
        order.setDeliveryPartnerPhone(null);
        order.setDeliveryOtp(newOtp());
        order.setPaymentMethod(order.getPaymentMethod() == null || order.getPaymentMethod().isBlank()
                ? "COD" : order.getPaymentMethod().trim().toUpperCase());
        OrderEntity saved = orderRepo.save(order);
        log.info("Order Created | orderId={} status={}", saved.getId(), saved.getStatus());
        return saved;
    }

    public OrderEntity get(String orderId) {
        return orderRepo.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));
    }

    @Transactional
    public OrderEntity updateStatus(String orderId, OrderStatus status) {
        OrderEntity order = get(orderId);
        order.setStatus(status);
        OrderEntity saved = orderRepo.save(order);
        log.info("Order Status Updated | orderId={} status={}", saved.getId(), saved.getStatus());
        return saved;
    }

    /**
     * Status change requested by a customer (or an admin) through the generic
     * endpoint. Customers may only mark their own order's payment as failed, or cancel it before
     * pickup. Orders are marked PAID only by payment-service after it verifies the payment.
     */
    @Transactional
    public OrderEntity updateStatusAs(String orderId, OrderStatus status, String userId, boolean admin) {
        if (admin) {
            return updateStatus(orderId, status);
        }
        OrderEntity order = get(orderId);
        if (userId == null || !userId.equals(order.getUserId())) {
            throw new ForbiddenException("You can only update your own orders");
        }
        if (status == OrderStatus.FAILED && order.getStatus() == OrderStatus.CREATED) {
            return updateStatus(orderId, status);
        }
        if (status == OrderStatus.CANCELLED) {
            if (!CUSTOMER_CANCELLABLE.contains(order.getStatus())) {
                throw new IllegalArgumentException("This order is already on its way and can no longer be cancelled");
            }
            order.setCancelReason("Cancelled by customer");
            return updateStatus(orderId, status);
        }
        throw new ForbiddenException("You cannot set this order to " + status);
    }

    /** Called by payment-service once a payment for this order is verified. Safe to repeat. */
    @Transactional
    public OrderEntity markPaid(String orderId) {
        OrderEntity order = get(orderId);
        if (order.getStatus() == OrderStatus.CREATED || order.getStatus() == OrderStatus.FAILED) {
            return updateStatus(orderId, OrderStatus.PAID);
        }
        return order;
    }

    /** The delivery code, shown only to the customer who placed the order. */
    @Transactional
    public String deliveryOtpFor(String orderId, String userId) {
        OrderEntity order = get(orderId);
        if (userId == null || !userId.equals(order.getUserId())) {
            throw new ForbiddenException("You can only view your own orders");
        }
        if (order.getDeliveryOtp() == null) {
            order.setDeliveryOtp(newOtp());
            orderRepo.save(order);
        }
        return order.getDeliveryOtp();
    }

    // ---------------------------------------------------------------- Vendor

    public List<OrderEntity> availableForVendors() {
        return orderRepo.findByVendorIdIsNullAndStatusInOrderByCreatedAtAsc(OPEN_FOR_VENDOR).stream()
                .filter(OrderService::readyForVendor).toList();
    }

    /** Paid online, or cash on delivery. Unpaid online orders wait for their payment. */
    private static boolean readyForVendor(OrderEntity o) {
        return o.getStatus() == OrderStatus.PAID || (o.getStatus() == OrderStatus.CREATED && o.isCashOnDelivery());
    }

    public List<OrderEntity> vendorOrders(String vendorId) {
        return orderRepo.findByVendorIdOrderByCreatedAtDesc(vendorId);
    }

    @Transactional
    public OrderEntity vendorAccept(String orderId, String vendorId, String vendorName) {
        if (!readyForVendor(get(orderId))) {
            throw new IllegalArgumentException("This order is waiting for the customer's payment");
        }
        int claimed = orderRepo.claimForVendor(orderId, vendorId, vendorName, LocalDateTime.now(), OPEN_FOR_VENDOR);
        if (claimed == 0) {
            throw new IllegalArgumentException("This order has already been taken or is no longer open");
        }
        log.info("Order Accepted | orderId={} vendorId={}", orderId, vendorId);
        return withDeliveryOtp(get(orderId));
    }

    @Transactional
    public OrderEntity vendorMarkPacked(String orderId, String vendorId) {
        OrderEntity order = ownedByVendor(orderId, vendorId);
        requireStatus(order, OrderStatus.CONFIRMED);
        order.setStatus(OrderStatus.PACKED);
        order.setPackedAt(LocalDateTime.now());
        log.info("Order Packed | orderId={} vendorId={}", orderId, vendorId);
        return orderRepo.save(order);
    }

    /** Vendor hands an accepted order back to the open pool (e.g. out of stock). */
    @Transactional
    public OrderEntity vendorRelease(String orderId, String vendorId) {
        OrderEntity order = ownedByVendor(orderId, vendorId);
        requireStatus(order, OrderStatus.CONFIRMED);
        order.setVendorId(null);
        order.setVendorName(null);
        order.setAcceptedAt(null);
        order.setStatus(OrderStatus.CREATED);
        log.info("Order Released | orderId={} vendorId={}", orderId, vendorId);
        return orderRepo.save(order);
    }

    public Map<String, Object> vendorStats(String vendorId) {
        return statsOf(orderRepo.findByVendorIdOrderByCreatedAtDesc(vendorId));
    }

    // -------------------------------------------------------------- Delivery

    public List<OrderEntity> availableForDelivery() {
        return orderRepo.findByDeliveryPartnerIdIsNullAndStatusOrderByPackedAtAsc(OrderStatus.PACKED);
    }

    public List<OrderEntity> deliveryOrders(String partnerId) {
        return orderRepo.findByDeliveryPartnerIdOrderByCreatedAtDesc(partnerId);
    }

    @Transactional
    public OrderEntity deliveryAccept(String orderId, String partnerId, String name, String phone) {
        get(orderId);
        int claimed = orderRepo.claimForDelivery(orderId, partnerId, name, phone);
        if (claimed == 0) {
            throw new IllegalArgumentException("This delivery has already been taken or is not ready yet");
        }
        log.info("Delivery Accepted | orderId={} partnerId={}", orderId, partnerId);
        return get(orderId);
    }

    @Transactional
    public OrderEntity deliveryPickUp(String orderId, String partnerId) {
        OrderEntity order = assignedTo(orderId, partnerId);
        requireStatus(order, OrderStatus.PACKED);
        order.setStatus(OrderStatus.SHIPPED);
        order.setPickedUpAt(LocalDateTime.now());
        log.info("Order Picked Up | orderId={} partnerId={}", orderId, partnerId);
        return withDeliveryOtp(order);
    }

    @Transactional
    public OrderEntity deliveryUpdateLocation(String orderId, String partnerId, double lat, double lng) {
        OrderEntity order = assignedTo(orderId, partnerId);
        requireStatus(order, OrderStatus.SHIPPED);
        order.setRiderLat(lat);
        order.setRiderLng(lng);
        order.setRiderLocationAt(LocalDateTime.now());
        return orderRepo.save(order);
    }

    @Transactional
    public OrderEntity deliveryComplete(String orderId, String partnerId, String otp) {
        OrderEntity order = assignedTo(orderId, partnerId);
        requireStatus(order, OrderStatus.SHIPPED);
        if (order.getDeliveryOtp() == null || otp == null || !order.getDeliveryOtp().equals(otp.trim())) {
            throw new IllegalArgumentException("Incorrect delivery code. Ask the customer for the code shown in their app.");
        }
        order.setStatus(OrderStatus.DELIVERED);
        order.setDeliveredAt(LocalDateTime.now());
        log.info("Order Delivered | orderId={} partnerId={}", orderId, partnerId);
        return orderRepo.save(order);
    }

    public Map<String, Object> deliveryStats(String partnerId) {
        return statsOf(orderRepo.findByDeliveryPartnerIdOrderByCreatedAtDesc(partnerId));
    }

    // ----------------------------------------------------------------- Admin

    public List<OrderEntity> allOrders(OrderStatus status) {
        return status == null
                ? orderRepo.findAllByOrderByCreatedAtDesc()
                : orderRepo.findByStatusOrderByCreatedAtDesc(status);
    }

    public Map<String, Object> adminStats() {
        return statsOf(orderRepo.findAll());
    }

    /** Order count, amount spent and last order time for every customer who has ordered. */
    public List<Map<String, Object>> customerSummaries() {
        return orderRepo.customerSummaries().stream().map(row -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", row[0]);
            m.put("orderCount", row[1]);
            m.put("totalSpent", row[2]);
            m.put("lastOrderAt", row[3]);
            return m;
        }).toList();
    }

    public List<OrderEntity> customerOrders(String userId) {
        return orderRepo.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public OrderEntity adminAssignVendor(String orderId, String vendorId, String vendorName) {
        OrderEntity order = get(orderId);
        if (!EnumSet.of(OrderStatus.CREATED, OrderStatus.PAID, OrderStatus.CONFIRMED).contains(order.getStatus())) {
            throw new IllegalArgumentException("A vendor can only be assigned before the order is packed");
        }
        order.setVendorId(vendorId);
        order.setVendorName(vendorName);
        order.setAcceptedAt(LocalDateTime.now());
        order.setStatus(OrderStatus.CONFIRMED);
        return orderRepo.save(order);
    }

    @Transactional
    public OrderEntity adminAssignDelivery(String orderId, String partnerId, String name, String phone) {
        OrderEntity order = get(orderId);
        if (order.getStatus() != OrderStatus.PACKED && order.getStatus() != OrderStatus.SHIPPED) {
            throw new IllegalArgumentException("A delivery partner can only be assigned once the order is packed");
        }
        order.setDeliveryPartnerId(partnerId);
        order.setDeliveryPartnerName(name);
        order.setDeliveryPartnerPhone(phone);
        return orderRepo.save(order);
    }

    @Transactional
    public OrderEntity adminCancel(String orderId, String reason) {
        OrderEntity order = get(orderId);
        if (order.getStatus() == OrderStatus.DELIVERED) {
            throw new IllegalArgumentException("Delivered orders cannot be cancelled");
        }
        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelReason(reason == null || reason.isBlank() ? "Cancelled by admin" : reason);
        return orderRepo.save(order);
    }

    // --------------------------------------------------------------- Helpers

    private OrderEntity ownedByVendor(String orderId, String vendorId) {
        OrderEntity order = get(orderId);
        if (!vendorId.equals(order.getVendorId())) {
            throw new ForbiddenException("This order is not assigned to your store");
        }
        return order;
    }

    private OrderEntity assignedTo(String orderId, String partnerId) {
        OrderEntity order = get(orderId);
        if (!partnerId.equals(order.getDeliveryPartnerId())) {
            throw new ForbiddenException("This delivery is not assigned to you");
        }
        return order;
    }

    /**
     * Orders placed before delivery codes existed have none, and deliveryComplete can never
     * accept them. Give every order in fulfilment a code so the customer can show it on arrival.
     */
    private OrderEntity withDeliveryOtp(OrderEntity order) {
        if (order.getDeliveryOtp() == null) {
            order.setDeliveryOtp(newOtp());
        }
        return orderRepo.save(order);
    }

    private static void requireStatus(OrderEntity order, OrderStatus expected) {
        if (order.getStatus() != expected) {
            throw new IllegalArgumentException("Order is " + order.getStatus() + ", expected " + expected);
        }
    }

    private static Map<String, Object> statsOf(List<OrderEntity> orders) {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (OrderStatus s : OrderStatus.values()) {
            byStatus.put(s.name(), orders.stream().filter(o -> o.getStatus() == s).count());
        }
        LocalDate today = LocalDate.now();
        BigDecimal deliveredRevenue = orders.stream()
                .filter(o -> o.getStatus() == OrderStatus.DELIVERED && o.getTotalAmount() != null)
                .map(OrderEntity::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long deliveredToday = orders.stream()
                .filter(o -> o.getDeliveredAt() != null && o.getDeliveredAt().toLocalDate().equals(today))
                .count();
        long placedToday = orders.stream()
                .filter(o -> o.getCreatedAt() != null && o.getCreatedAt().toLocalDate().equals(today))
                .count();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", orders.size());
        stats.put("byStatus", byStatus);
        stats.put("deliveredRevenue", deliveredRevenue);
        stats.put("deliveredToday", deliveredToday);
        stats.put("placedToday", placedToday);
        return stats;
    }

    private static String newOtp() {
        return String.format("%04d", RANDOM.nextInt(10_000));
    }
}
