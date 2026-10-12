package com.pharmacy.auth.entity;

import java.time.LocalDateTime;

import com.pharmacy.common.Role;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Business details for a vendor (pharmacy store) or delivery partner. Keyed by
 * the owning {@link User}'s id; the approval state lives on {@link User#getPartnerStatus()}
 * so it can go into the JWT without an extra lookup.
 */
@Entity
@Table(name = "partner_profiles")
public class PartnerProfile {

    @Id
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role partnerRole;

    // Vendor fields
    private String businessName;
    private String drugLicenseNumber;
    private String gstin;

    // Delivery partner fields
    private String vehicleType;
    private String vehicleNumber;
    private String drivingLicenseNumber;

    // Shared
    @Column(length = 1000)
    private String businessAddress;
    private String city;
    private String pincode;

    /** Delivery partners toggle this to receive new delivery requests. */
    private boolean online = false;

    @Column(length = 500)
    private String reviewNote;
    private LocalDateTime reviewedAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public Role getPartnerRole() { return partnerRole; }
    public void setPartnerRole(Role partnerRole) { this.partnerRole = partnerRole; }

    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }

    public String getDrugLicenseNumber() { return drugLicenseNumber; }
    public void setDrugLicenseNumber(String drugLicenseNumber) { this.drugLicenseNumber = drugLicenseNumber; }

    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }

    public String getVehicleType() { return vehicleType; }
    public void setVehicleType(String vehicleType) { this.vehicleType = vehicleType; }

    public String getVehicleNumber() { return vehicleNumber; }
    public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }

    public String getDrivingLicenseNumber() { return drivingLicenseNumber; }
    public void setDrivingLicenseNumber(String drivingLicenseNumber) { this.drivingLicenseNumber = drivingLicenseNumber; }

    public String getBusinessAddress() { return businessAddress; }
    public void setBusinessAddress(String businessAddress) { this.businessAddress = businessAddress; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public boolean isOnline() { return online; }
    public void setOnline(boolean online) { this.online = online; }

    public String getReviewNote() { return reviewNote; }
    public void setReviewNote(String reviewNote) { this.reviewNote = reviewNote; }

    public LocalDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(LocalDateTime reviewedAt) { this.reviewedAt = reviewedAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
}
