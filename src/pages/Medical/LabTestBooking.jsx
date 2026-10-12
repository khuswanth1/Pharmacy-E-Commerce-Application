import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, ScienceOutlined, CalendarMonth, KeyboardArrowRight, CreditCard, LocalAtm, AccountBalanceWallet, PhoneAndroid } from "@mui/icons-material";
import { toast } from "react-toastify";
import { bookLabTest, fetchAvailableSlots, getUserLabBookings, getAllLabBookings } from "../../api/productService";
import { createPaymentOrder, verifyPayment, payWithWallet } from "../../api/paymentService";
import { openRazorpayCheckout } from "../../utils/razorpay";
import { syncUserFromServer } from "../../utils/wallet";
import { getProfileAPI } from "../../api/authService";

export default function LabTestBooking() {
  const location = useLocation();
  const navigate = useNavigate();
  const test = location.state?.test || {
    name: "Complete Blood Count (CBC)",
    desc: "A vital screen to evaluate overall health and detect infections/anemia.",
    price: 299,
    originalPrice: 599,
    count: 30
  };

  const [selectedSlot, setSelectedSlot] = useState("");
  const [slots, setSlots] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("RAZORPAY");

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("pharmacy_user") || localStorage.getItem("user");
    return saved ? JSON.parse(saved) : { walletBalance: 0 };
  });

  const walletBalance = Number(user?.walletBalance || 0);

  useEffect(() => {
    const syncUser = () => {
      const saved = localStorage.getItem("pharmacy_user") || localStorage.getItem("user");
      if (saved) setUser(JSON.parse(saved));
    };
    window.addEventListener("storage", syncUser);
    return () => window.removeEventListener("storage", syncUser);
  }, []);

  useEffect(() => {
    fetchAvailableSlots()
      .then((data) => {
        if (data && data.length > 0) {
          setSlots(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load slots from API:", err);
      });

    getAllLabBookings()
      .then((data) => {
        setAllBookings(data || []);
      })
      .catch((err) => {
        console.error("Failed to fetch all lab bookings:", err);
      });

    const user = JSON.parse(localStorage.getItem("user") || localStorage.getItem("pharmacy_user") || "{}");
    if (user && user.id) {
      getUserLabBookings(user.id)
        .then((data) => {
          const matching = (data || []).filter(b => b.testName === test.name);
          setPastBookings(matching);
        })
        .catch((err) => {
          console.error("Failed to fetch past bookings:", err);
        });
    }
  }, [test.name]);

  const handleBookingConfirm = async () => {
    if (!selectedSlot) {
      toast.warn("Please select a home sample collection time slot!");
      return;
    }

    setIsProcessing(true);

    try {
      const user = JSON.parse(localStorage.getItem("user") || localStorage.getItem("pharmacy_user") || "{}");
      const todayStr = new Date().toISOString().split("T")[0];

      const payload = {
        testName: test.name,
        price: Number(test.price),
        selectedDate: todayStr,
        selectedSlot: selectedSlot,
        userId: user?.id || "GUEST",
        patientName: user?.name || "Guest Patient",
        patientPhone: user?.phone || "0000000000",
        status: "BOOKED"
      };

      // ── Cash on Delivery ──────────────────────────────────────────
      if (paymentMethod === "COD") {
        await bookLabTest({ ...payload, paymentMode: "COD" });
        setIsProcessing(false);
        toast.success(`Lab Test "${test.name}" booked for ${selectedSlot}. Our team will collect the sample at your door. 🔬`);
        navigate("/");
        return;
      }

      const uId = user?.id || user?.userId;
      const prefill = { name: user?.name, email: user?.email, phone: user?.phone };
      const amountInPaise = Math.round(Number(test.price) * 100);
      const labPaymentId = `LAB_${uId}_${Date.now()}`;

      // ── Pharmacy Wallet: top up any shortfall through Razorpay, then the server takes the payment
      if (paymentMethod === "WALLET") {
        const fresh = await syncUserFromServer(uId, setUser);
        const shortfall = Number(test.price) - Number((fresh || user).walletBalance || 0);
        if (shortfall > 0) {
          toast.info(`Wallet balance is low. Add ₹${shortfall.toFixed(2)} to book this test.`);
          const topUp = await createPaymentOrder({
            orderId: `WLT_${uId}_${Date.now()}`,
            amount: Math.ceil(shortfall * 100),
            paymentMethod: "RAZORPAY"
          });
          setIsProcessing(false);
          const paid = await openRazorpayCheckout(topUp, {
            name: "Pharmacy Wallet",
            description: `Add ₹${shortfall.toFixed(2)} to book ${test.name}`,
            prefill
          });
          setIsProcessing(true);
          await verifyPayment(paid); // the server credits the wallet
        }
        await payWithWallet({ orderId: labPaymentId, amount: amountInPaise });
        await syncUserFromServer(uId, setUser);
        await bookLabTest({ ...payload, paymentMode: "WALLET" });
        setIsProcessing(false);
        toast.success(`₹${test.price} paid from your wallet. Lab Test booked for ${selectedSlot}! 🔬`);
        navigate("/");
        return;
      }

      // ── UPI, cards, net banking through Razorpay
      const pOrder = await createPaymentOrder({
        orderId: labPaymentId,
        amount: amountInPaise,
        paymentMethod: paymentMethod === "UPI" ? "UPI" : "RAZORPAY"
      });
      setIsProcessing(false);
      const paid = await openRazorpayCheckout(pOrder, {
        name: "Pharmacy",
        description: `Lab Test: ${test.name} — ${selectedSlot}`,
        prefill,
        preferUpi: paymentMethod === "UPI"
      });
      setIsProcessing(true);
      await verifyPayment(paid);
      await bookLabTest({ ...payload, paymentMode: paymentMethod === "UPI" ? "UPI" : "RAZORPAY" });
      setIsProcessing(false);
      toast.success(`Payment successful! Lab Test "${test.name}" booked for ${selectedSlot}. 🔬`);
      navigate("/");

    } catch (err) {
      setIsProcessing(false);
      if (err?.dismissed) {
        toast.warn("Payment cancelled. Your slot has not been booked.");
        return;
      }
      toast.error(typeof err === "string" ? err : (err?.message || "Failed to initiate payment. Please try again."));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 max-w-7xl mx-auto select-none">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* LEFT COLUMN: Test details */}
        <div className="lg:col-span-1 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6 text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orangeBrand/10 flex items-center justify-center text-orangeBrand border border-orangeBrand/50">
              <ScienceOutlined sx={{ fontSize: 24 }} />
            </div>
            <div>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-extrabold uppercase px-2 py-0.5 rounded-full">Diagnostics</span>
              <h2 className="text-lg font-black text-slate-800 leading-tight mt-1">{test.name}</h2>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">{test.desc}</p>

          <div className="bg-slate-50/50 border border-slate-100/50 rounded-2xl p-4 space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Included Tests:</span>
              <span className="font-extrabold text-slate-700">{test.count} parameters</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Sample Collection:</span>
              <span className="font-extrabold text-emerald-600 uppercase tracking-wider text-[10px]">Free Home Pickup</span>
            </div>
            <div className="h-[1px] bg-slate-100 my-2" />
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-slate-700">Total Price:</span>
              <div className="text-right">
                <div className="flex items-baseline gap-1.5 justify-end">
                  <span className="text-xl font-black text-slate-900">₹{test.price}</span>
                  <span className="text-slate-400 line-through text-xs font-semibold">₹{test.originalPrice}</span>
                </div>
                <span className="text-[9px] text-green-600 font-extrabold uppercase tracking-wide">
                  Save {Math.round(((test.originalPrice - test.price) / test.originalPrice) * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Secure guidelines */}
          <div className="space-y-3 pt-2 text-xs">
            <div className="flex gap-2.5 items-start">
              <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" sx={{ fontSize: 14 }} />
              <span className="text-slate-650 leading-relaxed">Certified phlebotomists follow 100% sterile protocols.</span>
            </div>
            <div className="flex gap-2.5 items-start">
              <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" sx={{ fontSize: 14 }} />
              <span className="text-slate-650 leading-relaxed">Reports delivered securely to your email within 12-24 hours.</span>
            </div>
          </div>

          {/* Existing bookings info */}
          {pastBookings.length > 0 && (
            <div className="bg-orange-50 border border-orange-100/70 rounded-2xl p-4 text-xs text-orange-800 space-y-2 mt-4 select-none">
              <p className="font-bold flex items-center gap-1">
                <span>Existing Bookings ({pastBookings.length})</span>
              </p>
              <ul className="space-y-1.5 pl-0 text-[10px]">
                {pastBookings.map((b, i) => (
                  <li key={i} className="flex justify-between items-center border-b border-orange-100/40 pb-1 last:border-0 last:pb-0">
                    <span className="font-bold">{b.selectedDate} at {b.selectedSlot}</span>
                    <span className="bg-orange-150 text-orange-850 px-1.5 py-0.5 rounded font-black uppercase text-[8.5px] tracking-wider">
                      {b.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Slot picker */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col text-left space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
            <CalendarMonth className="text-orangeBrand" sx={{ fontSize: 20 }} />
            <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">Choose Home Collection Time Slot</h3>
          </div>

          {/* Slot Grid */}
          {slots.length === 0 ? (
            <div className="text-center py-10 flex flex-col items-center justify-center">
              <div className="w-6 h-6 border-2 border-orangeBrand border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-slate-400 font-extrabold text-[10px] uppercase tracking-wider">Loading available slots...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slots.map((time) => {
                const todayStr = new Date().toISOString().split("T")[0];
                const isSlotTaken = allBookings.some(
                  (b) => b.testName === test.name && b.selectedSlot === time && b.selectedDate === todayStr && b.status !== "CANCELLED"
                );
                const isSelected = selectedSlot === time;

                return (
                  <div
                    key={time}
                    onClick={() => {
                      if (!isSlotTaken) {
                        setSelectedSlot(time);
                      }
                    }}
                    className={`border rounded-2xl p-4 text-center transition duration-150 border-l-4 shadow-[0_1px_4px_rgba(0,0,0,0.01)] ${
                      isSlotTaken
                        ? "border-slate-200 border-l-rose-500 bg-rose-50/10 text-slate-350 cursor-not-allowed opacity-60"
                        : isSelected
                        ? "border-orangeBrand border-l-orangeBrand bg-orange-50/40 text-orangeBrand cursor-pointer active:scale-95"
                        : "border-slate-200 border-l-emerald-600 bg-white hover:bg-slate-50/50 text-slate-700 cursor-pointer active:scale-95"
                    }`}
                  >
                    <span className="text-xs font-black block">{time}</span>
                    <span className={`text-[9px] font-bold block mt-1.5 uppercase tracking-wider ${
                      isSlotTaken ? "text-rose-500" : isSelected ? "text-orangeBrand/80" : "text-slate-400"
                    }`}>
                      {isSlotTaken ? "Slot Taken" : "Home collection"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="border-t border-slate-50 pt-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Choose Payment Method</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

              {/* Razorpay */}
              <div
                onClick={() => setPaymentMethod("RAZORPAY")}
                className={`border rounded-2xl p-4 cursor-pointer transition duration-150 ${paymentMethod === "RAZORPAY" ? "border-orangeBrand bg-orange-50/30 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <CreditCard sx={{ fontSize: 18 }} className={paymentMethod === "RAZORPAY" ? "text-orangeBrand" : "text-slate-400"} />
                  {paymentMethod === "RAZORPAY" && <span className="text-[9px] font-black text-orangeBrand uppercase tracking-wider">Selected</span>}
                </div>
                <p className="text-xs font-black text-slate-800">Razorpay</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Cards, Netbanking, Wallet</p>
              </div>

              {/* Cash on Delivery */}
              <div
                onClick={() => setPaymentMethod("COD")}
                className={`border rounded-2xl p-4 cursor-pointer transition duration-150 ${paymentMethod === "COD" ? "border-orangeBrand bg-orange-50/30 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <LocalAtm sx={{ fontSize: 18 }} className={paymentMethod === "COD" ? "text-orangeBrand" : "text-slate-400"} />
                  {paymentMethod === "COD" && <span className="text-[9px] font-black text-orangeBrand uppercase tracking-wider">Selected</span>}
                </div>
                <p className="text-xs font-black text-slate-800">Cash on Delivery</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Pay cash at your doorstep</p>
              </div>

              {/* Pharmacy Wallet */}
              <div
                onClick={async () => {
                  setPaymentMethod("WALLET");
                  const uId = user.id || user.userId;
                  if (uId) {
                    try {
                      const freshProfile = await getProfileAPI(uId);
                      if (freshProfile?.data) {
                        const updatedUser = { ...user, walletBalance: freshProfile.data.walletBalance ?? user.walletBalance };
                        setUser(updatedUser);
                        localStorage.setItem("user", JSON.stringify(updatedUser));
                        localStorage.setItem("pharmacy_user", JSON.stringify(updatedUser));
                      }
                    } catch (e) {
                      console.warn("Could not fetch fresh wallet balance:", e);
                    }
                  }
                }}
                className={`border rounded-2xl p-4 cursor-pointer transition duration-150 ${paymentMethod === "WALLET" ? "border-orangeBrand bg-orange-50/30 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <AccountBalanceWallet sx={{ fontSize: 18 }} className={paymentMethod === "WALLET" ? "text-orangeBrand" : "text-slate-400"} />
                  {paymentMethod === "WALLET" && <span className="text-[9px] font-black text-orangeBrand uppercase tracking-wider">Selected</span>}
                </div>
                <p className="text-xs font-black text-slate-800">Pharmacy Wallet</p>
                <p className={`text-[10px] font-semibold mt-0.5 ${walletBalance >= test.price ? "text-emerald-600" : "text-orange-500"}`}>
                  Balance: ₹{walletBalance} {walletBalance < test.price && `(Short by ₹${Number(test.price) - walletBalance})`}
                </p>
              </div>

            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-50 flex items-center justify-between gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs rounded-2xl transition active:scale-95 duration-150 flex items-center justify-center gap-1.5 tracking-wider"
            >
              <KeyboardArrowRight sx={{ fontSize: 16, transform: "rotate(180deg)" }} />
              <span>Back</span>
            </button>
            <button
              onClick={handleBookingConfirm}
              disabled={isProcessing}
              className="w-full sm:w-auto px-10 py-3.5 bg-orangeBrand hover:bg-orangeBrand-light disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-2xl shadow-md hover:shadow-lg transition active:scale-95 duration-150 flex items-center justify-center gap-1.5 tracking-wider"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Pay ₹{test.price} & Book</span>
                  <KeyboardArrowRight sx={{ fontSize: 16 }} />
                </>
              )}
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
