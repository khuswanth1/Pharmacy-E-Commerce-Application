package com.pharmacy.order.exception;

/**
 * The support assistant can't answer right now (not configured, provider down, rate limited).
 * Mapped to HTTP 503 with a message that is safe to show the customer.
 */
public class ChatUnavailableException extends RuntimeException {
    public ChatUnavailableException(String message) {
        super(message);
    }
}
