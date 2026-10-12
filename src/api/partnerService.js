import apiClient from "./apiClient";

// Backend wraps responses as { success, message, data }
const unwrap = (res) => res?.data?.data ?? res?.data;
const errorMessage = (error, fallback) =>
  error?.response?.data?.message ||
  (error?.response?.status === 403 ? "You don't have access to this. Try logging in again." : fallback);

const call = async (request, fallback) => {
  try {
    return unwrap(await request());
  } catch (error) {
    throw errorMessage(error, fallback);
  }
};

// ------------------------------------------------------------ Partner account

/** Sign up as a vendor or delivery partner. data.type is "VENDOR" or "DELIVERY". Returns { token, userId }. */
export const registerPartnerAPI = (data) =>
  call(() => apiClient.post("/api/auth/register/partner", data), "Sign-up failed. Please try again.");

export const getMyPartnerProfile = () =>
  call(() => apiClient.get("/api/auth/partner/me"), "Could not load your partner account.");

export const setOnlineStatus = (online) =>
  call(() => apiClient.put("/api/auth/partner/me/online", null, { params: { online } }), "Could not change your status.");

/** Fresh token with the account's current roles and approval status. Returns { token, userId }. */
export const refreshTokenAPI = () =>
  call(() => apiClient.post("/api/auth/token/refresh"), "Could not refresh your session.");

// --------------------------------------------------------------------- Vendor

export const vendorAvailableOrders = () =>
  call(() => apiClient.get("/api/orders/vendor/available"), "Could not load new orders.");
export const vendorMyOrders = () =>
  call(() => apiClient.get("/api/orders/vendor/mine"), "Could not load your orders.");
export const vendorOrderStats = () =>
  call(() => apiClient.get("/api/orders/vendor/stats"), "Could not load stats.");
export const vendorAcceptOrder = (orderId, vendorName) =>
  call(() => apiClient.post(`/api/orders/vendor/${orderId}/accept`, { vendorName }), "Could not accept the order.");
export const vendorMarkPacked = (orderId) =>
  call(() => apiClient.post(`/api/orders/vendor/${orderId}/packed`), "Could not mark the order packed.");
export const vendorReleaseOrder = (orderId) =>
  call(() => apiClient.post(`/api/orders/vendor/${orderId}/release`), "Could not release the order.");

export const vendorMyProducts = () =>
  call(() => apiClient.get("/api/products/vendor/mine"), "Could not load your products.");
export const vendorCreateProduct = (form) =>
  call(() => apiClient.post("/api/products/vendor", form), "Could not add the product.");
export const vendorUpdateProduct = (id, form) =>
  call(() => apiClient.put(`/api/products/vendor/${id}`, form), "Could not update the product.");
export const vendorDeleteProduct = (id) =>
  call(() => apiClient.delete(`/api/products/vendor/${id}`), "Could not remove the product.");

export const fetchCategoryList = () =>
  call(() => apiClient.get("/api/products/categories/list"), "Could not load categories.");

// ------------------------------------------------------------------- Delivery

export const deliveryAvailableOrders = () =>
  call(() => apiClient.get("/api/orders/delivery/available"), "Could not load deliveries.");
export const deliveryMyOrders = () =>
  call(() => apiClient.get("/api/orders/delivery/mine"), "Could not load your deliveries.");
export const deliveryStats = () =>
  call(() => apiClient.get("/api/orders/delivery/stats"), "Could not load stats.");
export const deliveryAccept = (orderId, name, phone) =>
  call(() => apiClient.post(`/api/orders/delivery/${orderId}/accept`, { name, phone }), "Could not accept the delivery.");
export const deliveryPickUp = (orderId) =>
  call(() => apiClient.post(`/api/orders/delivery/${orderId}/pickup`), "Could not mark as picked up.");
export const deliveryUpdateLocation = (orderId, lat, lng) =>
  call(() => apiClient.post(`/api/orders/delivery/${orderId}/location`, { lat, lng }), "Could not share location.");
export const deliveryComplete = (orderId, code) =>
  call(() => apiClient.post(`/api/orders/delivery/${orderId}/deliver`, { code }), "Could not complete the delivery.");

// ---------------------------------------------------------------------- Admin

export const adminUserStats = () =>
  call(() => apiClient.get("/api/auth/admin/stats"), "Could not load stats.");
export const adminOrderStats = () =>
  call(() => apiClient.get("/api/orders/admin/stats"), "Could not load stats.");
/** role: "ROLE_VENDOR" | "ROLE_DELIVERY" | undefined; status: "PENDING" | "APPROVED" | ... | undefined */
export const adminListPartners = (role, status) =>
  call(() => apiClient.get("/api/auth/admin/partners", { params: { role, status } }), "Could not load partners.");
export const adminReviewPartner = (userId, status, note) =>
  call(() => apiClient.put(`/api/auth/admin/partners/${userId}/review`, { status, note }), "Could not update the partner.");
export const adminListUsers = () =>
  call(() => apiClient.get("/api/auth/admin/users"), "Could not load users.");
export const adminSetUserEnabled = (userId, enabled) =>
  call(() => apiClient.put(`/api/auth/admin/users/${userId}/enabled`, null, { params: { enabled } }), "Could not update the account.");

/** data: same fields as partner sign-up, with type "VENDOR" | "DELIVERY" and a password. Approved immediately. */
export const adminCreatePartner = (data) =>
  call(() => apiClient.post("/api/auth/admin/partners", data), "Could not create the partner.");
/** type: "SIGNUP" | "LOGIN" | undefined */
export const adminActivity = ({ type, userId, limit = 100 } = {}) =>
  call(() => apiClient.get("/api/auth/admin/activity", { params: { type: type || undefined, userId: userId || undefined, limit } }), "Could not load activity.");
export const adminCustomerSummaries = () =>
  call(() => apiClient.get("/api/orders/admin/customers/summary"), "Could not load customer order totals.");
export const adminCustomerOrders = (userId) =>
  call(() => apiClient.get(`/api/orders/admin/customers/${userId}/orders`), "Could not load this customer's orders.");

export const adminListOrders = (status) =>
  call(() => apiClient.get("/api/orders/admin/all", { params: { status: status || undefined } }), "Could not load orders.");
export const adminAssignVendor = (orderId, vendorId, vendorName) =>
  call(() => apiClient.post(`/api/orders/admin/${orderId}/assign-vendor`, { vendorId, vendorName }), "Could not assign the vendor.");
export const adminAssignDelivery = (orderId, partnerId, name, phone) =>
  call(() => apiClient.post(`/api/orders/admin/${orderId}/assign-delivery`, { partnerId, name, phone }), "Could not assign the delivery partner.");
export const adminCancelOrder = (orderId, reason) =>
  call(() => apiClient.post(`/api/orders/admin/${orderId}/cancel`, { reason }), "Could not cancel the order.");

export const adminListProducts = () =>
  call(() => apiClient.get("/api/products/admin/all"), "Could not load products.");
export const adminCreateProduct = (form) =>
  call(() => apiClient.post("/api/products/admin", form), "Could not add the product.");
export const adminUpdateProduct = (id, form) =>
  call(() => apiClient.put(`/api/products/admin/${id}`, form), "Could not update the product.");
export const adminDeleteProduct = (id) =>
  call(() => apiClient.delete(`/api/products/admin/${id}`), "Could not remove the product.");

// ------------------------------------------------------------------- Customer

/** The code the customer shows the delivery partner. Only works for the customer's own order. */
export const getDeliveryCode = (orderId) =>
  call(() => apiClient.get(`/api/orders/detail/${orderId}/delivery-code`), "Could not load the delivery code.");
