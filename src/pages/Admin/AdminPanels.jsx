import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  adminCreatePartner, adminActivity, adminCustomerSummaries, adminCustomerOrders, adminSetUserEnabled,
} from "../../api/partnerService";
import {
  OrderCard, StatCard, EmptyState, Button, Loading, ErrorNote, useAsync, Field, inputClass, LIVE,
} from "../../components/Portal/PortalUI";
import { formatMoney, formatDateTime, ROLES } from "../../utils/roles";

export { LIVE };

const ROLE_NAMES = {
  ROLE_ADMIN: "Admin",
  ROLE_VENDOR: "Vendor",
  ROLE_DELIVERY: "Delivery",
  ROLE_PHARMACIST: "Pharmacist",
  ROLE_USER: "Customer",
};
const METHOD_NAMES = { PASSWORD: "Email & password", GOOGLE: "Google", ADMIN_CREATED: "Created by admin" };

/** The role shown for an account: admin, then partner roles, then customer. */
const mainRole = (roles = []) =>
  [ROLES.ADMIN, ROLES.VENDOR, ROLES.DELIVERY, "ROLE_PHARMACIST", ROLES.USER].find((r) => roles.includes(r)) || roles[0];

const Modal = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div
      onClick={(e) => e.stopPropagation()}
      className={`bg-white w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"} rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl px-2" aria-label="Close">×</button>
      </div>
      {children}
    </div>
  </div>
);

// --------------------------------------------------------- Create partner

const PARTNER_FIELDS = {
  VENDOR: [
    { key: "businessName", label: "Store name", required: true },
    { key: "drugLicenseNumber", label: "Drug licence number", required: true },
    { key: "gstin", label: "GSTIN" },
  ],
  DELIVERY: [
    { key: "vehicleType", label: "Vehicle type", required: true, options: ["Bike", "Scooter", "Bicycle", "Car"] },
    { key: "vehicleNumber", label: "Vehicle number" },
    { key: "drivingLicenseNumber", label: "Driving licence number", required: true },
  ],
};

/** Admin adds a vendor or delivery partner with a login. The account is approved straight away. */
export const CreatePartnerModal = ({ type, onClose, onCreated }) => {
  const [form, setForm] = useState({ vehicleType: "Bike" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = PARTNER_FIELDS[type];
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const required = [["name", "Full name"], ["email", "Email"], ["phone", "Phone"], ["password", "Password"],
      ...fields.filter((f) => f.required).map((f) => [f.key, f.label])];
    const missing = required.find(([k]) => !String(form[k] || "").trim());
    if (missing) return setError(`${missing[1]} is required.`);
    if (!/\S+@\S+\.\S+/.test(form.email)) return setError("Enter a valid email.");
    if (!/^\d{10}$/.test(form.phone)) return setError("Enter a 10-digit phone number.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");

    const otherKeys = PARTNER_FIELDS[type === "VENDOR" ? "DELIVERY" : "VENDOR"].map((f) => f.key);
    const payload = Object.fromEntries(Object.entries(form).filter(([k, v]) => !otherKeys.includes(k) && v !== ""));
    setBusy(true);
    try {
      const created = await adminCreatePartner({ ...payload, type });
      toast.success(`${created.businessName || created.name} added and approved`);
      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={type === "VENDOR" ? "Add a vendor" : "Add a delivery partner"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[11px] text-slate-500">
          The account is approved immediately. Share the email and password with them so they can log in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name *"><input className={inputClass} value={form.name || ""} onChange={set("name")} /></Field>
          <Field label="Phone *">
            <input className={inputClass} inputMode="numeric" value={form.phone || ""}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} />
          </Field>
          <Field label="Email *"><input className={inputClass} type="email" value={form.email || ""} onChange={set("email")} autoComplete="off" /></Field>
          <Field label="Password *"><input className={inputClass} type="password" value={form.password || ""} onChange={set("password")} autoComplete="new-password" /></Field>
          {fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
              {f.options ? (
                <select className={inputClass} value={form[f.key] || ""} onChange={set(f.key)}>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input className={inputClass} value={form[f.key] || ""} onChange={set(f.key)} />
              )}
            </Field>
          ))}
          <Field label="City"><input className={inputClass} value={form.city || ""} onChange={set("city")} /></Field>
          <Field label="Pincode">
            <input className={inputClass} inputMode="numeric" value={form.pincode || ""}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
          </Field>
        </div>
        <Field label={type === "VENDOR" ? "Store address" : "Address"}>
          <textarea className={inputClass} rows={2} value={form.businessAddress || ""} onChange={set("businessAddress")} />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
        </div>
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------- Activity

const ActivityTable = ({ events, showPerson = true }) => {
  if (!events?.length) return <EmptyState title="No activity yet" body="Sign-ups and logins appear here as they happen." />;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left font-black px-3 py-2.5">When</th>
            {showPerson && <th className="text-left font-black px-3 py-2.5">Account</th>}
            <th className="text-left font-black px-3 py-2.5">Role</th>
            <th className="text-left font-black px-3 py-2.5">Event</th>
            <th className="text-left font-black px-3 py-2.5">Method</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{formatDateTime(e.occurredAt)}</td>
              {showPerson && (
                <td className="px-3 py-2.5">
                  <p className="font-bold text-slate-800">{e.name || "—"}</p>
                  <p className="text-[11px] text-slate-400">{e.email}</p>
                </td>
              )}
              <td className="px-3 py-2.5 text-slate-600">{ROLE_NAMES[e.role] || e.role || "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                  e.type === "SIGNUP" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700"}`}>
                  {e.type === "SIGNUP" ? "Sign-up" : "Login"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{METHOD_NAMES[e.method] || e.method}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const ActivityPanel = () => {
  const [type, setType] = useState("");
  const activity = useAsync(() => adminActivity({ type, limit: 200 }), [type], LIVE);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <select className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Sign-ups and logins</option>
          <option value="SIGNUP">Sign-ups only</option>
          <option value="LOGIN">Logins only</option>
        </select>
        <p className="text-[11px] text-slate-400 ml-auto">Latest 200 · updates automatically</p>
      </div>
      {activity.loading && !activity.data ? <Loading /> : activity.error ? (
        <ErrorNote message={activity.error} onRetry={activity.reload} />
      ) : (
        <ActivityTable events={activity.data} />
      )}
    </section>
  );
};

// ------------------------------------------------------ Users / customers

const CustomerDetail = ({ user, summary, onClose }) => {
  const orders = useAsync(() => adminCustomerOrders(user.id), [user.id], LIVE);
  const activity = useAsync(() => adminActivity({ userId: user.id, limit: 20 }), [user.id], LIVE);
  const delivered = (orders.data || []).filter((o) => o.status === "DELIVERED").length;

  return (
    <Modal title={user.name || user.email} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600 mb-4">
        <p><span className="text-slate-400">Email:</span> <b className="text-slate-800">{user.email}</b></p>
        <p><span className="text-slate-400">Phone:</span> <b className="text-slate-800">{user.phone || "—"}</b></p>
        <p><span className="text-slate-400">Role:</span> <b className="text-slate-800">{ROLE_NAMES[mainRole(user.roles)] || "—"}</b></p>
        <p><span className="text-slate-400">Signed up with:</span> <b className="text-slate-800">{user.provider === "GOOGLE" ? "Google" : "Email & password"}</b></p>
        <p><span className="text-slate-400">Joined:</span> <b className="text-slate-800">{formatDateTime(user.createdAt)}</b></p>
        <p><span className="text-slate-400">Last login:</span> <b className="text-slate-800">{formatDateTime(user.lastLoginAt)}</b></p>
        <p><span className="text-slate-400">Wallet:</span> <b className="text-slate-800">{formatMoney(user.walletBalance)}</b></p>
        <p><span className="text-slate-400">Status:</span> <b className={user.enabled === false ? "text-rose-600" : "text-green-700"}>{user.enabled === false ? "Disabled" : "Active"}</b></p>
        {user.address && <p className="sm:col-span-2"><span className="text-slate-400">Address:</span> {user.address}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="Orders" value={summary?.orderCount ?? orders.data?.length ?? 0} />
        <StatCard label="Spent" value={formatMoney(summary?.totalSpent)} />
        <StatCard label="Delivered" value={delivered} />
      </div>

      <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Order history</h3>
      {orders.loading && !orders.data ? <Loading /> : orders.error ? (
        <ErrorNote message={orders.error} onRetry={orders.reload} />
      ) : !orders.data?.length ? (
        <EmptyState title="No orders yet" />
      ) : (
        <div className="space-y-3">
          {orders.data.map((o) => (
            <OrderCard key={o.id} order={o}>
              {o.cancelReason && <p className="mt-2 text-[11px] text-rose-600">{o.cancelReason}</p>}
            </OrderCard>
          ))}
        </div>
      )}

      <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-5 mb-2">Recent logins and sign-up</h3>
      {activity.loading && !activity.data ? <Loading /> : activity.error ? (
        <ErrorNote message={activity.error} onRetry={activity.reload} />
      ) : (
        <ActivityTable events={activity.data} showPerson={false} />
      )}
    </Modal>
  );
};

const UserToggle = ({ u, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const enabled = u.enabled !== false;
  return (
    <Button variant={enabled ? "danger" : "outline"} disabled={busy} className="px-2 py-1"
      onClick={async () => {
        if (enabled && !window.confirm(`Disable ${u.email}? They won't be able to log in.`)) return;
        setBusy(true);
        try { await adminSetUserEnabled(u.id, !enabled); toast.success(enabled ? "Account disabled" : "Account enabled"); onChanged(); }
        catch (err) { toast.error(String(err)); }
        finally { setBusy(false); }
      }}>
      {enabled ? "Disable" : "Enable"}
    </Button>
  );
};

/** All accounts with sign-up / last-login dates and, for customers, their order totals and history. */
export const UsersPanel = ({ users, currentUserId }) => {
  const summaries = useAsync(adminCustomerSummaries, [], LIVE);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState(ROLES.USER);
  const [viewing, setViewing] = useState(null);

  const summaryById = useMemo(
    () => Object.fromEntries((summaries.data || []).map((s) => [s.userId, s])),
    [summaries.data]
  );
  const rows = (users.data || [])
    .filter((u) => !roleFilter || mainRole(u.roles) === roleFilter)
    .filter((u) => !query || `${u.name || ""} ${u.email || ""} ${u.phone || ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value={ROLES.USER}>Customers</option>
          <option value={ROLES.VENDOR}>Vendors</option>
          <option value={ROLES.DELIVERY}>Delivery partners</option>
          <option value={ROLES.ADMIN}>Admins</option>
          <option value="">Everyone</option>
        </select>
        <input className={`${inputClass} max-w-xs`} placeholder="Search name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="text-[11px] text-slate-400 ml-auto">{rows.length} account{rows.length === 1 ? "" : "s"}</p>
      </div>
      {summaries.error && <ErrorNote message={summaries.error} onRetry={summaries.reload} />}
      {users.loading && !users.data ? <Loading /> : users.error ? (
        <ErrorNote message={users.error} onRetry={users.reload} />
      ) : !rows.length ? (
        <EmptyState title="No accounts match" />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left font-black px-3 py-2.5">Name</th>
                <th className="text-left font-black px-3 py-2.5">Contact</th>
                <th className="text-left font-black px-3 py-2.5">Role</th>
                <th className="text-left font-black px-3 py-2.5">Joined</th>
                <th className="text-left font-black px-3 py-2.5">Last login</th>
                <th className="text-right font-black px-3 py-2.5">Orders</th>
                <th className="text-right font-black px-3 py-2.5">Spent</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => {
                const s = summaryById[u.id];
                return (
                  <tr key={u.id} className={u.enabled === false ? "opacity-60" : ""}>
                    <td className="px-3 py-2.5 font-bold text-slate-800">{u.name || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{u.email}<br /><span className="text-slate-400">{u.phone || ""}</span></td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {ROLE_NAMES[mainRole(u.roles)] || "—"}
                      {u.partnerStatus && <span className="text-slate-400"> · {u.partnerStatus.toLowerCase()}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTime(u.lastLoginAt)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s?.orderCount ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(s?.totalSpent)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button variant="outline" className="px-2 py-1" onClick={() => setViewing(u)}>View</Button>
                      {u.id !== currentUserId && <span className="ml-1 inline-block"><UserToggle u={u} onChanged={users.reload} /></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {viewing && <CustomerDetail user={viewing} summary={summaryById[viewing.id]} onClose={() => setViewing(null)} />}
    </section>
  );
};
