package com.pharmacy.gateway;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Component
public class SecurityRouteFilter implements GlobalFilter, Ordered {

    /** Identity headers the gateway sets for downstream services. Never trusted from the client. */
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String USER_ROLES_HEADER = "X-User-Roles";
    public static final String PARTNER_STATUS_HEADER = "X-Partner-Status";

    @Value("${app.jwt-secret:pharmacy_super_secret_key_please_change}")
    private String jwtSecret;

    /**
     * Prefixes that need a specific role. Checked before {@link #PUBLIC_PATHS} so
     * e.g. /api/orders/admin is protected even though /api/orders is public.
     * Vendor and delivery routes additionally require an APPROVED partner account.
     */
    private static final Map<String, String> ROLE_PATHS = Map.of(
        "/api/auth/admin", "ROLE_ADMIN",
        "/api/orders/admin", "ROLE_ADMIN",
        "/api/products/admin", "ROLE_ADMIN",
        "/api/payments/admin", "ROLE_ADMIN",
        "/api/orders/vendor", "ROLE_VENDOR",
        "/api/products/vendor", "ROLE_VENDOR",
        "/api/orders/delivery", "ROLE_DELIVERY"
    );

    private static final List<String> PUBLIC_PATHS = List.of(
        "/actuator", "/swagger-ui", "/v3/api-docs", "/api-docs", "/webjars", "/hello", "/asyncapi.yaml",
        "/api/auth/login", "/api/auth/register", "/api/auth/google",
        "/api/auth/forgot", "/api/auth/reset",
        "/api/auth/geocode",
        "/api/cart/coupons/validate",
        "/api/products",
        "/api/prescriptions",
        "/api/orders",
        "/api/payments",
        "/oauth2", "/login"
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // Let CORS preflight requests through untouched.
        if (HttpMethod.OPTIONS.equals(exchange.getRequest().getMethod())) {
            return chain.filter(exchange);
        }

        var path = exchange.getRequest().getURI().getPath();
        // Service-to-service endpoints are never reachable through the gateway.
        if (path.contains("/internal/")) {
            return reject(exchange, HttpStatus.NOT_FOUND);
        }
        Claims claims = parseClaims(exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION));

        // Strip any identity headers the client tried to send, then add the verified ones.
        ServerHttpRequest.Builder request = exchange.getRequest().mutate()
                .headers(h -> {
                    h.remove(USER_ID_HEADER);
                    h.remove(USER_ROLES_HEADER);
                    h.remove(PARTNER_STATUS_HEADER);
                });
        List<String> roles = List.of();
        String partnerStatus = null;
        if (claims != null) {
            roles = rolesOf(claims);
            partnerStatus = claims.get("partnerStatus", String.class);
            request.header(USER_ID_HEADER, claims.getSubject());
            request.header(USER_ROLES_HEADER, String.join(",", roles));
            if (partnerStatus != null) {
                request.header(PARTNER_STATUS_HEADER, partnerStatus);
            }
        }
        ServerWebExchange forwarded = exchange.mutate().request(request.build()).build();

        String requiredRole = ROLE_PATHS.entrySet().stream()
                .filter(e -> path.startsWith(e.getKey()))
                .map(Map.Entry::getValue)
                .findFirst().orElse(null);
        if (requiredRole != null) {
            if (claims == null) {
                return reject(exchange, HttpStatus.UNAUTHORIZED);
            }
            boolean partnerRole = requiredRole.equals("ROLE_VENDOR") || requiredRole.equals("ROLE_DELIVERY");
            if (!roles.contains(requiredRole) || (partnerRole && !"APPROVED".equals(partnerStatus))) {
                return reject(exchange, HttpStatus.FORBIDDEN);
            }
            return chain.filter(forwarded);
        }

        if (PUBLIC_PATHS.stream().anyMatch(path::startsWith)) {
            return chain.filter(forwarded);
        }

        if (claims == null) {
            return reject(exchange, HttpStatus.UNAUTHORIZED);
        }
        return chain.filter(forwarded);
    }

    private Claims parseClaims(String auth) {
        if (auth == null || !auth.startsWith("Bearer ")) {
            return null;
        }
        try {
            var key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
            return Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(auth.substring(7)).getPayload();
        } catch (Exception ex) {
            return null;
        }
    }

    private static List<String> rolesOf(Claims claims) {
        Object raw = claims.get("roles");
        if (raw instanceof Collection<?> c) {
            return c.stream().map(String::valueOf).collect(Collectors.toList());
        }
        return List.of();
    }

    private static Mono<Void> reject(ServerWebExchange exchange, HttpStatus status) {
        exchange.getResponse().setStatusCode(status);
        return exchange.getResponse().setComplete();
    }

    @Override
    public int getOrder() {
        return -1;
    }
}
