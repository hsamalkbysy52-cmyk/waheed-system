"use client";
import { useState, useEffect, useCallback } from "react";
import { BillModal } from "@/components/BillModal";

const API = "https://waheed-system-production.up.railway.app";

type RawItem = { name: string; price: number; category: string };
type AggItem = { name: string; price: number; category: string; qty: number };
type Order   = { id: number; table_number: number; total_price: number; status: string; created_at: string; items: RawItem[]; notes: string; cashier: string; payment_method?: string | null; };

const CAT_EMOJI: Record<string, string> = {
  "برجر": "🍔", "بيتزا": "🍕", "مشروبات": "🥤",
  "حلويات": "🍰", "مقبلات": "🥗", "رئيسية": "🍽️", "وجبات": "🍽️",
};
const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🍴";

function aggregate(items: RawItem[]): AggItem[] {
  const m: Record<string, AggItem> = {};
  for (const i of items) {
    if (m[i.name]) m[i.name].qty++;
    else m[i.name] = { ...i, qty: 1 };
  }
  return Object.values(m);
}

/* ─────────────────────────── Page ─────────────────────────── */
export default function PaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoad]  = useState(true);
  const [active, setActive] = useState<Order | null>(null);
  const [tab, setTab]       = useState<"pending" | "done">("pending");

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/orders`);
      const d = await r.json();
      setOrders(d.orders || []);
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const pending = orders.filter(o => !o.payment_method && ["preparing", "ready", "served", "pending"].includes(o.status));
  const done    = orders.filter(o => o.status === "done" || !!o.payment_method);
  const revenue = done.reduce((s, o) => s + o.total_price, 0);
  const display = tab === "pending" ? pending : done;

  return (
    <div style={{ padding: "24px", background: "var(--bg)", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text)", fontSize: "20px", fontWeight: "700" }}>💳 المدفوعات</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${pending.length} طلب بانتظار الدفع`}
          </p>
        </div>
        <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "var(--gold)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
          🔄 تحديث
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "بانتظار الدفع", value: pending.length,                    color: "var(--gold)", icon: "⏳" },
          { label: "مدفوعة",        value: done.length,                        color: "var(--green)", icon: "✅" },
          { label: "إجمالي اليوم",  value: `${revenue.toLocaleString()} د.ع`, color: "var(--gold)", icon: "💰" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--surface)", border: `1px solid ${s.color}20`, borderRadius: "14px", padding: "14px 18px" }}>
            <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
            <div style={{ color: s.color, fontSize: "22px", fontWeight: "800" }}>{s.value}</div>
            <div style={{ color: "var(--muted)", fontSize: "12px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["pending", "done"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 22px", borderRadius: "12px", cursor: "pointer", fontSize: "13px",
            fontWeight: tab === t ? "700" : "400",
            background: tab === t ? "rgba(245,158,11,0.15)" : "var(--surface)",
            color: tab === t ? "var(--gold)" : "var(--muted)",
            border: `1px solid ${tab === t ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
          }}>
            {t === "pending" ? `⏳ بانتظار الدفع (${pending.length})` : `✅ مدفوعة (${done.length})`}
          </button>
        ))}
      </div>

      {/* Order cards */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: "80px" }}>⏳ جاري التحميل...</div>
      ) : display.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px" }}>
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>{tab === "pending" ? "🎉" : "📋"}</div>
          <div style={{ color: "var(--text2)", fontSize: "15px" }}>{tab === "pending" ? "لا توجد طلبات بانتظار الدفع" : "لا توجد مدفوعات بعد"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
          {display.map(order => {
            const aggItems = aggregate(order.items ?? []);
            return (
              <div key={order.id} style={{
                background: "var(--surface)",
                border: `1px solid ${tab === "pending" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.15)"}`,
                borderRadius: "16px", padding: "18px",
                borderRight: `4px solid ${tab === "pending" ? "var(--gold)" : "var(--green)"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ color: "var(--text)", fontWeight: "700", fontSize: "15px" }}>طلب #{order.id}</div>
                    <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "2px" }}>🪑 طاولة {order.table_number}</div>
                  </div>
                  <span style={{
                    background: tab === "pending" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.1)",
                    color: tab === "pending" ? "var(--gold)" : "var(--green)",
                    border: `1px solid ${tab === "pending" ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.25)"}`,
                    borderRadius: "8px", padding: "3px 10px", fontSize: "11px", fontWeight: "700",
                  }}>
                    {tab === "pending" ? "⏳ معلق" : "✅ مدفوع"}
                  </span>
                </div>

                {aggItems.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    {aggItems.slice(0, 3).map((it, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ color: "var(--text2)", fontSize: "12px" }}>
                          {catEmoji(it.category)} {it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}
                        </span>
                        <span style={{ color: "var(--gold)", fontSize: "12px", fontWeight: "600" }}>
                          {(it.price * it.qty).toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span>
                        </span>
                      </div>
                    ))}
                    {aggItems.length > 3 && (
                      <div style={{ color: "var(--muted)", fontSize: "11px" }}>+{aggItems.length - 3} أصناف أخرى</div>
                    )}
                  </div>
                )}

                {order.notes && (
                  <div style={{ background: "rgba(245,158,11,0.06)", borderRadius: "7px", padding: "5px 8px", fontSize: "11px", color: "var(--text2)", marginBottom: "10px" }}>
                    📝 {order.notes}
                  </div>
                )}

                <div style={{ color: "var(--gold)", fontSize: "20px", fontWeight: "800", marginBottom: "10px" }}>
                  {order.total_price.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: "400" }}>د.ع</span>
                </div>

                <div style={{ color: "var(--muted)", fontSize: "11px", marginBottom: tab === "pending" ? "14px" : "0" }}>
                  🕐 {new Date(order.created_at).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}
                </div>

                {tab === "pending" && (
                  <button onClick={() => setActive(order)} style={{
                    width: "100%", padding: "11px",
                    background: "linear-gradient(135deg,#f59e0b,#d97706)",
                    color: "#000", border: "none", borderRadius: "12px",
                    cursor: "pointer", fontSize: "13px", fontWeight: "800",
                    boxShadow: "0 4px 14px rgba(245,158,11,0.3)",
                  }}>
                    💳 عرض الفاتورة والدفع
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {active && <BillModal order={active} onClose={() => setActive(null)} onPaid={fetchOrders} />}
    </div>
  );
}
