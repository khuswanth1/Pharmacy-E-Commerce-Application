package com.pharmacy.payment.service;

import java.math.BigDecimal;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.pharmacy.common.InternalToken;

/**
 * Calls to order-, auth- and product-service. These go straight to each service
 * (not through the gateway) and carry the shared internal token.
 */
@Component
public class ServiceClients {

    private static final ParameterizedTypeReference<Map<String, Object>> JSON = new ParameterizedTypeReference<>() {};

    private final RestClient orders;
    private final RestClient auth;
    private final RestClient products;
    private final String internalToken;

    public ServiceClients(@Value("${app.order-service-url:http://localhost:8084}") String orderUrl,
                          @Value("${app.auth-service-url:http://localhost:8081}") String authUrl,
                          @Value("${app.product-service-url:http://localhost:8082}") String productUrl,
                          @Value("${app.internal-token:}") String internalToken) {
        this.orders = RestClient.create(orderUrl);
        this.auth = RestClient.create(authUrl);
        this.products = RestClient.create(productUrl);
        this.internalToken = internalToken;
    }

    /** The order as order-service stores it: id, userId, totalAmount, status, ... */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getOrder(String orderId) {
        Map<String, Object> body = call(() -> orders.get().uri("/api/orders/detail/{orderId}", orderId).retrieve().body(JSON),
                "Order not found");
        Object data = body == null ? null : body.get("data");
        if (!(data instanceof Map)) {
            throw new IllegalArgumentException("Order not found");
        }
        return (Map<String, Object>) data;
    }

    public void markOrderPaid(String orderId) {
        call(() -> orders.post().uri("/api/orders/internal/{orderId}/paid", orderId)
                .header(InternalToken.HEADER, internalToken).retrieve().toBodilessEntity(), "Could not mark the order paid");
    }

    public void creditWallet(String userId, BigDecimal rupees) {
        if (userId == null || userId.isBlank() || rupees == null) {
            throw new IllegalArgumentException("userId and amount must not be empty");
        }
        call(() -> auth.post().uri("/api/auth/internal/wallet/{userId}/credit", userId)
                .header(InternalToken.HEADER, internalToken).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", rupees)).retrieve().toBodilessEntity(), "Could not credit the wallet");
    }

    /** @throws IllegalArgumentException with auth-service's message, e.g. "Not enough wallet balance". */
    public void debitWallet(String userId, BigDecimal rupees) {
        if (userId == null || userId.isBlank() || rupees == null) {
            throw new IllegalArgumentException("userId and amount must not be empty");
        }
        call(() -> auth.post().uri("/api/auth/internal/wallet/{userId}/debit", userId)
                .header(InternalToken.HEADER, internalToken).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", rupees)).retrieve().toBodilessEntity(), "Could not take payment from the wallet");
    }

    /** Reduces product stock for a paid order. */
    public void reduceStock(String orderId) {
        call(() -> products.post().uri("/api/products/update-stock").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("orderId", orderId)).retrieve().toBodilessEntity(), "Could not update stock");
    }

    /** Runs a call; a 4xx from the other service becomes IllegalArgumentException with its message. */
    private static <T> T call(java.util.function.Supplier<T> request, String fallbackMessage) {
        try {
            return request.get();
        } catch (RestClientResponseException ex) {
            String message = messageOf(ex);
            if (ex.getStatusCode().is4xxClientError()) {
                throw new IllegalArgumentException(message != null ? message : fallbackMessage);
            }
            throw new IllegalStateException(fallbackMessage + (message != null ? ": " + message : ""));
        } catch (RuntimeException ex) {
            throw new IllegalStateException(fallbackMessage + " (service unavailable)");
        }
    }

    @SuppressWarnings("unchecked")
    private static String messageOf(RestClientResponseException ex) {
        try {
            Map<String, Object> body = ex.getResponseBodyAs(Map.class);
            Object m = body == null ? null : body.get("message");
            return m == null ? null : String.valueOf(m);
        } catch (RuntimeException ignored) {
            return null;
        }
    }
}
