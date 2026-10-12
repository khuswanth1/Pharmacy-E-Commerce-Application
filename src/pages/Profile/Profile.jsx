// src/pages/Profile/Profile.jsx
import React, { useState, useContext, useEffect, useCallback } from "react";
import { Person, LocationOn, LocalMall, Lock, ChevronRight, CheckCircle, Cancel, Redeem, CreditCard, ArrowBack, Headphones, Edit, Delete, Add, Send, Paid, WhatsApp, Share, Bolt, LocalOffer, Receipt, ContentCopy, ArrowDownward, Medication, LocalPharmacy, LocalHospital, ShoppingBag, Close, ScienceOutlined } from "@mui/icons-material";
import { AuthContext } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { toast } from "react-toastify";
import { useNavigate, useLocation } from "react-router-dom";
import { loadAddresses, removeAddress, syncAddressesWithBackend, updateAddressLocal } from "../../utils/addressStorage";
import AddAddressModal from "../../components/Header/AddAddressModal";
import SupportChat from "../../components/Support/SupportChat";
import { updateProfileAPI, getProfileAPI } from "../../api/authService";
import { getUserOrders } from "../../api/orderService";
import { createPaymentOrder, verifyPayment, getMyPayments } from "../../api/paymentService";
import { openRazorpayCheckout } from "../../utils/razorpay";
import { getUserLabBookings, fetchAllProducts } from "../../api/productService";

/** Real time from order placed to delivered, e.g. "38 mins" or "2 hrs 5 mins"; null when unknown. */
const deliveryDuration = (createdAt, deliveredAt) => {
  const mins = Math.round((new Date(deliveredAt) - new Date(createdAt)) / 60000);
  if (!deliveredAt || !Number.isFinite(mins) || mins < 0) return null;
  if (mins < 60) return `${Math.max(1, mins)} ${mins === 1 ? "min" : "mins"}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours} ${hours === 1 ? "hr" : "hrs"}${rest ? ` ${rest} mins` : ""}`;
};

const Profile = () => {
  const { loginUser, logoutUser } = useContext(AuthContext);
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTabFromPath = (path) => {
    const segments = path.split("/").filter(Boolean);
    if (segments.length > 1) {
      const sub = segments[1].toLowerCase();
      if (sub === "orders") return "orders";
      if (sub === "addresses") return "addresses";
      if (sub === "details" || sub === "profile") return "profile";
      if (sub === "security") return "security";
      if (sub === "wallet") return "wallet";
      if (sub === "lab-bookings" || sub === "bookings") return "lab-bookings";
    }
    return "orders";
  };

  const activeTab = getActiveTabFromPath(location.pathname);

  const setActiveTab = (tab) => {
    if (tab === "profile") {
      navigate("/profile/details");
    } else {
      navigate(`/profile/${tab}`);
    }
  };

  useEffect(() => {
    if (location.pathname === "/profile" || location.pathname === "/profile/") {
      navigate("/profile/orders", { replace: true });
    }
  }, [location.pathname, navigate]);

  const [selectedOrder, setSelectedOrder] = useState(null);

  // Normalise profile to replace null fields with empty strings (avoids React null-value warnings)
  const normaliseProfile = (data) => ({
    ...data,
    name:       data.name        ?? "",
    phone:      data.phone       ?? "",
    email:      data.email       ?? "",
    address:    data.address     ?? "",
    picture:    data.picture     ?? "",
    geolocation:data.geolocation ?? "",
    walletBalance: data.walletBalance ?? 0,
  });

  // Load profile from active login/onboarding session
  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem("pharmacy_user") || localStorage.getItem("user");
    if (saved) {
      try { return normaliseProfile(JSON.parse(saved)); } catch (e) {}
    }
    return {
      name: "",
      phone: "",
      email: "",
      address: "",
      picture: "",
      geolocation: "",
      walletBalance: 0,
    };
  });

  // Dynamic Saved Addresses Sync
  const [savedAddrs, setSavedAddrs] = useState([]);
  const [editingAddr, setEditingAddr] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [walletView, setWalletView] = useState("dashboard"); // "dashboard" or "activity"
  const [activityFilter, setActivityFilter] = useState("all"); // "all", "debits", "credits"
  const [visibleTxCount, setVisibleTxCount] = useState(5);

  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const loadTransactions = async () => {
    const userId = profile.id || profile.userId || JSON.parse(localStorage.getItem("pharmacy_user") || localStorage.getItem("user") || "{}")?.id;
    if (!userId) return;
    setLoadingTransactions(true);
    try {
      // Wallet activity: top-ups and refunds add money, wallet payments take it out.
      const payments = await getMyPayments();
      // Only money that actually moved: unfinished or failed attempts are left out.
      const walletPayments = payments.filter((p) => {
        const id = p.orderId || "";
        const status = String(p.paymentStatus || "").toUpperCase();
        if (status === "REFUNDED") return true;
        if (status !== "SUCCESS") return false;
        return p.purpose === "WALLET_TOPUP" || id.startsWith("WLT_") || p.paymentMethod === "WALLET";
      });
      const mapped = walletPayments.map((p, idx) => {
        const amountVal = p.amount ? Number(p.amount) / 100 : 0;
        const status = String(p.paymentStatus || "").toUpperCase();
        const id = p.orderId || "";
        const shortId = id.split("_").pop().slice(-8).toUpperCase();
        const isTopUp = p.purpose === "WALLET_TOPUP" || (id.startsWith("WLT_") && !id.startsWith("WLT_PAY_"));
        const isRefund = status === "REFUNDED";
        const isDebit = !isTopUp && !isRefund;
        const title = isRefund
          ? `Refund for order #${shortId}`
          : isTopUp ? "Wallet top-up" : id.startsWith("LAB_") ? "Paid for lab test" : `Paid for order #${shortId}`;
        return {
          id: p.id || idx,
          type: isDebit ? "debit" : "credit",
          title,
          time: p.createdAt ? new Date(p.createdAt).toLocaleString("en-IN") : "Recent",
          amount: isDebit ? `-₹${amountVal}` : `+₹${amountVal}`,
          amountRaw: amountVal,
          status: p.paymentStatus
        };
      });
      setTransactions(mapped);
    } catch (e) {
      console.error("Error loading transactions:", e);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    if (activeTab === "wallet") {
      loadTransactions();
    }
  }, [activeTab, profile.id]);

  const getMockDistance = (id) => {
    const mod = (Number(id) || 0) % 3;
    if (mod === 0) return "39 m";
    if (mod === 1) return "1.2 km";
    return "12.6 km";
  };

  const filteredTxs = transactions.filter((t) => {
    if (activityFilter === "debits") return t.type === "debit";
    if (activityFilter === "credits") return t.type === "credit";
    return true;
  });

  const hasMore = visibleTxCount < filteredTxs.length;

  const refreshAddresses = () => {
    setSavedAddrs(loadAddresses());
  };

  // Sync addresses from backend whenever activeTab changes or profile changes
  useEffect(() => {
    const userId = profile.id || profile.userId || JSON.parse(localStorage.getItem("pharmacy_user") || localStorage.getItem("user") || "{}")?.id;
    if (userId) {
      syncAddressesWithBackend(userId).then(() => {
        refreshAddresses();
      });
    } else {
      refreshAddresses();
    }
  }, [activeTab, profile.id]);

  // Sync profile details from backend on initial mount
  useEffect(() => {
    const saved = localStorage.getItem("pharmacy_user") || localStorage.getItem("user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const userId = parsed.id || parsed.userId;
        if (userId) {
          getProfileAPI(userId)
            .then((response) => {
              if (response && response.success && response.data) {
                const normalised = normaliseProfile(response.data);
                setProfile(normalised);
                localStorage.setItem("pharmacy_user", JSON.stringify(normalised));
                localStorage.setItem("user", JSON.stringify(normalised));
                loginUser(normalised);
              }
            })
            .catch((err) => {
              console.error("Error loading user profile details from backend:", err);
            });
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refreshAddresses);
    return () => window.removeEventListener("storage", refreshAddresses);
  }, []);

  // Sync profile address state with primary/first saved address
  useEffect(() => {
    if (savedAddrs && savedAddrs.length > 0) {
      const primaryAddr = savedAddrs.find(a => a.primary) || savedAddrs[0];
      const fullText = primaryAddr.fullText || `${primaryAddr.flat || ""} ${primaryAddr.building || ""} ${primaryAddr.landmark || ""}`.trim();
      setProfile(prev => ({ ...prev, address: fullText }));
    } else {
      setProfile(prev => ({ ...prev, address: "" }));
    }
  }, [savedAddrs]);

  const handleDeleteAddress = async (id) => {
    if (window.confirm("Are you sure you want to delete this address?")) {
      await removeAddress(id);
      refreshAddresses();
      toast.success("Address deleted successfully.");
    }
  };

  // Product icon mapping using MUI icons
  const PRODUCT_ICONS = {
    "pill":     <Medication sx={{ fontSize: 18 }} className="text-blue-500" />,
    "liquid":   <LocalPharmacy sx={{ fontSize: 18 }} className="text-teal-500" />,
    "bandage":  <LocalHospital sx={{ fontSize: 18 }} className="text-rose-500" />,
    "cream":    <LocalHospital sx={{ fontSize: 18 }} className="text-purple-400" />,
    "ice":      <ShoppingBag sx={{ fontSize: 18 }} className="text-amber-500" />,
  };

  // High-Fidelity Orders Data mimicking the Zepto screenshot
  const [orders, setOrders] = useState([]);
  // "Get Help" chat, opened from an order's detail view.
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [productMap, setProductMap] = useState({}); // name (lowercase) → first image URL

  useEffect(() => {
    if (activeTab !== "orders" || !profile) return undefined;
    const uId = profile.id || profile.userId;
    if (!uId) return undefined;

    setLoadingOrders(true);
    getUserOrders(uId)
      .then((data) => {
        setOrders(data || []);
        setLoadingOrders(false);
      })
      .catch((err) => {
        console.error("Error fetching orders:", err);
        setLoadingOrders(false);
      });

    // Keep statuses current (accepted, out for delivery, delivered) without a page reload.
    // getUserOrders answers [] when a request fails, and orders never disappear, so an
    // empty answer here is ignored rather than wiping the list.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getUserOrders(uId).then((data) => { if (data?.length) setOrders(data); }).catch(() => {});
    };
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [activeTab, profile]);

  // Load product catalog once to build name → image lookup
  useEffect(() => {
    fetchAllProducts().then((allProducts) => {
      const map = {};
      (allProducts || []).forEach((p) => {
        if (p.name) {
          const key = p.name.trim().toLowerCase();
          const img = (p.images && p.images[0]) || p.image || null;
          if (img) map[key] = img;
        }
      });
      setProductMap(map);
    }).catch(() => {});
  }, []);

  const [labBookings, setLabBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [showAllBookings, setShowAllBookings] = useState(false);

  useEffect(() => {
    if (activeTab === "lab-bookings" && profile) {
      const uId = profile.id || profile.userId;
      if (uId) {
        setLoadingBookings(true);
        getUserLabBookings(uId)
          .then((data) => {
            setLabBookings(data || []);
            setLoadingBookings(false);
          })
          .catch((err) => {
            console.error("Error fetching lab bookings:", err);
            setLoadingBookings(false);
          });
      }
    }
  }, [activeTab, profile]);

  const formatOrderDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
      return d.toLocaleDateString('en-IN', options).replace(/,/g, '');
    } catch (e) {
      return dateStr;
    }
  };

  const getProductIconKey = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("ice cream") || n.includes("icecream")) return "ice";
    if (n.includes("liquid") || n.includes("dettol") || n.includes("eno") || n.includes("syrup")) return "liquid";
    if (n.includes("bandage") || n.includes("first aid") || n.includes("plaster") || n.includes("kit")) return "bandage";
    if (n.includes("cream") || n.includes("moisturizer") || n.includes("gel") || n.includes("lotion")) return "cream";
    return "pill";
  };

  const getMockUnit = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("ice cream")) return "1 pack (950 ml)";
    if (n.includes("tablet") || n.includes("dolo") || n.includes("metformin")) return "1 strip of 15 tablets";
    if (n.includes("liquid") || n.includes("dettol") || n.includes("syrup")) return "1 bottle (500 ml)";
    if (n.includes("bandage") || n.includes("plaster")) return "1 pack of 20 strips";
    if (n.includes("gel") || n.includes("cream")) return "1 tube (30g)";
    return "1 unit";
  };

  const getMockManufacturer = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("ice cream")) return "Heritage Alpenvie";
    if (n.includes("dolo") || n.includes("paracetamol")) return "Micro Labs";
    if (n.includes("metformin")) return "USV Pvt Ltd";
    if (n.includes("dettol")) return "Reckitt";
    if (n.includes("hansaplast")) return "Beiersdorf";
    if (n.includes("volini")) return "Sun Pharma";
    if (n.includes("himalaya")) return "Himalaya";
    return "Pharmacy App";
  };

  const getRealProductImage = (name) => {
    // 1. Look up the actual product image from the catalog API
    if (name && productMap) {
      const key = name.trim().toLowerCase();
      if (productMap[key]) return productMap[key];
      // Partial match: if any catalog key starts with the first word of the product name
      const firstWord = key.split(" ")[0];
      const partialMatch = Object.keys(productMap).find(k => k.includes(firstWord));
      if (partialMatch) return productMap[partialMatch];
    }
    // 2. Generic fallback by product type
    const key = getProductIconKey(name);
    const images = {
      "ice": "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400&q=80",
      "liquid": "https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&q=80",
      "bandage": "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=400&q=80",
      "cream": "https://images.unsplash.com/photo-1608248597481-496100c80836?w=400&q=80",
      "pill": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80"
    };
    return images[key] || images["pill"];
  };

  const getOrderDetails = (o) => {
    const s = o.status?.toUpperCase() || "";
    let normalizedStatus = "Created";
    if (s === "DELIVERED") normalizedStatus = "Delivered";
    else if (s === "CANCELLED") normalizedStatus = "Cancelled";
    else if (s === "CONFIRMED") normalizedStatus = "Confirmed";
    else if (s === "PACKED") normalizedStatus = "Packed";
    else if (s === "SHIPPED") normalizedStatus = "Shipped";
    
    const isDelivered = normalizedStatus === "Delivered";

    return {
      id: o.id,
      date: formatOrderDate(o.createdAt),
      arrivalTime: formatOrderDate(new Date(new Date(o.createdAt).getTime() + 15 * 60 * 1000)), // 15 mins later
      amount: "₹" + (o.totalAmount || 0),
      status: normalizedStatus,
      deliveryTime: isDelivered ? deliveryDuration(o.createdAt, o.deliveredAt) : null,
      items: (o.items || []).map((item, idx) => ({
        id: item.productId || item.id || idx,
        productId: item.productId || item.id,
        name: item.productName,
        final_price: Number(item.price) || 0,
        cost: Number(item.price) || 0,
        quantity: item.quantity,
        unit: getMockUnit(item.productName),
        manufacturer: getMockManufacturer(item.productName),
        image: getProductIconKey(item.productName),
        realImage: getRealProductImage(item.productName)
      }))
    };
  };

  const handleReorderMedicines = (selectedDetails) => {
    if (!selectedDetails?.items || selectedDetails.items.length === 0) return;
    
    selectedDetails.items.forEach((item) => {
      addToCart({
        id: item.productId || item.id,
        name: item.name,
        final_price: item.final_price,
        cost: item.cost,
        quantity: item.quantity,
        manufacturer: item.manufacturer,
        images: [item.realImage || "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80"]
      }, item.quantity);
    });

    toast.success("All items added back to your cart! 🛒");
    navigate("/cart");
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Order ID copied to clipboard!");
  };

  const updateProfileOnBackend = async (updatedFields) => {
    const savedUser = localStorage.getItem("pharmacy_user") || localStorage.getItem("user");
    const parsed = savedUser ? JSON.parse(savedUser) : {};
    const userId = parsed.id || parsed.userId || profile.id;

    if (!userId) {
      const merged = { ...profile, ...updatedFields };
      localStorage.setItem("pharmacy_user", JSON.stringify(merged));
      localStorage.setItem("user",          JSON.stringify(merged));
      loginUser(merged);
      setProfile(merged);
      return false;
    }

    try {
      const payload = {
        name:        updatedFields.name        !== undefined ? updatedFields.name        : (profile.name        || undefined),
        phone:       updatedFields.phone       !== undefined ? updatedFields.phone       : (profile.phone       || undefined),
        email:       updatedFields.email       !== undefined ? updatedFields.email       : (profile.email       || undefined),
        address:     updatedFields.address     !== undefined ? updatedFields.address     : (profile.address     || undefined),
        geolocation: updatedFields.geolocation !== undefined ? updatedFields.geolocation : (profile.geolocation || undefined),
        picture:     updatedFields.picture     !== undefined ? updatedFields.picture     : (profile.picture     !== undefined ? profile.picture : undefined),
      };

      const updateResponse = await updateProfileAPI(userId, payload);
      if (updateResponse && updateResponse.success) {
        const normalised = normaliseProfile(updateResponse.data);
        localStorage.setItem("pharmacy_user", JSON.stringify(normalised));
        localStorage.setItem("user",          JSON.stringify(normalised));
        loginUser(normalised);
        setProfile(normalised);
        return true;
      }
    } catch (err) {
      console.error("Error saving profile details:", err);
    }
    return false;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size should not exceed 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result;
      setProfile((prev) => ({ ...prev, picture: base64Image }));

      const success = await updateProfileOnBackend({ picture: base64Image });
      if (success) {
        toast.success("Profile image uploaded and saved successfully! 📸");
      } else {
        toast.error("Failed to save profile image to database.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async () => {
    setProfile((prev) => ({ ...prev, picture: "" }));

    const success = await updateProfileOnBackend({ picture: "" });
    if (success) {
      toast.success("Profile image removed successfully! 🗑️");
    } else {
      toast.error("Failed to remove profile image from database.");
    }
  };

  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isEditingAddressText, setIsEditingAddressText] = useState(false);
  const [tempAddressText, setTempAddressText] = useState("");

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setProfile((prev) => ({ ...prev, geolocation: coords }));
        setIsFetchingLocation(false);
        toast.success("Location coordinates loaded successfully! 📍");
      },
      (error) => {
        console.error("Error getting user location:", error);
        toast.error("Unable to retrieve location. Please check browser permissions.");
        setIsFetchingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleProfileChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    try {
      const success = await updateProfileOnBackend({
        name: profile.name,
        phone: profile.phone,
        email: profile.email,
        address: profile.address,
        geolocation: profile.geolocation,
        picture: profile.picture
      });
      if (success) {
        toast.success("Profile saved to backend successfully! 💾");
      } else {
        toast.error("Failed to update profile. Please try again.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("pharmacy_user");
    localStorage.removeItem("pharmacy_prescription_uploaded");
    logoutUser();
    toast.success("Logged out successfully.");
    navigate("/login");
  };

  const [isToppingUp, setIsToppingUp] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("500");
  const [topUpMethod, setTopUpMethod] = useState("razorpay");
  const handleWalletTopUp = () => {
    setTopUpAmount("500");
    setTopUpMethod("razorpay");
    setShowTopUpModal(true);
  };

  const executeWalletTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount greater than 0.");
      return;
    }
    if (amount > 50000) {
      toast.error("You can add up to ₹50,000 at a time.");
      return;
    }
    setIsToppingUp(true);
    setShowTopUpModal(false);
    try {
      // Pay through Razorpay; the server credits the wallet after verifying the payment.
      const pOrder = await createPaymentOrder({
        orderId: `WLT_${profile.id || profile.userId}_${Date.now()}`,
        amount: Math.round(amount * 100),
        paymentMethod: topUpMethod === "upi" ? "UPI" : "RAZORPAY"
      });
      setIsToppingUp(false);
      const paid = await openRazorpayCheckout(pOrder, {
        name: "Pharmacy Wallet",
        description: `Add ₹${amount} to your wallet`,
        prefill: profile,
        preferUpi: topUpMethod === "upi"
      });
      setIsToppingUp(true);
      await verifyPayment(paid);
      const fresh = await getProfileAPI(profile.id || profile.userId);
      if (fresh?.success) {
        setProfile(fresh.data);
        localStorage.setItem("user", JSON.stringify(fresh.data));
        localStorage.setItem("pharmacy_user", JSON.stringify(fresh.data));
        window.dispatchEvent(new Event("storage"));
      }
      toast.success(`Added ₹${amount} to your wallet! 🎉`);
      loadTransactions();
    } catch (err) {
      if (err?.dismissed) {
        toast.warn("Top-up cancelled.");
      } else {
        console.error(err);
        toast.error(typeof err === "string" ? err : (err?.message || "Couldn't add money to the wallet."));
      }
    } finally {
      setIsToppingUp(false);
    }
  };

  // Helper mapping for tab titles
  const getTabTitle = () => {
    if (activeTab === "wallet" && walletView === "activity") {
      return "Activity";
    }
    switch (activeTab) {
      case "orders": return "Orders";
      case "addresses": return "Saved Addresses";
      case "profile": return "Profile Details";
      case "security": return "Security & Session";
      case "wallet": return "Pharmacy Cash & Wallet";
      case "lab-bookings": return "Lab Bookings";
      default: return "Dashboard";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-0 md:p-6 flex justify-center items-start animate-in fade-in duration-200">
      <div className="w-full max-w-6xl bg-white shadow-md md:rounded-[24px] overflow-hidden border border-slate-100 flex flex-col md:flex-row min-h-[85vh]">
        
        {/* ================= LEFT SIDEBAR ================= */}
        <div className="w-full md:w-80 border-r border-slate-100 bg-white p-5 flex flex-col justify-between flex-shrink-0 select-none">
          <div>
            {/* User Profile Info Card */}
            <div className="flex items-center gap-3.5 mb-6 px-1">
              {profile.picture ? (
                <img
                  src={profile.picture}
                  alt={profile.name}
                  className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0 font-extrabold text-base shadow-sm">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : "U"}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-[15px] font-black text-slate-800 leading-snug truncate">
                  {profile.name}
                </h3>
                <p className="text-[11px] text-slate-400 font-extrabold mt-0.5 tracking-wide">
                  {profile.phone}
                </p>
              </div>
            </div>

            {/* Wallet Widget Block (Pharmacy Cash & Gift Card) */}
            <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/30 border border-emerald-100 rounded-2xl p-4 mb-6 shadow-sm">
              <button 
                onClick={() => setActiveTab("wallet")}
                className="w-full flex items-center justify-between text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="text-emerald-600" sx={{ fontSize: 16 }} />
                  <span className="text-[12px] font-black text-emerald-950">Pharmacy Cash & Gift Card</span>
                </div>
                <ChevronRight className="text-emerald-400" sx={{ fontSize: 14 }} />
              </button>
              <div className="h-[1px] bg-emerald-100/70 my-3" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">Available Balance</span>
                  <span className="text-[14px] font-black text-emerald-950 mt-0.5 block">₹{profile.walletBalance || 0}</span>
                </div>
                <button
                  onClick={handleWalletTopUp}
                  disabled={isToppingUp}
                  className="px-3.5 py-1.5 bg-black hover:bg-slate-900 disabled:bg-slate-300 text-white font-extrabold text-[10px] rounded-full uppercase tracking-wider shadow-sm transition active:scale-95 duration-200"
                >
                  {isToppingUp ? "Processing..." : "Add Balance"}
                </button>
              </div>
            </div>

            {/* Sidebar Navigation Row Items */}
            <div className="space-y-1.5">
              <SidebarItem icon={<LocalMall sx={{ fontSize: 16 }} />} title="Orders" active={activeTab === "orders"} onClick={() => setActiveTab("orders")} />
              <SidebarItem icon={<ScienceOutlined sx={{ fontSize: 16 }} />} title="Lab Bookings" active={activeTab === "lab-bookings"} onClick={() => setActiveTab("lab-bookings")} />
              <SidebarItem icon={<LocationOn sx={{ fontSize: 16 }} />} title="Saved Addresses" active={activeTab === "addresses"} onClick={() => setActiveTab("addresses")} />
              <SidebarItem icon={<Person sx={{ fontSize: 16 }} />} title="Profile" active={activeTab === "profile"} onClick={() => setActiveTab("profile")} />
              <SidebarItem icon={<Lock sx={{ fontSize: 16 }} />} title="Security" active={activeTab === "security"} onClick={() => setActiveTab("security")} />
            </div>
          </div>

          {/* Logout & Branding Footer */}
          <div className="mt-8 flex flex-col gap-4">
            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-white border border-orangeBrand/20 hover:bg-orangeBrand/10 text-orangeBrand font-black text-[12px] rounded-xl tracking-wide uppercase transition active:scale-95 duration-200 flex items-center justify-center gap-1.5 shadow-sm"
            >
              Log Out
            </button>
            <div className="text-center font-black tracking-widest text-[15px] select-none uppercase text-slate-300">
              pharmacy
            </div>
          </div>
        </div>

        {/* ================= RIGHT TAB VIEWS ================= */}
        <div className="flex-1 bg-white p-5 md:p-7 flex flex-col">
          
          {/* Header Tab Title */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-5">
            <button
              onClick={() => {
                if (activeTab === "orders" && selectedOrder) {
                  setSelectedOrder(null);
                } else if (activeTab === "wallet" && walletView === "activity") {
                  setWalletView("dashboard");
                } else {
                  setActiveTab("orders");
                  setSelectedOrder(null);
                }
              }}
              className="p-1 rounded-full hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition active:scale-95"
            >
              <ArrowBack sx={{ fontSize: 18 }} />
            </button>
            {activeTab === "orders" && selectedOrder ? (
              <div className="flex-1 flex justify-between items-center ml-1">
                <div className="text-left">
                  <h2 className="text-[14px] font-black text-slate-850 tracking-wide leading-tight">
                    Order #{selectedOrder.id}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">
                    {selectedOrder.items.length} {selectedOrder.items.length === 1 ? "item" : "items"}
                  </p>
                </div>
                <button 
                  onClick={() => setHelpOpen(true)}
                  className="flex items-center gap-1.5 text-[11px] font-black text-[#d6335c] border border-rose-100 bg-rose-50/30 px-3.5 py-1.5 rounded-full hover:bg-rose-50 transition active:scale-95 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-400/30 dark:hover:bg-rose-500/20"
                >
                  <Headphones sx={{ fontSize: 13 }} />
                  <span>Get Help</span>
                </button>
              </div>
            ) : (
              <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
                {getTabTitle()}
              </h2>
            )}
          </div>

          {/* Content Scroll Shell */}
          <div className="flex-1 overflow-y-auto max-h-[72vh] pr-1.5 no-scrollbar">

            {/* ORDERS TAB */}
            {activeTab === "orders" && !selectedOrder && (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                {loadingOrders ? (
                  <div className="text-center py-10">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-slate-400 font-extrabold text-xs uppercase tracking-wider">Loading your orders...</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 rounded-3xl bg-slate-50/30">
                    <LocalMall className="text-slate-300 mb-3" sx={{ fontSize: 40 }} />
                    <h3 className="text-slate-700 font-black text-sm uppercase tracking-wide">No Orders Found</h3>
                    <p className="text-slate-400 font-extrabold text-[11px] uppercase tracking-wider mt-1">Place your first order to see it here</p>
                  </div>
                ) : (
                  <>


                    {/* Order cards — limited to 10 unless View All */}
                    {(showAllOrders ? orders : orders.slice(0, 10)).map((o) => (
                      <div 
                        key={o.id}
                        onClick={() => {
                          const details = getOrderDetails(o);
                          setSelectedOrder(details);
                        }}
                        className="border border-slate-100 p-4 rounded-2xl bg-white hover:border-orangeBrand/20 hover:shadow-md transition duration-200 cursor-pointer flex flex-col gap-3 relative"
                      >
                        {/* Status & Price Row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {o.status?.toUpperCase() === "DELIVERED" ? (
                              <>
                                <CheckCircle className="text-emerald-500 flex-shrink-0" sx={{ fontSize: 15 }} />
                                <span className="text-[12px] font-black text-slate-800">Order delivered</span>
                              </>
                            ) : o.status?.toUpperCase() === "CANCELLED" ? (
                              <>
                                <Cancel className="text-rose-500 flex-shrink-0" sx={{ fontSize: 15 }} />
                                <span className="text-[12px] font-black text-slate-500">Order cancelled</span>
                              </>
                            ) : (
                              <>
                                <Medication className="text-orangeBrand flex-shrink-0 animate-pulse" sx={{ fontSize: 15 }} />
                                <span className="text-[12px] font-black text-slate-800">Order {o.status?.toLowerCase() || "placed"}</span>
                              </>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <span className="text-[13px] font-black text-slate-800">{"₹" + (o.totalAmount || 0)}</span>
                            <ChevronRight className="text-slate-400" sx={{ fontSize: 13 }} />
                          </div>
                        </div>

                        {/* Order Placement Subtext */}
                        <p className="text-[10px] text-slate-400 font-extrabold tracking-wide uppercase leading-none">
                          Placed at {formatOrderDate(o.createdAt)}
                        </p>

                        {/* Product list with images beside their names */}
                        <div className="flex flex-col gap-2.5 mt-2">
                          {(o.items || []).map((item, index) => {
                            const iconKey = getProductIconKey(item.productName);
                            const realImg = getRealProductImage(item.productName);
                            return (
                              <div key={index} className="flex items-center gap-3">
                                <div className="w-10 h-10 border border-slate-100 rounded-xl bg-slate-50 flex items-center justify-center shadow-sm select-none overflow-hidden flex-shrink-0">
                                  {realImg ? (
                                    <img src={realImg} alt={item.productName} className="w-full h-full object-cover" />
                                  ) : (
                                    PRODUCT_ICONS[iconKey] || <Medication sx={{ fontSize: 18 }} className="text-blue-400" />
                                  )}
                                </div>
                                <div className="text-left min-w-0">
                                  <span className="text-[12px] font-black text-slate-800 block truncate">
                                    {item.productName} <span className="text-emerald-600 font-extrabold ml-1.5">₹{item.price || 0}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-extrabold tracking-wide uppercase leading-none block mt-0.5">
                                    Qty: {item.quantity}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* View All / Show Less — moved to sticky footer outside scroll shell */}
                  </>
                )}
              </div>
            )}

            {activeTab === "orders" && selectedOrder && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Status Card */}
                <div className={`p-4 rounded-3xl flex justify-between items-center shadow-sm ${
                  selectedOrder.status === "Delivered" 
                    ? "bg-emerald-50/40 border border-emerald-100/60" 
                    : selectedOrder.status === "Cancelled"
                      ? "bg-slate-50 border border-slate-150"
                      : "bg-orange-50/40 border border-orange-100/60"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-white ${
                      selectedOrder.status === "Delivered" 
                        ? "bg-emerald-600" 
                        : selectedOrder.status === "Cancelled"
                          ? "bg-slate-400"
                          : "bg-orangeBrand"
                    }`}>
                      {selectedOrder.status === "Delivered" ? (
                        <CheckCircle sx={{ fontSize: 16 }} />
                      ) : selectedOrder.status === "Cancelled" ? (
                        <Cancel sx={{ fontSize: 16 }} />
                      ) : (
                        <Medication sx={{ fontSize: 16 }} />
                      )}
                    </div>
                    <div className="text-left">
                      <h4 className="text-xs font-black text-slate-850 uppercase tracking-wide">
                        {selectedOrder.status}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        {selectedOrder.status === "Delivered" 
                          ? "Order arrived safely" 
                          : selectedOrder.status === "Cancelled"
                            ? "Order was cancelled"
                            : `Order is ${selectedOrder.status?.toLowerCase()}`}
                      </p>
                    </div>
                  </div>
                  {selectedOrder.status === "Delivered" && selectedOrder.deliveryTime && (
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Arrived in</span>
                      <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm dark:text-indigo-200 dark:bg-indigo-500/15 dark:border-indigo-400/30 dark:shadow-none">
                        <Bolt sx={{ fontSize: 12 }} className="text-yellow-500" /> {selectedOrder.deliveryTime}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Items list */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider text-left">
                    {selectedOrder.items.length} {selectedOrder.items.length === 1 ? "item" : "items"} in order
                  </h4>
                  <div className="space-y-3.5 bg-slate-50/40 border border-slate-100/60 rounded-[20px] p-4">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex gap-3.5 items-center justify-between">
                        <div className="flex gap-3 items-center flex-1 min-w-0">
                          <div className="w-11 h-11 border border-slate-100 rounded-xl bg-white flex items-center justify-center shadow-sm select-none flex-shrink-0 overflow-hidden animate-in fade-in duration-205">
                            {item.realImage ? (
                              <img src={item.realImage} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              PRODUCT_ICONS[item.image] || <Medication sx={{ fontSize: 20 }} className="text-blue-400" />
                            )}
                          </div>
                          <div className="min-w-0 text-left">
                            <h5 className="font-extrabold text-slate-800 text-xs truncate leading-snug">
                              {item.name}
                            </h5>
                            <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                              {item.unit} • {item.quantity} {item.quantity === 1 ? "unit" : "units"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-black text-slate-900 block text-xs">₹{item.final_price * item.quantity}</span>
                          {item.cost > item.final_price && (
                            <span className="text-[10px] text-slate-400 line-through font-bold block mt-0.5">
                              ₹{item.cost * item.quantity}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Bill Summary */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider flex items-center gap-1.5 text-left">
                    <Receipt sx={{ fontSize: 16 }} className="text-orangeBrand" />
                    Bill Summary
                  </h3>
                  
                  <div className="bg-white border border-slate-100 rounded-[20px] p-4 shadow-sm space-y-3 text-xs">
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Item Total</span>
                      <div className="flex items-center gap-2">
                        {selectedOrder.items.reduce((sum, item) => sum + ((item.cost || item.final_price) * item.quantity), 0) > parseFloat(selectedOrder.amount.replace("₹", "")) && (
                          <span className="text-slate-400 line-through">
                            ₹{selectedOrder.items.reduce((sum, item) => sum + ((item.cost || item.final_price) * item.quantity), 0)}
                          </span>
                        )}
                        <span className="font-bold text-slate-750">
                          ₹{selectedOrder.items.reduce((sum, item) => sum + (item.final_price * item.quantity), 0)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Delivery Fee</span>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-300 line-through font-medium">₹30</span>
                        <span className="font-black text-emerald-600 uppercase tracking-wider text-[9px]">FREE</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Handling Fee</span>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-300 line-through font-medium">₹10</span>
                        <span className="font-black text-emerald-600 uppercase tracking-wider text-[9px]">FREE</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-slate-100 pt-3 flex justify-between font-black text-slate-900 bg-slate-50/50 p-2.5 rounded-xl">
                      <span>Total Bill</span>
                      <div className="flex items-center gap-2">
                        {selectedOrder.items.reduce((sum, item) => sum + ((item.cost || item.final_price) * item.quantity), 0) > parseFloat(selectedOrder.amount.replace("₹", "")) && (
                          <span className="text-slate-400 line-through text-xs font-normal">
                            ₹{selectedOrder.items.reduce((sum, item) => sum + ((item.cost || item.final_price) * item.quantity), 0)}
                          </span>
                        )}
                        <span>{selectedOrder.amount}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      handleReorderMedicines(selectedOrder);
                    }}
                    className="w-full bg-orangeBrand/10 hover:bg-orangeBrand/20 text-orangeBrand border border-orangeBrand/20 font-black text-xs py-3 rounded-2xl transition active:scale-95 duration-200 uppercase tracking-wide"
                  >
                    Order Again
                  </button>
                </div>

                {/* 4. Order Details */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider text-left">
                    Order Details
                  </h3>
                  <div className="bg-white border border-slate-100 rounded-[20px] p-5 shadow-sm space-y-4 text-[11px] text-slate-500 leading-normal">
                    <div className="flex justify-between items-start gap-4">
                      <span className="font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">Order ID</span>
                      <span className="text-slate-800 font-extrabold text-right break-all flex items-center gap-1">
                        {selectedOrder.id}
                        <button 
                          onClick={() => copyToClipboard(selectedOrder.id)}
                          className="text-slate-400 hover:text-slate-700 transition"
                          title="Copy Order ID"
                        >
                          <ContentCopy sx={{ fontSize: 13 }} />
                        </button>
                      </span>
                    </div>
                    <div className="flex justify-between items-start gap-4">
                      <span className="font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">Receiver Details</span>
                      <div className="text-right">
                        <span className="text-slate-800 font-extrabold block">{profile.name}</span>
                        <span className="text-slate-400 block mt-0.5">{profile.phone}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">Delivery Address</span>
                      <span className="text-slate-700 font-extrabold text-left leading-relaxed">
                        {profile.address || "S.N.S Luxury Men's Hostel & PG, 1372, 100 Feet Rd, Ayyappa Society, VIP Hills, Sarojini Naidu Nagar, Madhapur, Hyderabad, Telangana 500081, India"}
                      </span>
                    </div>
                    <div className="flex justify-between items-start gap-4 pt-1.5 border-t border-slate-100">
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide block">Order Placed at</span>
                        <span className="text-slate-850 font-black block mt-1">{selectedOrder.date}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-400 uppercase tracking-wide block">Order Arrived at</span>
                        <span className="text-slate-850 font-black block mt-1">
                          {selectedOrder.arrivalTime || "9:12 PM"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Order Again Button */}
                <button
                  onClick={() => {
                    handleReorderMedicines(selectedOrder);
                  }}
                  className="w-full bg-orangeBrand hover:bg-orangeBrand-light text-white font-black text-sm py-4 rounded-2xl shadow-md hover:shadow-lg transition active:scale-95 duration-200 text-center uppercase tracking-wide"
                >
                  Order Again
                </button>
              </div>
            )}
            {/* PHARMACY CASH & WALLET TAB - DASHBOARD VIEW */}
            {activeTab === "wallet" && walletView === "dashboard" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* WALLET BALANCE HERO CARD */}
                <div className="relative rounded-[24px] bg-gradient-to-br from-emerald-600 via-teal-700 to-green-600 overflow-hidden p-6 flex flex-col justify-between shadow-lg text-white">
                  {/* Decorative Glowing Circle Grid */}
                  <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex justify-between items-center relative z-10">
                    <div>
                      <span className="text-[10px] text-emerald-100 font-extrabold uppercase tracking-widest block">Available Balance</span>
                      <span className="text-[32px] font-black tracking-wide block mt-1">₹{profile.walletBalance || 0}</span>
                    </div>
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center border border-white/20 shadow-lg text-white font-black text-xl transform rotate-12">
                        <Paid sx={{ fontSize: 26 }} className="text-yellow-300" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* FEATURE HIGHLIGHTS */}
                <div className="grid grid-cols-3 gap-2 py-2">
                  <div className="flex flex-col items-center text-center p-2">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mb-1.5">
                      <Bolt className="text-emerald-600 animate-pulse" sx={{ fontSize: 18 }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-800 block uppercase leading-snug">Easy & Fast</span>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Payments</span>
                  </div>

                  <div className="flex flex-col items-center text-center p-2">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mb-1.5">
                      <Paid className="text-emerald-600" sx={{ fontSize: 16 }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-800 block uppercase leading-snug">Instant</span>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Refunds</span>
                  </div>

                  <div className="flex flex-col items-center text-center p-2">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center mb-1.5">
                      <LocalOffer className="text-emerald-600 animate-pulse" sx={{ fontSize: 15 }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-800 block uppercase leading-snug">Exclusive</span>
                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Offers</span>
                  </div>
                </div>

                {/* PHARMACY CASH CARD */}
                <div className="bg-white border border-slate-100 rounded-[20px] p-5 shadow-sm flex items-start gap-4 hover:border-slate-200 transition duration-150">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <Paid className="text-amber-500" sx={{ fontSize: 20 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-wide">Pharmacy Cash</h4>
                      <span className="bg-rose-50 text-rose-500 border border-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-400/30 rounded-md px-1.5 py-0.5 font-black uppercase text-[8px] tracking-wider ml-2.5">
                        UNAVAILABLE
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-relaxed">
                      Unavailable in your location. Please contact customer support for any queries.
                    </p>
                  </div>
                  <span className="text-xs font-black text-slate-800 flex-shrink-0 mt-0.5">₹0</span>
                </div>

                {/* TRANSACTIONS SECTION */}
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider text-center mb-4">
                    Recent Transactions
                  </h3>

                  <div className="bg-white border border-slate-100 rounded-[20px] shadow-sm overflow-hidden p-5 flex flex-col gap-4">
                    {transactions.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">No transaction history found.</p>
                      </div>
                    ) : (
                      transactions.slice(0, 5).map((t, idx) => (
                        <div key={t.id} className="flex flex-col">
                          {idx > 0 && <div className="h-[1px] bg-slate-100 my-3" />}
                          <div className="flex justify-between items-start text-[11px] text-left">
                            <div>
                              <span className="font-black text-slate-800 block">{t.title}</span>
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{t.time}</span>
                            </div>
                            <span className="font-black text-slate-850">
                              {t.amount}
                            </span>
                          </div>
                        </div>
                      ))
                    )}

                    {/* See All */}
                    <button
                      type="button"
                      onClick={() => setWalletView("activity")}
                      className="text-center font-black text-emerald-600 hover:text-emerald-700 transition active:scale-95 text-[11px] uppercase tracking-wider py-1 hover:underline w-full focus:outline-none"
                    >
                      See All &gt;
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* PHARMACY CASH & WALLET TAB - DETAILED ACTIVITY LEDGER */}
            {activeTab === "wallet" && walletView === "activity" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* TAB SWITCHER */}
                <div className="flex justify-center">
                  <div className="bg-slate-100/60 rounded-full p-1 flex items-center justify-between gap-1 w-full max-w-sm border border-slate-100">
                    <button
                      onClick={() => setActivityFilter("all")}
                      className={`flex-1 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition duration-150 focus:outline-none ${
                        activityFilter === "all"
                          ? "bg-emerald-800 text-white shadow-sm font-black"
                          : "text-slate-500 hover:text-slate-850 font-bold"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setActivityFilter("debits")}
                      className={`flex-1 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition duration-150 focus:outline-none ${
                        activityFilter === "debits"
                          ? "bg-emerald-800 text-white shadow-sm font-black"
                          : "text-slate-500 hover:text-slate-850 font-bold"
                      }`}
                    >
                      Debits
                    </button>
                    <button
                      onClick={() => setActivityFilter("credits")}
                      className={`flex-1 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition duration-150 focus:outline-none ${
                        activityFilter === "credits"
                          ? "bg-emerald-800 text-white shadow-sm font-black"
                          : "text-slate-500 hover:text-slate-850 font-bold"
                      }`}
                    >
                      Credits
                    </button>
                  </div>
                </div>

                {/* DETAILED TRANSACTIONS LIST */}
                <div className="bg-white border border-slate-100 rounded-[20px] shadow-sm overflow-hidden p-5 flex flex-col gap-4">
                  {filteredTxs
                    .slice(0, visibleTxCount)
                    .map((t, idx) => (
                      <div key={t.id} className="flex flex-col">
                        {idx > 0 && <div className="h-[1px] bg-slate-100 my-4" />}
                        <div className="flex justify-between items-start text-[11px] text-left">
                          <div>
                            <span className="font-black text-slate-800 block">{t.title}</span>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{t.time}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-black block ${t.type === "credit" ? "text-emerald-600" : "text-slate-800"}`}>
                              {t.amount}
                            </span>
                            {t.expiry && (
                              <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{t.expiry}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                  {/* Empty state if filtered results are 0 */}
                  {filteredTxs.length === 0 && (
                    <div className="text-center py-6">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">No transaction history found.</p>
                    </div>
                  )}
                </div>

                {/* LOAD MORE BUTTON */}
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    disabled={!hasMore}
                    onClick={() => {
                      if (hasMore) {
                        setVisibleTxCount((p) => p + 5);
                        toast.success("Additional transactions loaded successfully.");
                      }
                    }}
                    className={`px-6 py-2.5 bg-white border font-extrabold text-[11px] rounded-xl shadow-sm transition active:scale-95 duration-205 flex items-center justify-center gap-1.5 border-[1.5px] focus:outline-none ${
                      hasMore 
                        ? "border-slate-900 text-slate-900 hover:bg-slate-50 cursor-pointer" 
                        : "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50/50"
                    }`}
                  >
                    {hasMore ? <><ArrowDownward sx={{ fontSize: 13 }} /> <span>Load More</span></> : <span>All Records Loaded</span>}
                  </button>
                </div>

              </div>
            )}

            {/* SAVED ADDRESSES TAB */}
            {activeTab === "addresses" && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* ADD NEW ADDRESS CARD */}
                <div 
                  onClick={() => setShowAddModal(true)}
                  className="bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:shadow-md transition active:scale-[0.99] duration-150"
                >
                  <div className="flex items-center gap-3">
                    <Add className="text-rose-500 font-black" sx={{ fontSize: 20 }} />
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Add New Address</span>
                  </div>
                  <ChevronRight className="text-slate-400" sx={{ fontSize: 18 }} />
                </div>

                {/* SAVED ADDRESSES SECTION */}
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3 px-1">
                    Saved Addresses
                  </h3>

                  {savedAddrs.length === 0 ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
                      <LocationOn className="text-slate-300 mb-2" sx={{ fontSize: 36 }} />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">No saved addresses found.</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden p-4 space-y-4">
                      {savedAddrs.map((a, idx) => (
                        <div key={a.id} className="flex flex-col">
                          {idx > 0 && (
                            <div className="border-t border-dashed border-slate-100 my-4" />
                          )}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <LocationOn className="text-slate-400 mt-0.5 flex-shrink-0" sx={{ fontSize: 18 }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-black text-slate-800">{a.typeTag || "Other"}</span>
                                  <span className="text-[10px] text-slate-400 font-bold">•</span>
                                  <span className="text-[10px] text-slate-400 font-extrabold">{getMockDistance(a.id)}</span>
                                  {a.primary && (
                                    <span className="text-[9px] font-black text-orangeBrand bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-100 dark:bg-orange-500/15 dark:border-orange-400/30 uppercase tracking-wider ml-1">
                                      Primary
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 font-semibold mt-1 leading-relaxed break-words pr-2">
                                  {a.fullText || `${a.flat || ""} ${a.building || ""} ${a.landmark || ""}`.trim()}
                                </p>
                                <p className="text-[9px] text-slate-400 font-black mt-1 tracking-wide uppercase">
                                  {a.receiverName} · {a.phone}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3.5 flex-shrink-0 mt-0.5 pr-1">
                              {/* EDIT */}
                              <button
                                onClick={() => setEditingAddr(a)}
                                className="text-slate-400 hover:text-orangeBrand transition active:scale-90 flex items-center justify-center"
                                title="Edit Address"
                              >
                                <Edit sx={{ fontSize: 18 }} />
                              </button>

                              {/* DELETE */}
                              <button
                                onClick={() => handleDeleteAddress(a.id)}
                                className="text-slate-400 hover:text-rose-600 transition active:scale-90 flex items-center justify-center"
                                title="Delete Address"
                              >
                                <Delete sx={{ fontSize: 18 }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PROFILE DETAILS TAB */}
            {activeTab === "profile" && (
              <div className="space-y-4">
                {/* PROFILE PICTURE CARD */}
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative w-20 h-20 group flex-shrink-0">
                    {/* Clickable avatar container */}
                    <label className="block w-20 h-20 rounded-full overflow-hidden border-2 border-orangeBrand bg-orange-50 flex items-center justify-center shadow-sm cursor-pointer hover:border-orangeBrand-light transition-all duration-200 relative">
                      {profile.picture ? (
                        <img src={profile.picture} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-black text-orangeBrand">
                          {profile.name ? profile.name.charAt(0).toUpperCase() : "U"}
                        </span>
                      )}
                      
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition duration-200">
                        <Edit className="text-white" sx={{ fontSize: 18 }} />
                      </div>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>

                    {/* Floating delete button */}
                    {profile.picture && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRemoveImage();
                        }}
                        className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-slate-200 hover:border-rose-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-full flex items-center justify-center shadow-sm transition active:scale-90 duration-100"
                        title="Remove Profile Photo"
                      >
                        <Delete sx={{ fontSize: 13 }} />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Profile Photo</h4>
                    <p className="text-[9px] text-slate-450 font-bold mt-1">Click the avatar to upload or change image. Accepts PNG, JPG, JPEG (Max 2MB)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Full Name</label>
                    <input
                      name="name"
                      value={profile.name || ""}
                      onChange={handleProfileChange}
                      placeholder="Enter your full name"
                      className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orangeBrand focus:ring-1 focus:ring-orangeBrand/10 font-bold text-slate-700 bg-slate-50/50 hover:bg-slate-50 transition"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Phone Number</label>
                    <input
                      name="phone"
                      value={profile.phone || ""}
                      onChange={handleProfileChange}
                      placeholder="Enter your phone number"
                      className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orangeBrand focus:ring-1 focus:ring-orangeBrand/10 font-bold text-slate-700 bg-slate-50/50 hover:bg-slate-50 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Email ID</label>
                  <input
                    name="email"
                    value={profile.email || ""}
                    onChange={handleProfileChange}
                    placeholder="Enter your email address"
                    className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orangeBrand focus:ring-1 focus:ring-orangeBrand/10 font-bold text-slate-700 bg-slate-50/50 hover:bg-slate-50 transition"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Delivery Address</label>
                  {savedAddrs.length === 0 ? (
                    <div className="p-3 border border-slate-250 rounded-xl bg-slate-50 text-xs font-bold text-slate-500 flex items-center justify-between">
                      <span>No saved addresses found. Please add one.</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab("addresses")}
                        className="text-orangeBrand hover:text-orangeBrand-light hover:underline uppercase text-[10px] font-black focus:outline-none"
                      >
                        Add Address
                      </button>
                    </div>
                  ) : isEditingAddressText ? (
                    <div className="space-y-2 border border-slate-200/60 p-3 rounded-2xl bg-slate-50 animate-in fade-in duration-200 text-left">
                      <textarea
                        rows="2"
                        value={tempAddressText}
                        onChange={(e) => setTempAddressText(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-orangeBrand focus:ring-1 focus:ring-orangeBrand/10 font-bold text-slate-700 leading-normal resize-none"
                        placeholder="Enter delivery address details"
                      />
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!tempAddressText.trim()) {
                              toast.error("Address cannot be empty.");
                              return;
                            }
                            const primaryAddr = savedAddrs.find(a => a.primary) || savedAddrs[0];
                            if (primaryAddr) {
                              await updateAddressLocal(primaryAddr.id, { fullText: tempAddressText });
                            }
                            setProfile(prev => ({ ...prev, address: tempAddressText }));
                            setIsEditingAddressText(false);
                            toast.success("Delivery address updated and applied to Saved Addresses!");
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase px-3 py-1.5 rounded-lg shadow-sm"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingAddressText(false);
                          }}
                          className="bg-white border border-slate-300 text-slate-500 font-bold text-[10px] uppercase px-3 py-1.5 rounded-lg hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between text-left leading-relaxed">
                      <span className="flex-1">{profile.address || "No primary address selected."}</span>
                      {savedAddrs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTempAddressText(profile.address || "");
                            setIsEditingAddressText(true);
                          }}
                          className="text-slate-400 hover:text-orangeBrand transition p-1 hover:bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0 ml-2"
                          title="Edit Address"
                        >
                          <Edit sx={{ fontSize: 16 }} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">GPS Coordinates</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      name="geolocation"
                      value={profile.geolocation || ""}
                      onChange={handleProfileChange}
                      placeholder="Auto-filled from location services"
                      className="flex-1 p-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orangeBrand focus:ring-1 focus:ring-orangeBrand/10 font-bold text-slate-700 bg-slate-50/50 hover:bg-slate-50 transition"
                    />
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isFetchingLocation}
                      className="px-4 py-3 bg-orange-50 dark:bg-orange-500/15 hover:bg-orangeBrand/10 border border-orangeBrand/20 text-orangeBrand font-extrabold text-[11px] rounded-xl uppercase tracking-wider transition active:scale-95 disabled:opacity-50 duration-150 flex items-center justify-center gap-1.5 shadow-sm"
                      title="Get Current Location"
                    >
                      {isFetchingLocation ? (
                        <span className="inline-block w-4 h-4 border-2 border-orangeBrand border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <LocationOn sx={{ fontSize: 16 }} />
                      )}
                      <span>Coordinates</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="px-6 py-2.5 bg-orangeBrand hover:bg-orangeBrand-light disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 duration-200 flex items-center gap-2"
                >
                  {isSavingProfile ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            )}

            {/* SECURITY TAB */}
            {activeTab === "security" && (
              <div className="space-y-4">
                <div className="p-4 bg-orange-50 border border-orange-700 rounded-2xl text-[11px] text-orange-800 dark:bg-orange-500/10 dark:border-orange-400/40 dark:text-orange-200 font-extrabold flex items-start gap-2.5">
                  <Lock className="mt-0.5 flex-shrink-0" sx={{ fontSize: 15 }} />
                  <span>If you are using a shared device, please logout cleanly to wipe cached prescription images.</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-6 py-2.5 bg-orangeBrand hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 duration-200"
                >
                  Logout
                </button>
              </div>
            )}

            {/* LAB BOOKINGS TAB */}
            {activeTab === "lab-bookings" && (
              <div className="space-y-4 animate-in fade-in duration-200 text-left">
                {loadingBookings ? (
                  <div className="text-center py-10">
                    <div className="w-8 h-8 border-4 border-emerald-550 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-slate-400 font-extrabold text-xs uppercase tracking-wider">Loading your lab bookings...</p>
                  </div>
                ) : labBookings.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 rounded-3xl bg-slate-50/30">
                    <ScienceOutlined className="text-slate-300 mb-3" sx={{ fontSize: 40 }} />
                    <h3 className="text-slate-700 font-black text-sm uppercase tracking-wide">No Lab Bookings Found</h3>
                    <p className="text-slate-400 font-extrabold text-[11px] uppercase tracking-wider mt-1">Book your first lab test slot to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(showAllBookings ? labBookings : labBookings.slice(0, 5)).map((b) => (
                      <div key={b.id} className="border border-slate-100 p-4 rounded-2xl bg-white flex flex-col gap-2 relative shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <ScienceOutlined className="text-orangeBrand" sx={{ fontSize: 16 }} />
                            <span className="text-[12px] font-black text-slate-800">{b.testName}</span>
                          </div>
                          <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 uppercase tracking-wider border border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30">
                            {b.status || "BOOKED"}
                          </span>
                        </div>
                        <div className="h-[1px] bg-slate-100/50 my-1" />
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Date</span>
                            <span className="font-extrabold text-slate-700">{b.selectedDate}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Time Slot</span>
                            <span className="font-extrabold text-slate-700">{b.selectedSlot}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Patient Name</span>
                            <span className="font-extrabold text-slate-700">{b.patientName}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Cost</span>
                            <span className="font-extrabold text-emerald-600">₹{b.price}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>{/* end scroll shell */}

          {/* Sticky "View All Orders" button — outside scroll shell, pinned to panel bottom */}
          {activeTab === "orders" && !selectedOrder && orders.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAllOrders(prev => !prev)}
                className="w-full py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-600 uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                {showAllOrders ? (
                  <>
                    <ChevronRight sx={{ fontSize: 15, transform: "rotate(-90deg)" }} />
                    <span>Show Less</span>
                  </>
                ) : (
                  <>
                    <ChevronRight sx={{ fontSize: 15, transform: "rotate(90deg)" }} />
                    <span>View All {orders.length} Orders</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Sticky "View All Lab Bookings" button */}
          {activeTab === "lab-bookings" && labBookings.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAllBookings(prev => !prev)}
                className="w-full py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-600 uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                {showAllBookings ? (
                  <>
                    <ChevronRight sx={{ fontSize: 15, transform: "rotate(-90deg)" }} />
                    <span>Show Less</span>
                  </>
                ) : (
                  <>
                    <ChevronRight sx={{ fontSize: 15, transform: "rotate(90deg)" }} />
                    <span>View All {labBookings.length} Bookings</span>
                  </>
                )}
              </button>
            </div>
          )}

        </div>

      </div>

      {editingAddr && (
        <AddAddressModal
          editingAddress={editingAddr}
          onSaved={() => {
            setEditingAddr(null);
            refreshAddresses();
            toast.success("Address updated successfully!");
          }}
          onCancel={() => setEditingAddr(null)}
        />
      )}

      {showAddModal && (
        <AddAddressModal
          initialCoords={null}
          editingAddress={null}
          onSaved={() => {
            setShowAddModal(false);
            refreshAddresses();
            toast.success("Address saved successfully!");
          }}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {showTopUpModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[2200] animate-in fade-in duration-200 p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTopUpModal(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-[32px] p-6 space-y-6 animate-in zoom-in-95 duration-200 shadow-2xl border border-slate-100 text-slate-800">
            <div className="flex justify-between items-center">
              <h3 className="text-[16px] font-black text-slate-900 uppercase tracking-wide text-left">Add Money to Wallet</h3>
              <button
                onClick={() => setShowTopUpModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
              >
                <Close sx={{ fontSize: 20 }} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider text-left">
                Enter Amount (₹)
              </label>
              <div className="relative border border-slate-200 rounded-2xl p-3 bg-white focus-within:border-[#006A4E] focus-within:ring-1 focus-within:ring-[#006A4E]/10">
                <span className="absolute left-4 top-3 text-slate-500 font-extrabold text-sm">₹</span>
                <input
                  type="number"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-full pl-6 bg-transparent text-sm font-black text-slate-850 focus:outline-none text-left"
                  placeholder="Enter amount"
                />
              </div>
            </div>

            {/* Quick Select Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {["100", "500", "1000", "2000"].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setTopUpAmount(amt)}
                  className={`py-2.5 rounded-xl text-[10px] font-black transition ${
                    topUpAmount === amt
                      ? "bg-[#006A4E] text-white border-transparent shadow-sm"
                      : "bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-650"
                  }`}
                >
                  +₹{amt}
                </button>
              ))}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider text-left">
                Select Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTopUpMethod("razorpay")}
                  className={`py-3 rounded-xl border text-center flex flex-col justify-center items-center gap-1 transition ${
                    topUpMethod === "razorpay"
                      ? "border-[#006A4E] bg-emerald-50/10 text-[#006A4E] font-black"
                      : "border-slate-200 hover:bg-slate-50 text-slate-500 font-bold"
                  }`}
                >
                  <span className="text-[11px] block">Razorpay</span>
                  <span className="text-[8px] text-gray-400 block font-normal">Card / Netbanking</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTopUpMethod("upi")}
                  className={`py-3 rounded-xl border text-center flex flex-col justify-center items-center gap-1 transition ${
                    topUpMethod === "upi"
                      ? "border-[#006A4E] bg-emerald-50/10 text-[#006A4E] font-black"
                      : "border-slate-200 hover:bg-slate-50 text-slate-500 font-bold"
                  }`}
                >
                  <span className="text-[11px] block">UPI / QR Code</span>
                  <span className="text-[8px] text-gray-400 block font-normal">GPay, PhonePe, Paytm or QR</span>
                </button>
              </div>
            </div>

            <button
              onClick={executeWalletTopUp}
              disabled={isToppingUp || !topUpAmount || parseFloat(topUpAmount) <= 0}
              className="w-full bg-[#006A4E] hover:bg-[#005740] disabled:bg-slate-200 disabled:text-slate-450 text-white font-extrabold text-xs py-4 rounded-full transition shadow-md active:scale-[0.98] uppercase tracking-wider"
            >
              {isToppingUp ? "Processing..." : topUpMethod === "upi" ? "Pay with UPI" : "Proceed to Pay"}
            </button>
          </div>
        </div>
      )}

      <SupportChat open={helpOpen} onClose={closeHelp} order={selectedOrder} />
    </div>
  );
};

const callHelpline = () => (window.location.href = "tel:+919000000000");

function SidebarItem({ icon, title, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 cursor-pointer rounded-xl transition duration-150 border focus:outline-none ${
        active 
          ? "bg-slate-50 text-slate-800 border-slate-100 font-black" 
          : "text-slate-500 hover:bg-slate-50/50 hover:text-slate-800 border-transparent font-bold"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={active ? "text-orangeBrand" : "text-slate-400"}>{icon}</span>
        <span className="text-[12px] tracking-wide text-left">{title}</span>
      </div>
      {active && <ChevronRight className="text-slate-400" sx={{ fontSize: 13 }} />}
    </button>
  );
}

export default Profile;