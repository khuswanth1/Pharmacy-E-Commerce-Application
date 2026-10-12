package com.pharmacy.payment.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for POST /api/payments/create-order
 *
 * paymentMethod : UPI | CARD | WALLET | PAYLATER | COD | RAZORPAY
 *                 Defaults to RAZORPAY when not supplied.
 */
public class PaymentOrderRequest {

    @NotBlank(message = "orderId is required")
    private String orderId;

    /**
     * In paise (e.g. 49900 = ₹499). Only used for wallet top-ups (WLT_) and lab tests (LAB_);
     * medicine orders are always charged their total from order-service.
     */
    private long amount;

    /** Optional – client passes the chosen payment method for record keeping. */
    private String paymentMethod = "RAZORPAY";

    public String getOrderId()               { return orderId; }
    public void   setOrderId(String orderId) { this.orderId = orderId; }

    public long   getAmount()                { return amount; }
    public void   setAmount(long amount)     { this.amount = amount; }

    public String getPaymentMethod()                     { return paymentMethod; }
    public void   setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
}
