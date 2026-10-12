package com.pharmacy.payment.config;

import com.razorpay.RazorpayClient;
import com.razorpay.RazorpayException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Razorpay keys come from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (backend/.env).
 * Without them the service still starts, cash on delivery and wallet payments still
 * work, and online payments fail with a clear "not configured" message.
 */
@Component
public class RazorpayConfig {

    private static final Logger log = LoggerFactory.getLogger(RazorpayConfig.class);

    private final String keyId;
    private final String keySecret;
    private final RazorpayClient client;

    public RazorpayConfig(@Value("${razorpay.key-id:}") String keyId,
                          @Value("${razorpay.key-secret:}") String keySecret) throws RazorpayException {
        this.keyId = keyId == null ? "" : keyId.trim();
        this.keySecret = keySecret == null ? "" : keySecret.trim();
        if (this.keyId.isEmpty() || this.keySecret.isEmpty()) {
            log.warn("Razorpay keys are not set (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET). Online payments are disabled.");
            this.client = null;
        } else {
            log.info("Razorpay configured | keyId={} | mode={}", this.keyId,
                    this.keyId.startsWith("rzp_live_") ? "LIVE" : "TEST");
            this.client = new RazorpayClient(this.keyId, this.keySecret);
        }
    }

    /** @throws IllegalStateException if the keys are not configured. */
    public RazorpayClient client() {
        if (client == null) {
            throw new IllegalStateException("Online payments are not set up yet. Please pay by cash on delivery or wallet.");
        }
        return client;
    }

    public String keyId() { return keyId; }

    public String keySecret() { return keySecret; }
}
