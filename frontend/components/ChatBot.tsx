"use client";
import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

const RAILWAY = "https://waheed-system-production.up.railway.app";

type Msg = { role: "user" | "assistant"; content: string };
type OrderProposal = { table: number; items: { name: string; quantity: number; price?: number }[] };

const SUGGESTIONS = ["شو في المنيو؟", "وش تنصحني للغداء؟", "عندكم شي بدون غلوتين؟"];

function parseOrderProposal(text: string): { display: string; proposal: OrderProposal | null } {
  const match = text.match(/__ORDER__([\s\S]+?)__END__/);
  if (!match) return { display: text, proposal: null };
  try {
    const proposal: OrderProposal = JSON.parse(match[1]);
    return { display: text.replace(/__ORDER__[\s\S]+?__END__/, "").trim(), proposal };
  } catch {
    return { display: text.replace(/__ORDER__[\s\S]+?__END__/, "").trim(), proposal: null };
  }
}

export default function ChatBot() {
  const [open, setOpen]   = useState(false);
  const [msgs, setMsgs]   = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoad] = useState(false);
  const [placing, setPlacing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const menu      = useStore(s => s.menu);
  const fetchMenu = useStore(s => s.fetchMenu);

  // Fetch menu once when the chat is first opened
  useEffect(() => {
    if (open && menu.length === 0) fetchMenu().catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const menuText = menu
    .filter((i) => i.available)
    .map((i) => `${i.name}: ${i.price.toLocaleString()} د.ع (${i.category})`)
    .join("\n");

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    const next: Msg[] = [...msgs, { role: "user", content: msg }];
    setMsgs(next);
    setInput("");
    setLoad(true);
    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, menuText }),
      });
      const data = await res.json();
      setMsgs([...next, { role: "assistant", content: data.reply || data.error || "عذراً، حدث خطأ." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "⚠️ تعذر الاتصال. تحقق من الإنترنت." }]);
    }
    setLoad(false);
  };

  const confirmOrder = async (proposal: OrderProposal) => {
    setPlacing(true);
    try {
      const r = await fetch(`${RAILWAY}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_number: proposal.table,
          items: proposal.items,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const orderId = d.order_id || d.id || "—";
        setMsgs((p) => [
          ...p,
          { role: "assistant", content: `✅ تم تأكيد الطلب رقم #${orderId} للطاولة ${proposal.table}. بالعافية! 🎉` },
        ]);
      } else {
        setMsgs((p) => [...p, { role: "assistant", content: "❌ فشل إنشاء الطلب. حاول مجدداً." }]);
      }
    } catch {
      setMsgs((p) => [...p, { role: "assistant", content: "⚠️ تعذر الاتصال بالسيرفر." }]);
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
              <div style={{ color: "var(--muted)", fontSize: "11px" }}>مدعوم بـ GPT-4o ✨</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {msgs.length === 0 && (
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

            {msgs.map((m, i) => {
              const { display, proposal } = m.role === "assistant" ? parseOrderProposal(m.content) : { display: m.content, proposal: null };
              return (
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
                      {display}
                    </div>
                  </div>

                  {/* Order confirmation button */}
                  {proposal && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                      <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "14px", padding: "12px 14px", maxWidth: "84%" }}>
                        <div style={{ color: "var(--text2)", fontSize: "11px", marginBottom: "8px" }}>📋 الطاولة {proposal.table} • {proposal.items.length} صنف</div>
                        {proposal.items.map((it, j) => (
                          <div key={j} style={{ color: "var(--text)", fontSize: "12px", marginBottom: "3px" }}>• {it.name} ×{it.quantity}</div>
                        ))}
                        <button
                          onClick={() => confirmOrder(proposal)}
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
              );
            })}

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
