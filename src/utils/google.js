// Google Identity Services helpers (the GSI script is loaded in index.html).

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || "433619936564-onv1plu11f7lecb6rm3bov85j6qj2jq4.apps.googleusercontent.com";

/**
 * Reads name/email/picture from a Google ID token, for display only.
 * The backend verifies the token itself; never trust these values for auth.
 */
export const decodeGoogleCredential = (credential) => {
  try {
    const part = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(part).split("").map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
    );
    const { name, email, picture } = JSON.parse(json);
    return { name, email, picture };
  } catch (e) {
    return {};
  }
};
