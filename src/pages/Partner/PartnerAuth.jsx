import React, { useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { getProfileAPI } from "../../api/authService";
import { registerPartnerAPI, getMyPartnerProfile } from "../../api/partnerService";
import { homeFor, hasRole, isPartner, ROLES } from "../../utils/roles";
import { GOOGLE_CLIENT_ID, decodeGoogleCredential } from "../../utils/google";
import { Button, Field, inputClass, refreshSession } from "../../components/Portal/PortalUI";

const Shell = ({ title, subtitle, children }) => (
  <div className="min-h-full bg-slate-50 flex items-start sm:items-center justify-center px-4 py-8">
    <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-card p-6 sm:p-8">
      <span className="text-[9px] bg-orange-50 text-orangeBrand border border-orange-100 px-3 py-1 rounded-full uppercase tracking-wider font-black">
        Partner portal
      </span>
      <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{title}</h1>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  </div>
);

const ErrorText = ({ children }) =>
  children ? <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{children}</p> : null;

/** Signs in with a token and loads the profile into AuthContext. */
const startSession = async (token, userId, loginUser) => {
  localStorage.setItem("pharmacy_token", token);
  const profile = await getProfileAPI(userId);
  if (!profile?.success) throw "Could not load your profile.";
  localStorage.setItem("user", JSON.stringify(profile.data));
  loginUser(profile.data, token);
  return profile.data;
};

// -------------------------------------------------------------- Register

const VENDOR_FIELDS = [
  { key: "businessName", label: "Store name", required: true },
  { key: "drugLicenseNumber", label: "Drug licence number", required: true },
  { key: "gstin", label: "GSTIN" },
];
const DELIVERY_FIELDS = [
  { key: "vehicleType", label: "Vehicle type", required: true, options: ["Bike", "Scooter", "Bicycle", "Car"] },
  { key: "vehicleNumber", label: "Vehicle number" },
  { key: "drivingLicenseNumber", label: "Driving licence number", required: true },
];

/** Renders Google's "Sign up with Google" button and reports the credential. */
const GoogleSignUpButton = ({ onCredential }) => {
  const container = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    const render = () => {
      if (!window.google || !container.current) return false;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => callback.current(response.credential),
      });
      window.google.accounts.id.renderButton(container.current, {
        theme: "outline", size: "large", text: "signup_with", shape: "pill",
        width: Math.min(container.current.offsetWidth || 360, 400),
      });
      return true;
    };
    if (render()) return undefined;
    // The GSI script loads async; retry until it is ready.
    const t = setInterval(() => { if (render()) clearInterval(t); }, 500);
    return () => clearInterval(t);
  }, []);

  return <div ref={container} className="w-full flex justify-center min-h-[44px]" />;
};

export const PartnerRegister = () => {
  const { loginUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const initialType = new URLSearchParams(window.location.search).get("type") === "DELIVERY" ? "DELIVERY" : "VENDOR";
  const [type, setType] = useState(initialType);
  const [form, setForm] = useState({ vehicleType: "Bike" });
  // Set once the applicant signs up with Google: { idToken, name, email, picture }
  const [google, setGoogle] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const extraFields = type === "VENDOR" ? VENDOR_FIELDS : DELIVERY_FIELDS;

  const handleGoogleCredential = (credential) => {
    const profile = decodeGoogleCredential(credential);
    setGoogle({ idToken: credential, ...profile });
    setForm((f) => ({ ...f, name: profile.name || f.name, email: profile.email || "" }));
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const required = [
      ["name", "Full name"], ["phone", "Phone"],
      ...(google ? [] : [["email", "Email"], ["password", "Password"]]),
      ...extraFields.filter((f) => f.required).map((f) => [f.key, f.label]),
    ];
    const missing = required.find(([k]) => !String(form[k] || "").trim());
    if (missing) return setError(`${missing[1]} is required.`);
    if (!/^\d{10}$/.test(form.phone)) return setError("Enter a 10-digit phone number.");
    if (!google && form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (!google && form.password !== form.confirmPassword) return setError("Passwords do not match.");

    setBusy(true);
    try {
      const { confirmPassword, ...payload } = form;
      const fields = type === "VENDOR" ? VENDOR_FIELDS : DELIVERY_FIELDS;
      const other = (type === "VENDOR" ? DELIVERY_FIELDS : VENDOR_FIELDS).map((f) => f.key);
      other.forEach((k) => delete payload[k]);
      fields.forEach((f) => { if (payload[f.key] === "") delete payload[f.key]; });
      if (google) {
        // Name and email come from the verified Google account on the server.
        delete payload.password;
        payload.googleIdToken = google.idToken;
      }
      const { token, userId } = await registerPartnerAPI({ ...payload, type });
      await startSession(token, userId, loginUser);
      navigate("/partner/pending", { replace: true });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={type === "VENDOR" ? "Register your pharmacy" : "Become a delivery partner"}
      subtitle="An admin reviews every application. You can sign in to check its status."
    >
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-5">
        {[["VENDOR", "Pharmacy vendor"], ["DELIVERY", "Delivery partner"]].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${type === value ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {google ? (
        <div className="mb-5 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3">
          {google.picture && <img src={google.picture} alt="" className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 truncate">Signing up with Google</p>
            <p className="text-[11px] text-slate-500 truncate">{google.email}</p>
          </div>
          <button type="button" className="text-[11px] font-bold text-orangeBrand"
            onClick={() => { setGoogle(null); setForm((f) => ({ ...f, email: "" })); }}>
            Use email instead
          </button>
        </div>
      ) : (
        <div className="mb-5">
          <GoogleSignUpButton onCredential={handleGoogleCredential} />
          <div className="relative mt-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <span className="relative px-3 bg-white text-[10px] text-slate-400 font-black uppercase">or sign up with email</span>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name *"><input className={inputClass} value={form.name || ""} onChange={set("name")} /></Field>
          <Field label="Phone *">
            <input className={inputClass} inputMode="numeric" value={form.phone || ""}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} />
          </Field>
          {!google && (
            <Field label="Email *"><input className={inputClass} type="email" value={form.email || ""} onChange={set("email")} /></Field>
          )}
          <Field label="City"><input className={inputClass} value={form.city || ""} onChange={set("city")} /></Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extraFields.map((f) => (
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
          <Field label="Pincode">
            <input className={inputClass} inputMode="numeric" value={form.pincode || ""}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
          </Field>
        </div>

        <Field label={type === "VENDOR" ? "Store address" : "Home address"}>
          <textarea className={inputClass} rows={2} value={form.businessAddress || ""} onChange={set("businessAddress")} />
        </Field>

        {!google && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Password *"><input className={inputClass} type="password" value={form.password || ""} onChange={set("password")} autoComplete="new-password" /></Field>
          <Field label="Confirm password *"><input className={inputClass} type="password" value={form.confirmPassword || ""} onChange={set("confirmPassword")} autoComplete="new-password" /></Field>
        </div>}

        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full py-3 text-sm">{busy ? "Submitting…" : "Submit application"}</Button>
      </form>
      <p className="mt-5 text-xs text-slate-500 text-center">
        Already registered? <Link to="/login" className="font-bold text-orangeBrand">Sign in</Link>
      </p>
    </Shell>
  );
};

// --------------------------------------------------------------- Pending

const STATUS_COPY = {
  PENDING: {
    title: "Application under review",
    body: "An admin is checking your details. This page updates once you're approved.",
    tone: "bg-amber-50 border-amber-200 text-amber-800",
  },
  REJECTED: {
    title: "Application not approved",
    body: "Your application was not approved. See the reason below, then contact support if you think this is a mistake.",
    tone: "bg-rose-50 border-rose-200 text-rose-800",
  },
  SUSPENDED: {
    title: "Account suspended",
    body: "Your partner account is suspended. See the reason below.",
    tone: "bg-rose-50 border-rose-200 text-rose-800",
  },
};

export const PartnerPending = () => {
  const { user, loginUser, logoutUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const check = React.useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const profile = await refreshSession(loginUser);
      if (profile.partnerStatus === "APPROVED") {
        navigate(homeFor(profile), { replace: true });
        return;
      }
      const partner = await getMyPartnerProfile();
      setNote(partner?.reviewNote || "");
      setMessage("Still waiting for approval.");
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(false);
    }
  }, [loginUser, navigate]);

  React.useEffect(() => {
    if (user && isPartner(user)) check();
    // Check once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return <Navigate to="/login" replace />;
  if (!isPartner(user)) return <Navigate to={homeFor(user)} replace />;
  if (user.partnerStatus === "APPROVED") return <Navigate to={homeFor(user)} replace />;

  const copy = STATUS_COPY[user.partnerStatus] || STATUS_COPY.PENDING;
  const roleLabel = hasRole(user, ROLES.VENDOR) ? "pharmacy vendor" : "delivery partner";

  return (
    <Shell title={`Hi ${user.name?.split(" ")[0] || "there"}`} subtitle={`Your ${roleLabel} account`}>
      <div className={`border rounded-2xl p-4 ${copy.tone}`}>
        <p className="text-sm font-black">{copy.title}</p>
        <p className="text-xs mt-1">{copy.body}</p>
        {note && user.partnerStatus !== "PENDING" && <p className="text-xs mt-2"><b>Reason:</b> {note}</p>}
      </div>
      {message && <p className="text-[11px] text-slate-500 mt-3">{message}</p>}
      <div className="mt-5 flex gap-2">
        <Button onClick={check} disabled={busy} className="flex-1 py-2.5">{busy ? "Checking…" : "Check status"}</Button>
        <Button variant="outline" onClick={() => { logoutUser(); localStorage.removeItem("user"); navigate("/login"); }}>
          Log out
        </Button>
      </div>
    </Shell>
  );
};
