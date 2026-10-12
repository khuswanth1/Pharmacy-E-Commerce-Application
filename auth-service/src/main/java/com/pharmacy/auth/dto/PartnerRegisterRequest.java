package com.pharmacy.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Sign-up for a vendor ({@code type = VENDOR}) or delivery partner
 * ({@code type = DELIVERY}). The account starts PENDING until an admin approves it.
 *
 * <p>Either sign up with email + password, or pass {@code googleIdToken}: the name and
 * email then come from the verified Google account and no password is set.
 */
public record PartnerRegisterRequest(
        @NotBlank(message = "Partner type is required")
        @Pattern(regexp = "VENDOR|DELIVERY", message = "Partner type must be VENDOR or DELIVERY") String type,
        String googleIdToken,
        String name,
        @Email(message = "A valid email is required") String email,
        String password,
        @NotBlank(message = "Phone is required") String phone,
        String businessName,
        String drugLicenseNumber,
        String gstin,
        String vehicleType,
        String vehicleNumber,
        String drivingLicenseNumber,
        String businessAddress,
        String city,
        String pincode
) {}
