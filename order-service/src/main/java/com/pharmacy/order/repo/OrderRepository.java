package com.pharmacy.order.repo;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pharmacy.common.OrderStatus;
import com.pharmacy.order.entity.OrderEntity;

public interface OrderRepository extends JpaRepository<OrderEntity, String> {
    List<OrderEntity> findByUserIdOrderByCreatedAtDesc(String userId);

    List<OrderEntity> findAllByOrderByCreatedAtDesc();
    List<OrderEntity> findByStatusOrderByCreatedAtDesc(OrderStatus status);

    // Vendor
    List<OrderEntity> findByVendorIdIsNullAndStatusInOrderByCreatedAtAsc(Collection<OrderStatus> statuses);
    List<OrderEntity> findByVendorIdOrderByCreatedAtDesc(String vendorId);

    // Delivery
    List<OrderEntity> findByDeliveryPartnerIdIsNullAndStatusOrderByPackedAtAsc(OrderStatus status);
    List<OrderEntity> findByDeliveryPartnerIdOrderByCreatedAtDesc(String deliveryPartnerId);

    /**
     * One row per customer: [userId, order count, amount spent, last order time].
     * Spent excludes cancelled and failed orders.
     */
    @Query("select o.userId, count(o), "
         + "coalesce(sum(case when o.status in (com.pharmacy.common.OrderStatus.CANCELLED, com.pharmacy.common.OrderStatus.FAILED) "
         + "then 0 else o.totalAmount end), 0), max(o.createdAt) "
         + "from OrderEntity o where o.userId is not null group by o.userId")
    List<Object[]> customerSummaries();

    /** Claims an unassigned order for a vendor. Returns 0 if someone else got it first. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update OrderEntity o set o.vendorId = :vendorId, o.vendorName = :vendorName, "
         + "o.status = com.pharmacy.common.OrderStatus.CONFIRMED, o.acceptedAt = :now "
         + "where o.id = :orderId and o.vendorId is null and o.status in :statuses")
    int claimForVendor(@Param("orderId") String orderId, @Param("vendorId") String vendorId,
                       @Param("vendorName") String vendorName, @Param("now") LocalDateTime now,
                       @Param("statuses") Collection<OrderStatus> statuses);

    /** Claims a packed order for a delivery partner. Returns 0 if someone else got it first. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update OrderEntity o set o.deliveryPartnerId = :partnerId, o.deliveryPartnerName = :name, "
         + "o.deliveryPartnerPhone = :phone "
         + "where o.id = :orderId and o.deliveryPartnerId is null "
         + "and o.status = com.pharmacy.common.OrderStatus.PACKED")
    int claimForDelivery(@Param("orderId") String orderId, @Param("partnerId") String partnerId,
                         @Param("name") String name, @Param("phone") String phone);
}
