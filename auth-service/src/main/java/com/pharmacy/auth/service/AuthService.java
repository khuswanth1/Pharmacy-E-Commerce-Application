package com.pharmacy.auth.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pharmacy.auth.config.JwtService;
import com.pharmacy.auth.dto.AuthRequest;
import com.pharmacy.auth.dto.PartnerRegisterRequest;
import com.pharmacy.auth.dto.RegisterRequest;
import com.pharmacy.auth.dto.TokenResponse;
import com.pharmacy.auth.entity.AuthEvent;
import com.pharmacy.auth.entity.AuthProvider;
import com.pharmacy.auth.entity.PartnerProfile;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.repo.PartnerProfileRepository;
import com.pharmacy.auth.repo.UserRepository;
import com.pharmacy.auth.service.GoogleTokenVerifier.GoogleProfile;
import com.pharmacy.common.PartnerStatus;
import com.pharmacy.common.Role;

/**
 * Core authentication use-cases: local registration/login, Google sign-in
 * (both server-verified ID token and browser OAuth2 provisioning) and password
 * recovery.
 */
@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwt;
    private final GoogleTokenVerifier googleVerifier;
    private final PartnerProfileRepository partners;
    private final AuthEventService authEvents;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder,
                       JwtService jwt, GoogleTokenVerifier googleVerifier,
                       PartnerProfileRepository partners, AuthEventService authEvents) {
        this.users = users;
        this.partners = partners;
        this.authEvents = authEvents;
        this.passwordEncoder = passwordEncoder;
        this.jwt = jwt;
        this.googleVerifier = googleVerifier;
    }

    @Transactional
    public User register(RegisterRequest req) {
        if (users.existsByEmail(req.email())) {
            throw new IllegalArgumentException("An account with this email already exists");
        }
        User u = new User();
        u.setName(req.name());
        u.setEmail(req.email());
        u.setPassword(passwordEncoder.encode(req.password()));
        u.setPhone(req.phone());
        u.setGender(req.gender());
        u.setProvider(AuthProvider.LOCAL);
        u.setRoles(Set.of(Role.ROLE_USER));
        User saved = users.save(u);
        authEvents.record(saved, AuthEvent.Type.SIGNUP, AuthEvent.Method.PASSWORD);
        return saved;
    }

    /** Creates a vendor or delivery-partner account in PENDING state, awaiting admin approval. */
    @Transactional
    public User registerPartner(PartnerRegisterRequest req) {
        return createPartner(req, PartnerStatus.PENDING, false);
    }

    /** An admin adds a vendor or delivery partner directly. The account is approved straight away. */
    @Transactional
    public User createPartnerAsAdmin(PartnerRegisterRequest req) {
        if (!isBlank(req.googleIdToken())) {
            throw new IllegalArgumentException("Admins create partners with an email and password");
        }
        return createPartner(req, PartnerStatus.APPROVED, true);
    }

    private User createPartner(PartnerRegisterRequest req, PartnerStatus status, boolean byAdmin) {
        // With Google, the name and email come from the verified Google account, not the form.
        GoogleProfile google = isBlank(req.googleIdToken()) ? null : googleVerifier.verify(req.googleIdToken());
        String email = google != null ? google.email() : req.email();
        String name = google != null && !isBlank(google.name()) ? google.name() : req.name();
        if (isBlank(name) || isBlank(email)) {
            throw new IllegalArgumentException("Name and email are required");
        }
        if (google == null && (req.password() == null || req.password().length() < 6)) {
            throw new IllegalArgumentException("Password must be at least 6 characters long");
        }
        if (users.existsByEmail(email)) {
            throw new IllegalArgumentException("An account with this email already exists");
        }
        boolean vendor = "VENDOR".equals(req.type());
        if (vendor && (isBlank(req.businessName()) || isBlank(req.drugLicenseNumber()))) {
            throw new IllegalArgumentException("Store name and drug licence number are required for vendors");
        }
        if (!vendor && (isBlank(req.vehicleType()) || isBlank(req.drivingLicenseNumber()))) {
            throw new IllegalArgumentException("Vehicle type and driving licence number are required for delivery partners");
        }
        Role role = vendor ? Role.ROLE_VENDOR : Role.ROLE_DELIVERY;

        User u = new User();
        u.setName(name);
        u.setEmail(email);
        u.setPhone(req.phone());
        u.setAddress(req.businessAddress());
        if (google != null) {
            u.setProvider(AuthProvider.GOOGLE);
            u.setProviderId(google.sub());
            u.setPicture(google.picture());
        } else {
            u.setPassword(passwordEncoder.encode(req.password()));
            u.setProvider(AuthProvider.LOCAL);
        }
        u.setRoles(Set.of(role));
        u.setPartnerStatus(status);
        User saved = users.save(u);

        PartnerProfile p = new PartnerProfile();
        p.setUserId(saved.getId());
        p.setPartnerRole(role);
        p.setBusinessName(req.businessName());
        p.setDrugLicenseNumber(req.drugLicenseNumber());
        p.setGstin(req.gstin());
        p.setVehicleType(req.vehicleType());
        p.setVehicleNumber(req.vehicleNumber());
        p.setDrivingLicenseNumber(req.drivingLicenseNumber());
        p.setBusinessAddress(req.businessAddress());
        p.setCity(req.city());
        p.setPincode(req.pincode());
        if (byAdmin) {
            p.setReviewNote("Added by admin");
            p.setReviewedAt(LocalDateTime.now());
        }
        partners.save(p);
        authEvents.record(saved, AuthEvent.Type.SIGNUP,
                byAdmin ? AuthEvent.Method.ADMIN_CREATED
                        : google != null ? AuthEvent.Method.GOOGLE : AuthEvent.Method.PASSWORD);
        return saved;
    }

    /**
     * Google sign-in for an existing vendor or delivery partner. Never creates an account:
     * new partners must apply first (with or without Google) so an admin can check their details.
     */
    public TokenResponse loginPartnerWithGoogle(String idToken, String type) {
        Role role = switch (type == null ? "" : type) {
            case "VENDOR" -> Role.ROLE_VENDOR;
            case "DELIVERY" -> Role.ROLE_DELIVERY;
            default -> throw new IllegalArgumentException("Role must be VENDOR or DELIVERY");
        };
        GoogleProfile profile = googleVerifier.verify(idToken);
        String label = role == Role.ROLE_VENDOR ? "vendor" : "delivery partner";
        User u = users.findByEmail(profile.email())
                .orElseThrow(() -> new IllegalArgumentException(
                        "No " + label + " account uses this Google email. Apply first to register."));
        if (u.getRoles() == null || !u.getRoles().contains(role)) {
            throw new IllegalArgumentException("This Google account is not registered as a " + label + ".");
        }
        if (!u.isEnabled()) {
            throw new IllegalArgumentException("This account has been disabled");
        }
        if (u.getProviderId() == null) {
            u.setProviderId(profile.sub());
        }
        recordLogin(u, AuthEvent.Method.GOOGLE);
        return issueToken(u);
    }

    /** Re-issues a token so changes such as partner approval take effect without logging out. */
    public TokenResponse refreshToken(String userId) {
        User u = users.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!u.isEnabled()) {
            throw new IllegalArgumentException("This account has been disabled");
        }
        return issueToken(u);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    public TokenResponse login(AuthRequest req) {
        User u = users.findByEmail(req.email())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));
        if (u.getPassword() == null || !passwordEncoder.matches(req.password(), u.getPassword())) {
            throw new IllegalArgumentException("Invalid email or password");
        }
        if (!u.isEnabled()) {
            throw new IllegalArgumentException("This account has been disabled");
        }
        recordLogin(u, AuthEvent.Method.PASSWORD);
        return issueToken(u);
    }

    /** Updates last_login_at and records the login for the admin Activity tab. */
    private void recordLogin(User u, AuthEvent.Method method) {
        u.setLastLoginAt(LocalDateTime.now());
        users.save(u);
        authEvents.record(u, AuthEvent.Type.LOGIN, method);
    }

    /** Server-side Google sign-in using a verified ID token from the browser. */
    @Transactional
    public TokenResponse loginWithGoogleIdToken(String idToken) {
        GoogleProfile profile = googleVerifier.verify(idToken);
        User u = provisionGoogleUser(profile.email(), profile.name(), profile.picture(), profile.sub());
        return issueToken(u);
    }

    /**
     * Finds or creates a user from Google profile data. Used by both the ID-token
     * flow and the Spring Security OAuth2 success handler.
     */
    @Transactional
    public User provisionGoogleUser(String email, String name, String picture, String providerId) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Google account did not provide an email");
        }
        User user = users.findByEmail(email)
                .map(existing -> {
                    if (picture != null && !picture.equals(existing.getPicture())) {
                        existing.setPicture(picture);
                    }
                    if (existing.getProviderId() == null && providerId != null) {
                        existing.setProviderId(providerId);
                    }
                    return existing;
                })
                .orElseGet(() -> {
                    User u = new User();
                    u.setName(name != null ? name : email.split("@")[0]);
                    u.setEmail(email);
                    u.setPicture(picture);
                    u.setProvider(AuthProvider.GOOGLE);
                    u.setProviderId(providerId);
                    u.setRoles(Set.of(Role.ROLE_USER));
                    User saved = users.save(u);
                    authEvents.record(saved, AuthEvent.Type.SIGNUP, AuthEvent.Method.GOOGLE);
                    return saved;
                });
        recordLogin(user, AuthEvent.Method.GOOGLE);
        return user;
    }

    /** Verifies the email is registered before allowing a password reset. */
    public void verifyAccountExists(String email) {
        if (!users.existsByEmail(email)) {
            throw new IllegalArgumentException("This email address is not registered");
        }
    }

    @Transactional
    public void resetPassword(String email, String newPassword) {
        User u = users.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("This email address is not registered"));
        u.setPassword(passwordEncoder.encode(newPassword));
        if (u.getProvider() == null) {
            u.setProvider(AuthProvider.LOCAL);
        }
        users.save(u);
    }

    public TokenResponse issueToken(User u) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", u.getEmail());
        claims.put("roles", u.getRoles() == null ? Set.of() : u.getRoles());
        if (u.getPartnerStatus() != null) {
            claims.put("partnerStatus", u.getPartnerStatus().name());
        }
        String token = jwt.generateToken(u.getId(), claims);
        return new TokenResponse(token, u.getId());
    }
}
