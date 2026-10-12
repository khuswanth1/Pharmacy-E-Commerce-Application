package com.pharmacy.auth.dto;

/**
 * Payload for client-side Google sign-in (Google Identity Services / One-Tap).
 * Either an {@code idToken} (preferred, verified server-side) or a basic
 * {@code email}/{@code name} pair can be supplied.
 *
 * <p>{@code role} is {@code VENDOR} or {@code DELIVERY} when a partner signs in. Partner
 * sign-in requires an {@code idToken} and only logs in an existing account of that type;
 * it never creates a customer account.
 */
public record GoogleLoginRequest(String idToken, String email, String name, String role) {}
