package com.pharmacy.order.exception;

/** The caller is signed in but not allowed to act on this order. Mapped to HTTP 403. */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
