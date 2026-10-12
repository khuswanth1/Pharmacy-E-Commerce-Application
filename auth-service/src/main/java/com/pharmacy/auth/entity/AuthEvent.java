package com.pharmacy.auth.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** One sign-up or login, shown to admins on the Activity tab. */
@Entity
@Table(name = "auth_events", indexes = {
        @Index(name = "idx_auth_events_at", columnList = "occurredAt"),
        @Index(name = "idx_auth_events_user", columnList = "userId")
})
public class AuthEvent {

    public enum Type { SIGNUP, LOGIN }

    public enum Method { PASSWORD, GOOGLE, ADMIN_CREATED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String userId;

    private String email;
    private String name;

    /** The account's main role at the time, e.g. ROLE_VENDOR. */
    private String role;

    // Stored as text so new values don't need a column change (see db/migrations).
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20)")
    private Type type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, columnDefinition = "varchar(20)")
    private Method method;

    @Column(nullable = false, updatable = false)
    private LocalDateTime occurredAt;

    @PrePersist
    void onCreate() {
        this.occurredAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }
    public Method getMethod() { return method; }
    public void setMethod(Method method) { this.method = method; }
    public LocalDateTime getOccurredAt() { return occurredAt; }
}
