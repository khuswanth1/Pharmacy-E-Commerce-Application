import apiClient from "./apiClient";

/**
 * Next reply from the "Get Help" assistant. The AI key lives on the server; this only sends
 * the conversation. messages: [{ role: "user" | "assistant", content }], ending with the user.
 * Returns the reply text; throws a message that is safe to show.
 */
export const sendSupportMessage = async (messages) => {
  try {
    const res = await apiClient.post("/api/orders/support/chat", { messages });
    return res?.data?.data?.reply || "";
  } catch (error) {
    throw error.response?.data?.message || "Couldn't reach the help assistant. Check your connection and try again.";
  }
};
