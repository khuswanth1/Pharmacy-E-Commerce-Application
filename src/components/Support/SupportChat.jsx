import React, { useEffect, useRef, useState } from "react";
import { Close, Send, SupportAgent } from "@mui/icons-material";
import { sendSupportMessage } from "../../api/supportService";

/** Same #code the rest of the app shows: last 8 characters of the order id, upper-case. */
const orderCode = (id) => String(id || "").slice(-8).toUpperCase();

const QUICK_QUESTIONS = ["Where is my order?", "Can I cancel my order?", "How do refunds work?", "What is the delivery code?"];

/** The assistant is asked for plain text; this drops any stray markdown bold it still adds. */
const plain = (text) => String(text || "").replace(/\*\*(.+?)\*\*/g, "$1");

/**
 * "Get Help" chat. Talks to the server-side assistant (/api/orders/support/chat), which already
 * knows this customer's recent orders. `order` (optional) is the order the customer opened it from.
 */
const SupportChat = ({ open, onClose, order }) => {
  const greeting = order
    ? `Hi! I can help with order #${orderCode(order.id)} or anything else about your orders. What do you need?`
    : "Hi! I'm the pharmacy help assistant. Ask me about your orders, delivery, payments or refunds.";

  const [messages, setMessages] = useState([{ role: "assistant", content: greeting }]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // A new order gets a fresh conversation.
  useEffect(() => {
    setMessages([{ role: "assistant", content: greeting }]);
    setError("");
    setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const send = async (text) => {
    const content = text.trim();
    if (!content || sending) return;
    // Mention the order the chat was opened from, so "my order" has a clear meaning.
    const asked = order && messages.length === 1 ? `${content} (about order #${orderCode(order.id)})` : content;
    const next = [...messages, { role: "user", content: asked, shown: content }];
    setMessages(next);
    setDraft("");
    setError("");
    setSending(true);
    try {
      const reply = await sendSupportMessage(next.map(({ role, content: c }) => ({ role, content: c })));
      setMessages((m) => [...m, { role: "assistant", content: plain(reply) || "Sorry, I didn't catch that. Could you ask again?" }]);
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Help chat"
        className="fixed z-[1101] inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 w-full sm:w-[400px] h-[85vh] sm:h-[600px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-full bg-[#d6335c] text-white flex items-center justify-center shrink-0">
            <SupportAgent sx={{ fontSize: 20 }} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <h2 className="text-sm font-black text-slate-800">Pharmacy help</h2>
            <p className="text-[10px] text-slate-500 truncate">
              {order ? `About order #${orderCode(order.id)} · ` : ""}AI assistant, can make mistakes
            </p>
          </div>
          <button onClick={onClose} aria-label="Close help chat"
            className="p-2 rounded-full text-slate-500 hover:bg-slate-100 transition">
            <Close sx={{ fontSize: 20 }} />
          </button>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap text-left text-[13px] leading-relaxed px-3.5 py-2.5 rounded-2xl ${
                m.role === "user"
                  ? "bg-orangeBrand text-white rounded-br-md"
                  : "bg-slate-100 text-slate-800 rounded-bl-md"
              }`}>
                {m.shown || m.content}
              </p>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start" aria-label="Assistant is typing">
              <span className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </div>
          )}

          {messages.length === 1 && !sending && (
            <div className="flex flex-wrap gap-2 pt-1">
              {QUICK_QUESTIONS.map((q) => (
                <button key={q} onClick={() => send(q)}
                  className="text-[11px] font-bold text-[#d6335c] border border-rose-200 bg-rose-50 rounded-full px-3 py-1.5 hover:bg-rose-100 transition dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-400/30 dark:hover:bg-rose-500/20">
                  {q}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="text-[12px] text-left text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 dark:text-rose-200 dark:bg-rose-500/10 dark:border-rose-400/30">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(draft); }}
          className="flex items-end gap-2 px-3 py-3 border-t border-slate-100"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); }
            }}
            placeholder="Type your question…"
            aria-label="Your message"
            className="flex-1 resize-none max-h-28 px-3.5 py-2.5 border border-slate-200 rounded-2xl text-[13px] focus:outline-none focus:ring-1 focus:ring-orangeBrand"
          />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Send"
            className="w-10 h-10 shrink-0 rounded-full bg-orangeBrand text-white flex items-center justify-center transition disabled:opacity-40 active:scale-95">
            <Send sx={{ fontSize: 18 }} />
          </button>
        </form>
      </section>
    </>
  );
};

export default SupportChat;
