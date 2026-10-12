package com.pharmacy.auth.service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pharmacy.auth.dto.PartnerResponse;
import com.pharmacy.auth.dto.UserResponse;
import com.pharmacy.auth.entity.PartnerProfile;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.exception.ResourceNotFoundException;
import com.pharmacy.auth.repo.PartnerProfileRepository;
import com.pharmacy.auth.repo.UserRepository;
import com.pharmacy.common.PartnerStatus;
import com.pharmacy.common.Role;

/** Partner self-service (vendor / delivery) and the admin use-cases that manage accounts. */
@Service
public class PartnerService {

    private final UserRepository users;
    private final PartnerProfileRepository partners;

    public PartnerService(UserRepository users, PartnerProfileRepository partners) {
        this.users = users;
        this.partners = partners;
    }

    public PartnerResponse getPartner(String userId) {
        User u = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        PartnerProfile p = partners.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("This account is not a vendor or delivery partner"));
        return PartnerResponse.from(u, p);
    }

    @Transactional
    public PartnerResponse setOnline(String userId, boolean online) {
        PartnerProfile p = partners.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("This account is not a vendor or delivery partner"));
        User u = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (online && u.getPartnerStatus() != PartnerStatus.APPROVED) {
            throw new IllegalArgumentException("Your account must be approved before going online");
        }
        p.setOnline(online);
        return PartnerResponse.from(u, partners.save(p));
    }

    /** Lists partners, optionally filtered by role (ROLE_VENDOR / ROLE_DELIVERY) and status. */
    public List<PartnerResponse> listPartners(Role role, PartnerStatus status) {
        List<PartnerProfile> profiles = role == null
                ? partners.findAllByOrderByCreatedAtDesc()
                : partners.findByPartnerRoleOrderByCreatedAtDesc(role);
        Map<String, User> byId = new LinkedHashMap<>();
        users.findAllById(profiles.stream().map(PartnerProfile::getUserId).toList())
                .forEach(u -> byId.put(u.getId(), u));
        return profiles.stream()
                .filter(p -> byId.containsKey(p.getUserId()))
                .map(p -> PartnerResponse.from(byId.get(p.getUserId()), p))
                .filter(r -> status == null || r.status() == status)
                .toList();
    }

    /** Approve, reject or suspend a partner. A note is required when rejecting or suspending. */
    @Transactional
    public PartnerResponse review(String userId, PartnerStatus status, String note) {
        if (status == PartnerStatus.PENDING) {
            throw new IllegalArgumentException("Choose APPROVED, REJECTED or SUSPENDED");
        }
        if (status != PartnerStatus.APPROVED && (note == null || note.isBlank())) {
            throw new IllegalArgumentException("Please give a reason");
        }
        User u = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        PartnerProfile p = partners.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("This account is not a vendor or delivery partner"));
        u.setPartnerStatus(status);
        p.setReviewNote(note);
        p.setReviewedAt(LocalDateTime.now());
        if (status != PartnerStatus.APPROVED) {
            p.setOnline(false);
        }
        return PartnerResponse.from(users.save(u), partners.save(p));
    }

    public List<UserResponse> listUsers() {
        return users.findAll().stream().map(UserResponse::from).toList();
    }

    @Transactional
    public UserResponse setEnabled(String userId, boolean enabled, String actingAdminId) {
        if (userId.equals(actingAdminId) && !enabled) {
            throw new IllegalArgumentException("You cannot disable your own account");
        }
        User u = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        u.setEnabled(enabled);
        return UserResponse.from(users.save(u));
    }

    public Map<String, Object> stats() {
        List<User> all = users.findAll();
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("customers", all.stream().filter(u -> has(u, Role.ROLE_USER)).count());
        s.put("vendors", all.stream().filter(u -> has(u, Role.ROLE_VENDOR)).count());
        s.put("deliveryPartners", all.stream().filter(u -> has(u, Role.ROLE_DELIVERY)).count());
        s.put("pendingApprovals", all.stream().filter(u -> u.getPartnerStatus() == PartnerStatus.PENDING).count());
        s.put("onlineDeliveryPartners", partners.findByPartnerRoleOrderByCreatedAtDesc(Role.ROLE_DELIVERY)
                .stream().filter(PartnerProfile::isOnline).count());
        return s;
    }

    private static boolean has(User u, Role r) {
        return u.getRoles() != null && u.getRoles().contains(r);
    }
}
