import React, { useContext } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AuthContext } from "../../context/AuthContext";
import { hasRole, STATUS_LABELS, STATUS_STYLES, formatMoney, formatDateTime } from "../../utils/roles";
import { getProfileAPI } from "../../api/authService";
import { refreshTokenAPI } from "../../api/partnerService";

/** Re-issues the JWT and reloads the profile, so approval or role changes apply without logging out. */
export const refreshSession = async (loginUser) => {
  const { token, userId } = await refreshTokenAPI();
  localStorage.setItem("pharmacy_token", token);
  const profile = await getProfileAPI(userId);
  if (!profile?.success) throw "Could not reload your profile.";
  localStorage.setItem("user", JSON.stringify(profile.data));
  loginUser(profile.data, token);
  return profile.data;
};

/**
 * Only renders children for a signed-in user with `role`. Vendor and delivery
 * routes also require an approved partner account.
 */
export const RoleRoute = ({ role, requireApproved = false, children }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!hasRole(user, role)) return <Navigate to="/login" replace />;
  if (requireApproved && user.partnerStatus !== "APPROVED") return <Navigate to="/partner/pending" replace />;
  return children;
};

/**
 * The portal tab that the URL points at, e.g. /vendor/history → "history". Each portal is
 * mounted on a wildcard route (/vendor/*), so every tab has its own address that survives a
 * reload and works with back/forward. A bare or unknown path goes to the first tab.
 * Returns [tab, goToTab].
 */
export const usePortalTab = (basePath, tabIds) => {
  const { "*": rest = "" } = useParams();
  const navigate = useNavigate();
  const segment = rest.split("/")[0];
  const known = tabIds.includes(segment);
  const ids = tabIds.join(",");

  React.useEffect(() => {
    if (!known) navigate(`${basePath}/${tabIds[0]}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, basePath, ids]);

  const goToTab = React.useCallback((id, search = "") => navigate(`${basePath}/${id}${search}`), [navigate, basePath]);
  return [known ? segment : tabIds[0], goToTab];
};

/** Shell for the vendor, delivery and admin portals: top bar, tab links and page body. */
export const PortalLayout = ({ title, subtitle, accent = "bg-orangeBrand", basePath, tabs, activeTab, headerExtra, children }) => {
  const { user, logoutUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutUser();
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-full bg-slate-50">
      <ToastContainer position="top-right" autoClose={2500} newestOnTop />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${accent} text-white flex items-center justify-center font-black shrink-0`}>
            {title?.[0] || "P"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black text-slate-900 leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
          </div>
          {headerExtra}
          <div className="hidden sm:block text-right">
            <p className="text-xs font-bold text-slate-800">{user?.name}</p>
            <p className="text-[10px] text-slate-400">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-bold text-slate-600 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
        {tabs && (
          <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t.id}
                to={`${basePath}/${t.id}`}
                aria-current={activeTab === t.id ? "page" : undefined}
                className={`px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition ${
                  activeTab === t.id
                    ? "border-orangeBrand text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="ml-1.5 bg-orangeBrand text-white rounded-full px-1.5 py-0.5 text-[10px]">{t.count}</span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
};

export const StatusBadge = ({ status }) => (
  <span className={`inline-block text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${STATUS_STYLES[status] || "bg-slate-100 text-slate-700"}`}>
    {STATUS_LABELS[status] || status}
  </span>
);

export const StatCard = ({ label, value, hint }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

export const EmptyState = ({ title, body }) => (
  <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
    <p className="text-sm font-bold text-slate-700">{title}</p>
    {body && <p className="text-xs text-slate-500 mt-1">{body}</p>}
  </div>
);

export const Button = ({ variant = "primary", className = "", ...props }) => {
  const styles = {
    primary: "bg-orangeBrand text-white hover:brightness-95",
    dark: "bg-slate-900 text-white hover:bg-slate-800",
    success: "bg-green-600 text-white hover:bg-green-700",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-100",
    danger: "border border-rose-200 text-rose-600 hover:bg-rose-50",
  };
  return (
    <button
      {...props}
      className={`text-xs font-bold rounded-xl px-3 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
};

export const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{label}</span>
    {children}
  </label>
);

export const inputClass =
  "w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-orangeBrand bg-white";

/** Order summary used by all three portals. `actions` renders buttons for the current role. */
export const OrderCard = ({ order, actions, showCustomer = true, children }) => {
  const items = order.items || [];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-900">Order #{String(order.id).slice(-8).toUpperCase()}</p>
          <p className="text-[11px] text-slate-500">{formatDateTime(order.createdAt)}</p>
        </div>
        <div className="text-right shrink-0">
          <StatusBadge status={order.status} />
          <p className="text-sm font-black text-slate-900 mt-1 tabular-nums">{formatMoney(order.totalAmount)}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {items.map((it) => (
          <li key={it.id || it.productId} className="flex justify-between text-xs text-slate-700">
            <span className="truncate pr-2">{it.quantity} × {it.productName || it.productId}</span>
            <span className="tabular-nums text-slate-500">{formatMoney(Number(it.price || 0) * (it.quantity || 0))}</span>
          </li>
        ))}
      </ul>

      {showCustomer && (order.receiverName || order.address) && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-0.5">
          {order.receiverName && (
            <p>
              <span className="font-bold text-slate-800">{order.receiverName}</span>
              {order.phoneNumber && <> · <a className="text-orangeBrand font-bold" href={`tel:${order.phoneNumber}`}>{order.phoneNumber}</a></>}
            </p>
          )}
          {order.address && <p>{order.address}</p>}
          {order.deliveryInstructions && <p className="italic text-slate-500">“{order.deliveryInstructions}”</p>}
        </div>
      )}

      {(order.vendorName || order.deliveryPartnerName) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {order.vendorName && <span>Store: <b className="text-slate-700">{order.vendorName}</b></span>}
          {order.deliveryPartnerName && <span>Rider: <b className="text-slate-700">{order.deliveryPartnerName}</b></span>}
        </div>
      )}

      {children}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
};

/** Portal screens refresh their data this often (only while the tab is visible). */
export const LIVE = { refreshMs: 10000 };

/**
 * Loads data and returns { data, loading, error, reload, updatedAt }.
 * With { refreshMs }, it also refreshes quietly in the background while the tab is visible
 * (and right away when you come back to it), so the screen stays current without reloading.
 * Background refreshes never show a spinner and keep the last good data if a request fails.
 */
export const useAsync = (loader, deps = [], { refreshMs } = {}) => {
  const [state, setState] = React.useState({ data: null, loading: true, error: "", updatedAt: null });
  const latestRequest = React.useRef(0);

  const run = React.useCallback(async (quiet) => {
    const request = ++latestRequest.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await loader();
      // Ignore answers to older requests (e.g. after a filter changed).
      if (request !== latestRequest.current) return;
      setState({ data, loading: false, error: "", updatedAt: new Date() });
    } catch (e) {
      if (request !== latestRequest.current) return;
      setState((s) => quiet && s.data != null
        ? { ...s, loading: false }
        : { data: null, loading: false, error: String(e), updatedAt: s.updatedAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => { run(false); }, [run]);

  React.useEffect(() => {
    if (!refreshMs) return undefined;
    const tick = () => { if (document.visibilityState === "visible") run(true); };
    const timer = setInterval(tick, refreshMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [run, refreshMs]);

  const reload = React.useCallback(() => run(false), [run]);
  return { ...state, reload };
};

/** "Live · updated 5s ago" badge for screens that refresh themselves. */
export const LiveBadge = ({ updatedAt }) => {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const seconds = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000)) : null;
  const label = seconds == null ? "Connecting…" : seconds < 5 ? "Updated just now" : seconds < 60 ? `Updated ${seconds}s ago` : `Updated ${Math.round(seconds / 60)}m ago`;
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1"
      title="This page updates automatically">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full w-2 h-2 bg-green-500" />
      </span>
      Live · {label}
    </span>
  );
};

export const Loading = () => <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>;
export const ErrorNote = ({ message, onRetry }) => (
  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl p-3 flex items-center justify-between gap-3">
    <span>{message}</span>
    {onRetry && <Button variant="danger" onClick={onRetry}>Retry</Button>}
  </div>
);
