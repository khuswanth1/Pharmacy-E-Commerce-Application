import React, { useState, useContext, useEffect, useRef } from "react";
import { AuthContext } from "../../context/AuthContext";
import { toast } from "react-toastify";
import { Explore } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { loginAPI, registerAPI, getProfileAPI, updateProfileAPI, forgotPasswordAPI, resetPasswordAPI, googleLoginAPI } from "../../api/authService";
import { homeFor, hasRole, ROLES } from "../../utils/roles";
import { GOOGLE_CLIENT_ID } from "../../utils/google";

// Role picker on the login card.
const LOGIN_ROLES = [
  { id: "customer", label: "Customer", role: null, hint: "Order medicines and book lab tests" },
  { id: "vendor", label: "Vendor", role: ROLES.VENDOR, hint: "Manage your pharmacy's orders and stock", signup: "VENDOR" },
  { id: "delivery", label: "Delivery", role: ROLES.DELIVERY, hint: "Pick up and deliver orders", signup: "DELIVERY" },
  { id: "admin", label: "Admin", role: ROLES.ADMIN, hint: "Approve partners and manage the store" },
];

/** Which picker option an account belongs to. Admin wins, since an admin may also hold other roles. */
const accountRoleId = (profile) => {
  if (hasRole(profile, ROLES.ADMIN)) return "admin";
  if (hasRole(profile, ROLES.VENDOR)) return "vendor";
  if (hasRole(profile, ROLES.DELIVERY)) return "delivery";
  return "customer";
};

const wrongRoleMessage = (actualRole) => {
  const article = /^[aeiou]/i.test(actualRole.label) ? "an" : "a";
  return `This is ${article} ${actualRole.label.toLowerCase()} account. Choose "${actualRole.label}" above to log in.`;
};

const Login = ({ onClose }) => {
  const { loginUser } = useContext(AuthContext);
  const navigate = useNavigate();

  // Standalone page render check
  const isPage = !onClose;

  // Active tab: "login" or "signup" or "forgot" or "signupDetails"
  const [activeTab, setActiveTab] = useState("login");

  // Who is logging in: customer, vendor, delivery or admin (see LOGIN_ROLES)
  const [loginRole, setLoginRole] = useState("customer");
  const selectedRole = LOGIN_ROLES.find((r) => r.id === loginRole);
  const loginRoleRef = useRef(loginRole);
  loginRoleRef.current = loginRole;
  
  // Forgot password sub-step: 1 (enter email), 2 (enter new passwords)
  const [forgotStep, setForgotStep] = useState(1);

  // Form Fields State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [geolocation, setGeolocation] = useState("");
  const [detectingGeo, setDetectingGeo] = useState(false);
  const [error, setError] = useState("");

  // If already logged in and loading as standalone landing page, auto redirect to Home
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("token");
    const oauthUserId = params.get("userId");
    const oauthError = params.get("error");

    if (oauthError === "google_auth_failed") {
      setError("Google authentication failed. Please configure a valid GOOGLE_CLIENT_SECRET on the backend, or use the direct Google button.");
      toast.error("Google authentication failed on backend.");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (oauthToken && oauthUserId) {
      localStorage.setItem("pharmacy_token", oauthToken);
      getProfileAPI(oauthUserId)
        .then((profileResponse) => {
          if (profileResponse && profileResponse.success) {
            const profileData = profileResponse.data;
            localStorage.setItem("user", JSON.stringify(profileData));
            loginUser(profileData, oauthToken);
            toast.success(`Welcome, ${profileData.name || 'User'}! Logged in successfully via Google. 🔓`);
            // Clean up query parameters from the URL
            window.history.replaceState({}, document.title, window.location.pathname);
            if (isPage) {
              navigate("/home/All", { replace: true });
            } else {
              onClose();
            }
          } else {
            toast.error("Failed to retrieve Google profile details.");
          }
        })
        .catch((err) => {
          console.error("OAuth2 Login error:", err);
          toast.error("OAuth2 authentication failed.");
        });
      return;
    }

    const saved = localStorage.getItem("user") || localStorage.getItem("pharmacy_user");
    if (saved && isPage) {
      let savedUser = null;
      try { savedUser = JSON.parse(saved); } catch (e) { savedUser = null; }
      navigate(savedUser ? homeFor(savedUser) : "/home");
    }
  }, [navigate, isPage, loginUser, onClose]);

  const handlePhoneInput = (e) => {
    let value = e.target.value.replace(/\D/g, ""); // Allow only digits
    if (value.length > 10) {
      value = value.slice(0, 10);
    }
    setPhone(value);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      return setError("Please fill in all fields.");
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return setError("Please enter a valid email address.");
    }

    try {
      const response = await loginAPI(email, password);
      
      if (response && response.success) {
        const { token, userId } = response.data;
        
        // Save token to localStorage immediately so subsequent profile request succeeds
        localStorage.setItem("pharmacy_token", token);
        
        const profileResponse = await getProfileAPI(userId);
        
        if (profileResponse && profileResponse.success) {
          const profileData = profileResponse.data;

          // The account must match the role picked above the form.
          const actualRole = LOGIN_ROLES.find((r) => r.id === accountRoleId(profileData));
          if (actualRole.id !== loginRole) {
            localStorage.removeItem("pharmacy_token");
            return setError(wrongRoleMessage(actualRole));
          }

          localStorage.setItem("user", JSON.stringify(profileData));
          loginUser(profileData, token);
          toast.success("Welcome back! Logged in successfully. 🔓");

          // Vendors, delivery partners and admins go to their own portal.
          if (isPage || homeFor(profileData) !== "/home/All") {
            navigate(homeFor(profileData), { replace: true });
          } else {
            onClose();
          }
        } else {
          setError("Failed to retrieve profile details.");
        }
      } else {
        setError(response?.message || "Invalid credentials.");
      }
    } catch (err) {
      console.error(err);
      setError(err.toString());
    }
  };

  const handleSignupSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!email || !phone || !password || !confirmPassword) {
      return setError("Please fill in all fields.");
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return setError("Please enter a valid email address.");
    }
    if (phone.length !== 10) {
      return setError("Please enter a valid 10-digit phone number.");
    }
    if (password.length < 6) {
      return setError("Password must be at least 6 characters long.");
    }
    if (password !== confirmPassword) {
      return setError("Passwords do not match!");
    }

    // Transition to details collection step
    setName(email.split("@")[0]);
    setActiveTab("signupDetails");
    toast.info("Account credentials set! Let's complete your profile.");
  };

  const performRegisterAndLogin = async (finalName, finalPhone) => {
    try {
      const regResponse = await registerAPI(finalName, email, password, finalPhone);
      
      if (regResponse && regResponse.success) {
        const loginResponse = await loginAPI(email, password);
        
        if (loginResponse && loginResponse.success) {
          const { token, userId } = loginResponse.data;
          
          localStorage.setItem("pharmacy_token", token);
          
          const profileResponse = await getProfileAPI(userId);
          
          if (profileResponse && profileResponse.success) {
            let finalProfile = profileResponse.data;
            if (address.trim() || geolocation) {
              try {
                const updateResponse = await updateProfileAPI(userId, {
                  address: address.trim(),
                  geolocation: geolocation
                });
                if (updateResponse && updateResponse.success) {
                  finalProfile = updateResponse.data;
                }
              } catch (updErr) {
                console.error("Failed to sync onboarding details with backend:", updErr);
              }
            }
            
            localStorage.setItem("user", JSON.stringify(finalProfile));
            loginUser(finalProfile, token);
            return true;
          }
        }
      }
      return false;
    } catch (err) {
      console.error(err);
      setError(err.toString());
      return false;
    }
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      return setError("Please enter your name.");
    }

    const success = await performRegisterAndLogin(name.trim(), `+91 ${phone}`);
    if (success) {
      toast.success(`Welcome, ${name.trim()}! Onboarding completed successfully! 🎉`);
      if (isPage) {
        navigate("/home/All", { replace: true });
      } else {
        onClose();
      }
    }
  };

  const handleSkipDetails = async () => {
    const finalName = name || email.split("@")[0] || "Patient";
    const success = await performRegisterAndLogin(finalName, `+91 ${phone}`);
    if (success) {
      toast.info("Onboarding completed with minimal profile details.");
      if (isPage) {
        navigate("/home/All", { replace: true });
      } else {
        onClose();
      }
    }
  };

  const handleGetGeolocation = () => {
    setDetectingGeo(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(4);
          const lng = position.coords.longitude.toFixed(4);
          setGeolocation(`Coordinates: ${lat}° N, ${lng}° E`);
          setDetectingGeo(false);
          toast.success("GPS location coordinates detected! 📍");
        },
        (err) => {
          // Fallback Hyderabad location
          setTimeout(() => {
            setGeolocation("Hyderabad (17.3850° N, 78.4867° E)");
            setDetectingGeo(false);
            toast.success("Hyderabad coordinates auto-filled! 📍");
          }, 1000);
        }
      );
    } else {
      setGeolocation("Hyderabad (17.3850° N, 78.4867° E)");
      setDetectingGeo(false);
      toast.success("Hyderabad coordinates auto-filled! 📍");
    }
  };

  const handleForgotStep1Submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email) {
      return setError("Please enter your registered Email ID.");
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return setError("Please enter a valid email address.");
    }

    try {
      const response = await forgotPasswordAPI(email);
      if (response && response.success) {
        setForgotStep(2);
        setPassword("");
        setConfirmPassword("");
        toast.info("Verification code accepted. Please set your new password.");
      } else {
        setError(response?.message || "Email address is not registered.");
      }
    } catch (err) {
      console.error(err);
      setError(err.toString());
    }
  };

  const handleForgotStep2Submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!password || !confirmPassword) {
      return setError("Please fill in both password fields.");
    }
    if (password.length < 6) {
      return setError("Password must be at least 6 characters long.");
    }
    if (password !== confirmPassword) {
      return setError("Passwords do not match!");
    }

    try {
      const response = await resetPasswordAPI(email, password);
      if (response && response.success) {
        toast.success("Password reset successfully! Please log in with your new credentials.");
        setActiveTab("login");
        setForgotStep(1);
        setPassword("");
        setConfirmPassword("");
      } else {
        setError(response?.message || "Failed to reset password.");
      }
    } catch (err) {
      console.error(err);
      setError(err.toString());
    }
  };

  const handleCredentialResponse = async (response) => {
    setError("");
    const idToken = response.credential;
    // Read the role from a ref: Google keeps the callback from the render that initialised it.
    const role = LOGIN_ROLES.find((r) => r.id === loginRoleRef.current);
    try {
      toast.info("Verifying Google account... 🔑");
      const res = await googleLoginAPI(idToken, undefined, undefined, role.signup);
      if (res && res.success) {
        const { token, userId } = res.data;
        localStorage.setItem("pharmacy_token", token);

        const profileResponse = await getProfileAPI(userId);
        if (profileResponse && profileResponse.success) {
          const profileData = profileResponse.data;

          const actualRole = LOGIN_ROLES.find((r) => r.id === accountRoleId(profileData));
          if (actualRole.id !== role.id) {
            localStorage.removeItem("pharmacy_token");
            return setError(wrongRoleMessage(actualRole));
          }

          localStorage.setItem("user", JSON.stringify(profileData));
          loginUser(profileData, token);
          toast.success(`Welcome, ${profileData.name || 'User'}! Logged in successfully via Google. 🔓`);

          if (isPage || homeFor(profileData) !== "/home/All") {
            navigate(homeFor(profileData), { replace: true });
          } else {
            onClose();
          }
        } else {
          setError("Failed to retrieve Google profile details.");
        }
      } else {
        setError(res?.message || "Google login failed.");
      }
    } catch (err) {
      console.error("Google ID Token Login error:", err);
      setError(err.toString());
      toast.error("Google authentication failed.");
    }
  };

  const handleGoogleRedirectLogin = async () => {
    try {
      toast.info("Redirecting to Google login...");
      const res = await googleLoginAPI();
      if (res && res.success && res.data?.endpoint) {
        const gatewayUrl = import.meta.env.VITE_API_URL || "http://localhost:8089";
        window.location.href = `${gatewayUrl}${res.data.endpoint}`;
      } else {
        toast.error("Failed to retrieve Google OAuth2 endpoint from server.");
      }
    } catch (err) {
      console.error("Google redirect login error:", err);
      toast.error("Failed to start Google OAuth2 process.");
    }
  };



  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });

        const loginBtn = document.getElementById("googleButtonLogin");
        if (loginBtn) {
          window.google.accounts.id.renderButton(loginBtn, {
            theme: "outline",
            size: "large",
            width: 376,
            text: "signin_with",
            shape: "pill"
          });
        }

        const signupBtn = document.getElementById("googleButtonSignup");
        if (signupBtn) {
          window.google.accounts.id.renderButton(signupBtn, {
            theme: "outline",
            size: "large",
            width: 376,
            text: "signup_with",
            shape: "pill"
          });
        }
      }
    };

    initializeGoogleSignIn();

    const interval = setInterval(() => {
      if (window.google) {
        initializeGoogleSignIn();
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Outer Wrapper styling depending on layout type
  const wrapperStyle = isPage
    ? "min-h-screen w-full bg-slate-50 flex justify-center items-center py-10 px-3 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]"
    : "fixed inset-0 bg-black/60 flex justify-center items-center z-[2000] px-3 backdrop-blur-sm";

  return (
    <div className={wrapperStyle}>
      
      {/* MAIN AUTH CARD (Single clean panel) */}
      <div className="w-[440px] max-w-full bg-white rounded-3xl shadow-2xl p-8 relative animate-fadeIn border border-slate-100">
        
        {/* Close Button (Hidden if rendered as a dedicated landing page) */}
        {!isPage && activeTab !== "signupDetails" && (
          <button
            onClick={onClose}
            className="absolute top-4 right-5 text-gray-400 hover:text-gray-700 text-2xl font-semibold transition"
            aria-label="Close"
          >
            ×
          </button>
        )}

        {/* LOGO AND BRAND HEADER */}
        <div className="text-center mb-6">
          <span className="text-[9px] bg-orange-50 text-orangeBrand border border-orange-100 px-3 py-1 rounded-full uppercase tracking-wider font-black">
            Medical & Healthcare
          </span>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-3">Pharmacy</h1>

        </div>

        {/* ROLE PICKER: who is logging in */}
        {(activeTab === "login" || activeTab === "signup") && (
          <div className="mb-4">
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Log in as">
              {LOGIN_ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={loginRole === r.id}
                  onClick={() => {
                    setLoginRole(r.id);
                    setError("");
                    // Only customers sign up on this card; admins cannot sign up at all.
                    if (r.id !== "customer") setActiveTab("login");
                  }}
                  className={`py-2 text-[11px] font-black rounded-xl border transition ${
                    loginRole === r.id
                      ? "bg-orange-50 border-orangeBrand text-orangeBrand"
                      : "bg-white border-slate-200 text-gray-500 hover:text-gray-800 hover:border-slate-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-2">{selectedRole.hint}</p>
          </div>
        )}

        {/* TAB HEADER SELECTORS */}
        {activeTab !== "forgot" && activeTab !== "signupDetails" ? (
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab("login");
                setError("");
              }}
              className={`flex-1 text-center py-2 text-xs font-black rounded-xl transition ${
                activeTab === "login"
                  ? "bg-white text-orangeBrand shadow"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Login
            </button>
            {loginRole !== "admin" && (
              <button
                type="button"
                onClick={() => {
                  // Vendors and delivery partners apply on the partner sign-up form.
                  if (selectedRole.signup) {
                    navigate(`/partner/register?type=${selectedRole.signup}`);
                    return;
                  }
                  setActiveTab("signup");
                  setError("");
                }}
                className={`flex-1 text-center py-2 text-xs font-black rounded-xl transition ${
                  activeTab === "signup"
                    ? "bg-white text-orangeBrand shadow"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {selectedRole.signup ? "Apply" : "Sign Up"}
              </button>
            )}
          </div>
        ) : activeTab === "forgot" ? (
          <div className="mb-6 border-b border-gray-50 pb-3">
            <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">
              {forgotStep === 1 ? " Forgot Password" : "Reset Password"}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {forgotStep === 1 
                ? "Enter your email to verify account credentials."
                : "Set a secure password for your health account."
              }
            </p>
          </div>
        ) : (
          <div className="mb-6 border-b border-gray-50 pb-3">
            <h2 className="text-sm font-black text-gray-800 tracking-tight uppercase">
              Profile Address
            </h2>
          </div>
        )}

        {/* DYNAMIC FORMS CONTROLLER */}
        <div className="space-y-4">
          
          {/* LOGIN FORM VIEW */}
          {activeTab === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Email ID
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    Password
                  </label>

                </div>
                <input
                  type="password"
                  placeholder="*********"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
               <button
                    type="button"
                    onClick={() => {
                      setActiveTab("forgot");
                      setForgotStep(1);
                      setError("");
                    }}
                    className="text-[10px] font-extrabold text-orangeBrand hover:underline"
                  >
                    Forgot Password?
                  </button>
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              <button
                type="submit"
                className="w-full py-3.5 bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 duration-200 uppercase tracking-wider"
              >
                Log In
              </button>

              {/* Google sign-in for customers, vendors and delivery partners. Hidden (not removed) for admins so the button stays rendered. */}
              <div className={loginRole === "admin" ? "hidden" : ""}>
                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <span className="relative px-3 bg-white text-[10px] text-gray-400 font-extrabold uppercase">or continue with</span>
                </div>

                <div className="w-full flex justify-center mt-2">
                  <div id="googleButtonLogin"></div>
                </div>
              </div>

              {loginRole === "admin" && (
                <p className="text-center text-[11px] text-gray-500 pt-1">
                  Admin accounts are set up by the system and can't be created here.
                </p>
              )}
            </form>
          )}

          {/* SIGN UP FORM VIEW */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Email ID
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Phone No
                </label>
                <div className="flex">
                  <span className="bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl px-3 py-2 text-xs font-bold text-gray-500 flex items-center">
                    +91
                  </span>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={handlePhoneInput}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-r-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Re-type Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              <button
                type="submit"
                className="w-full py-3.5 bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 duration-200 uppercase tracking-wider"
              >
                Create Account
              </button>

              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <span className="relative px-3 bg-white text-[10px] text-gray-400 font-extrabold uppercase">or continue with</span>
              </div>

              <div className="w-full flex justify-center mt-2">
                <div id="googleButtonSignup"></div>
              </div>
            </form>
          )}

          {/* SIGNUP ONBOARDING DETAILS FORM VIEW */}
          {activeTab === "signupDetails" && (
            <form onSubmit={handleDetailsSubmit} className="space-y-3.5 animate-in slide-in-from-right-3">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-2 border border-gray-100 bg-gray-50 rounded-xl text-xs text-gray-400 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={`+91 ${phone}`}
                  disabled
                  className="w-full px-4 py-2 border border-gray-100 bg-gray-50 rounded-xl text-xs text-gray-400 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Delivery Address
                </label>
                <textarea
                  rows="2"
                  placeholder="Flat No, Apartment, Street name, Hyderabad"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  GPS Geolocation
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Not detected"
                    value={geolocation}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-xs bg-slate-50 text-gray-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleGetGeolocation}
                    disabled={detectingGeo}
                    className="px-3.5 bg-orangeBrand hover:bg-orangeBrand-light text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Explore className={detectingGeo ? "animate-spin" : ""} sx={{ fontSize: 16 }} />
                    <span>{detectingGeo ? "GPS..." : "Detect"}</span>
                  </button>
                </div>
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSkipDetails}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-xl shadow-sm transition active:scale-95 duration-200"
                >
                  Skip Onboarding
                </button>
                
                <button
                  type="submit"
                  className="w-full py-3 bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition active:scale-95 duration-200"
                >
                  Complete Onboarding
                </button>
              </div>
            </form>
          )}

          {/* FORGOT PASSWORD FORM STEP 1 */}
          {activeTab === "forgot" && forgotStep === 1 && (
            <form onSubmit={handleForgotStep1Submit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Enter Email ID
                </label>
                <input
                  type="email"
                  placeholder="your-email@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              <button
                type="submit"
                className="w-full py-3.5 bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 duration-200 uppercase tracking-wider"
              >
                Submit Email
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("login");
                  setError("");
                }}
                className="w-full text-center text-xs font-extrabold text-gray-500 hover:text-gray-800 mt-2 block"
              >
                ← Back to Login
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM STEP 2 */}
          {activeTab === "forgot" && forgotStep === 2 && (
            <form onSubmit={handleForgotStep2Submit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="******"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-orangeBrand font-medium"
                />
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              <button
                type="submit"
                className="w-full py-3.5 bg-orangeBrand hover:bg-orangeBrand-light text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 duration-200 uppercase tracking-wider"
              >
                Reset & Save Password
              </button>
            </form>
          )}

        </div>

        {/* Legal T&C footer */}
        <div className="text-[10px] text-gray-400 text-center mt-6 border-t border-gray-50 pt-4">
          By accessing this account, you agree to our <span className="underline cursor-pointer">Terms</span> & <span className="underline cursor-pointer">Privacy</span>.
        </div>

      </div>
    </div>
  );
};

export default Login;