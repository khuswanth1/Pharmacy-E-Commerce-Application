package com.pharmacy.auth.config;

import java.util.HashSet;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.pharmacy.auth.entity.AuthProvider;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.repo.UserRepository;
import com.pharmacy.common.Role;

/**
 * Creates the first admin from {@code ADMIN_EMAIL} / {@code ADMIN_PASSWORD} on startup.
 * Admins cannot sign up through the API, so this is the only way to get one.
 * If the email already exists, that account is given ROLE_ADMIN (password unchanged).
 */
@Component
public class AdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;

    public AdminSeeder(UserRepository users, PasswordEncoder passwordEncoder,
                       @Value("${app.admin.email:}") String email,
                       @Value("${app.admin.password:}") String password) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.email = email;
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (email.isBlank()) {
            log.info("ADMIN_EMAIL not set; skipping admin bootstrap");
            return;
        }
        users.findByEmail(email).ifPresentOrElse(existing -> {
            if (existing.getRoles() == null || !existing.getRoles().contains(Role.ROLE_ADMIN)) {
                Set<Role> roles = existing.getRoles() == null ? new HashSet<>() : new HashSet<>(existing.getRoles());
                roles.add(Role.ROLE_ADMIN);
                existing.setRoles(roles);
                users.save(existing);
                log.info("Granted ROLE_ADMIN to existing account {}", email);
            }
        }, () -> {
            if (password.length() < 8) {
                log.warn("ADMIN_PASSWORD must be at least 8 characters; admin {} not created", email);
                return;
            }
            User u = new User();
            u.setName("Admin");
            u.setEmail(email);
            u.setPassword(passwordEncoder.encode(password));
            u.setProvider(AuthProvider.LOCAL);
            u.setRoles(Set.of(Role.ROLE_ADMIN));
            users.save(u);
            log.info("Created admin account {}", email);
        });
    }
}
