package com.pharmacy.auth.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.pharmacy.auth.dto.PartnerRegisterRequest;
import com.pharmacy.auth.dto.PartnerResponse;
import com.pharmacy.auth.entity.AuthEvent;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.service.AuthEventService;
import com.pharmacy.auth.service.AuthService;
import com.pharmacy.auth.dto.UserResponse;
import com.pharmacy.auth.service.PartnerService;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.common.PartnerStatus;
import com.pharmacy.common.Role;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

/** Admin-only account management. The gateway only lets ROLE_ADMIN tokens reach /api/auth/admin. */
@RestController
@RequestMapping("/api/auth/admin")
@Tag(name = "Admin", description = "Approve partners and manage user accounts")
public class AdminController {

    private final PartnerService partnerService;
    private final AuthService authService;
    private final AuthEventService authEvents;

    public AdminController(PartnerService partnerService, AuthService authService, AuthEventService authEvents) {
        this.partnerService = partnerService;
        this.authService = authService;
        this.authEvents = authEvents;
    }

    @PostMapping("/partners")
    @Operation(summary = "Create a vendor or delivery partner (approved immediately)")
    public ApiResponse<PartnerResponse> createPartner(@RequestBody @Valid PartnerRegisterRequest req) {
        User u = authService.createPartnerAsAdmin(req);
        return ApiResponse.ok("Partner created", partnerService.getPartner(u.getId()));
    }

    @GetMapping("/activity")
    @Operation(summary = "Recent sign-ups and logins, newest first. Filter by type (SIGNUP / LOGIN) or userId")
    public ApiResponse<List<AuthEvent>> activity(@RequestParam(required = false) AuthEvent.Type type,
                                                 @RequestParam(required = false) String userId,
                                                 @RequestParam(defaultValue = "100") int limit) {
        return ApiResponse.ok("Activity", authEvents.recent(type, userId, limit));
    }

    @GetMapping("/stats")
    @Operation(summary = "Account counts for the admin dashboard")
    public ApiResponse<Map<String, Object>> stats() {
        return ApiResponse.ok("Stats", partnerService.stats());
    }

    @GetMapping("/partners")
    @Operation(summary = "List vendors and delivery partners, optionally by role and status")
    public ApiResponse<List<PartnerResponse>> partners(@RequestParam(required = false) Role role,
                                                       @RequestParam(required = false) PartnerStatus status) {
        return ApiResponse.ok("Partners", partnerService.listPartners(role, status));
    }

    @PutMapping("/partners/{userId}/review")
    @Operation(summary = "Approve, reject or suspend a partner. Body: { status, note }")
    public ApiResponse<PartnerResponse> review(@PathVariable String userId,
                                               @RequestBody Map<String, String> body) {
        PartnerStatus status = PartnerStatus.valueOf(body.getOrDefault("status", ""));
        return ApiResponse.ok("Partner " + status.name().toLowerCase(),
                partnerService.review(userId, status, body.get("note")));
    }

    @GetMapping("/users")
    @Operation(summary = "List all accounts")
    public ApiResponse<List<UserResponse>> users() {
        return ApiResponse.ok("Users", partnerService.listUsers());
    }

    @PutMapping("/users/{userId}/enabled")
    @Operation(summary = "Enable or disable an account")
    public ApiResponse<UserResponse> setEnabled(@PathVariable String userId,
                                                @RequestParam boolean enabled,
                                                @RequestHeader("X-User-Id") String adminId) {
        return ApiResponse.ok(enabled ? "Account enabled" : "Account disabled",
                partnerService.setEnabled(userId, enabled, adminId));
    }
}
