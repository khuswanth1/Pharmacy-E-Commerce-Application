package com.pharmacy.payment.repo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.pharmacy.common.PaymentStatus;
import com.pharmacy.payment.entity.PaymentEntity;

public interface PaymentRepository extends JpaRepository<PaymentEntity, String> {
    Optional<PaymentEntity> findByRazorpayOrderId(String razorpayOrderId);

    /** An order can have several attempts; this is the latest. */
    Optional<PaymentEntity> findFirstByOrderIdOrderByCreatedAtDesc(String orderId);

    List<PaymentEntity> findByOrderIdAndPaymentStatus(String orderId, PaymentStatus status);

    boolean existsByOrderIdAndPaymentStatus(String orderId, PaymentStatus status);

    /** A user's payments. Older rows have no userId, so also match ids that embed it (WLT_/LAB_). */
    List<PaymentEntity> findByUserIdOrOrderIdStartingWithOrOrderIdStartingWithOrderByCreatedAtDesc(
            String userId, String walletPrefix, String labPrefix);
}
