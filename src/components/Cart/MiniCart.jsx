import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Close,
  ShoppingCart,
  ArrowForward,
  WarningAmber,
  Receipt,
  Percent,
  LocalOffer,
  LocalMall,
  Paid,
  Refresh,
} from "@mui/icons-material";
import { useCart } from "../../context/CartContext";
import CartItem from "./CartItem";
import { getOrderDetails } from "../../api/orderService";

/** Full fees charged when an order misses the free delivery / free handling thresholds. */
const FULL_DELIVERY_FEE = 30;
const FULL_HANDLING_FEE = 70;

/** Statuses that mean the last order went through, so a leftover cart can be dropped. */
const SETTLED_STATUSES = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "COMPLETED"];

const MiniCart = ({ isOpen, onClose }) => {
  const {
    cart,
    cartLoading,
    syncBackendCart,
    subtotal,
    retailTotal,
    retailDiscount,
    couponDiscount,
    gst,
    deliveryCharges,
    handlingFee,
    grandTotal,
    totalCount,
    requiresPrescription,
    clearCart,
  } = useCart();
  const navigate = useNavigate();

  // Held in refs so the status check below depends on `isOpen` alone. `clearCart` gets a
  // new identity on every CartProvider render, so having it as a dep meant clearing the
  // cart re-triggered the effect, which cleared it again — an endless loop of
  // /api/orders/detail requests for as long as the drawer stayed open.
  const clearCartRef = useRef(clearCart);
  const cartCountRef = useRef(cart.length);
  const settledOrderRef = useRef(null);
  clearCartRef.current = clearCart;
  cartCountRef.current = cart.length;

  useEffect(() => {
    if (!isOpen || cartCountRef.current === 0) return undefined;

    let lastOrderId = null;
    try {
      const orders = JSON.parse(localStorage.getItem("pharmacy_orders")) || [];
      lastOrderId = orders[0]?.id ?? null;
    } catch (err) {
      console.warn("[MiniCart] Could not read the local order history:", err);
    }
    // Already settled this order — there is nothing left to clear.
    if (!lastOrderId || settledOrderRef.current === lastOrderId) return undefined;

    let cancelled = false;
    getOrderDetails(lastOrderId)
      .then((liveOrder) => {
        if (cancelled) return;
        if (SETTLED_STATUSES.includes(String(liveOrder?.status || "").toUpperCase())) {
          settledOrderRef.current = lastOrderId;
          clearCartRef.current();
        }
      })
      .catch((err) => console.warn("[MiniCart] Could not check order status:", err));

    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckoutClick = () => {
    onClose();
    navigate("/checkout");
  };

  const handleViewCartClick = () => {
    onClose();
    navigate("/cart");
  };

  // Savings mirror the billing in CartContext so the breakdown always reconciles with "To Pay".
  const deliverySavings = FULL_DELIVERY_FEE - deliveryCharges;
  const handlingSavings = FULL_HANDLING_FEE - handlingFee;
  const totalSavings = retailDiscount + couponDiscount + deliverySavings + handlingSavings;

  return (
    <>
      {/* BACKGROUND BACKDROP OVERLAY */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] transition-opacity duration-300 animate-in fade-in"
      />

      {/* DRAWER CONTAINER */}
      <div className="fixed top-0 right-0 h-screen w-full sm:w-[480px] bg-white shadow-2xl z-[1000] flex flex-col justify-between transform transition-transform duration-300 animate-in slide-in-from-right">

        {/* HEADER SECTION */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <ShoppingCart className="text-orangeBrand" sx={{ fontSize: 20 }} />
            <h2 className="text-base font-black text-gray-800 uppercase tracking-wide">
              Your Cart ({cartLoading ? "…" : totalCount})
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Refresh / re-sync button */}
            <button
              onClick={syncBackendCart}
              disabled={cartLoading}
              title="Refresh cart from server"
              className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-orangeBrand transition disabled:opacity-40"
            >
              <Refresh sx={{ fontSize: 18 }} className={cartLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition"
            >
              <Close sx={{ fontSize: 20 }} />
            </button>
          </div>
        </div>

        {/* BODY CONTAINER */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* LOADING SKELETON */}
          {cartLoading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-slate-100 rounded-3xl h-28 w-full" />
              ))}
              <div className="bg-slate-100 rounded-2xl h-32 w-full" />
            </div>
          ) : cart.length === 0 ? (
            /* EMPTY CART STATE */
            <div className="h-full flex flex-col justify-center items-center py-20 text-center gap-4">
              <div className="w-24 h-24 bg-orange-50 rounded-full flex justify-center items-center text-orangeBrand shadow-inner">
                <ShoppingCart sx={{ fontSize: 40 }} />
              </div>
              <h3 className="text-lg font-extrabold text-gray-800">Your Cart is Empty</h3>
              <p className="text-gray-400 text-xs max-w-[280px]">
                Add medicines, wellness items, and baby care essentials to start your health purchase.
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate("/home/All");
                }}
                className="mt-2 bg-orangeBrand text-white font-bold text-xs px-6 py-2.5 rounded-full hover:bg-orangeBrand-light transition shadow-md"
              >
                Shop Now
              </button>
            </div>
          ) : (
            /* CART LIST SCROLL */
            <div className="space-y-5 pb-5">
              <div className="space-y-4">
                {cart.map((item) => (
                  <CartItem key={item.id} item={item} />
                ))}
              </div>

              {/* 1. BILL SUMMARY BOX */}
              <div className="border border-slate-100 p-4 rounded-2xl bg-white flex flex-col gap-3.5 shadow-sm text-left">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                    <Receipt sx={{ fontSize: 16 }} />
                  </div>
                  <span className="text-[12px] font-black text-slate-800 uppercase tracking-wide">Bill Summary</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>Item Total</span>
                    <div className="flex items-center gap-2">
                      {retailTotal > subtotal && (
                        <span className="text-slate-400 line-through">₹{retailTotal}</span>
                      )}
                      <span className="font-extrabold text-slate-800">₹{subtotal}</span>
                    </div>
                  </div>

                  {couponDiscount > 0 && (
                    <div className="flex justify-between items-center font-semibold text-emerald-600">
                      <span>Coupon Discount</span>
                      <span className="font-extrabold">-₹{couponDiscount}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>GST (18%)</span>
                    <span className="font-extrabold text-slate-800">₹{gst}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>Delivery Fee</span>
                    <div className="flex items-center gap-2">
                      {deliveryCharges === 0 ? (
                        <>
                          <span className="text-slate-400 line-through">₹{FULL_DELIVERY_FEE}</span>
                          <span className="font-black text-emerald-600 uppercase tracking-wider text-[10px]">FREE</span>
                        </>
                      ) : (
                        <span className="font-extrabold text-slate-800">₹{deliveryCharges}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-slate-500 font-semibold">
                    <span>Handling Fee</span>
                    <div className="flex items-center gap-2">
                      {handlingFee === 0 ? (
                        <>
                          <span className="text-slate-400 line-through">₹{FULL_HANDLING_FEE}</span>
                          <span className="font-black text-emerald-600 uppercase tracking-wider text-[10px]">FREE</span>
                        </>
                      ) : (
                        <span className="font-extrabold text-slate-800">₹{handlingFee}</span>
                      )}
                    </div>
                  </div>

                  <div className="h-[1px] bg-slate-100 my-2" />

                  <div className="flex justify-between items-center font-black text-slate-800 text-[13px]">
                    <span>To Pay</span>
                    <div className="flex items-center gap-2">
                      {totalSavings > 0 && (
                        <span className="text-slate-400 line-through text-xs font-normal">₹{grandTotal + totalSavings}</span>
                      )}
                      <span className="text-base font-black text-slate-900">₹{grandTotal}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SAVINGS BLOCK */}
              {totalSavings > 0 && (
                <div className="bg-emerald-50/40 border border-emerald-100/60 p-4 rounded-2xl flex flex-col gap-3 shadow-sm text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black text-slate-800 uppercase tracking-wide">Savings on this order</span>
                    <div className="bg-emerald-600 text-white px-3 py-1 rounded-lg font-black text-[12px] shadow-sm">
                      ₹{totalSavings}
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-100/30 rounded-xl p-3.5 space-y-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                    {/* Discount on MRP */}
                    {retailDiscount > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                            <Percent sx={{ fontSize: 12 }} />
                          </div>
                          <span className="font-bold text-slate-700">Discount on MRP</span>
                        </div>
                        <span className="font-black text-slate-800">₹{retailDiscount}</span>
                      </div>
                    )}

                    {/* Coupon savings */}
                    {couponDiscount > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                            <LocalOffer sx={{ fontSize: 11 }} />
                          </div>
                          <span className="font-bold text-slate-700">Coupon savings</span>
                        </div>
                        <span className="font-black text-slate-800">₹{couponDiscount}</span>
                      </div>
                    )}

                    {/* FREE Delivery Savings */}
                    {deliverySavings > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                            <LocalMall sx={{ fontSize: 11 }} />
                          </div>
                          <span className="font-bold text-slate-700">FREE delivery savings</span>
                        </div>
                        <span className="font-black text-slate-800">₹{deliverySavings}</span>
                      </div>
                    )}

                    {/* Savings on Handling fee */}
                    {handlingSavings > 0 && (
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                            <Paid sx={{ fontSize: 12 }} />
                          </div>
                          <span className="font-bold text-slate-700">Savings on Handling fee</span>
                        </div>
                        <span className="font-black text-slate-800">₹{handlingSavings}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* FOOTER METRICS AND ACTIONS */}
        {!cartLoading && cart.length > 0 && (
          <div className="border-t border-gray-100 p-5 bg-slate-50 space-y-4 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
            {/* Prescription warnings */}
            {requiresPrescription && (
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 flex gap-2 text-[11px] text-rose-800 font-medium items-start">
                <WarningAmber sx={{ color: "#e11d48", fontSize: 16 }} className="flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-900">Rx Prescription Required:</span> Some items require a doctor's prescription. You can upload it during checkout.
                </div>
              </div>
            )}

            {/* ACTION TRIGGERS */}
            <div className="grid grid-cols-2 gap-3.5">
              <button
                onClick={handleViewCartClick}
                className="w-full bg-white border border-gray-300 hover:border-gray-400 text-gray-700 font-extrabold text-xs py-3 rounded-2xl shadow-sm transition active:scale-95 duration-200"
              >
                View Full Cart
              </button>

              <button
                onClick={handleCheckoutClick}
                className="w-full bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs py-3 rounded-2xl shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 transition active:scale-95 duration-200"
              >
                <span>Checkout</span>
                <ArrowForward sx={{ fontSize: 16 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default MiniCart;
