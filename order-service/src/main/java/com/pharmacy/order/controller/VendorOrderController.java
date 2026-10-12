package com.pharmacy.order.controller;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.order.entity.OrderEntity;
import com.pharmacy.order.service.OrderService;

/**
 * Store-side order handling. The gateway only lets approved ROLE_VENDOR tokens
 * reach /api/orders/vendor and sets X-User-Id to the vendor's id.
 */
@RestController
@RequestMapping("/api/orders/vendor")
public class VendorOrderController {
    private final OrderService orderService;

    public VendorOrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/available")
    public ApiResponse<List<OrderEntity>> available() {
        return ApiResponse.ok("Open orders", orderService.availableForVendors());
    }

    @GetMapping("/mine")
    public ApiResponse<List<OrderEntity>> mine(@RequestHeader("X-User-Id") String vendorId) {
        return ApiResponse.ok("Your orders", orderService.vendorOrders(vendorId));
    }

    @GetMapping("/stats")
    public ApiResponse<Map<String, Object>> stats(@RequestHeader("X-User-Id") String vendorId) {
        return ApiResponse.ok("Stats", orderService.vendorStats(vendorId));
    }

    @PostMapping("/{orderId}/accept")
    public ApiResponse<OrderEntity> accept(@PathVariable String orderId,
                                           @RequestHeader("X-User-Id") String vendorId,
                                           @RequestBody(required = false) Map<String, String> body) {
        String name = body == null ? null : body.get("vendorName");
        return ApiResponse.ok("Order accepted", orderService.vendorAccept(orderId, vendorId, name));
    }

    @PostMapping("/{orderId}/packed")
    public ApiResponse<OrderEntity> packed(@PathVariable String orderId,
                                           @RequestHeader("X-User-Id") String vendorId) {
        return ApiResponse.ok("Order ready for pickup", orderService.vendorMarkPacked(orderId, vendorId));
    }

    @PostMapping("/{orderId}/release")
    public ApiResponse<OrderEntity> release(@PathVariable String orderId,
                                            @RequestHeader("X-User-Id") String vendorId) {
        return ApiResponse.ok("Order returned to the open pool", orderService.vendorRelease(orderId, vendorId));
    }
}
