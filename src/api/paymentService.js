import apiClient from "./apiClient";

// All requests go through the API Gateway, which routes /api/payments/** to payment-service
// and passes the signed-in user's id along. The backend wraps responses as { success, message, data }.
const unwrap = (res) => res?.data?.data ?? res?.data;
const messageOf = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * Create a Razorpay order, or record cash on delivery.
 * orderId: the order id, or WLT_<userId>_<n> for a wallet top-up, LAB_<userId>_<n> for a lab test.
 * amount (paise) is only used for top-ups and lab tests; orders are charged their total.
 * Returns { razorpayOrderId, keyId, amount, currency }.
 */
export const createPaymentOrder = async ({ orderId, amount, paymentMethod }) => {
  try {
    const res = await apiClient.post("/api/payments/create-order", {
      orderId: String(orderId), amount: Number(amount) || 0, paymentMethod,
    });
    return unwrap(res);
  } catch (error) {
    throw messageOf(error, "Couldn't start the payment. Please try again.");
  }
};

/**
 * Confirm a Razorpay payment. The server then marks the order paid or credits the wallet.
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature }. Safe to retry.
 */
export const verifyPayment = async (payment) => {
  try {
    return unwrap(await apiClient.post("/api/payments/verify", payment));
  } catch (error) {
    throw messageOf(error, "We couldn't confirm the payment. Please try again.");
  }
};

/** Pay an order (or lab test, with amount in paise) from the wallet balance. */
export const payWithWallet = async ({ orderId, amount }) => {
  try {
    return unwrap(await apiClient.post("/api/payments/wallet/pay", { orderId: String(orderId), amount }));
  } catch (error) {
    throw messageOf(error, "Couldn't pay from the wallet.");
  }
};

/** Refund a cancelled order to the wallet. Returns { refunded } in rupees (0 if nothing was paid). */
export const refundToWallet = async (orderId) => {
  try {
    return unwrap(await apiClient.post("/api/payments/refund-to-wallet", { orderId: String(orderId) }));
  } catch (error) {
    throw messageOf(error, "Couldn't refund to the wallet.");
  }
};

/** The signed-in user's payments, newest first. */
export const getMyPayments = async () => {
  try {
    return unwrap(await apiClient.get("/api/payments/mine")) || [];
  } catch (error) {
    console.error("[paymentService] getMyPayments error:", messageOf(error, error.message));
    return [];
  }
};
