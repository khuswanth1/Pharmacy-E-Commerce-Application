package com.pharmacy.payment.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import com.pharmacy.common.PaymentStatus;
import jakarta.persistence.*;

@Entity
@Table(name = "payments")
public class PaymentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String orderId;
    private String razorpayOrderId;
    private String razorpayPaymentId;
    private String razorpaySignature;
    private BigDecimal amount;
    private String currency = "INR";
    private String paymentMethod;

    /** Who paid. Null on rows created before this was recorded. */
    private String userId;

    /** What the money is for. Stored as text so new values need no column change. */
    @Enumerated(EnumType.STRING)
    @Column(length = 20, columnDefinition = "varchar(20)")
    private Purpose purpose;

    /** True once the order was marked paid / the wallet credited after a successful payment. */
    @Column(columnDefinition = "bit default 0")
    private Boolean fulfilled = false;

    private LocalDateTime refundedAt;

    public enum Purpose { ORDER, WALLET_TOPUP, LAB_TEST }

    @Enumerated(EnumType.STRING)
    private PaymentStatus paymentStatus = PaymentStatus.PENDING;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public String getOrderId() { return orderId; }
    public void setOrderId(String orderId) { this.orderId = orderId; }
    public String getRazorpayOrderId() { return razorpayOrderId; }
    public void setRazorpayOrderId(String razorpayOrderId) { this.razorpayOrderId = razorpayOrderId; }
    public String getRazorpayPaymentId() { return razorpayPaymentId; }
    public void setRazorpayPaymentId(String razorpayPaymentId) { this.razorpayPaymentId = razorpayPaymentId; }
    @com.fasterxml.jackson.annotation.JsonIgnore
    public String getRazorpaySignature() { return razorpaySignature; }
    public void setRazorpaySignature(String razorpaySignature) { this.razorpaySignature = razorpaySignature; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public Purpose getPurpose() { return purpose; }
    public void setPurpose(Purpose purpose) { this.purpose = purpose; }
    public boolean isFulfilled() { return Boolean.TRUE.equals(fulfilled); }
    public void setFulfilled(boolean fulfilled) { this.fulfilled = fulfilled; }
    public LocalDateTime getRefundedAt() { return refundedAt; }
    public void setRefundedAt(LocalDateTime refundedAt) { this.refundedAt = refundedAt; }
    public PaymentStatus getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(PaymentStatus paymentStatus) { this.paymentStatus = paymentStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    // kept for backward-compat with controller code that still exists during migration
    /** @deprecated use {@link #getPaymentStatus()} */
    @Deprecated public PaymentStatus getStatus() { return paymentStatus; }
    /** @deprecated use {@link #setPaymentStatus(PaymentStatus)} */
    @Deprecated public void setStatus(PaymentStatus s) { this.paymentStatus = s; }
}
