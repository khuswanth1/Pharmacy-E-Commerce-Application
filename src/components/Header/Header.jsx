// src/components/Header/Header.jsx
import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Person, ShoppingCart, LocalPharmacy, LightMode, DarkMode } from "@mui/icons-material";

import SearchBar from "./SearchBar";
import LocationSelector from "./LocationSelector";
import HeaderToggleMenu from "./HeaderToggleMenu";
// import CategorySlider from "./CategorySlider";
import CartBadge from "./CartBadge";
import Login from "../../pages/Auth/Login";
import PrescriptionToggle from "./PrescriptionToggle";
import { useCart } from "../../context/CartContext";
import { AuthContext } from "../../context/AuthContext";
import MiniCart from "../Cart/MiniCart";

const Header = () => {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const { totalCount } = useCart();

  // Signed-in user straight from AuthContext, so logging in or out (or editing the profile)
  // shows in the header immediately instead of after a page reload.
  const { user, logoutUser } = useContext(AuthContext);
  const isLoggedIn = !!user;

  const goTo = (path) => {
    setProfileOpen(false);
    navigate(path);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-white dark:bg-[#0b0f19] shadow-sm z-50 border-b border-gray-200 dark:border-slate-800/80 transition-colors duration-200">
        {/* MAIN TOP BAR */}
        <div className="max-w-8xl mx-auto flex flex-wrap lg:flex-nowrap items-center justify-between px-3 py-2 gap-y-2">
          {/* LOGO */}
          <div
            className="order-1 flex items-center gap-2 cursor-pointer select-none"
            onClick={() => goTo("/")}
          >
            <LocalPharmacy className="text-orangeBrand" sx={{ fontSize: 28 }} />
            <span className="hidden sm:block font-black text-orangeBrand text-xl tracking-tight">
              Pharmacy
            </span>
          </div>

          {/* RESPONSIVE SEARCH BAR */}
          <div className="order-3 lg:order-2 w-full lg:w-auto lg:max-w-xl lg:flex-1 px-1 lg:px-4 lg:mr-auto">
            <SearchBar />
          </div>

          {/* RIGHT BUTTONS */}
          <div className="order-2 lg:order-3 flex items-center gap-3">
            {/* LOCATION */}
            <LocationSelector />

            {/* LOGIN / PROFILE */}
            {!isLoggedIn ? (
              <button
                onClick={() => setLoginOpen(true)} // ⭐ POPUP OPEN HERE
                className="flex items-center gap-1 bg-orangeBrand text-white px-3 py-1.5 rounded-md hover:bg-orangeBrand-light"
              >
                <Person sx={{ fontSize: 18 }} />
                <span className="hidden md:block">Login</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 shadow-sm focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-full border border-orangeBrand/20 overflow-hidden flex items-center justify-center text-orange-600 flex-shrink-0 bg-orange-50 dark:bg-slate-800">
                    {user?.picture ? (
                      <img src={user.picture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <Person sx={{ fontSize: 16 }} />
                    )}
                  </div>
                  <div className="text-left hidden md:flex flex-col select-none max-w-[120px]">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 leading-tight truncate">
                      {user?.name || "Patient"}
                    </span>
                    <span className="text-[9px] text-gray-500 dark:text-slate-400 font-bold leading-none mt-0.5 truncate">
                      {user?.phone || ""}
                    </span>
                  </div>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-11 w-44 bg-white dark:bg-slate-900 shadow-xl rounded-2xl border border-slate-100 dark:border-slate-800 p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* User Mini Info Header inside Dropdown */}
                    <div className="px-3 py-2 border-b border-slate-50 dark:border-slate-850 mb-1 select-none">
                      <div className="text-xs font-black text-slate-900 dark:text-slate-200 truncate">
                        {user?.name || "Patient"}
                      </div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 font-bold truncate mt-0.5">
                        {user?.phone || ""}
                      </div>
                    </div>

                    <button
                      onClick={() => goTo("/profile")}
                      className="block px-3 py-2 w-full text-xs font-bold text-slate-700 dark:text-slate-300 text-left hover:bg-orange-50/50 dark:hover:bg-orange-950/20 hover:text-orangeBrand dark:hover:text-orange-400 rounded-xl transition"
                    >
                      My Account
                    </button>

                    <button
                      onClick={() => goTo("/wishlist")}
                      className="block px-3 py-2 w-full text-xs font-bold text-slate-700 dark:text-slate-300 text-left hover:bg-orange-50/50 dark:hover:bg-orange-950/20 hover:text-orangeBrand dark:hover:text-orange-400 rounded-xl transition"
                    >
                      My Wishlist
                    </button>
                    <button
                      onClick={() => {
                        logoutUser();
                        localStorage.removeItem("user");
                        setProfileOpen(false);
                        navigate("/login", { replace: true });
                      }}
                      className="block px-3 py-2 w-full text-xs font-bold text-red-500 dark:text-red-400 text-left hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition mt-1"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}



            {/* THEME TOGGLE */}
            <button
              onClick={() => setIsDark((prev) => !prev)}
              className="p-1.5 rounded-full hover:bg-slate-100 transition-colors duration-200 text-slate-700 dark:text-slate-200 focus:outline-none"
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? (
                <LightMode sx={{ fontSize: 20 }} className="text-amber-500" />
              ) : (
                <DarkMode sx={{ fontSize: 20 }} className="text-slate-600" />
              )}
            </button>

            {/* CART */}
            <div className="relative">
              <button
                onClick={() => setMiniCartOpen(true)}
                className="flex items-center justify-center p-1.5 text-gray-800 dark:text-slate-200 hover:text-orangeBrand transition duration-200"
                title="Open Cart"
              >
                <ShoppingCart sx={{ fontSize: 22 }} />
              </button>
              <CartBadge count={totalCount} />
            </div>

            {/* PRESCRIPTION BUTTON */}
            <div className="hidden lg:block">
              <PrescriptionToggle />
            </div>
          </div>
        </div>
      </header>

      {/* SPACER BELOW HEADER */}
      <div className="h-[120px] lg:h-[90px]" />

      {/* MOBILE SMALL MENU */}
      <HeaderToggleMenu
        menuOpen={menuOpen}
        closeMenu={() => setMenuOpen(false)}
      />

      {/* LOGIN POPUP OVERLAY */}
      {loginOpen && (
        <div className="fixed inset-0 bg-black/60 z-[999] flex justify-center items-center">
          <Login onClose={() => setLoginOpen(false)} />
        </div>
      )}

      {/* MINI CART SLIDEOUT DRAWER */}
      <MiniCart isOpen={miniCartOpen} onClose={() => setMiniCartOpen(false)} />
    </>
  );
};

export default Header;

