package com.pharmacy.order.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.common.InternalToken;
import com.pharmacy.order.entity.OrderEntity;
import com.pharmacy.order.service.OrderService;

/** Service-to-service order updates. The gateway blocks /internal/ paths from outside. */
@RestController
@RequestMapping("/api/orders/internal")
public class InternalOrderController {
    private final OrderService orderService;
    private final String internalToken;

    public InternalOrderController(OrderService orderService, @Value("${app.internal-token:}") String internalToken) {
        this.orderService = orderService;
        this.internalToken = internalToken;
    }

    @PostMapping("/{orderId}/paid")
    public ApiResponse<OrderEntity> markPaid(@PathVariable String orderId,
                                             @RequestHeader(value = InternalToken.HEADER, required = false) String token) {
        InternalToken.require(internalToken, token);
        return ApiResponse.ok("Order marked paid", orderService.markPaid(orderId));
    }
}
