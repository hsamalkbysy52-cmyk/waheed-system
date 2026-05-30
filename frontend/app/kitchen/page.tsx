"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type RawItem = { name: string; price: number; category: string };
type Order = { id: number; table_number: number; status: string; created_at: string; items?: RawItem[] };

const CAT_EMOJI: Record<string, string> = {
  "برجر": "🍔", "بيتزا": "🍕", "مشروبات": "🥤",
  "حلويات": "🍰", "مقبلات": "🥗", "رئيسية": "🍽️", "وجبات": "🍽️", "باستا": "🍝",
};
const catEmoji = (name: string, cat: string) => CAT_EMOJI[name] ?? CAT_EMOJI[cat] ?? "🍴";

function aggregateItems(items: RawItem[]) {
  const map: Record<string, { name: string; category: string; qty: number }> = {};
  for (const it of items) {
    if (map[it.name]) map[it.name].qty++;
    else map[it.name] = { name: it.name, category: it.category, qty: 1 };
  }
  return Object.values(map);
}

function aggregateAll(orders: Order[]) {
  const map: Record<string, { name: string; category: string; qty: number }> = {};
  for (const order of orders) {
    for (const it of order.items ?? []) {
      if (map[it.name]) map[it.name].qty++;
      else map[it.name] = { name: it.name, category: it.category, qty: 1 };
    }
  }
  return Object.values(map).sort((a, b) => b.qty - a.qty);
}

function elapsed(created_at: string, now: number) {
  const s = created_at.endsWith("Z") || created_at.includes("+") ? created_at : created_at + "Z";
  const ms = now - new Date(s).getTime();
  const m  = Math.max(0, Math.floor(ms / 60000));
  const sc = Math.floor((Math.max(0, ms) % 60000) / 1000);
  return { label: `${m}:${sc.toString().padStart(2, "0")}`, mins: m };
}

function urgencyColor(mins: number) {
  if (mins < 5)  return { bg: "rgba(34,197,94,0.08)",  border: "#22c55e", badge: "rgba(34,197,94,0.15)",  text: "#22c55e",  tag: "عادي"   };
  if (mins < 15) return { bg: "rgba(249,115,22,0.08)", border: "#f97316", badge: "rgba(249,115,22,0.15)", text: "#f97316",  tag: "عاجل"   };
  return             { bg: "rgba(239,68,68,0.08)",  border: "#ef4444", badge: "rgba(239,68,68,0.15)",  text: "#ef4444",  tag: "⚠️ متأخر" };
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow]       = useState(Date.now());
  const [loading, setLoad]  = useState(true);
  const [marking, setMarking] = useState<Set<number>>(new Set());

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/orders`);
      const d = await r.json();
      const pending = (d.orders || []).filter((o: Order) => o.status === "pending");
      pending.sort((a: Order, b: Order) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setOrders(pending);
    } finally { setLoad(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const refresh = setInterval(fetchOrders, 15000);
    const tick    = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [fetchOrders]);

  const markReady = async (id: number) => {
    setMarking(p => new Set(p).add(id));
    try {
      await fetch(`${API}/orders/${id}/done`, { method: "PUT" });
      setOrders(p => p.filter(o => o.id !== id));
    } finally {
      setMarking(p => { const s = new Set(p); s.delete(id); return s; });
    }
  };

  const urgentCount = orders.filter(o => elapsed(o.created_at, now).mins >= 15).length;
  const totals = aggregateAll(orders);

  return (
    <div style={{ padding: "24px", background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>🍳 شاشة المطبخ</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${orders.length} طلب قيد التحضير${urgentCount ? ` • ${urgentCount} متأخر` : ""} • يتحدث كل 15 ثانية`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {urgentCount > 0 && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "7px 14px", color: "#ef4444", fontSize: "13px", fontWeight: "700" }}>
              ⚠️ {urgentCount} طلب متأخر
            </div>
          )}
          <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            🔄 تحديث
          </button>
        </div>
      </div>

      {/* ── Totals summary strip ── */}
      {!loading && totals.length > 0 && (
        <div style={{
          background: "#111118", border: "1px solid #252535",
          borderRadius: "16px", padding: "16px 20px", marginBottom: "24px",
        }}>
          <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "600", marginBottom: "12px" }}>
            📊 إجمالي الأصناف — كل الطاولات
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {totals.map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "7px",
                background: "#1c1c28", border: "1px solid #252535",
                borderRadius: "12px", padding: "8px 14px",
              }}>
                <span style={{ fontSize: "18px" }}>{catEmoji(item.name, item.category)}</span>
                <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: "600" }}>{item.name}</span>
                <span style={{
                  background: "rgba(245,158,11,0.18)", color: "#f59e0b",
                  borderRadius: "8px", padding: "2px 10px",
                  fontSize: "15px", fontWeight: "800",
                }}>×{item.qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order grid */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", paddingTop: "80px", fontSize: "16px" }}>⏳ جاري التحميل...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "100px" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>✅</div>
          <div style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: "700", marginBottom: "6px" }}>المطبخ فارغ!</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>لا توجد طلبات قيد التحضير حالياً</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {orders.map(order => {
            const { label: timer, mins } = elapsed(order.created_at, now);
            const u = urgencyColor(mins);
            const busy = marking.has(order.id);
            const aggItems = aggregateItems(order.items ?? []);
            return (
              <div key={order.id} style={{
                background: u.bg, border: `1px solid ${u.border}40`,
                borderTop: `3px solid ${u.border}`,
                borderRadius: "16px", padding: "18px", display: "flex", flexDirection: "column", gap: "12px",
              }}>
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "16px" }}>طلب #{order.id}</div>
                    <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>🪑 طاولة {order.table_number}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                    <div style={{ background: u.badge, color: u.text, borderRadius: "8px", padding: "4px 10px", fontSize: "13px", fontWeight: "700" }}>
                      ⏱ {timer}
                    </div>
                    <div style={{ background: u.badge, color: u.text, borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: "600" }}>
                      {u.tag}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "10px 12px", flex: 1 }}>
                  {aggItems.length > 0 ? aggItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < aggItems.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <span style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "600" }}>
                        {catEmoji(item.name, item.category)} {item.name}
                      </span>
                      <span style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: "700" }}>×{item.qty}</span>
                    </div>
                  )) : (
                    <div style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "6px 0" }}>لا توجد تفاصيل للأصناف</div>
                  )}
                </div>

                {/* Mark ready button */}
                <button
                  onClick={() => markReady(order.id)}
                  disabled={busy}
                  style={{
                    width: "100%", padding: "12px",
                    background: busy ? "#252535" : "rgba(34,197,94,0.15)",
                    color: busy ? "#64748b" : "#22c55e",
                    border: `1px solid ${busy ? "#252535" : "rgba(34,197,94,0.35)"}`,
                    borderRadius: "12px", cursor: busy ? "not-allowed" : "pointer",
                    fontSize: "14px", fontWeight: "700",
                  }}
                >
                  {busy ? "⏳ جاري..." : "✅ جاهز للتقديم"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
