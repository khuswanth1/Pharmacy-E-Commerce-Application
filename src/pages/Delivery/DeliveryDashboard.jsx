import React, { useContext, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { AuthContext } from "../../context/AuthContext";
import {
  getMyPartnerProfile, setOnlineStatus, deliveryAvailableOrders, deliveryMyOrders, deliveryStats,
  deliveryAccept, deliveryPickUp, deliveryUpdateLocation, deliveryComplete,
} from "../../api/partnerService";
import {
  PortalLayout, OrderCard, StatCard, EmptyState, Button, Loading, ErrorNote, useAsync, inputClass, usePortalTab, LIVE, LiveBadge,
} from "../../components/Portal/PortalUI";
import { formatMoney, formatDateTime } from "../../utils/roles";

const LOCATION_MS = 30000;
const BASE_PATH = "/delivery";
const TAB_IDS = ["active", "requests", "history", "summary"];

const mapsLink = (address) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || "")}`;

/** Shares the rider's position for every order that is out for delivery. */
const useLocationSharing = (orders) => {
  const [sharing, setSharing] = useState(false);
  const last = useRef(0);
  const ids = orders.map((o) => o.id).join(",");

  useEffect(() => {
    if (!ids || !navigator.geolocation) { setSharing(false); return undefined; }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setSharing(true);
        if (Date.now() - last.current < LOCATION_MS) return;
        last.current = Date.now();
        ids.split(",").forEach((id) =>
          deliveryUpdateLocation(id, pos.coords.latitude, pos.coords.longitude).catch(() => {})
        );
      },
      () => setSharing(false),
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [ids]);

  return sharing;
};

const DeliverForm = ({ order, onDone }) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== 4) return toast.error("Enter the 4-digit code from the customer.");
    setBusy(true);
    try {
      const delivered = await deliveryComplete(order.id, code);
      toast.success("Delivered. Nice work!");
      onDone({ ...order, ...(delivered || {}) });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-slate-100 flex items-end gap-2">
      <label className="flex-1">
        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Customer's delivery code</span>
        <input
          className={`${inputClass} tracking-[0.5em] text-center font-black`}
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
        />
      </label>
      <Button type="submit" variant="success" disabled={busy} className="py-2.5">Confirm delivery</Button>
    </form>
  );
};

const Detail = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2">
    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="text-xs font-bold text-slate-800 truncate">{value}</dd>
  </div>
);

/** Confirmation shown right after the customer's delivery code is accepted. */
const DeliverySuccess = ({ order, onDismiss, onViewHistory }) => (
  <section className="bg-white rounded-2xl border border-green-200 ring-1 ring-green-100 p-5 text-center">
    <div className="w-12 h-12 mx-auto rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl font-black">
      &#10003;
    </div>
    <h2 className="mt-3 text-base font-black text-slate-900">Order delivered successfully</h2>
    <p className="text-xs text-slate-500 mt-1">
      The code matched. This order is now marked delivered and has moved to your history.
    </p>

    <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
      <Detail label="Order" value={`#${String(order.id).slice(-8).toUpperCase()}`} />
      <Detail label="Customer" value={order.receiverName || "—"} />
      <Detail label="Order value" value={formatMoney(order.totalAmount)} />
      <Detail label="Delivered at" value={formatDateTime(order.deliveredAt || new Date().toISOString())} />
    </dl>

    {String(order.paymentMethod || "").toUpperCase() === "COD" && (
      <p className="mt-3 text-[11px] font-bold text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
        Cash on delivery &mdash; check that you collected {formatMoney(order.totalAmount)}.
      </p>
    )}

    <div className="mt-4 flex justify-center gap-2">
      <Button variant="success" onClick={onDismiss}>Next delivery</Button>
      <Button variant="outline" onClick={onViewHistory}>View in history</Button>
    </div>
  </section>
);

const DeliveryDashboard = () => {
  const { user } = useContext(AuthContext);
  const [tab, setTab] = usePortalTab(BASE_PATH, TAB_IDS);
  const [profile, setProfile] = useState(null);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [delivered, setDelivered] = useState(null);

  const online = !!profile?.online;

  // Lists refresh themselves, so new requests and status changes show up without reloading.
  // New requests only matter while the rider is online.
  const available = useAsync(deliveryAvailableOrders, [], online ? LIVE : {});
  const mine = useAsync(deliveryMyOrders, [], LIVE);
  const stats = useAsync(deliveryStats, [], LIVE);

  useEffect(() => {
    getMyPartnerProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  const active = (mine.data || []).filter((o) => ["PACKED", "SHIPPED"].includes(o.status));
  const done = (mine.data || []).filter((o) => !["PACKED", "SHIPPED"].includes(o.status));
  const outForDelivery = active.filter((o) => o.status === "SHIPPED");
  const sharing = useLocationSharing(outForDelivery);

  const refresh = () => { available.reload(); mine.reload(); stats.reload(); };

  // The "delivered" confirmation belongs to My deliveries; leaving that tab dismisses it.
  useEffect(() => {
    if (tab !== "active") setDelivered(null);
  }, [tab]);

  /** Confirms the delivery on screen, then pulls fresh lists and totals. */
  const handleDelivered = (order) => {
    setDelivered(order);
    refresh();
  };

  const act = async (orderId, fn, success, nextTab) => {
    setBusyId(orderId);
    try {
      await fn();
      toast.success(success);
      if (nextTab) setTab(nextTab);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const toggleOnline = async () => {
    setTogglingOnline(true);
    try {
      setProfile(await setOnlineStatus(!online));
      if (!online) available.reload();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setTogglingOnline(false);
    }
  };

  const tabs = [
    { id: "active", label: "My deliveries", count: active.length },
    { id: "requests", label: "New requests", count: online ? available.data?.length || 0 : 0 },
    { id: "history", label: "History" },
    { id: "summary", label: "Summary" },
  ];

  const onlineSwitch = (
    <button
      onClick={toggleOnline}
      disabled={togglingOnline || !profile}
      className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 text-xs font-black border transition ${
        online ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-500"
      }`}
    >
      <span className={`w-5 h-5 rounded-full ${online ? "bg-green-500" : "bg-slate-400"}`} />
      {online ? "Online" : "Offline"}
    </button>
  );

  return (
    <PortalLayout
      title="Deliveries"
      subtitle={profile ? `${profile.vehicleType || "Rider"}${profile.vehicleNumber ? ` · ${profile.vehicleNumber}` : ""}` : "Delivery partner"}
      accent="bg-green-600"
      basePath={BASE_PATH}
      tabs={tabs}
      activeTab={tab}
      headerExtra={<><LiveBadge updatedAt={mine.updatedAt} />{onlineSwitch}</>}
    >
      {tab === "active" && (
        <section className="space-y-3">
          {delivered && (
            <DeliverySuccess
              order={delivered}
              onDismiss={() => setDelivered(null)}
              onViewHistory={() => setTab("history")}
            />
          )}
          {outForDelivery.length > 0 && (
            <p className={`text-[11px] rounded-xl px-3 py-2 ${sharing ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
              {sharing
                ? "Sharing your live location with customers while you're out for delivery."
                : "Allow location access so customers can track you."}
            </p>
          )}
          {mine.loading && !mine.data ? <Loading /> : mine.error ? (
            <ErrorNote message={mine.error} onRetry={mine.reload} />
          ) : !active.length ? (
            <EmptyState
              title="No active deliveries"
              body={online ? "Accept a request from New requests." : "Go online to start receiving delivery requests."}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {active.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  actions={
                    <>
                      <a href={mapsLink(o.address)} target="_blank" rel="noreferrer"
                        className="text-xs font-bold rounded-xl px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100">
                        Navigate
                      </a>
                      {o.status === "PACKED" && (
                        <Button disabled={busyId === o.id}
                          onClick={() => act(o.id, () => deliveryPickUp(o.id), "Picked up. Head to the customer.")}>
                          Picked up from store
                        </Button>
                      )}
                    </>
                  }
                >
                  {o.status === "PACKED" && (
                    <p className="mt-2 text-[11px] text-slate-500">Collect from <b>{o.vendorName || "the store"}</b>.</p>
                  )}
                  {o.status === "SHIPPED" && <DeliverForm order={o} onDone={handleDelivered} />}
                </OrderCard>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "requests" && (
        <section className="space-y-3">
          {!online ? (
            <EmptyState title="You're offline" body="Switch to Online at the top to see delivery requests." />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Packed orders waiting for a rider.</p>
                <Button variant="outline" onClick={available.reload}>Refresh</Button>
              </div>
              {available.loading && !available.data ? <Loading /> : available.error ? (
                <ErrorNote message={available.error} onRetry={available.reload} />
              ) : !available.data?.length ? (
                <EmptyState title="No requests right now" body="New requests appear here automatically." />
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  {available.data.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      actions={
                        <Button variant="success" disabled={busyId === o.id}
                          onClick={() => act(o.id, () => deliveryAccept(o.id, user?.name, user?.phone), "Delivery accepted", "active")}>
                          Accept delivery
                        </Button>
                      }
                    >
                      <p className="mt-2 text-[11px] text-slate-500">Pick up from <b>{o.vendorName || "the store"}</b>.</p>
                    </OrderCard>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="space-y-3">
          {!done.length ? <EmptyState title="No completed deliveries yet" /> : (
            <div className="grid md:grid-cols-2 gap-3">
              {done.map((o) => <OrderCard key={o.id} order={o} showCustomer={false} />)}
            </div>
          )}
        </section>
      )}

      {tab === "summary" && (
        <section>
          {stats.loading && !stats.data ? <Loading /> : stats.error ? <ErrorNote message={stats.error} onRetry={stats.reload} /> : stats.data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Delivered today" value={stats.data.deliveredToday} />
              <StatCard label="Delivered total" value={stats.data.byStatus?.DELIVERED ?? 0} />
              <StatCard label="Out for delivery" value={stats.data.byStatus?.SHIPPED ?? 0} />
              <StatCard label="Assigned total" value={stats.data.total} />
            </div>
          )}
        </section>
      )}
    </PortalLayout>
  );
};

export default DeliveryDashboard;
