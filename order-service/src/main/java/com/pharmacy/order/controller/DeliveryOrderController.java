package com.pharmacy.order.controller;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.order.entity.OrderEntity;
import com.pharmacy.order.service.OrderService;

/**
 * Delivery-partner order handling. The gateway only lets approved ROLE_DELIVERY
 * tokens reach /api/orders/delivery and sets X-User-Id to the partner's id.
 */
@RestController
@RequestMapping("/api/orders/delivery")
public class DeliveryOrderController {
    private final OrderService orderService;

    public DeliveryOrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/available")
    public ApiResponse<List<OrderEntity>> available() {
        return ApiResponse.ok("Orders ready for pickup", orderService.availableForDelivery());
    }

    @GetMapping("/mine")
    public ApiResponse<List<OrderEntity>> mine(@RequestHeader("X-User-Id") String partnerId) {
        return ApiResponse.ok("Your deliveries", orderService.deliveryOrders(partnerId));
    }

    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats(@RequestHeader("X-User-Id") String partnerId) {
        return ApiResponse.ok("Stats", orderService.deliveryStats(partnerId));
    }

    @PostMapping("/{orderId}/accept")
    public ApiResponse<OrderEntity> accept(@PathVariable String orderId,
                                           @RequestHeader("X-User-Id") String partnerId,
                                           @RequestBody(required = false) Map<String, String> body) {
        String name = body == null ? null : body.get("name");
        String phone = body == null ? null : body.get("phone");
        return ApiResponse.ok("Delivery accepted", orderService.deliveryAccept(orderId, partnerId, name, phone));
    }

    @PostMapping("/{orderId}/pickup")
    public ApiResponse<OrderEntity> pickUp(@PathVariable String orderId,
                                           @RequestHeader("X-User-Id") String partnerId) {
        return ApiResponse.ok("Picked up, out for delivery", orderService.deliveryPickUp(orderId, partnerId));
    }

    @PostMapping("/{orderId}/location")
    public ApiResponse<OrderEntity> location(@PathVariable String orderId,
                                             @RequestHeader("X-User-Id") String partnerId,
                                             @RequestBody Map<String, Double> body) {
        Double lat = body.get("lat");
        Double lng = body.get("lng");
        if (lat == null || lng == null) {
            throw new IllegalArgumentException("lat and lng are required");
        }
        return ApiResponse.ok("Location updated", orderService.deliveryUpdateLocation(orderId, partnerId, lat, lng));
    }

    @PostMapping("/{orderId}/deliver")
    public ApiResponse<OrderEntity> deliver(@PathVariable String orderId,
                                            @RequestHeader("X-User-Id") String partnerId,
                                            @RequestBody Map<String, String> body) {
        return ApiResponse.ok("Order delivered", orderService.deliveryComplete(orderId, partnerId, body.get("code")));
    }
}
