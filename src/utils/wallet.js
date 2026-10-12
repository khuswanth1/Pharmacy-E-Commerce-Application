import { getProfileAPI } from "../api/authService";

/**
 * Reloads the signed-in user's profile (including the wallet balance, which only the server
 * changes) and saves it where the app keeps the user. Returns the profile, or null on failure.
 */
export const syncUserFromServer = async (userId, setUser) => {
  if (!userId) return null;
  try {
    const res = await getProfileAPI(userId);
    if (!res?.success) return null;
    const stored = JSON.parse(localStorage.getItem("pharmacy_user") || localStorage.getItem("user") || "{}");
    const merged = { ...stored, ...res.data };
    localStorage.setItem("pharmacy_user", JSON.stringify(merged));
    localStorage.setItem("user", JSON.stringify(merged));
    window.dispatchEvent(new Event("storage"));
    if (setUser) setUser(merged);
    return merged;
  } catch (e) {
    return null;
  }
};
