package com.pharmacy.auth.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.pharmacy.auth.entity.AuthEvent;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.repo.AuthEventRepository;
import com.pharmacy.common.Role;

/** Records sign-ups and logins for the admin Activity tab. */
@Service
public class AuthEventService {

    private static final Logger log = LoggerFactory.getLogger(AuthEventService.class);
    private static final int MAX_LIMIT = 500;

    private final AuthEventRepository events;
    private final TransactionTemplate ownTransaction;

    public AuthEventService(AuthEventRepository events, PlatformTransactionManager txManager) {
        this.events = events;
        this.ownTransaction = new TransactionTemplate(txManager);
        this.ownTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Saves the event in its own transaction, so a recording problem is logged and
     * never fails or rolls back the sign-in itself. Callers update last_login_at.
     */
    public void record(User u, AuthEvent.Type type, AuthEvent.Method method) {
        try {
            AuthEvent e = new AuthEvent();
            e.setUserId(u.getId());
            e.setEmail(u.getEmail());
            e.setName(u.getName());
            e.setRole(mainRole(u));
            e.setType(type);
            e.setMethod(method);
            ownTransaction.executeWithoutResult(status -> events.save(e));
        } catch (Exception ex) {
            log.warn("Could not record {} for user {}: {}", type, u.getId(), ex.getMessage());
        }
    }

    public List<AuthEvent> recent(AuthEvent.Type type, String userId, int limit) {
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, MAX_LIMIT)));
        if (userId != null && !userId.isBlank()) {
            return events.findByUserIdOrderByOccurredAtDesc(userId, page);
        }
        return type == null ? events.findAllByOrderByOccurredAtDesc(page) : events.findByTypeOrderByOccurredAtDesc(type, page);
    }

    private static String mainRole(User u) {
        if (u.getRoles() == null || u.getRoles().isEmpty()) return null;
        for (Role r : List.of(Role.ROLE_ADMIN, Role.ROLE_VENDOR, Role.ROLE_DELIVERY, Role.ROLE_PHARMACIST, Role.ROLE_USER)) {
            if (u.getRoles().contains(r)) return r.name();
        }
        return u.getRoles().iterator().next().name();
    }
}
