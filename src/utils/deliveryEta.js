/**
 * Delivery estimate driven by the real fulfilment timestamps the vendor and rider portals
 * write (acceptedAt, packedAt, pickedUpAt, deliveredAt). Each step has a time budget; the
 * estimate is what's left of the current step plus the budgets of the steps still ahead.
 * When a step takes longer than its budget the order is "running late".
 */

/** Minutes each step is expected to take (about 30 minutes end to end). */
export const STEP_MINUTES = {
  accept: 3, // a pharmacy accepts the order
  pack: 7,   // the pharmacy packs it
  pickup: 8, // a rider takes the job and collects it from the store
  ride: 12,  // the rider brings it to the customer
};

const STEPS = ["accept", "pack", "pickup", "ride"];

/** Which step is under way for an order status, and which timestamp it started at. */
const CURRENT_STEP = {
  CREATED: { step: "accept", startedAt: (o) => o.createdAt },
  PAID: { step: "accept", startedAt: (o) => o.createdAt },
  CONFIRMED: { step: "pack", startedAt: (o) => o.acceptedAt },
  PACKED: { step: "pickup", startedAt: (o) => o.packedAt },
  SHIPPED: { step: "ride", startedAt: (o) => o.pickedUpAt },
};

/** When an overdue step will "surely" finish: never promise less than this many minutes. */
const LATE_GRACE_MINUTES = 2;

const toTime = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

export const formatMinutes = (mins) => {
  if (mins < 60) return `${mins} ${mins === 1 ? "min" : "mins"}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} ${h === 1 ? "hr" : "hrs"}${m ? ` ${m} mins` : ""}`;
};

/**
 * One of:
 *   { kind: "eta", minutes, late, step }      order on its way
 *   { kind: "delivered", minutes }            delivered, minutes it took (null if unknown)
 *   { kind: "awaiting-payment" }              online order not paid yet, clock hasn't started
 *   { kind: "none" }                          cancelled / failed / unknown
 * `order.status` is upper-case; timestamps are ISO strings; `now` is a Date or ms.
 */
export const estimateDelivery = (order, now = Date.now()) => {
  const status = String(order?.status || "").toUpperCase();
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();

  if (status === "DELIVERED") {
    const placed = toTime(order.createdAt);
    const delivered = toTime(order.deliveredAt);
    return {
      kind: "delivered",
      minutes: placed && delivered && delivered >= placed ? Math.max(1, Math.round((delivered - placed) / 60000)) : null,
    };
  }

  // Unpaid online orders don't reach pharmacies yet (cash on delivery does).
  const cashOnDelivery = String(order?.paymentMethod || "").toUpperCase() === "COD";
  if (status === "CREATED" && !cashOnDelivery) return { kind: "awaiting-payment" };

  const current = CURRENT_STEP[status];
  if (!current) return { kind: "none" };

  // Orders made before these timestamps existed fall back to when the order was placed.
  const started = toTime(current.startedAt(order)) ?? toTime(order.createdAt) ?? nowMs;
  const elapsed = Math.max(0, (nowMs - started) / 60000);
  const budget = STEP_MINUTES[current.step];
  const late = elapsed > budget;
  const leftInStep = late ? LATE_GRACE_MINUTES : budget - elapsed;
  const ahead = STEPS.slice(STEPS.indexOf(current.step) + 1).reduce((sum, s) => sum + STEP_MINUTES[s], 0);

  return { kind: "eta", minutes: Math.max(1, Math.ceil(leftInStep + ahead)), late, step: current.step };
};
