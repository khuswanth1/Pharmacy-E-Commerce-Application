import React, { useContext, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthContext } from "../../context/AuthContext";
import {
  adminUserStats, adminOrderStats, adminListPartners, adminReviewPartner, adminListUsers,
  adminListOrders, adminAssignVendor, adminAssignDelivery, adminCancelOrder,
  adminListProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct,
} from "../../api/partnerService";
import {
  PortalLayout, OrderCard, StatCard, EmptyState, Button, Loading, ErrorNote, useAsync, inputClass, LiveBadge, usePortalTab,
} from "../../components/Portal/PortalUI";
import { ProductFormModal, ProductTable } from "../../components/Portal/ProductEditor";
import { CreatePartnerModal, ActivityPanel, UsersPanel, LIVE } from "./AdminPanels";
import { formatMoney, formatDateTime, STATUS_LABELS, ROLES } from "../../utils/roles";

const PARTNER_STATUS_STYLES = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-rose-50 text-rose-700",
  SUSPENDED: "bg-rose-50 text-rose-700",
};

const Pill = ({ className, children }) => (
  <span className={`inline-block text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${className}`}>{children}</span>
);

const roleLabel = (role) => (role === ROLES.VENDOR ? "Vendor" : role === ROLES.DELIVERY ? "Delivery" : role);

// --------------------------------------------------------------- Partners

const PartnerCard = ({ p, onReview, busy }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-900 truncate">{p.businessName || p.name}</p>
        <p className="text-[11px] text-slate-500 truncate">{p.name} · {p.email} · {p.phone}</p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <Pill className="bg-slate-100 text-slate-700">{roleLabel(p.partnerRole)}</Pill>
        <div><Pill className={PARTNER_STATUS_STYLES[p.status]}>{p.status}</Pill></div>
      </div>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
      {p.partnerRole === ROLES.VENDOR ? (
        <>
          <dt className="text-slate-400">Drug licence</dt><dd className="font-bold text-slate-800">{p.drugLicenseNumber || "—"}</dd>
          <dt className="text-slate-400">GSTIN</dt><dd className="font-bold text-slate-800">{p.gstin || "—"}</dd>
        </>
      ) : (
        <>
          <dt className="text-slate-400">Vehicle</dt><dd className="font-bold text-slate-800">{[p.vehicleType, p.vehicleNumber].filter(Boolean).join(" · ") || "—"}</dd>
          <dt className="text-slate-400">Driving licence</dt><dd className="font-bold text-slate-800">{p.drivingLicenseNumber || "—"}</dd>
        </>
      )}
      <dt className="text-slate-400">Location</dt><dd className="font-bold text-slate-800">{[p.city, p.pincode].filter(Boolean).join(" ") || "—"}</dd>
      <dt className="text-slate-400">Applied</dt><dd className="font-bold text-slate-800">{formatDateTime(p.createdAt)}</dd>
    </dl>
    {p.businessAddress && <p className="mt-2 text-[11px] text-slate-500">{p.businessAddress}</p>}
    {p.reviewNote && <p className="mt-2 text-[11px] text-slate-500"><b>Note:</b> {p.reviewNote}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {p.status !== "APPROVED" && (
        <Button variant="success" disabled={busy} onClick={() => onReview(p, "APPROVED")}>Approve</Button>
      )}
      {p.status === "PENDING" && (
        <Button variant="danger" disabled={busy} onClick={() => onReview(p, "REJECTED")}>Reject</Button>
      )}
      {p.status === "APPROVED" && (
        <Button variant="danger" disabled={busy} onClick={() => onReview(p, "SUSPENDED")}>Suspend</Button>
      )}
    </div>
  </div>
);

// ----------------------------------------------------------------- Orders

const AdminOrderCard = ({ order, vendors, riders, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast.success(msg); onChanged(); }
    catch (err) { toast.error(String(err)); }
    finally { setBusy(false); }
  };
  const canAssignVendor = ["CREATED", "PAID", "CONFIRMED"].includes(order.status);
  const canAssignRider = ["PACKED", "SHIPPED"].includes(order.status);
  const canCancel = !["DELIVERED", "CANCELLED"].includes(order.status);

  return (
    <OrderCard
      order={order}
      actions={
        <>
          {canAssignVendor && (
            <select
              disabled={busy}
              className="text-xs border border-slate-200 rounded-xl px-2 py-2 bg-white"
              value=""
              onChange={(e) => {
                const v = vendors.find((x) => x.userId === e.target.value);
                if (v) run(() => adminAssignVendor(order.id, v.userId, v.businessName || v.name), `Assigned to ${v.businessName || v.name}`);
              }}
            >
              <option value="">{order.vendorId ? "Change store…" : "Assign store…"}</option>
              {vendors.map((v) => <option key={v.userId} value={v.userId}>{v.businessName || v.name}</option>)}
            </select>
          )}
          {canAssignRider && (
            <select
              disabled={busy}
              className="text-xs border border-slate-200 rounded-xl px-2 py-2 bg-white"
              value=""
              onChange={(e) => {
                const r = riders.find((x) => x.userId === e.target.value);
                if (r) run(() => adminAssignDelivery(order.id, r.userId, r.name, r.phone), `Assigned to ${r.name}`);
              }}
            >
              <option value="">{order.deliveryPartnerId ? "Change rider…" : "Assign rider…"}</option>
              {riders.map((r) => <option key={r.userId} value={r.userId}>{r.name}{r.online ? " (online)" : ""}</option>)}
            </select>
          )}
          {canCancel && (
            <Button variant="danger" disabled={busy} onClick={() => {
              const reason = window.prompt("Reason for cancelling this order?");
              if (reason !== null) run(() => adminCancelOrder(order.id, reason), "Order cancelled");
            }}>
              Cancel order
            </Button>
          )}
        </>
      }
    >
      {order.cancelReason && <p className="mt-2 text-[11px] text-rose-600">{order.cancelReason}</p>}
    </OrderCard>
  );
};

// -------------------------------------------------------------- Dashboard

const BASE_PATH = "/admin";
const TAB_IDS = ["overview", "approvals", "orders", "partners", "products", "users", "activity"];

const AdminDashboard = () => {
  const { user } = useContext(AuthContext);
  const [tab, setTab] = usePortalTab(BASE_PATH, TAB_IDS);
  // The order filter lives in the URL (/admin/orders?status=PAID) so a filtered list can be linked to.
  const [searchParams, setSearchParams] = useSearchParams();
  const orderStatus = searchParams.get("status") || "";
  const setOrderStatus = (status) => setSearchParams(status ? { status } : {}, { replace: true });
  const [partnerFilter, setPartnerFilter] = useState({ role: "", status: "" });
  const [productQuery, setProductQuery] = useState("");
  const [creatingPartner, setCreatingPartner] = useState(null); // "VENDOR" | "DELIVERY"
  const [editing, setEditing] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);

  // Everything refreshes itself in the background, so the dashboard stays current without reloading.
  const userStats = useAsync(adminUserStats, [], LIVE);
  const orderStats = useAsync(adminOrderStats, [], LIVE);
  const pending = useAsync(() => adminListPartners(undefined, "PENDING"), [], LIVE);
  const partners = useAsync(
    () => adminListPartners(partnerFilter.role || undefined, partnerFilter.status || undefined),
    [partnerFilter.role, partnerFilter.status],
    LIVE
  );
  const approved = useAsync(() => adminListPartners(undefined, "APPROVED"), [], LIVE);
  const orders = useAsync(() => adminListOrders(orderStatus), [orderStatus], LIVE);
  const products = useAsync(adminListProducts, [], LIVE);
  const users = useAsync(adminListUsers, [], LIVE);
  const lastUpdated = [userStats, orderStats, pending, orders]
    .map((x) => x.updatedAt).filter(Boolean).sort((a, b) => a - b)[0] || null;

  const vendors = useMemo(() => (approved.data || []).filter((p) => p.partnerRole === ROLES.VENDOR), [approved.data]);
  const riders = useMemo(() => (approved.data || []).filter((p) => p.partnerRole === ROLES.DELIVERY), [approved.data]);

  const review = async (p, status) => {
    let note = null;
    if (status !== "APPROVED") {
      note = window.prompt(status === "REJECTED" ? "Reason for rejecting (shown to the applicant):" : "Reason for suspending:");
      if (!note) return;
    }
    setReviewingId(p.userId);
    try {
      await adminReviewPartner(p.userId, status, note);
      toast.success(`${p.businessName || p.name} ${status.toLowerCase()}`);
      pending.reload(); partners.reload(); approved.reload(); userStats.reload();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setReviewingId(null);
    }
  };

  const refreshOrders = () => { orders.reload(); orderStats.reload(); };

  const filteredProducts = (products.data || []).filter((p) =>
    !productQuery || `${p.name} ${p.brand || ""} ${p.vendorName || ""}`.toLowerCase().includes(productQuery.toLowerCase())
  );
  const lowStock = (products.data || []).filter((p) => p.stock <= 10);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "approvals", label: "Approvals", count: pending.data?.length || 0 },
    { id: "orders", label: "Orders" },
    { id: "partners", label: "Partners" },
    { id: "products", label: "Products", count: lowStock.length },
    { id: "users", label: "Customers & users" },
    { id: "activity", label: "Activity" },
  ];

  const us = userStats.data;
  const os = orderStats.data;

  return (
    <PortalLayout title="Admin" subtitle="Manage partners, orders and the catalogue" accent="bg-slate-900"
      basePath={BASE_PATH} tabs={tabs} activeTab={tab} headerExtra={<LiveBadge updatedAt={lastUpdated} />}>

      {tab === "overview" && (
        <section className="space-y-4">
          {(userStats.error || orderStats.error) && (
            <ErrorNote message={userStats.error || orderStats.error} onRetry={() => { userStats.reload(); orderStats.reload(); }} />
          )}
          {(!us || !os) && (userStats.loading || orderStats.loading) ? <Loading /> : us && os && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Delivered revenue" value={formatMoney(os.deliveredRevenue)} />
                <StatCard label="Orders today" value={os.placedToday} hint={`${os.deliveredToday} delivered today`} />
                <StatCard label="Waiting for a store" value={(os.byStatus?.CREATED ?? 0) + (os.byStatus?.PAID ?? 0)} />
                <StatCard label="Waiting for a rider" value={os.byStatus?.PACKED ?? 0} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Customers" value={us.customers} />
                <StatCard label="Vendors" value={us.vendors} />
                <StatCard label="Delivery partners" value={us.deliveryPartners} hint={`${us.onlineDeliveryPartners} online now`} />
                <StatCard label="Pending approvals" value={us.pendingApprovals} />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Orders by status</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(os.byStatus || {}).map(([k, v]) => (
                    <button key={k} onClick={() => setTab("orders", `?status=${k}`)}
                      className="text-left rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <p className="text-[11px] text-slate-500">{STATUS_LABELS[k] || k}</p>
                      <p className="text-lg font-black text-slate-900 tabular-nums">{v}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "approvals" && (
        <section className="space-y-3">
          <p className="text-xs text-slate-500">Check licence details before approving. Approved partners can start taking orders straight away.</p>
          {pending.loading && !pending.data ? <Loading /> : pending.error ? (
            <ErrorNote message={pending.error} onRetry={pending.reload} />
          ) : !pending.data?.length ? (
            <EmptyState title="No applications waiting" />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {pending.data.map((p) => <PartnerCard key={p.userId} p={p} onReview={review} busy={reviewingId === p.userId} />)}
            </div>
          )}
        </section>
      )}

      {tab === "partners" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white" value={partnerFilter.role}
              onChange={(e) => setPartnerFilter((f) => ({ ...f, role: e.target.value }))}>
              <option value="">All partners</option>
              <option value={ROLES.VENDOR}>Vendors</option>
              <option value={ROLES.DELIVERY}>Delivery partners</option>
            </select>
            <select className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white" value={partnerFilter.status}
              onChange={(e) => setPartnerFilter((f) => ({ ...f, status: e.target.value }))}>
              <option value="">Any status</option>
              {["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => setCreatingPartner("VENDOR")}>Add vendor</Button>
              <Button variant="success" onClick={() => setCreatingPartner("DELIVERY")}>Add delivery partner</Button>
            </div>
          </div>
          {partners.loading && !partners.data ? <Loading /> : partners.error ? (
            <ErrorNote message={partners.error} onRetry={partners.reload} />
          ) : !partners.data?.length ? (
            <EmptyState title="No partners match" />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {partners.data.map((p) => <PartnerCard key={p.userId} p={p} onReview={review} busy={reviewingId === p.userId} />)}
            </div>
          )}
        </section>
      )}

      {tab === "orders" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <select className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white" value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}>
              <option value="">All orders</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {orders.loading && !orders.data ? <Loading /> : orders.error ? (
            <ErrorNote message={orders.error} onRetry={orders.reload} />
          ) : !orders.data?.length ? (
            <EmptyState title="No orders" />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {orders.data.map((o) => (
                <AdminOrderCard key={o.id} order={o} vendors={vendors} riders={riders} onChanged={refreshOrders} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "products" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <input className={`${inputClass} max-w-xs`} placeholder="Search products" value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)} />
            <Button onClick={() => setEditing({})}>Add product</Button>
          </div>
          {lowStock.length > 0 && (
            <p className="text-[11px] bg-amber-50 text-amber-800 rounded-xl px-3 py-2">
              {lowStock.length} product{lowStock.length === 1 ? "" : "s"} at 10 or fewer in stock (highlighted).
            </p>
          )}
          {products.loading && !products.data ? <Loading /> : products.error ? (
            <ErrorNote message={products.error} onRetry={products.reload} />
          ) : (
            <ProductTable
              products={filteredProducts}
              showVendor
              onEdit={setEditing}
              onDelete={async (p) => {
                if (!window.confirm(`Remove ${p.name} from the catalogue?`)) return;
                try { await adminDeleteProduct(p.id); toast.success("Product removed"); products.reload(); }
                catch (err) { toast.error(String(err)); }
              }}
              onSaveStock={async (p, stock) => {
                try { await adminUpdateProduct(p.id, { stock }); toast.success("Stock updated"); products.reload(); }
                catch (err) { toast.error(String(err)); }
              }}
            />
          )}
        </section>
      )}

      {tab === "users" && <UsersPanel users={users} currentUserId={user?.id} />}

      {tab === "activity" && <ActivityPanel />}

      {creatingPartner && (
        <CreatePartnerModal
          type={creatingPartner}
          onClose={() => setCreatingPartner(null)}
          onCreated={() => { partners.reload(); approved.reload(); users.reload(); userStats.reload(); }}
        />
      )}

      {editing && (
        <ProductFormModal
          product={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            if (editing.id) await adminUpdateProduct(editing.id, form);
            else await adminCreateProduct(form);
            toast.success(editing.id ? "Product updated" : "Product added");
            products.reload();
          }}
        />
      )}
    </PortalLayout>
  );
};

export default AdminDashboard;
