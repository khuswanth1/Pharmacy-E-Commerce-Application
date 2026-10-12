package com.pharmacy.order.controller;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.common.OrderStatus;
import com.pharmacy.order.entity.OrderEntity;
import com.pharmacy.order.repo.OrderRepository;
import com.pharmacy.order.service.OrderService;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderRepository repo;
    private final OrderService orderService;

    public OrderController(OrderRepository repo, OrderService orderService) {
        this.repo = repo;
        this.orderService = orderService;
    }

    @PostMapping
    public ApiResponse<OrderEntity> create(@RequestBody OrderEntity order) {
        return ApiResponse.ok("Order created", orderService.createOrder(order));
    }

    @GetMapping("/{userId}")
    public ApiResponse<List<OrderEntity>> byUser(@PathVariable String userId) {
        return ApiResponse.ok("Orders", repo.findByUserIdOrderByCreatedAtDesc(userId));
    }

    @GetMapping("/detail/{orderId}")
    public ApiResponse<OrderEntity> getOrderById(@PathVariable String orderId) {
        return ApiResponse.ok("Order found", orderService.get(orderId));
    }

    /** The code the customer gives the delivery partner. Only the customer who placed the order can see it. */
    @GetMapping("/detail/{orderId}/delivery-code")
    public ApiResponse<Map<String, String>> deliveryCode(@PathVariable String orderId,
                                                         @RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok("Delivery code", Map.of("code", orderService.deliveryOtpFor(orderId, userId)));
    }

    @PatchMapping("/{orderId}/status")
    public ApiResponse<?> updateStatus(@PathVariable String orderId, @RequestParam String status,
                                       @RequestHeader(value = "X-User-Id", required = false) String userId,
                                       @RequestHeader(value = "X-User-Roles", required = false) String roles) {
        boolean admin = roles != null && List.of(roles.split(",")).contains("ROLE_ADMIN");
        orderService.updateStatusAs(orderId, OrderStatus.valueOf(status), userId, admin);
        return ApiResponse.ok("Status updated", Map.of("orderId", orderId, "status", status));
    }

    @PatchMapping("/{orderId}/delivery-details")
    public ApiResponse<OrderEntity> updateDeliveryDetails(
            @PathVariable String orderId,
            @RequestBody Map<String, String> details) {
        OrderEntity order = orderService.get(orderId);
        if (details.containsKey("receiverName")) order.setReceiverName(details.get("receiverName"));
        if (details.containsKey("phoneNumber")) order.setPhoneNumber(details.get("phoneNumber"));
        if (details.containsKey("address")) order.setAddress(details.get("address"));
        if (details.containsKey("deliveryInstructions")) order.setDeliveryInstructions(details.get("deliveryInstructions"));
        return ApiResponse.ok("Delivery details updated", repo.save(order));
    }
}
