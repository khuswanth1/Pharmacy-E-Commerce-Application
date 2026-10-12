package com.pharmacy.auth.dto;

import java.time.LocalDateTime;

import com.pharmacy.auth.entity.PartnerProfile;
import com.pharmacy.auth.entity.User;
import com.pharmacy.common.PartnerStatus;
import com.pharmacy.common.Role;

/** A partner's account plus business details, as shown to the partner and to admins. */
public record PartnerResponse(
        String userId,
        String name,
        String email,
        String phone,
        Role partnerRole,
        PartnerStatus status,
        boolean enabled,
        String businessName,
        String drugLicenseNumber,
        String gstin,
        String vehicleType,
        String vehicleNumber,
        String drivingLicenseNumber,
        String businessAddress,
        String city,
        String pincode,
        boolean online,
        String reviewNote,
        LocalDateTime reviewedAt,
        LocalDateTime createdAt
) {
    public static PartnerResponse from(User u, PartnerProfile p) {
        return new PartnerResponse(
                u.getId(), u.getName(), u.getEmail(), u.getPhone(),
                p.getPartnerRole(), u.getPartnerStatus(), u.isEnabled(),
                p.getBusinessName(), p.getDrugLicenseNumber(), p.getGstin(),
                p.getVehicleType(), p.getVehicleNumber(), p.getDrivingLicenseNumber(),
                p.getBusinessAddress(), p.getCity(), p.getPincode(),
                p.isOnline(), p.getReviewNote(), p.getReviewedAt(), p.getCreatedAt());
    }
}
