import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  getMyPartnerProfile, vendorAvailableOrders, vendorMyOrders, vendorOrderStats,
  vendorAcceptOrder, vendorMarkPacked, vendorReleaseOrder,
  vendorMyProducts, vendorCreateProduct, vendorUpdateProduct, vendorDeleteProduct,
} from "../../api/partnerService";
import {
  PortalLayout, OrderCard, StatCard, EmptyState, Button, Loading, ErrorNote, useAsync, usePortalTab, LIVE, LiveBadge,
} from "../../components/Portal/PortalUI";
import { ProductFormModal, ProductTable } from "../../components/Portal/ProductEditor";
import { formatMoney } from "../../utils/roles";

const BASE_PATH = "/vendor";
const TAB_IDS = ["new", "in-progress", "products", "history", "overview"];

const VendorDashboard = () => {
  const [tab] = usePortalTab(BASE_PATH, TAB_IDS);
  const [store, setStore] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // product, or {} for new

  // Orders, stats and stock refresh themselves, so a new order or a rider pickup shows up
  // without reloading the page.
  const available = useAsync(vendorAvailableOrders, [], LIVE);
  const mine = useAsync(vendorMyOrders, [], LIVE);
  const stats = useAsync(vendorOrderStats, [], LIVE);
  const products = useAsync(vendorMyProducts, [], LIVE);

  useEffect(() => {
    getMyPartnerProfile().then(setStore).catch(() => setStore(null));
  }, []);

  const refreshOrders = () => { available.reload(); mine.reload(); stats.reload(); };

  const act = async (orderId, fn, success) => {
    setBusyId(orderId);
    try {
      await fn();
      toast.success(success);
      refreshOrders();
    } catch (err) {
      toast.error(String(err));
      refreshOrders();
    } finally {
      setBusyId(null);
    }
  };

  const active = (mine.data || []).filter((o) => ["CONFIRMED", "PACKED", "SHIPPED"].includes(o.status));
  const past = (mine.data || []).filter((o) => !["CONFIRMED", "PACKED", "SHIPPED"].includes(o.status));
  const toPack = active.filter((o) => o.status === "CONFIRMED").length;
  const lowStock = (products.data || []).filter((p) => p.stock <= 10).length;
  const s = stats.data;

  const tabs = [
    { id: "new", label: "New orders", count: available.data?.length || 0 },
    { id: "in-progress", label: "In progress", count: toPack },
    { id: "products", label: "Products", count: lowStock },
    { id: "history", label: "History" },
    { id: "overview", label: "Overview" },
  ];

  const storeName = store?.businessName || "Your store";

  return (
    <PortalLayout
      title={storeName}
      subtitle="Vendor dashboard"
      tabs={tabs}
      basePath={BASE_PATH}
      activeTab={tab}
      headerExtra={<LiveBadge updatedAt={available.updatedAt} />}
    >
      {tab === "new" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Orders waiting for a store. Accept one to start packing it.</p>
            <Button variant="outline" onClick={available.reload}>Refresh</Button>
          </div>
          {available.loading && !available.data ? <Loading /> : available.error ? (
            <ErrorNote message={available.error} onRetry={available.reload} />
          ) : !available.data?.length ? (
            <EmptyState title="No new orders" body="New orders show up here automatically." />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {available.data.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  actions={
                    <Button disabled={busyId === o.id}
                      onClick={() => act(o.id, () => vendorAcceptOrder(o.id, storeName), "Order accepted")}>
                      Accept order
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "in-progress" && (
        <section className="space-y-3">
          {mine.loading && !mine.data ? <Loading /> : mine.error ? (
            <ErrorNote message={mine.error} onRetry={mine.reload} />
          ) : !active.length ? (
            <EmptyState title="Nothing in progress" body="Accepted orders appear here until they are delivered." />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {active.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  actions={
                    o.status === "CONFIRMED" ? (
                      <>
                        <Button variant="success" disabled={busyId === o.id}
                          onClick={() => act(o.id, () => vendorMarkPacked(o.id), "Marked ready for pickup")}>
                          Packed, ready for pickup
                        </Button>
                        <Button variant="danger" disabled={busyId === o.id}
                          onClick={() => {
                            if (window.confirm("Can't fulfil this order? It will go back to the open pool for another store.")) {
                              act(o.id, () => vendorReleaseOrder(o.id), "Order released");
                            }
                          }}>
                          Can't fulfil
                        </Button>
                      </>
                    ) : o.status === "PACKED" ? (
                      <p className="text-[11px] text-slate-500">
                        {o.deliveryPartnerName ? `${o.deliveryPartnerName} is coming to collect it.` : "Waiting for a delivery partner."}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500">Out for delivery with {o.deliveryPartnerName || "a rider"}.</p>
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "products" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Products your store lists. Stock at 10 or below is highlighted.
            </p>
            <Button onClick={() => setEditing({})}>Add product</Button>
          </div>
          {products.loading && !products.data ? <Loading /> : products.error ? (
            <ErrorNote message={products.error} onRetry={products.reload} />
          ) : (
            <ProductTable
              products={products.data}
              onEdit={setEditing}
              onDelete={async (p) => {
                if (!window.confirm(`Remove ${p.name}?`)) return;
                try { await vendorDeleteProduct(p.id); toast.success("Product removed"); products.reload(); }
                catch (err) { toast.error(String(err)); }
              }}
              onSaveStock={async (p, stock) => {
                try { await vendorUpdateProduct(p.id, { stock }); toast.success("Stock updated"); products.reload(); }
                catch (err) { toast.error(String(err)); }
              }}
            />
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="space-y-3">
          {!past.length ? <EmptyState title="No completed orders yet" /> : (
            <div className="grid md:grid-cols-2 gap-3">
              {past.map((o) => <OrderCard key={o.id} order={o} showCustomer={false} />)}
            </div>
          )}
        </section>
      )}

      {tab === "overview" && (
        <section className="space-y-4">
          {stats.loading && !s ? <Loading /> : stats.error ? <ErrorNote message={stats.error} onRetry={stats.reload} /> : s && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Delivered revenue" value={formatMoney(s.deliveredRevenue)} />
              <StatCard label="Delivered today" value={s.deliveredToday} />
              <StatCard label="To pack" value={s.byStatus?.CONFIRMED ?? 0} />
              <StatCard label="All orders" value={s.total} />
            </div>
          )}
          {store && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-xs text-slate-600 grid sm:grid-cols-2 gap-2">
              <p><b className="text-slate-800">Drug licence:</b> {store.drugLicenseNumber || "—"}</p>
              <p><b className="text-slate-800">GSTIN:</b> {store.gstin || "—"}</p>
              <p className="sm:col-span-2"><b className="text-slate-800">Address:</b> {[store.businessAddress, store.city, store.pincode].filter(Boolean).join(", ") || "—"}</p>
            </div>
          )}
        </section>
      )}

      {editing && (
        <ProductFormModal
          product={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            const payload = { ...form, vendorName: storeName };
            if (editing.id) await vendorUpdateProduct(editing.id, payload);
            else await vendorCreateProduct(payload);
            toast.success(editing.id ? "Product updated" : "Product added");
            products.reload();
          }}
        />
      )}
    </PortalLayout>
  );
};

export default VendorDashboard;
