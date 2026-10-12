package com.pharmacy.auth.controller;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.pharmacy.auth.dto.UserResponse;
import com.pharmacy.auth.exception.ResourceNotFoundException;
import com.pharmacy.auth.repo.UserRepository;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.common.InternalToken;
import io.swagger.v3.oas.annotations.Hidden;

/**
 * Wallet balance changes, called only by payment-service after a verified payment,
 * a wallet purchase or a refund. Browsers can never change the balance directly.
 */
@Hidden
@RestController
@RequestMapping("/api/auth/internal/wallet")
public class InternalWalletController {

    private final UserRepository users;
    private final String internalToken;

    public InternalWalletController(UserRepository users, @Value("${app.internal-token:}") String internalToken) {
        this.users = users;
        this.internalToken = internalToken;
    }

    /** Body: { amount } in rupees. */
    @PostMapping("/{userId}/credit")
    @Transactional
    public ApiResponse<UserResponse> credit(@PathVariable("userId") String userId, @RequestBody Map<String, Object> body,
                                            @RequestHeader(value = InternalToken.HEADER, required = false) String token) {
        InternalToken.require(internalToken, token);
        double amount = amountOf(body);
        if (users.creditWallet(userId, amount) == 0) {
            throw new ResourceNotFoundException("User not found");
        }
        return ApiResponse.ok("Wallet credited", UserResponse.from(users.findById(userId).orElseThrow()));
    }

    /** Body: { amount } in rupees. Fails without changing anything if the balance is too low. */
    @PostMapping("/{userId}/debit")
    @Transactional
    public ApiResponse<UserResponse> debit(@PathVariable("userId") String userId, @RequestBody Map<String, Object> body,
                                           @RequestHeader(value = InternalToken.HEADER, required = false) String token) {
        InternalToken.require(internalToken, token);
        double amount = amountOf(body);
        if (!users.existsById(userId)) {
            throw new ResourceNotFoundException("User not found");
        }
        if (users.debitWallet(userId, amount) == 0) {
            throw new IllegalArgumentException("Not enough wallet balance");
        }
        return ApiResponse.ok("Wallet debited", UserResponse.from(users.findById(userId).orElseThrow()));
    }

    private static double amountOf(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("amount");
        double val = 0.0;
        if (raw instanceof Number n) {
            val = n.doubleValue();
        } else if (raw instanceof String s) {
            try {
                val = Double.parseDouble(s);
            } catch (NumberFormatException ignored) {
            }
        }
        if (val <= 0) {
            throw new IllegalArgumentException("amount must be a positive number");
        }
        // Round to paise so floating-point noise never accumulates in the balance.
        return Math.round(val * 100.0) / 100.0;
    }
}
