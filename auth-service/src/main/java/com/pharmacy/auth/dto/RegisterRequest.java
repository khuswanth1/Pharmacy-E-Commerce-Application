package com.pharmacy.auth.dto;

import com.pharmacy.common.Gender;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Customer sign-up. Roles are never taken from the client: customers always get
 * ROLE_USER, and partners sign up through {@link PartnerRegisterRequest}.
 */
public record RegisterRequest(
        @NotBlank(message = "Name is required") String name,
        @Email(message = "A valid email is required") @NotBlank(message = "Email is required") String email,
        @NotBlank(message = "Password is required")
        @Size(min = 6, message = "Password must be at least 6 characters long") String password,
        String phone,
        Gender gender
) {}
