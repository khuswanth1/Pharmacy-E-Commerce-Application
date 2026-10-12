package com.pharmacy.auth.controller;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.pharmacy.auth.dto.AuthRequest;
import com.pharmacy.auth.dto.ForgotPasswordRequest;
import com.pharmacy.auth.dto.GoogleLoginRequest;
import com.pharmacy.auth.dto.PartnerRegisterRequest;
import com.pharmacy.auth.dto.RegisterRequest;
import com.pharmacy.auth.dto.ResetPasswordRequest;
import com.pharmacy.auth.dto.TokenResponse;
import com.pharmacy.auth.dto.UpdateProfileRequest;
import com.pharmacy.auth.dto.UserResponse;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.service.AuthService;
import com.pharmacy.auth.service.ProfileService;
import com.pharmacy.common.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Login, registration, Google sign-in and profile management")
public class AuthController {

    private final AuthService authService;
    private final ProfileService profileService;
    private final String googleAuthorizationUrl;
    private final String googleCallbackUrl;

    public AuthController(
            AuthService authService,
            ProfileService profileService,
            @Value("${app.oauth2.authorization-url:/oauth2/authorization/google}") String googleAuthorizationUrl,
            @Value("${app.oauth2.callback-url:/login/oauth2/code/google}") String googleCallbackUrl) {
        this.authService = authService;
        this.profileService = profileService;
        this.googleAuthorizationUrl = googleAuthorizationUrl;
        this.googleCallbackUrl = googleCallbackUrl;
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new local account")
    public ApiResponse<Map<String, String>> register(@RequestBody @Valid RegisterRequest req) {
        User u = authService.register(req);
        return ApiResponse.ok("User registered successfully",
                Map.of("id", u.getId(), "email", u.getEmail()));
    }

    @PostMapping("/register/partner")
    @Operation(summary = "Sign up as a vendor or delivery partner (starts pending admin approval)")
    public ApiResponse<TokenResponse> registerPartner(@RequestBody @Valid PartnerRegisterRequest req) {
        User u = authService.registerPartner(req);
        return ApiResponse.ok("Application submitted. An admin will review it shortly.",
                authService.issueToken(u));
    }

    @PostMapping("/token/refresh")
    @Operation(summary = "Issue a fresh token reflecting the account's current roles and approval status")
    public ApiResponse<TokenResponse> refreshToken(@RequestHeader("X-User-Id") String userId) {
        return ApiResponse.ok("Token refreshed", authService.refreshToken(userId));
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate with email and password")
    public ApiResponse<TokenResponse> login(@RequestBody @Valid AuthRequest req) {
        return ApiResponse.ok("Login successful", authService.login(req));
    }

    @GetMapping("/google")
    @Operation(summary = "Discover the Google OAuth2 redirect endpoint")
    public ApiResponse<Map<String, String>> googleEndpoint() {
        return ApiResponse.ok("Redirect the browser to start Google sign-in", Map.of(
                "endpoint", googleAuthorizationUrl,
                "callback", googleCallbackUrl
        ));
    }

    @PostMapping("/google")
    @Operation(summary = "Sign in with a Google ID token (Google Identity Services)")
    public ApiResponse<TokenResponse> googleLogin(@RequestBody GoogleLoginRequest req) {
        TokenResponse token;
        if (req.role() != null && !req.role().isBlank()) {
            if (req.idToken() == null || req.idToken().isBlank()) {
                throw new IllegalArgumentException("Partner Google sign-in needs a Google ID token");
            }
            token = authService.loginPartnerWithGoogle(req.idToken(), req.role());
        } else if (req.idToken() != null && !req.idToken().isBlank()) {
            token = authService.loginWithGoogleIdToken(req.idToken());
        } else if (req.email() != null && !req.email().isBlank()) {
            User u = authService.provisionGoogleUser(req.email(), req.name(), null, null);
            token = authService.issueToken(u);
        } else {
            throw new IllegalArgumentException("Either idToken or email must be provided");
        }
        return ApiResponse.ok("Google login successful", token);
    }

    @GetMapping("/profile/{id}")
    @Operation(summary = "Fetch a user's profile")
    public ApiResponse<UserResponse> getProfile(@PathVariable String id) {
        return ApiResponse.ok("Profile", UserResponse.from(profileService.getById(id)));
    }

    @PutMapping("/profile/{id}")
    @Operation(summary = "Update a user's profile")
    public ApiResponse<UserResponse> updateProfile(@PathVariable String id,
                                                   @RequestBody UpdateProfileRequest req) {
        return ApiResponse.ok("Profile updated", UserResponse.from(profileService.update(id, req)));
    }

    @PostMapping("/forgot")
    @Operation(summary = "Verify an email is registered before password reset")
    public ApiResponse<Void> forgotPassword(@RequestBody @Valid ForgotPasswordRequest req) {
        authService.verifyAccountExists(req.email());
        return ApiResponse.ok("Account verified. You may now reset your password.", null);
    }

    @PostMapping("/reset")
    @Operation(summary = "Set a new password for a registered account")
    public ApiResponse<Void> resetPassword(@RequestBody @Valid ResetPasswordRequest req) {
        authService.resetPassword(req.email(), req.password());
        return ApiResponse.ok("Password reset successfully", null);
    }
}
