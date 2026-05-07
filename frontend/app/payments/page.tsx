"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type OrderItem = { name: string; quantity: number; notes?: string; price?: number };
type Order = { id: number; table_number: number; total_price: number; status: string; created_at: string; items?: OrderItem[] };
type PayMethod = "cash" | "card" | "qr";

const PAY_METHODS: { id: PayMethod; label: string; icon: string }[] = [
  { id: "cash", label: "كاش",       icon: "💵" },
  { id: "card", label: "بطاقة",     icon: "💳" },
  { id: "qr",   label: "QR / محفظة", icon: "📱" },
];

function BillModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [method, setMethod] = useState<PayMethod>("cash");
  const [paying, setPaying] = useState(false);
  const [done, setDone]     = useState(false);

  const pay = async () => {
    setPaying(true);
    try {
      await fetch(`${API}/orders/${order.id}/done`, { method: "PUT" });
      setDone(true);
    } catch { /* silent */ }
    finally { setPaying(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "20px" }}>
      <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "380px", direction: "rtl", overflow: "hidden" }}>

        {/* Bill header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "17px" }}>🧾 فاتورة طلب #{order.id}</div>
              <div style={{ color: "#64748b", fontSize: "12px", marginTop: "3px" }}>🪑 طاولة {order.table_number}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px" }}>✕</button>
          </div>
        </div>

        {done ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "56px", marginBottom: "16px" }}>✅</div>
            <div style={{ color: "#22c55e", fontSize: "18px", fontWeight: "700", marginBottom: "6px" }}>تم الدفع بنجاح!</div>
            <div style={{ color: "#64748b", fontSize: "13px", marginBottom: "24px" }}>
              {order.total_price.toLocaleString()} د.ع عبر {PAY_METHODS.find((m) => m.id === method)?.label}
            </div>
            <button onClick={onClose} style={{ padding: "12px 32px", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", fontSize: "14px", fontWeight: "700" }}>
              إغلاق
            </button>
          </div>
        ) : (
          <>
            {/* Items list */}
            <div style={{ padding: "16px 24px", maxHeight: "220px", overflowY: "auto" }}>
              {order.items && order.items.length > 0 ? (
                order.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < order.items!.length - 1 ? "1px solid #1c1c28" : "none" }}>
                    <div>
                      <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "600" }}>{item.name}</div>
                      {item.notes && <div style={{ color: "#64748b", fontSize: "11px" }}>{item.notes}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ color: "#64748b", fontSize: "12px" }}>×{item.quantity}</span>
                      {item.price && (
                        <span style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "700" }}>
                          {(item.price * item.quantity).toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "#64748b", fontSize: "13px", textAlign: "center", padding: "12px 0" }}>لا توجد تفاصيل للأصناف</div>
              )}
            </div>

            {/* Total */}
            <div style={{ padding: "14px 24px", background: "rgba(245,158,11,0.06)", borderTop: "1px solid #1c1c28", borderBottom: "1px solid #252535" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: "600" }}>الإجمالي</span>
                <span style={{ color: "#f59e0b", fontSize: "22px", fontWeight: "800" }}>
                  {order.total_price.toLocaleString()} <span style={{ fontSize: "13px", fontWeight: "400" }}>د.ع</span>
                </span>
              </div>
            </div>

            {/* Payment method */}
            <div style={{ padding: "16px 24px" }}>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "10px" }}>طريقة الدفع</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {PAY_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    style={{
                      flex: 1, padding: "10px 6px",
                      background: method === m.id ? "rgba(245,158,11,0.15)" : "#1c1c28",
                      color: method === m.id ? "#f59e0b" : "#64748b",
                      border: `1px solid ${method === m.id ? "rgba(245,158,11,0.4)" : "#252535"}`,
                      borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontWeight: method === m.id ? "700" : "400",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "18px", marginBottom: "2px" }}>{m.icon}</div>
                    {m.label}
                  </button>
                ))}
              </div>

              <button
                onClick={pay}
                disabled={paying}
                style={{
                  width: "100%", padding: "14px",
                  background: paying ? "#252535" : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: "white", border: "none", borderRadius: "12px",
                  cursor: paying ? "not-allowed" : "pointer",
                  fontSize: "15px", fontWeight: "800",
                  boxShadow: paying ? "none" : "0 6px 20px rgba(245,158,11,0.35)",
                }}
              >
                {paying ? "⏳ جاري المعالجة..." : `✅ تأكيد الدفع — ${order.total_price.toLocaleString()} د.ع`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const [orders, setOrders]  = useState<Order[]>([]);
  const [loading, setLoad]   = useState(true);
  const [active, setActive]  = useState<Order | null>(null);
  const [tab, setTab]        = useState<"pending" | "done">("pending");

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/orders`);
      const d = await r.json();
      setOrders(d.orders || []);
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const pending = orders.filter((o) => o.status === "pending");
  const done    = orders.filter((o) => o.status === "done");
  const revenue = done.reduce((s, o) => s + o.total_price, 0);
  const display = tab === "pending" ? pending : done;

  const handleBillClose = () => { setActive(null); fetchOrders(); };

  return (
    <div style={{ padding: "24px", background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>💳 المدفوعات</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${pending.length} طلب بانتظار الدفع`}
          </p>
        </div>
        <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
          🔄 تحديث
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "بانتظار الدفع", value: pending.length, color: "#f59e0b", icon: "⏳" },
          { label: "مدفوعة",        value: done.length,    color: "#22c55e", icon: "✅" },
          { label: "إجمالي اليوم",  value: `${revenue.toLocaleString()} د.ع`, color: "#f59e0b", icon: "💰" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#111118", border: `1px solid ${s.color}20`, borderRadius: "14px", padding: "14px 18px" }}>
            <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
            <div style={{ color: s.color, fontSize: "22px", fontWeight: "800" }}>{s.value}</div>
            <div style={{ color: "#64748b", fontSize: "12px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["pending", "done"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "9px 22px", borderRadius: "12px",
              background: tab === t ? "rgba(245,158,11,0.15)" : "#111118",
              color: tab === t ? "#f59e0b" : "#64748b",
              border: `1px solid ${tab === t ? "rgba(245,158,11,0.4)" : "#252535"}`,
              cursor: "pointer", fontSize: "13px", fontWeight: tab === t ? "700" : "400",
            }}
          >
            {t === "pending" ? `⏳ بانتظار الدفع (${pending.length})` : `✅ مدفوعة (${done.length})`}
          </button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", paddingTop: "80px" }}>⏳ جاري التحميل...</div>
      ) : display.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px" }}>
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>{tab === "pending" ? "🎉" : "📋"}</div>
          <div style={{ color: "#94a3b8", fontSize: "15px" }}>{tab === "pending" ? "لا توجد طلبات بانتظار الدفع" : "لا توجد مدفوعات بعد"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
          {display.map((order) => (
            <div key={order.id} style={{
              background: "#111118",
              border: `1px solid ${tab === "pending" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.15)"}`,
              borderRadius: "16px", padding: "18px",
              borderRight: `4px solid ${tab === "pending" ? "#f59e0b" : "#22c55e"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "15px" }}>طلب #{order.id}</div>
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>🪑 طاولة {order.table_number}</div>
                </div>
                <span style={{
                  background: tab === "pending" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.1)",
                  color: tab === "pending" ? "#f59e0b" : "#22c55e",
                  border: `1px solid ${tab === "pending" ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.25)"}`,
                  borderRadius: "8px", padding: "3px 10px", fontSize: "11px", fontWeight: "700",
                }}>
                  {tab === "pending" ? "⏳ معلق" : "✅ مدفوع"}
                </span>
              </div>

              {/* Items preview */}
              {order.items && order.items.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  {order.items.slice(0, 3).map((it, j) => (
                    <div key={j} style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "2px" }}>
                      • {it.name} ×{it.quantity}
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div style={{ color: "#64748b", fontSize: "11px" }}>+{order.items.length - 3} أصناف أخرى</div>
                  )}
                </div>
              )}

              <div style={{ color: "#f59e0b", fontSize: "20px", fontWeight: "800", marginBottom: "12px" }}>
                {order.total_price.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: "400" }}>د.ع</span>
              </div>

              <div style={{ color: "#64748b", fontSize: "11px", marginBottom: tab === "pending" ? "14px" : "0" }}>
                🕐 {new Date(order.created_at).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}
              </div>

              {tab === "pending" && (
                <button
                  onClick={() => setActive(order)}
                  style={{
                    width: "100%", padding: "11px",
                    background: "linear-gradient(135deg,#f59e0b,#d97706)",
                    color: "white", border: "none", borderRadius: "12px",
                    cursor: "pointer", fontSize: "13px", fontWeight: "700",
                    boxShadow: "0 4px 14px rgba(245,158,11,0.3)",
                  }}
                >
                  💳 عرض الفاتورة والدفع
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {active && <BillModal order={active} onClose={handleBillClose} />}
    </div>
  );
}
