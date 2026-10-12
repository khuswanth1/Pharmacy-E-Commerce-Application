package com.pharmacy.order.controller;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.common.OrderStatus;
import com.pharmacy.order.entity.OrderEntity;
import com.pharmacy.order.service.OrderService;

/** Admin order management. The gateway only lets ROLE_ADMIN tokens reach /api/orders/admin. */
@RestController
@RequestMapping("/api/orders/admin")
public class AdminOrderController {
    private final OrderService orderService;

    public AdminOrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/all")
    public ApiResponse<List<OrderEntity>> all(@RequestParam(required = false) OrderStatus status) {
        return ApiResponse.ok("Orders", orderService.allOrders(status));
    }

    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats() {
        return ApiResponse.ok("Stats", orderService.adminStats());
    }

    @GetMapping("/customers/summary")
    public ApiResponse<List<Map<String, Object>>> customerSummaries() {
        return ApiResponse.ok("Customer order summaries", orderService.customerSummaries());
    }

    @GetMapping("/customers/{userId}/orders")
    public ApiResponse<List<OrderEntity>> customerOrders(@PathVariable String userId) {
        return ApiResponse.ok("Customer orders", orderService.customerOrders(userId));
    }

    /** Body: { vendorId, vendorName } */
    @PostMapping("/{orderId}/assign-vendor")
    public ApiResponse<OrderEntity> assignVendor(@PathVariable String orderId, @RequestBody Map<String, String> body) {
        return ApiResponse.ok("Vendor assigned",
                orderService.adminAssignVendor(orderId, required(body, "vendorId"), body.get("vendorName")));
    }

    /** Body: { partnerId, name, phone } */
    @PostMapping("/{orderId}/assign-delivery")
    public ApiResponse<OrderEntity> assignDelivery(@PathVariable String orderId, @RequestBody Map<String, String> body) {
        return ApiResponse.ok("Delivery partner assigned",
                orderService.adminAssignDelivery(orderId, required(body, "partnerId"), body.get("name"), body.get("phone")));
    }

    /** Body: { reason } */
    @PostMapping("/{orderId}/cancel")
    public ApiResponse<OrderEntity> cancel(@PathVariable String orderId, @RequestBody(required = false) Map<String, String> body) {
        return ApiResponse.ok("Order cancelled", orderService.adminCancel(orderId, body == null ? null : body.get("reason")));
    }

    private static String required(Map<String, String> body, String key) {
        String v = body.get(key);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(key + " is required");
        }
        return v;
    }
}
