package com.pharmacy.auth.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.pharmacy.auth.dto.PartnerResponse;
import com.pharmacy.auth.service.PartnerService;
import com.pharmacy.common.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Self-service for vendors and delivery partners. The caller is identified by the
 * {@code X-User-Id} header the API gateway sets from the verified JWT.
 */
@RestController
@RequestMapping("/api/auth/partner")
@Tag(name = "Partners", description = "Vendor and delivery-partner account")
public class PartnerController {

    private final PartnerService partnerService;

    public PartnerController(PartnerService partnerService) {
        this.partnerService = partnerService;
    }

    @GetMapping("/me")
    @Operation(summary = "The signed-in partner's account, business details and approval status")
    public ApiResponse<PartnerResponse> me(@RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok("Partner profile", partnerService.getPartner(userId));
    }

    @PutMapping("/me/online")
    @Operation(summary = "Go online or offline for new delivery requests")
    public ApiResponse<PartnerResponse> setOnline(@RequestHeader("X-User-Id") String userId,
                                                  @RequestParam boolean online) {
        return ApiResponse.ok(online ? "You are online" : "You are offline",
                partnerService.setOnline(userId, online));
    }
}
