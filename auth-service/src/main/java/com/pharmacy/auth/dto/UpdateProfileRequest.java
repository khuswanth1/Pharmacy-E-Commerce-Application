package com.pharmacy.auth.dto;

import com.pharmacy.common.Gender;

/**
 * Partial profile update. Any {@code null} field is left unchanged.
 * The wallet balance is not editable here: only payment-service changes it.
 */
public record UpdateProfileRequest(
        String name,
        String phone,
        String address,
        String geolocation,
        Gender gender,
        String picture,
        String email
) {}
