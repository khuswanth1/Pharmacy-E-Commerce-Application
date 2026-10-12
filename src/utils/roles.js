// Role helpers shared by routing, login redirects and the partner portals.

export const ROLES = {
  USER: "ROLE_USER",
  ADMIN: "ROLE_ADMIN",
  VENDOR: "ROLE_VENDOR",
  DELIVERY: "ROLE_DELIVERY",
};

export const hasRole = (user, role) => Array.isArray(user?.roles) && user.roles.includes(role);

export const isPartner = (user) => hasRole(user, ROLES.VENDOR) || hasRole(user, ROLES.DELIVERY);

/** Where a user lands after login. Partners who are not yet approved go to the status page. */
export const homeFor = (user) => {
  if (hasRole(user, ROLES.ADMIN)) return "/admin";
  if (isPartner(user)) {
    if (user.partnerStatus !== "APPROVED") return "/partner/pending";
    return hasRole(user, ROLES.VENDOR) ? "/vendor" : "/delivery";
  }
  return "/home/All";
};

export const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export const STATUS_LABELS = {
  CREATED: "New",
  PAID: "Paid",
  CONFIRMED: "Accepted",
  PACKED: "Ready for pickup",
  SHIPPED: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Payment failed",
};

export const STATUS_STYLES = {
  CREATED: "bg-slate-100 text-slate-700",
  PAID: "bg-sky-50 text-sky-700",
  CONFIRMED: "bg-indigo-50 text-indigo-700",
  PACKED: "bg-amber-50 text-amber-700",
  SHIPPED: "bg-orange-50 text-orange-700",
  DELIVERED: "bg-green-50 text-green-700",
  CANCELLED: "bg-rose-50 text-rose-700",
  FAILED: "bg-rose-50 text-rose-700",
};
