package com.pharmacy.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Shared secret for service-to-service calls (e.g. payment-service crediting a wallet).
 * Callers send it in {@link #HEADER}; the API gateway blocks every {@code /internal/} path
 * from outside, and internal endpoints also check the token because service ports can be
 * reached directly. Configure the same {@code INTERNAL_API_TOKEN} in every service.
 */
public final class InternalToken {

    public static final String HEADER = "X-Internal-Token";

    private InternalToken() {}

    /** @throws SecurityException if the token is not configured or does not match. */
    public static void require(String expected, String provided) {
        if (expected == null || expected.isBlank()) {
            throw new SecurityException("INTERNAL_API_TOKEN is not configured");
        }
        if (provided == null || !MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
            throw new SecurityException("Invalid internal token");
        }
    }
}
