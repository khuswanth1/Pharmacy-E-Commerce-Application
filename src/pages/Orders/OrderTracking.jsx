import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import {
  ShoppingBag, Cached, ArrowBack, Chat,
  Receipt, Lock, LocationOn, Payment,
  CheckCircle, Edit, DirectionsBike, KeyboardArrowRight,
  Nightlight, WbSunny, MeetingRoom, VolumeOff, NotificationsOff,
  Shield, Mic, Close
} from "@mui/icons-material";
import { toast } from "react-toastify";
import { createPaymentOrder, verifyPayment, refundToWallet } from "../../api/paymentService";
import { openRazorpayCheckout } from "../../utils/razorpay";
import { syncUserFromServer } from "../../utils/wallet";
import { updateOrderStatus, getOrderDetails, updateOrderDeliveryDetails } from "../../api/orderService";
import { fetchAllProducts } from "../../api/productService";
import { getDeliveryCode } from "../../api/partnerService";

/** Store, rider and the delivery code the customer gives the rider on arrival. */
const DeliveryCodePanel = ({ order }) => {
  const [code, setCode] = useState(null);
  const active = ["CREATED", "PAID", "CONFIRMED", "PACKED", "SHIPPED"].includes(order?.status);

  useEffect(() => {
    if (!order?.id || !active) return;
    getDeliveryCode(order.id).then((d) => setCode(d?.code || null)).catch(() => setCode(null));
  }, [order?.id, active]);

  if (!active || (!code && !order.vendorName && !order.deliveryPartnerName)) return null;

  return (
    <div className="bg-white/15 border border-white/25 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="text-xs space-y-0.5">
        {order.vendorName && (
          <p>
            {order.status === "CONFIRMED" ? "Accepted by " : "Packed by "}<b>{order.vendorName}</b>
            {order.status === "PACKED" && !order.deliveryPartnerName && " · finding a delivery partner"}
          </p>
        )}
        {order.deliveryPartnerName && (
          <p>
            Delivered by <b>{order.deliveryPartnerName}</b>
            {order.deliveryPartnerPhone && (
              <> · <a href={`tel:${order.deliveryPartnerPhone}`} className="underline font-bold">{order.deliveryPartnerPhone}</a></>
            )}
          </p>
        )}
        {!order.vendorName && <p>Waiting for a pharmacy to accept your order.</p>}
      </div>
      {code && (
        <div className="text-center bg-white text-[#FF6F3C] rounded-xl px-4 py-2">
          <p className="text-[9px] font-black uppercase tracking-wider">Delivery code</p>
          <p className="text-2xl font-black tracking-[0.3em] tabular-nums">{code}</p>
          <p className="text-[9px] text-slate-500">Share only when you receive your order</p>
        </div>
      )}
    </div>
  );
};

/** Statuses where the order is still moving, and how often to re-check it. */
const LIVE_STATUSES = ["CREATED", "PAID", "CONFIRMED", "PACKED", "SHIPPED"];
const LIVE_REFRESH_MS = 10000;

const OrderTracking = () => {
  const { id } = useParams();
  const { addToCart, clearCart } = useCart();
  const navigate = useNavigate();
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isPayingNow, setIsPayingNow] = useState(false);
  const [repayMethod, setRepayMethod] = useState("razorpay");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refundMethod, setRefundMethod] = useState("wallet");
  const [isCancelling, setIsCancelling] = useState(false);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTip, setSelectedTip] = useState(null);
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);
  const [customTipValue, setCustomTipValue] = useState("50");
  
  // Premium Delivery Instructions States
  const [directionsText, setDirectionsText] = useState("");
  const [tempDirectionsText, setTempDirectionsText] = useState("");
  const [leaveAtDoor, setLeaveAtDoor] = useState(false);
  const [avoidCalling, setAvoidCalling] = useState(false);
  const [avoidRingingBell, setAvoidRingingBell] = useState(false);
  const [leaveWithSecurity, setLeaveWithSecurity] = useState(false);
  const [showDirectionsForm, setShowDirectionsForm] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const startVoiceRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.onstart = () => {
      setIsRecording(true);
      toast.info("Listening... Speak now 🎙️");
    };
    recognition.onerror = (e) => {
      console.error(e);
      setIsRecording(false);
      toast.error("Voice recognition failed. Try again.");
    };
    recognition.onend = () => {
      setIsRecording(false);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTempDirectionsText((prev) => (prev ? prev + " " + transcript : transcript));
      toast.success("Voice direction captured! 🎙️");
    };
    recognition.start();
  };

  const [nowTime, setNowTime] = useState(new Date());

  const loadLiveOrder = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);
      setLoadError(false);
      const [data, productsList] = await Promise.all([
        getOrderDetails(id),
        fetchAllProducts().catch(() => [])
      ]);

      if (data) {
        const formattedItems = (data.items || []).map(item => {
          const matched = productsList.find(p => String(p.id) === String(item.productId));
          return {
            id: item.productId,
            name: item.productName,
            final_price: item.price,
            cost: matched?.cost ?? matched?.price ?? item.price,
            quantity: item.quantity,
            manufacturer: matched?.manufacturer || matched?.brand || "Generic Product",
            images: matched?.images ? (Array.isArray(matched.images) ? matched.images[0] : matched.images) : "/assets/products/ice-cream.png"
          };
        });

        setOrder({
          id: data.id,
          createdAt: data.createdAt || new Date().toISOString(),
          date: new Date(data.createdAt || new Date()).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
          }),
          arrivalTime: data.arrivalTime || "30 Mins",
          amount: `₹${data.totalAmount}`,
          totalAmount: data.totalAmount,
          status: (data.status || "CREATED").toUpperCase(),
          paymentMethod: data.paymentMethod?.toLowerCase() || "cod",
          deliveryTime: data.deliveryTime || "30 mins",
          items: formattedItems,
          receiverName: data.receiverName,
          phoneNumber: data.phoneNumber,
          address: data.address,
          deliveryInstructions: data.deliveryInstructions,
          vendorName: data.vendorName,
          deliveryPartnerName: data.deliveryPartnerName,
          deliveryPartnerPhone: data.deliveryPartnerPhone
        });

        // Delivery details saved on the order win; otherwise keep the signed-in customer's.
        if (data.receiverName || data.phoneNumber || data.address) {
          setUserProfile((prev) => ({
            name: data.receiverName || prev.name,
            phone: data.phoneNumber || prev.phone,
            address: data.address || prev.address
          }));
          if (data.receiverName) setEditName(data.receiverName);
          if (data.phoneNumber) setEditPhone(data.phoneNumber);
          if (data.address) setEditAddress(data.address);
        }
        if (data.deliveryInstructions) {
          setDirectionsText(data.deliveryInstructions);
          setTempDirectionsText(data.deliveryInstructions);
        }

        // Clear cart for all successful/pending orders except failed/cancelled.
        // Only on the first load: background polls must not hit the cart API every few seconds.
        const statusUpper = (data.status || "CREATED").toUpperCase();
        if (showLoading && statusUpper !== "FAILED" && statusUpper !== "CANCELLED") {
          clearCart();
        }
      } else {
        throw new Error("No data returned");
      }
    } catch (err) {
      // A failed background poll keeps showing the live data we already have.
      if (!showLoading) return;
      console.warn("[OrderTracking] Live fetch failed, reading local storage history:", err);
      const orders = JSON.parse(localStorage.getItem("pharmacy_orders")) || [];
      const found = orders.find((o) => String(o.id) === String(id));
      if (found) {
        setOrder(found);
      } else {
        setLoadError(true);
      }
    } finally {
      if (showLoading) setLoading(false);
      else setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveOrder(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Follow the order live while it moves vendor → rider → doorstep, so the customer sees
  // "accepted", "out for delivery" and "delivered" without refreshing the page.
  const orderStatus = order?.status;
  useEffect(() => {
    if (!LIVE_STATUSES.includes(orderStatus)) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) loadLiveOrder(false);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, orderStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const remainingMins = useMemo(() => {
    if (!order) return 15;
    const createdAtStr = order.createdAt || order.date;
    let placedTime;
    try {
      placedTime = new Date(createdAtStr);
      if (isNaN(placedTime.getTime())) {
        return parseInt(order.deliveryTime) || 24;
      }
    } catch (e) {
      return parseInt(order.deliveryTime) || 24;
    }
    const diffMs = nowTime - placedTime;
    const diffMins = Math.floor(diffMs / 60000);
    const totalDuration = parseInt(order.deliveryTime) || 20;
    const remaining = totalDuration - diffMins;
    
    // Clamp to 5 to 20 mins range
    const clamped = Math.max(5, Math.min(20, remaining));
    return clamped;
  }, [order, nowTime]);


  const handleReorder = () => {
    if (!order?.items || order.items.length === 0) return;
    
    order.items.forEach((item) => {
      addToCart(item, item.quantity);
    });

    toast.success("All items added back to your cart! 🛒");
    navigate("/cart");
  };

  // ── Pay Now: pay for an unpaid order through Razorpay (UPI first when chosen).
  // The server charges the order total and marks the order paid after verifying.
  const handlePayNow = async () => {
    setIsPayingNow(true);
    try {
      const user = (() => {
        try { return JSON.parse(localStorage.getItem("user") || localStorage.getItem("pharmacy_user") || "{}"); } catch { return {}; }
      })();
      const pOrder = await createPaymentOrder({
        orderId: String(order.id),
        paymentMethod: repayMethod === "upi" ? "UPI" : "RAZORPAY"
      });
      setIsPayingNow(false);
      const paid = await openRazorpayCheckout(pOrder, {
        name: "Pharmacy",
        description: `Order #${String(order.id).slice(-8).toUpperCase()}`,
        prefill: user,
        preferUpi: repayMethod === "upi"
      });
      setIsPayingNow(true);
      await verifyPayment(paid);
      clearCart();
      toast.success("Payment successful!");
      setIsPayingNow(false);
      // Show the paid order in place; no page reload.
      await loadLiveOrder(false);
    } catch (err) {
      setIsPayingNow(false);
      if (err?.dismissed) {
        toast.info("Payment cancelled. You can pay later from here.");
        return;
      }
      toast.error(typeof err === "string" ? err : (err?.message || "Couldn't complete the payment. Try again."));
    }
  };

  // Retrieve user details as state so they can be edited dynamically
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem("user") || localStorage.getItem("pharmacy_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          name: parsed.name || "",
          phone: parsed.phone || "",
          address: parsed.address || "No delivery address saved"
        };
      } catch (e) {
        // Fall through to empty details
      }
    }
    return { name: "", phone: "", address: "No delivery address saved" };
  });

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  
  const [editName, setEditName] = useState(userProfile.name);
  const [editPhone, setEditPhone] = useState(userProfile.phone);
  const [editAddress, setEditAddress] = useState(userProfile.address);

  // Compute values for Bill Summary section
  const billSummary = useMemo(() => {
    let mrpSum = 0;
    let finalSum = 0;
    
    if (!order) return { mrp: 0, discount: 0, total: 0 };

    order.items?.forEach(item => {
      mrpSum += (item.cost || item.final_price) * item.quantity;
      finalSum += item.final_price * item.quantity;
    });

    return {
      mrp: mrpSum,
      discount: mrpSum - finalSum,
      total: finalSum
    };
  }, [order]);
 

  const handleCancelOrder = () => {
    setShowCancelModal(true);
  };

  const executeCancelOrder = async () => {
    setIsCancelling(true);
    try {
      await updateOrderStatus(order.id, "CANCELLED");
      // Only money that was actually paid is refunded; the server checks the payment records.
      const user = JSON.parse(localStorage.getItem("user") || localStorage.getItem("pharmacy_user") || "{}");
      if (refundMethod === "wallet") {
        const { refunded } = await refundToWallet(order.id);
        if (Number(refunded) > 0) {
          await syncUserFromServer(user.id || user.userId);
          toast.success(`Order cancelled. ₹${refunded} refunded to your Pharmacy Wallet.`);
        } else {
          toast.success("Order cancelled. Nothing was charged, so there's nothing to refund.");
        }
      } else {
        toast.success("Order cancelled. If you paid online, our team will refund it to your original payment method.");
      }
      setShowCancelModal(false);
      await loadLiveOrder(false);
    } catch (err) {
      toast.error(err?.message || "Failed to cancel order.");
    } finally {
      setIsCancelling(false);
    }
  };

  if (!loading && !order && loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 gap-3 text-center">
        <p className="text-sm font-black text-slate-800">We couldn't load this order</p>
        <p className="text-xs text-slate-500">Check your connection and try again. If you just paid, your payment is safe.</p>
        <div className="flex gap-2">
          <button onClick={() => loadLiveOrder()} className="text-xs font-bold bg-orangeBrand text-white rounded-xl px-4 py-2">Try again</button>
          <button onClick={() => navigate("/profile/orders")} className="text-xs font-bold border border-slate-300 rounded-xl px-4 py-2">My orders</button>
        </div>
      </div>
    );
  }

  if (loading || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 gap-4">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading live dispatch tracker...</p>
      </div>
    );
  }

  // Determine main status heading based on order status
  const getStatusHeading = () => {
    const s = (order.status || "").toUpperCase();
    if (s === "DELIVERED") return "Your order has been delivered";
    if (s === "CANCELLED" || s === "FAILED") return "Your order was cancelled";
    if (s === "SHIPPED") return "Rider is out for delivery";
    if (s === "PACKED") return "Packed and ready for pickup";
    if (s === "CONFIRMED") return "A pharmacy accepted your order";
    if (s === "PAID") return "Payment verified, preparing your order";
    return "Processing your order";
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-slate-800 font-sans flex flex-col items-center pb-12">
      {/* Dynamic route animation keyframe helper style */}
      <style>{`
        @keyframes routeDash {
          to {
            stroke-dashoffset: -20;
          }
        }
        .animated-route-line {
          stroke-dasharray: 8 6;
          animation: routeDash 1.5s linear infinite;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* MAIN CONTENT WRAPPER (RESPONSIVE GRID FORMAT) */}
      <main className="w-full max-w-7xl mx-auto px-4 md:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT/MAIN COLUMN (2 spans) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* STATUS PANEL CARD */}
            <section className="bg-[#FF6F3C] text-white rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">{getStatusHeading()}</h1>
                  <p className="text-xs text-orange-100 opacity-90">Order ID: <span className="font-mono font-extrabold">{order.id}</span> | Placed on {order.date}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="bg-[#e05624]/65 border border-orange-400/30 text-white font-extrabold text-xs px-3.5 py-2 rounded-full flex items-center gap-1.5 shadow-sm">
                    Arriving in {remainingMins > 0 ? `${remainingMins} mins` : "shortly"} • On time
                  </span>
                  <button 
                    disabled={isRefreshing}
                    onClick={() => {
                      loadLiveOrder(false);
                      setNowTime(new Date());
                      toast.success("Order status and remaining duration refreshed! 🔄");
                    }}
                    className="bg-[#e05624]/40 p-2.5 rounded-full hover:bg-[#e05624]/60 transition flex items-center justify-center disabled:opacity-50"
                  >
                    <Cached 
                      sx={{ fontSize: 18 }} 
                      className={isRefreshing ? "animate-spin" : ""}
                    />
                  </button>
                </div>
              </div>

              <DeliveryCodePanel order={order} />

              {/* LATE NIGHT / DAYTIME DELIVERY BANNER */}
              {(() => {
                const orderHour = order?.createdAt ? new Date(order.createdAt).getHours() : new Date().getHours();
                const isNight = orderHour >= 20 || orderHour < 6;
                return (
                  <div className="bg-white rounded-2xl p-4 flex gap-3.5 items-start text-xs border border-slate-200/60 shadow-sm text-slate-800">
                    {isNight ? (
                      <>
                        <Nightlight className="text-amber-500 mt-0.5" sx={{ fontSize: 18 }} />
                        <div className="space-y-0.5 font-medium">
                          <p className="font-bold text-slate-900">Late night delivery!</p>
                          <p className="text-slate-600 leading-relaxed">Keep your phone close, delivery partner may call closer to arrival</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <WbSunny className="text-amber-500 mt-0.5" sx={{ fontSize: 18 }} />
                        <div className="space-y-0.5 font-medium">
                          <p className="font-bold text-slate-900">Express daytime delivery!</p>
                          <p className="text-slate-600 leading-relaxed">Your medicines are on the way. Please ensure someone is available at the delivery location.</p>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </section>

            {/* LIVE SIMULATED TRACKING MAP */}
            <section className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/50 space-y-3">
              <div className="relative w-full h-[240px] md:h-[320px] bg-[#f0f4f8] rounded-2xl overflow-hidden border border-slate-100 shadow-inner">
                {/* Styled Grid / Roads Simulation */}
                <svg className="w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <path d="M 0 160 Q 300 180 600 120 T 900 160" fill="none" stroke="#e2e8f0" strokeWidth="20" strokeLinecap="round" />
                  <path d="M 220 0 L 220 400" fill="none" stroke="#e2e8f0" strokeWidth="20" strokeLinecap="round" />
                  <path d="M 520 0 L 520 400" fill="none" stroke="#e2e8f0" strokeWidth="20" strokeLinecap="round" />

                  {/* Animated Route Line */}
                  <path
                    d="M 220 320 C 220 220, 520 220, 520 80"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeLinecap="round"
                    className="animated-route-line"
                  />
                </svg>
                
                {/* Pin 1: Pharmacy Store */}
                <div className="absolute top-[50px] right-[25%] flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-600 border-2 border-white rounded-full flex items-center justify-center shadow-lg text-white">
                    <ShoppingBag sx={{ fontSize: 24 }} />
                  </div>
                  <span className="text-[10px] font-black bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-sm mt-1 text-slate-800">Pharmacy</span>
                </div>

                {/* Pin 2: User Home / PG */}
                <div className="absolute bottom-[50px] left-[20%] flex flex-col items-center">
                  <div className="w-12 h-12 bg-[#FF6F3C] border-2 border-white rounded-full flex items-center justify-center shadow-lg text-white">
                    <LocationOn sx={{ fontSize: 24 }} />
                  </div>
                  <span className="text-[10px] font-black bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-sm mt-1 text-slate-800">Delivery at PG</span>
                </div>
              </div>
            </section>

            {/* ORDER AUDIT AND ITEMS CARD */}
            <section className="bg-white rounded-3xl p-5 border border-slate-200/50 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Ordered Items</span>
                  <h4 className="font-extrabold text-xs text-slate-800 mt-0.5">Order #{order.id}</h4>
                </div>
                <button
                  onClick={() => setShowDetailsModal(true)}
                  className="text-emerald-600 font-extrabold text-[10px] uppercase hover:underline flex items-center gap-0.5"
                >
                  <span>View Bill</span>
                  <KeyboardArrowRight sx={{ fontSize: 14 }} />
                </button>
              </div>

              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                {order.items?.map((item) => (
                  <div key={item.id} className="flex gap-3 text-xs items-center justify-between">
                    <div className="flex gap-2.5 items-center flex-1 min-w-0">
                      <img
                        src={Array.isArray(item.images) ? item.images[0] : item.images}
                        alt={item.name}
                        className="w-10 h-10 object-contain bg-slate-50 p-1 rounded-xl flex-shrink-0 border border-slate-100"
                      />
                      <div className="min-w-0">
                        <h5 className="font-bold text-slate-800 truncate leading-tight text-left">{item.name}</h5>
                        <span className="text-[10px] text-slate-400 block text-left">Qty: {item.quantity} | {item.manufacturer}</span>
                      </div>
                    </div>
                    <span className="font-black text-slate-900 flex-shrink-0">₹{Math.round(item.final_price) * item.quantity}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (1 span) */}
          <div className="space-y-6">
            {/* DELIVERY DETAILS PANEL */}
            <section className="bg-white rounded-3xl p-5 border border-slate-200/50 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">All your delivery details</span>
              </div>

              <div className="space-y-4 text-xs">
                {/* Phone Info */}
                {isEditingPhone ? (
                  <div className="space-y-2 border border-slate-200/60 p-3 rounded-2xl bg-slate-50 animate-in fade-in duration-200 text-left">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Receiver Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-650 font-extrabold text-slate-800"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Phone Number</label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-650 font-bold text-slate-700"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        onClick={() => {
                          if (!editName.trim() || !editPhone.trim()) {
                            toast.error("Name and phone number cannot be empty.");
                            return;
                          }
                          updateOrderDeliveryDetails(order.id, { receiverName: editName, phoneNumber: editPhone })
                            .then(() => {
                              setUserProfile(prev => ({ ...prev, name: editName, phone: editPhone }));
                              setIsEditingPhone(false);
                              toast.success("Contact details updated in database! ");
                            })
                            .catch(err => toast.error("Failed to update in database: " + err));
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase px-3 py-1.5 rounded-lg shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditName(userProfile.name);
                          setEditPhone(userProfile.phone);
                          setIsEditingPhone(false);
                        }}
                        className="bg-white border border-slate-300 text-slate-500 font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 border border-slate-100 flex-shrink-0">
                      <Chat sx={{ fontSize: 16 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-slate-800">{userProfile.name}</span>
                        <button 
                          onClick={() => {
                            setEditName(userProfile.name);
                            setEditPhone(userProfile.phone);
                            setIsEditingPhone(true);
                          }}
                          className="text-slate-400 hover:text-[#006A4E] transition p-1 hover:bg-slate-100 rounded-full flex items-center justify-center"
                          title="Edit Contact Info"
                        >
                          <Edit sx={{ fontSize: 16 }} />
                        </button>
                      </div>
                      <p className="text-slate-400 mt-0.5">{userProfile.phone}</p>
                    </div>
                  </div>
                )}

                {/* Address Info */}
                {isEditingAddress ? (
                  <div className="space-y-2 border border-slate-200/60 p-3 rounded-2xl bg-slate-50 animate-in fade-in duration-200 text-left">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Delivery Address</label>
                      <textarea
                        rows="3"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-650 font-medium text-slate-700 leading-normal"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        onClick={() => {
                          if (!editAddress.trim()) {
                            toast.error("Address cannot be empty.");
                            return;
                          }
                          updateOrderDeliveryDetails(order.id, { address: editAddress })
                            .then(() => {
                              setUserProfile(prev => ({ ...prev, address: editAddress }));
                              setIsEditingAddress(false);
                              toast.success("Delivery address updated in database!");
                            })
                            .catch(err => toast.error("Failed to update in database: " + err));
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase px-3 py-1.5 rounded-lg shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditAddress(userProfile.address);
                          setIsEditingAddress(false);
                        }}
                        className="bg-white border border-slate-300 text-slate-500 font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 border border-slate-100 flex-shrink-0">
                      <LocationOn sx={{ fontSize: 16 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-slate-800">Delivery at PG</span>
                        <button 
                          onClick={() => {
                            setEditAddress(userProfile.address);
                            setIsEditingAddress(true);
                          }}
                          className="text-slate-400 hover:text-[#006A4E] transition p-1 hover:bg-slate-100 rounded-full flex items-center justify-center"
                          title="Edit Address"
                        >
                          <Edit sx={{ fontSize: 16 }} />
                        </button>
                      </div>
                      <p className="text-slate-400 mt-1 leading-relaxed line-clamp-2">{userProfile.address}</p>
                    </div>
                  </div>
                )}
                
                {/* Add Instructions Redesign */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3 text-left">
                    <span className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Delivery Instructions</span>
                  </div>

                  {/* Horizontal Scrollable Instruction Cards */}
                  <div className="flex gap-2 overflow-x-auto pb-2 pt-1 select-none no-scrollbar snap-x snap-mandatory">
                    {/* Card 1: Directions to reach */}
                    <div
                      onClick={() => {
                        setTempDirectionsText(directionsText);
                        setShowDirectionsForm(true);
                      }}
                      className={`flex-shrink-0 w-[82px] h-[92px] rounded-2xl p-2 border flex flex-col justify-between cursor-pointer transition-all duration-200 snap-start text-left ${
                        directionsText.trim()
                          ? "bg-orange-50 border-orange-500/30 text-orange-950"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-650"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <LocationOn className={directionsText.trim() ? "text-orange-650" : "text-slate-500"} sx={{ fontSize: 18 }} />
                        {directionsText.trim() && (
                          <Close
                            className="text-orange-550 hover:bg-orange-100 rounded-full p-0.5 cursor-pointer"
                            sx={{ fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderDeliveryDetails(order.id, { deliveryInstructions: "" })
                                .then(() => {
                                  setDirectionsText("");
                                  toast.info("Directions cleared from database.");
                                })
                                .catch(err => toast.error("Failed to clear directions: " + err));
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] font-extrabold leading-snug">Directions to reach</span>
                    </div>

                    {/* Card 2: Leave at the door */}
                    <div
                      onClick={() => {
                        setLeaveAtDoor(!leaveAtDoor);
                        if (!leaveAtDoor) toast.success("Instruction added: Leave at the door 🚪");
                      }}
                      className={`flex-shrink-0 w-[82px] h-[92px] rounded-2xl p-2 border flex flex-col justify-between cursor-pointer transition-all duration-200 snap-start text-left ${
                        leaveAtDoor
                          ? "bg-orange-50 border-orange-500/30 text-orange-950"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-650"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <MeetingRoom className={leaveAtDoor ? "text-orange-650" : "text-slate-500"} sx={{ fontSize: 18 }} />
                        {leaveAtDoor && (
                          <Close
                            className="text-orange-550 hover:bg-orange-100 rounded-full p-0.5 cursor-pointer"
                            sx={{ fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLeaveAtDoor(false);
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] font-extrabold leading-snug">Leave at the door</span>
                    </div>

                    {/* Card 3: Avoid calling */}
                    <div
                      onClick={() => {
                        setAvoidCalling(!avoidCalling);
                        if (!avoidCalling) toast.success("Instruction added: Avoid calling 🔇");
                      }}
                      className={`flex-shrink-0 w-[82px] h-[92px] rounded-2xl p-2 border flex flex-col justify-between cursor-pointer transition-all duration-200 snap-start text-left ${
                        avoidCalling
                          ? "bg-orange-50 border-orange-500/30 text-orange-950"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-650"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <VolumeOff className={avoidCalling ? "text-orange-650" : "text-slate-500"} sx={{ fontSize: 18 }} />
                        {avoidCalling && (
                          <Close
                            className="text-orange-550 hover:bg-orange-100 rounded-full p-0.5 cursor-pointer"
                            sx={{ fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAvoidCalling(false);
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] font-extrabold leading-snug">Avoid calling</span>
                    </div>

                    {/* Card 4: Avoid ringing bell */}
                    <div
                      onClick={() => {
                        setAvoidRingingBell(!avoidRingingBell);
                        if (!avoidRingingBell) toast.success("Instruction added: Avoid ringing bell 🔕");
                      }}
                      className={`flex-shrink-0 w-[82px] h-[92px] rounded-2xl p-2 border flex flex-col justify-between cursor-pointer transition-all duration-200 snap-start text-left ${
                        avoidRingingBell
                          ? "bg-orange-50 border-orange-500/30 text-orange-950"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-650"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <NotificationsOff className={avoidRingingBell ? "text-orange-650" : "text-slate-500"} sx={{ fontSize: 18 }} />
                        {avoidRingingBell && (
                          <Close
                            className="text-orange-550 hover:bg-orange-100 rounded-full p-0.5 cursor-pointer"
                            sx={{ fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAvoidRingingBell(false);
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] font-extrabold leading-snug">Avoid ringing bell</span>
                    </div>

                    {/* Card 5: Leave with security */}
                    <div
                      onClick={() => {
                        setLeaveWithSecurity(!leaveWithSecurity);
                        if (!leaveWithSecurity) toast.success("Instruction added: Leave with security 🛡️");
                      }}
                      className={`flex-shrink-0 w-[82px] h-[92px] rounded-2xl p-2 border flex flex-col justify-between cursor-pointer transition-all duration-200 snap-start text-left ${
                        leaveWithSecurity
                          ? "bg-orange-50 border-orange-500/30 text-orange-950"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-650"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <Shield className={leaveWithSecurity ? "text-orange-650" : "text-slate-500"} sx={{ fontSize: 18 }} />
                        {leaveWithSecurity && (
                          <Close
                            className="text-orange-550 hover:bg-orange-100 rounded-full p-0.5 cursor-pointer"
                            sx={{ fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLeaveWithSecurity(false);
                            }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] font-extrabold leading-snug">Leave with security</span>
                    </div>
                  </div>

                  {/* Directions to Reach Input Panel */}
                  {showDirectionsForm && (
                    <div className="fixed inset-0 flex items-center justify-center z-[2100] animate-in fade-in duration-200 p-4">
                      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setShowDirectionsForm(false)} />
                      <div className="relative w-full max-w-md bg-white rounded-[32px] p-6 space-y-5 animate-in zoom-in-95 duration-200 shadow-2xl border border-slate-100">
                        <div className="flex justify-between items-center">
                          <h3 className="text-[18px] font-bold text-slate-900 text-left">Directions to reach</h3>
                          <button
                            onClick={() => setShowDirectionsForm(false)}
                            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
                          >
                            <Close sx={{ fontSize: 20 }} />
                          </button>
                        </div>
                        <p className="text-[12px] text-slate-500 font-medium text-left leading-normal">
                          PG - S.n.s Luxury Men's Hostel & Pg, 1372, 100 Feet...
                        </p>

                        {/* Tap to record voice directions */}
                        <div 
                          onClick={!isRecording ? startVoiceRecording : undefined}
                          className={`flex items-center justify-between border rounded-full px-5 py-3 select-none transition-all duration-200 ${
                            isRecording 
                              ? "bg-red-50 border-red-500/40 text-red-700 animate-pulse cursor-default" 
                              : "bg-white border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-800"
                          }`}
                        >
                          <span className="text-[13px] font-bold">
                            {isRecording ? "Listening... Speak now" : "Tap to record voice directions"}
                          </span>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRecording ? "bg-red-500 text-white animate-ping" : "bg-slate-100 text-slate-650"}`}>
                            <Mic sx={{ fontSize: 18 }} />
                          </div>
                        </div>

                        {/* Text Area Input */}
                        <div className="relative border border-slate-200 rounded-2xl p-3 bg-white focus-within:border-orange-500/70">
                          <textarea
                            rows="4"
                            maxLength="200"
                            placeholder="e.g. Ring the bell on the red gate"
                            value={tempDirectionsText}
                            onChange={(e) => setTempDirectionsText(e.target.value)}
                            className="w-full text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none resize-none leading-relaxed text-left"
                          />
                          <span className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-bold">
                            {tempDirectionsText.length}/200
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            updateOrderDeliveryDetails(order.id, { deliveryInstructions: tempDirectionsText })
                              .then(() => {
                                setDirectionsText(tempDirectionsText);
                                setShowDirectionsForm(false);
                                toast.success("Directions saved in database!");
                              })
                              .catch(err => toast.error("Failed to save directions: " + err));
                          }}
                          className="w-full bg-[#FF4F18] hover:bg-[#e03f0f] text-white font-extrabold text-sm py-4 rounded-full transition shadow-md active:scale-[0.98]"
                        >
                          Save Instructions
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* REORDER / PAY NOW ACTIONS */}
            <section className="space-y-3">
              {/* Quick Reorder */}
              <button
                onClick={handleReorder}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-1.5 transition active:scale-95 duration-150"
              >
                <Cached sx={{ fontSize: 16 }} />
                <span>Reorder Medicines</span>
              </button>

              {/* Pay Now Button (if pending payment) */}
              {["CREATED", "FAILED"].includes((order.status || "").toUpperCase()) && order.paymentMethod !== "cod" && (
                <div className="space-y-2 border border-slate-100 p-3 rounded-2xl bg-slate-50/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center mb-1">Repayment Method</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRepayMethod("razorpay")}
                      className={`py-2 rounded-xl border text-[10px] text-center transition ${
                        repayMethod === "razorpay"
                          ? "border-orangeBrand bg-orange-50/10 text-orangeBrand font-black"
                          : "border-slate-200 hover:bg-slate-50 text-slate-500 font-bold"
                      }`}
                    >
                      Razorpay
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepayMethod("upi")}
                      className={`py-2 rounded-xl border text-[10px] text-center transition ${
                        repayMethod === "upi"
                          ? "border-orangeBrand bg-orange-50/10 text-orangeBrand font-black"
                          : "border-slate-200 hover:bg-slate-50 text-slate-500 font-bold"
                      }`}
                    >
                      UPI / QR Code
                    </button>
                  </div>
                  <button
                    onClick={handlePayNow}
                    disabled={isPayingNow}
                    className="w-full bg-[#FF6F3C] hover:bg-[#e65a2b] text-white font-black text-xs py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-1.5 transition active:scale-95 duration-150 mt-1"
                  >
                    <Payment sx={{ fontSize: 16 }} />
                    <span>{isPayingNow ? "Processing..." : repayMethod === "upi" ? `Pay ${order.amount} with UPI` : `Pay ${order.amount} via Razorpay`}</span>
                  </button>
                </div>
              )}
            </section>

            {/* SUPPORT AND DESTRUCTIVE ACTIONS */}
            <section className="bg-white rounded-3xl p-4 border border-slate-200/50 shadow-sm divide-y divide-slate-100 text-xs">
              {!["DELIVERED", "CANCELLED", "FAILED"].includes((order.status || "").toUpperCase()) && (
                <button
                  onClick={handleCancelOrder}
                  className="w-full py-3 flex items-center justify-between text-left font-bold text-rose-600 hover:bg-rose-50/50 rounded-b-2xl px-2 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Lock className="text-rose-400" sx={{ fontSize: 16 }} />
                    <span>Cancel order</span>
                  </div>
                  <KeyboardArrowRight className="text-rose-450" sx={{ fontSize: 16 }} />
                </button>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* DETAILED RECEIPT / BILL SUMMARY MODAL */}
      {showDetailsModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-250">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetailsModal(false)}
          />
          
          <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col p-6 space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowDetailsModal(false)} 
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition"
                >
                  <ArrowBack sx={{ fontSize: 20 }} />
                </button>
                <div className="text-left">
                  <h3 className="text-sm font-black text-slate-800 leading-tight">Order #{order.id}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">
                    {order.items?.length || 0} {order.items?.length === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 text-left">
                <Receipt className="text-emerald-600" sx={{ fontSize: 16 }} />
                Bill Summary
              </h3>
              
              <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Item Total</span>
                  <div className="flex items-center gap-2">
                    {billSummary.discount > 0 && (
                      <span className="text-slate-400 line-through">₹{Math.round(billSummary.mrp)}</span>
                    )}
                    <span className="font-bold text-slate-700">₹{Math.round(billSummary.total)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Delivery Fee</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-300 line-through font-medium">₹30</span>
                    <span className="font-black text-emerald-600 uppercase tracking-wider text-[10px]">FREE</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Handling Fee</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-300 line-through font-medium">₹10</span>
                    <span className="font-black text-emerald-600 uppercase tracking-wider text-[10px]">FREE</span>
                  </div>
                </div>
                
                <div className="border-t border-slate-200/60 pt-3 flex justify-between font-black text-slate-900 bg-white p-2.5 rounded-xl shadow-sm">
                  <span>Total Bill</span>
                  <div className="flex items-center gap-2">
                    {billSummary.discount > 0 && (
                      <span className="text-slate-400 line-through text-sm font-normal">₹{Math.round(billSummary.mrp)}</span>
                    )}
                    <span>₹{Math.round(billSummary.total)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => {
                setShowDetailsModal(false);
                toast.success("Invoice download started!");
              }}
              className="w-full bg-[#006A4E] hover:bg-[#005740] text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-md transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* REFUND SELECTION MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-sm p-6 relative shadow-2xl text-slate-800 text-center animate-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button
              onClick={() => setShowCancelModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-50 text-slate-450 hover:text-slate-650 hover:bg-slate-100 transition"
            >
              <Close sx={{ fontSize: 16 }} />
            </button>

            {/* Illustration Graphic */}
            <div className="flex justify-center mb-6">
              <div className="relative w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-inner">
                {/* Main wallet/payment icon */}
                <Payment className="text-emerald-600 animate-pulse" sx={{ fontSize: 36 }} />
                {/* Floating check mark */}
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center shadow-lg border-4 border-white">
                  <CheckCircle className="text-white" sx={{ fontSize: 16 }} />
                </div>
              </div>
            </div>

            <h3 className="text-base font-bold text-slate-800 mb-5">Choose refund method</h3>

            <div className="space-y-3 mb-6 text-left">
              {/* Option 1: Pharmacy Wallet */}
              <label className={`block border p-3.5 rounded-2xl cursor-pointer transition ${
                refundMethod === "wallet" ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200 bg-slate-50/30 hover:bg-slate-50"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Pharmacy Wallet</span>
                      <span className="bg-emerald-100 text-emerald-700 font-extrabold text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded">Instant</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">Instant Credit to Wallet</span>
                  </div>
                  <input
                    type="radio"
                    name="refundMethod"
                    value="wallet"
                    checked={refundMethod === "wallet"}
                    onChange={() => setRefundMethod("wallet")}
                    className="accent-emerald-650 w-4 h-4 cursor-pointer"
                  />
                </div>
              </label>

              {/* Option 2: Back to Source */}
              <label className={`block border p-3.5 rounded-2xl cursor-pointer transition ${
                refundMethod === "source" ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200 bg-slate-50/30 hover:bg-slate-50"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Back to source</span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Our team refunds online payments to the original method</span>
                  </div>
                  <input
                    type="radio"
                    name="refundMethod"
                    value="source"
                    checked={refundMethod === "source"}
                    onChange={() => setRefundMethod("source")}
                    className="accent-emerald-650 w-4 h-4 cursor-pointer"
                  />
                </div>
              </label>
            </div>

            {/* Submit Button */}
            <button
              onClick={executeCancelOrder}
              disabled={isCancelling}
              className="w-full py-3.5 bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs rounded-2xl shadow-lg transition active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              {isCancelling ? "Processing..." : "Cancel with full refund"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderTracking;
