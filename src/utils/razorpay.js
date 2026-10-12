// Razorpay Checkout helpers shared by checkout, order tracking, lab tests and the wallet.

/** Loads checkout.js once. Resolves false if it can't be loaded (offline, blocked). */
export const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

/** Thrown when the customer closes the Razorpay window without paying. */
export class PaymentDismissed extends Error {
  constructor() { super("Payment cancelled"); this.dismissed = true; }
}

/**
 * Opens Razorpay Checkout for an order returned by createPaymentOrder and resolves with
 * { razorpayOrderId, razorpayPaymentId, razorpaySignature } once the customer pays.
 * Rejects with PaymentDismissed if they close it without trying, or an Error with the
 * last failure reason if they close it after a failed attempt.
 * preferUpi shows UPI (QR, apps, UPI ID) first.
 */
export const openRazorpayCheckout = async (pOrder, { name = "Pharmacy", description, prefill = {}, preferUpi = false } = {}) => {
  if (!(await loadRazorpayScript())) {
    throw new Error("Couldn't load Razorpay. Check your internet connection and try again.");
  }
  if (!pOrder?.razorpayOrderId || !pOrder?.keyId) {
    throw new Error("The payment could not be started. Please try again.");
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    // Razorpay keeps the window open after a failed attempt so the customer can retry,
    // so a failure only counts once they close it without paying.
    let lastFailure = null;
    const rzp = new window.Razorpay({
      key: pOrder.keyId,
      amount: pOrder.amount,
      currency: pOrder.currency || "INR",
      name,
      description,
      order_id: pOrder.razorpayOrderId,
      prefill: { name: prefill.name || "", email: prefill.email || "", contact: prefill.phone || "" },
      theme: { color: "#f57e42" },
      config: preferUpi ? {
        display: {
          blocks: { upi: { name: "Pay with UPI", instruments: [{ method: "upi", flows: ["qr", "intent", "collect"] }] } },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: true },
        },
      } : undefined,
      handler: (response) => {
        settled = true;
        resolve({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          reject(lastFailure ? new Error(lastFailure) : new PaymentDismissed());
        },
      },
    });
    rzp.on("payment.failed", (response) => {
      lastFailure = response?.error?.description || "The payment failed. Please try again.";
    });
    rzp.open();
  });
};
