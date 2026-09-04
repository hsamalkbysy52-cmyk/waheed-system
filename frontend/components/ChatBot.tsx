"use client";
import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/apiFetch";
import { formatMoney } from "@/lib/money";

type Msg = { role: "user" | "assistant"; content: string };
type OrderProposalItem = { name: string; quantity: number; price: number };
type OrderProposal = { table: number | null; items: OrderProposalItem[]; total: number };
/** One turn in the conversation, with an optional Order proposal attached to it. */
type ChatTurn = Msg & { proposal?: OrderProposal | null };

const SUGGESTIONS = ["شو في المنيو؟", "وش تنصحني للغداء؟", "عندكم شي بدون غلوتين؟"];

export default function ChatBot() {
  const [open, setOpen]   = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoad] = useState(false);
  const [placing, setPlacing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // One id per widget session — lets the backend remember this conversation (and any table it
  // learns) for two hours. The widget itself has no table input, so table_number is always null;
  // the agent extracts it from the conversation.
  const conversationId = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    const nextMsgs: Msg[] = [...turns.map(({ role, content }) => ({ role, content })), { role: "user", content: msg }];
    setTurns((p) => [...p, { role: "user", content: msg }]);
    setInput("");
    setLoad(true);
    try {
      const res = await authFetch("/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMsgs,
          table_number: null,
          conversation_id: conversationId.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTurns((p) => [...p, { role: "assistant", content: data.error || data.detail || "عذراً، حدث خطأ." }]);
      } else {
        setTurns((p) => [...p, { role: "assistant", content: data.reply || "عذراً، حدث خطأ.", proposal: data.order_proposal ?? null }]);
      }
    } catch {
      setTurns((p) => [...p, { role: "assistant", content: "⚠️ تعذر الاتصال. تحقق من الإنترنت." }]);
    }
    setLoad(false);
  };

  const confirmOrder = async (proposal: OrderProposal) => {
    setPlacing(true);
    try {
      const r = await authFetch("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_number: proposal.table,
          items: proposal.items.map(({ name, quantity }) => ({ name, quantity })),
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const orderId = d.order_id ?? d.id ?? "—";
        const forTable = proposal.table != null ? ` للطاولة ${proposal.table}` : "";
        setTurns((p) => [
          ...p,
          { role: "assistant", content: `✅ تم تأكيد الطلب رقم #${orderId}${forTable}. بالعافية! 🎉` },
        ]);
      } else {
        setTurns((p) => [...p, { role: "assistant", content: "❌ فشل إنشاء الطلب. حاول مجدداً." }]);
      }
    } catch {
      setTurns((p) => [...p, { role: "assistant", content: "⚠️ تعذر الاتصال بالسيرفر." }]);
    }
    setPlacing(false);
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", bottom: "28px", left: "28px",
          width: "60px", height: "60px", borderRadius: "50%",
          background: open ? "var(--raised)" : "linear-gradient(135deg,#f59e0b,#d97706)",
          color: "white", border: open ? "1px solid #252535" : "none",
          cursor: "pointer", fontSize: "26px", zIndex: 1000,
          boxShadow: open ? "0 4px 16px rgba(0,0,0,0.4)" : "0 8px 28px rgba(245,158,11,0.5)",
          transition: "all 0.2s",
        }}
        title="مساعد Waheed"
      >
        {open ? "✕" : "🤖"}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: "104px", left: "28px",
          width: "340px", height: "520px",
          background: "var(--surface)", border: "1px solid #252535",
          borderRadius: "20px", zIndex: 1000,
          display: "flex", flexDirection: "column",
          boxShadow: "0 28px 70px rgba(0,0,0,0.8)",
          direction: "rtl", overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.05)", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <span style={{ fontSize: "28px" }}>🤖</span>
            <div>
              <div style={{ color: "var(--gold)", fontWeight: "700", fontSize: "15px" }}>مساعد Waheed</div>
              <div style={{ color: "var(--muted)", fontSize: "11px" }}>مدعوم بالذكاء الاصطناعي ✨</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {turns.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", marginTop: "24px" }}>
                <div style={{ fontSize: "38px", marginBottom: "10px" }}>👋</div>
                <p style={{ fontSize: "13px", marginBottom: "16px" }}>أهلاً! كيف أقدر أساعدك؟</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} style={{ padding: "8px 14px", background: "var(--card)", border: "1px solid #252535", borderRadius: "20px", color: "var(--text2)", cursor: "pointer", fontSize: "12px" }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((m, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{
                    maxWidth: "84%", padding: "10px 14px", borderRadius: "16px",
                    fontSize: "13px", lineHeight: "1.6",
                    background: m.role === "user" ? "rgba(245,158,11,0.1)" : "var(--raised)",
                    color: "var(--text)",
                    border: `1px solid ${m.role === "user" ? "rgba(245,158,11,0.25)" : "var(--border)"}`,
                    borderBottomRightRadius: m.role === "user" ? "4px" : "16px",
                    borderBottomLeftRadius:  m.role === "assistant" ? "4px" : "16px",
                    whiteSpace: "pre-wrap",
                  }}>
                    {m.content}
                  </div>
                </div>

                {/* Order confirmation card */}
                {m.proposal && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                    <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "14px", padding: "12px 14px", maxWidth: "84%" }}>
                      <div style={{ color: "var(--text2)", fontSize: "11px", marginBottom: "8px" }}>
                        📋 {m.proposal.table != null ? `الطاولة ${m.proposal.table} • ` : ""}{m.proposal.items.length} صنف
                      </div>
                      {m.proposal.items.map((it, j) => (
                        <div key={j} style={{ color: "var(--text)", fontSize: "12px", marginBottom: "3px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
                          <span>• {it.name} ×{it.quantity}</span>
                          <span style={{ color: "var(--gold)" }}>{formatMoney(it.price * it.quantity)}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(34,197,94,0.2)", color: "var(--text)", fontSize: "12px", fontWeight: "700" }}>
                        <span>الإجمالي</span>
                        <span style={{ color: "var(--gold)" }}>{formatMoney(m.proposal.total)}</span>
                      </div>
                      <button
                        onClick={() => confirmOrder(m.proposal!)}
                        disabled={placing}
                        style={{
                          marginTop: "10px", width: "100%", padding: "9px",
                          background: placing ? "var(--border)" : "rgba(34,197,94,0.15)",
                          color: placing ? "var(--muted)" : "var(--green)",
                          border: `1px solid ${placing ? "var(--border)" : "rgba(34,197,94,0.35)"}`,
                          borderRadius: "10px", cursor: placing ? "not-allowed" : "pointer",
                          fontSize: "13px", fontWeight: "700",
                        }}
                      >
                        {placing ? "⏳ جاري الإرسال..." : "✅ تأكيد الطلب"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: "var(--raised)", border: "1px solid #252535", borderRadius: "16px", borderBottomLeftRadius: "4px", padding: "10px 16px", color: "var(--muted)", fontSize: "13px" }}>
                  ⏳ يفكر...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #252535", display: "flex", gap: "8px", flexShrink: 0 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="اكتب سؤالك..."
              style={{ flex: 1, padding: "10px 14px", background: "var(--bg)", border: "1px solid #252535", borderRadius: "12px", color: "white", fontSize: "13px" }}
            />
            <button
              onClick={() => send()}
              disabled={loading}
              style={{ padding: "10px 16px", background: loading ? "var(--border)" : "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: "12px", cursor: loading ? "not-allowed" : "pointer", fontSize: "18px" }}
            >←</button>
          </div>
        </div>
      )}
    </>
  );
}
