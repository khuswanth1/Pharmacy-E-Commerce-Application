package com.pharmacy.auth.repo;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.pharmacy.auth.entity.User;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);

    @Modifying(clearAutomatically = true)
    @Query("update User u set u.walletBalance = u.walletBalance + :amount where u.id = :id")
    int creditWallet(@Param("id") String id, @Param("amount") double amount);

    /** Deducts only if the balance covers it. Returns 0 when the balance is too low. */
    @Modifying(clearAutomatically = true)
    @Query("update User u set u.walletBalance = u.walletBalance - :amount where u.id = :id and u.walletBalance >= :amount")
    int debitWallet(@Param("id") String id, @Param("amount") double amount);
}
