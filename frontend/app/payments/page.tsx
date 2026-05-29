"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type RawItem  = { name: string; price: number; category: string };
type AggItem  = { name: string; price: number; category: string; qty: number };
type Order    = { id: number; table_number: number; total_price: number; status: string; created_at: string; items: RawItem[]; notes: string; cashier: string; };
type PayMethod = "cash" | "card" | "qr";
type SplitMode = "none" | "equal" | "items";

const PAY_METHODS = [
  { id: "cash" as PayMethod, label: "كاش",        icon: "💵" },
  { id: "card" as PayMethod, label: "بطاقة",      icon: "💳" },
  { id: "qr"   as PayMethod, label: "QR / محفظة", icon: "📱" },
];

const GUEST_COLORS = ["#f59e0b", "#22c55e", "#818cf8", "#f472b6"];
const GUEST_LABELS = ["A", "B", "C", "D"];

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

/* ─────────────────────────── BillModal ─────────────────────────── */
function BillModal({ order, onClose, onPaid }: { order: Order; onClose: () => void; onPaid: () => void }) {
  const [splitMode, setSplitMode]   = useState<SplitMode>("none");
  const [method, setMethod]         = useState<PayMethod>("cash");
  const [paying, setPaying]         = useState(false);
  const [done, setDone]             = useState(false);

  /* equal split */
  const [numPeople, setNumPeople]   = useState(2);
  const [equalPaid, setEqualPaid]   = useState<boolean[]>([false, false]);
  const [equalMethods, setEqualMethods] = useState<PayMethod[]>(["cash", "cash"]);

  /* items split */
  const [assign, setAssign]         = useState<Record<string, string>>({});
  const [guestPaid, setGuestPaid]   = useState<Record<string, boolean>>({});
  const [guestMethods, setGuestMethods] = useState<Record<string, PayMethod>>({});

  const items = aggregate(order.items ?? []);

  const markDone = async () => {
    setPaying(true);
    try { await fetch(`${API}/orders/${order.id}/done`, { method: "PUT" }); setDone(true); }
    catch {}
    finally { setPaying(false); }
  };

  /* equal helpers */
  const changeNumPeople = (n: number) => {
    setNumPeople(n);
    setEqualPaid(Array(n).fill(false));
    setEqualMethods(Array(n).fill("cash"));
  };
  const share = Math.ceil(order.total_price / numPeople);
  const paidCount = equalPaid.filter(Boolean).length;
  const remaining = Math.max(0, order.total_price - paidCount * share);
  const payEqualGuest = (i: number) => {
    const p = equalPaid.map((v, j) => j === i ? true : v);
    setEqualPaid(p);
    if (p.every(Boolean)) markDone();
  };

  /* items helpers */
  const guests = [...new Set(Object.values(assign))].filter(Boolean).sort();
  const guestItems = (g: string) => items.filter(it => assign[it.name] === g);
  const guestTotal = (g: string) => guestItems(g).reduce((s, it) => s + it.price * it.qty, 0);
  const unassigned = items.filter(it => !assign[it.name]).reduce((s, it) => s + it.price * it.qty, 0);
  const payGuestItems = (g: string) => {
    const p = { ...guestPaid, [g]: true };
    setGuestPaid(p);
    if (unassigned === 0 && guests.every(x => p[x])) markDone();
  };
  const partiallyPaid = paidCount > 0 && paidCount < numPeople;
  const someGuestPaid = Object.values(guestPaid).some(Boolean);

  if (done) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
      <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", padding: "48px 32px", textAlign: "center", direction: "rtl", minWidth: "300px" }}>
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>✅</div>
        <div style={{ color: "#22c55e", fontSize: "18px", fontWeight: "800", marginBottom: "6px" }}>تم الدفع بنجاح!</div>
        <div style={{ color: "#64748b", fontSize: "13px", marginBottom: "24px" }}>{order.total_price.toLocaleString()} د.ع</div>
        <button onClick={() => { onPaid(); onClose(); }} style={{ padding: "12px 36px", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", border: "none", borderRadius: "12px", cursor: "pointer", fontSize: "14px", fontWeight: "800" }}>
          إغلاق
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "16px" }}>
      <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "460px", maxHeight: "90vh", direction: "rtl", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.04)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "17px" }}>🧾 فاتورة طلب #{order.id}</div>
              <div style={{ color: "#64748b", fontSize: "12px", marginTop: "3px" }}>🪑 طاولة {order.table_number}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "22px", lineHeight: 1 }}>✕</button>
          </div>
          {/* Split mode tabs */}
          <div style={{ display: "flex", gap: "6px" }}>
            {([
              { id: "none"  as SplitMode, label: "دفع كامل" },
              { id: "equal" as SplitMode, label: "تقسيم بالتساوي" },
              { id: "items" as SplitMode, label: "تقسيم بالأصناف" },
            ]).map(m => (
              <button key={m.id} onClick={() => setSplitMode(m.id)} style={{
                flex: 1, padding: "7px 4px", borderRadius: "9px", fontSize: "11px",
                fontWeight: splitMode === m.id ? "700" : "400",
                background: splitMode === m.id ? "rgba(245,158,11,0.15)" : "#1c1c28",
                color: splitMode === m.id ? "#f59e0b" : "#64748b",
                border: `1px solid ${splitMode === m.id ? "rgba(245,158,11,0.4)" : "#252535"}`,
                cursor: "pointer",
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* ══ FULL PAYMENT ══ */}
          {splitMode === "none" && (<>
            {/* Items */}
            <div style={{ padding: "14px 22px" }}>
              {items.length > 0 ? items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < items.length - 1 ? "1px solid #1c1c28" : "none" }}>
                  <span style={{ color: "#f1f5f9", fontSize: "13px" }}>
                    {catEmoji(it.category)} {it.name}
                    {it.qty > 1 && <span style={{ color: "#f59e0b", fontSize: "11px", marginRight: "5px" }}>×{it.qty}</span>}
                  </span>
                  <span style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "700" }}>
                    {(it.price * it.qty).toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span>
                  </span>
                </div>
              )) : (
                <div style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "14px 0" }}>لا توجد تفاصيل أصناف</div>
              )}
              {order.notes && (
                <div style={{ marginTop: "10px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "7px 10px", color: "#fbbf24", fontSize: "12px" }}>
                  📝 {order.notes}
                </div>
              )}
            </div>
            {/* Total */}
            <div style={{ padding: "12px 22px", background: "rgba(245,158,11,0.06)", borderTop: "1px solid #1c1c28" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: "600" }}>الإجمالي</span>
                <span style={{ color: "#f59e0b", fontSize: "22px", fontWeight: "800" }}>{order.total_price.toLocaleString()} <span style={{ fontSize: "13px", fontWeight: "400" }}>د.ع</span></span>
              </div>
            </div>
            {/* Pay */}
            <div style={{ padding: "16px 22px" }}>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "10px" }}>طريقة الدفع</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {PAY_METHODS.map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)} style={{
                    flex: 1, padding: "10px 6px", borderRadius: "10px", cursor: "pointer", textAlign: "center", fontSize: "12px",
                    fontWeight: method === m.id ? "700" : "400",
                    background: method === m.id ? "rgba(245,158,11,0.15)" : "#1c1c28",
                    color: method === m.id ? "#f59e0b" : "#64748b",
                    border: `1px solid ${method === m.id ? "rgba(245,158,11,0.4)" : "#252535"}`,
                  }}>
                    <div style={{ fontSize: "18px", marginBottom: "2px" }}>{m.icon}</div>{m.label}
                  </button>
                ))}
              </div>
              <button onClick={markDone} disabled={paying} style={{
                width: "100%", padding: "14px", border: "none", borderRadius: "12px", cursor: paying ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: "800",
                background: paying ? "#252535" : "linear-gradient(135deg,#f59e0b,#d97706)",
                color: paying ? "#64748b" : "#000",
                boxShadow: paying ? "none" : "0 6px 20px rgba(245,158,11,0.35)",
              }}>
                {paying ? "⏳ جاري المعالجة..." : `✅ تأكيد الدفع — ${order.total_price.toLocaleString()} د.ع`}
              </button>
            </div>
          </>)}

          {/* ══ EQUAL SPLIT ══ */}
          {splitMode === "equal" && (
            <div style={{ padding: "16px 22px" }}>
              {/* People picker */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "10px" }}>عدد الأشخاص</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[2,3,4,5,6].map(n => (
                    <button key={n} onClick={() => changeNumPeople(n)} style={{
                      flex: 1, padding: "11px 4px", borderRadius: "10px", fontSize: "15px", fontWeight: "800",
                      background: numPeople === n ? "rgba(245,158,11,0.15)" : "#1c1c28",
                      color: numPeople === n ? "#f59e0b" : "#64748b",
                      border: `1px solid ${numPeople === n ? "rgba(245,158,11,0.4)" : "#252535"}`,
                      cursor: "pointer",
                    }}>{n}</button>
                  ))}
                </div>
              </div>

              {/* Share */}
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "12px", padding: "12px 16px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>نصيب كل شخص</span>
                <span style={{ color: "#f59e0b", fontSize: "18px", fontWeight: "800" }}>{share.toLocaleString()} <span style={{ fontSize: "11px", fontWeight: "400" }}>د.ع</span></span>
              </div>

              {/* Partial paid banner */}
              {partiallyPaid && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#f59e0b", fontSize: "12px", fontWeight: "600" }}>⏳ مدفوع جزئياً — {paidCount}/{numPeople}</span>
                  <span style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "800" }}>متبقي {remaining.toLocaleString()} د.ع</span>
                </div>
              )}

              {/* Guest rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Array.from({ length: numPeople }, (_, i) => (
                  <div key={i} style={{
                    background: equalPaid[i] ? "rgba(34,197,94,0.08)" : "#1c1c28",
                    border: `1px solid ${equalPaid[i] ? "rgba(34,197,94,0.3)" : "#252535"}`,
                    borderRadius: "12px", padding: "12px 14px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ color: equalPaid[i] ? "#22c55e" : "#f1f5f9", fontWeight: "700", fontSize: "13px" }}>
                          {equalPaid[i] ? "✅" : "👤"} زبون {i + 1}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>{share.toLocaleString()} د.ع</div>
                      </div>
                      {equalPaid[i] ? (
                        <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: "600" }}>مدفوع ✓</span>
                      ) : (
                        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                          {PAY_METHODS.map(m => (
                            <button key={m.id} onClick={() => { const ms = [...equalMethods]; ms[i] = m.id; setEqualMethods(ms); }} title={m.label} style={{
                              width: "30px", height: "30px", borderRadius: "8px", fontSize: "15px", cursor: "pointer",
                              background: equalMethods[i] === m.id ? "rgba(245,158,11,0.15)" : "#252535",
                              border: `1px solid ${equalMethods[i] === m.id ? "rgba(245,158,11,0.4)" : "transparent"}`,
                            }}>{m.icon}</button>
                          ))}
                          <button onClick={() => payEqualGuest(i)} style={{
                            padding: "6px 14px", background: "rgba(34,197,94,0.15)", color: "#22c55e",
                            border: "1px solid rgba(34,197,94,0.3)", borderRadius: "9px",
                            cursor: "pointer", fontSize: "12px", fontWeight: "700",
                          }}>دفع</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ ITEMS SPLIT ══ */}
          {splitMode === "items" && (
            <div style={{ padding: "16px 22px" }}>
              {items.length === 0 ? (
                <div style={{ color: "#64748b", textAlign: "center", padding: "24px 0" }}>
                  لا توجد تفاصيل أصناف لهذا الطلب
                </div>
              ) : (<>
                {/* Assign items */}
                <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "10px" }}>وزّع الأصناف على الزبائن</div>
                <div style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", padding: "4px 12px", marginBottom: "16px" }}>
                  {items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < items.length - 1 ? "1px solid #252535" : "none" }}>
                      <div>
                        <div style={{ color: "#f1f5f9", fontSize: "13px" }}>
                          {catEmoji(it.category)} {it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "11px" }}>{(it.price * it.qty).toLocaleString()} د.ع</div>
                      </div>
                      <div style={{ display: "flex", gap: "5px" }}>
                        {GUEST_LABELS.map((g, gi) => (
                          <button key={g} onClick={() => setAssign(prev => ({ ...prev, [it.name]: prev[it.name] === g ? "" : g }))} style={{
                            width: "30px", height: "30px", borderRadius: "8px", fontSize: "12px", fontWeight: "800", cursor: "pointer",
                            background: assign[it.name] === g ? GUEST_COLORS[gi] + "25" : "#252535",
                            color: assign[it.name] === g ? GUEST_COLORS[gi] : "#64748b",
                            border: `1px solid ${assign[it.name] === g ? GUEST_COLORS[gi] + "60" : "transparent"}`,
                          }}>{g}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Unassigned warning */}
                {unassigned > 0 && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "9px 14px", marginBottom: "14px" }}>
                    <span style={{ color: "#ef4444", fontSize: "12px" }}>⚠️ غير موزع: {unassigned.toLocaleString()} د.ع — وزّع جميع الأصناف أولاً</span>
                  </div>
                )}

                {/* Partial paid banner */}
                {someGuestPaid && !done && (
                  <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "9px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#f59e0b", fontSize: "12px", fontWeight: "600" }}>⏳ مدفوع جزئياً</span>
                    <span style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "800" }}>
                      متبقي {guests.filter(g => !guestPaid[g]).reduce((s, g) => s + guestTotal(g), 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}

                {/* Guest pay rows */}
                {guests.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {guests.map((g, gi) => {
                      const total = guestTotal(g);
                      const paid  = guestPaid[g];
                      const color = GUEST_COLORS[GUEST_LABELS.indexOf(g)];
                      return (
                        <div key={g} style={{
                          background: paid ? "rgba(34,197,94,0.08)" : "#1c1c28",
                          border: `1px solid ${paid ? "rgba(34,197,94,0.3)" : "#252535"}`,
                          borderRadius: "12px", padding: "12px 14px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: paid ? 0 : "10px" }}>
                            <div>
                              <div style={{ color: paid ? "#22c55e" : color, fontWeight: "700", fontSize: "13px" }}>
                                {paid ? "✅" : "👤"} زبون {g}
                              </div>
                              <div style={{ color: "#64748b", fontSize: "11px", marginTop: "3px" }}>
                                {guestItems(g).map(it => `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ""}`).join("، ")}
                              </div>
                            </div>
                            <div style={{ color: color, fontSize: "16px", fontWeight: "800" }}>
                              {total.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span>
                            </div>
                          </div>
                          {!paid && (
                            <div style={{ display: "flex", gap: "6px" }}>
                              {PAY_METHODS.map(m => (
                                <button key={m.id} onClick={() => setGuestMethods(prev => ({ ...prev, [g]: m.id }))} title={m.label} style={{
                                  flex: 1, padding: "6px 4px", borderRadius: "8px", fontSize: "14px", cursor: "pointer",
                                  background: (guestMethods[g] ?? "cash") === m.id ? "rgba(245,158,11,0.15)" : "#252535",
                                  border: `1px solid ${(guestMethods[g] ?? "cash") === m.id ? "rgba(245,158,11,0.4)" : "transparent"}`,
                                }}>{m.icon}</button>
                              ))}
                              <button
                                onClick={() => { if (unassigned === 0) payGuestItems(g); }}
                                disabled={unassigned > 0}
                                style={{
                                  flex: 2, padding: "6px 10px", borderRadius: "9px", cursor: unassigned > 0 ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: "700",
                                  background: unassigned > 0 ? "#1c1c28" : "rgba(34,197,94,0.15)",
                                  color: unassigned > 0 ? "#334155" : "#22c55e",
                                  border: `1px solid ${unassigned > 0 ? "transparent" : "rgba(34,197,94,0.3)"}`,
                                }}>دفع</button>
                            </div>
                          )}
                          {paid && <div style={{ color: "#22c55e", fontSize: "11px", fontWeight: "600" }}>مدفوع ✓</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

  const pending = orders.filter(o => o.status === "pending");
  const done    = orders.filter(o => o.status === "done");
  const revenue = done.reduce((s, o) => s + o.total_price, 0);
  const display = tab === "pending" ? pending : done;

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
          { label: "بانتظار الدفع", value: pending.length,                       color: "#f59e0b", icon: "⏳" },
          { label: "مدفوعة",        value: done.length,                           color: "#22c55e", icon: "✅" },
          { label: "إجمالي اليوم",  value: `${revenue.toLocaleString()} د.ع`,    color: "#f59e0b", icon: "💰" },
        ].map(s => (
          <div key={s.label} style={{ background: "#111118", border: `1px solid ${s.color}20`, borderRadius: "14px", padding: "14px 18px" }}>
            <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
            <div style={{ color: s.color, fontSize: "22px", fontWeight: "800" }}>{s.value}</div>
            <div style={{ color: "#64748b", fontSize: "12px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["pending", "done"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 22px", borderRadius: "12px", cursor: "pointer", fontSize: "13px",
            fontWeight: tab === t ? "700" : "400",
            background: tab === t ? "rgba(245,158,11,0.15)" : "#111118",
            color: tab === t ? "#f59e0b" : "#64748b",
            border: `1px solid ${tab === t ? "rgba(245,158,11,0.4)" : "#252535"}`,
          }}>
            {t === "pending" ? `⏳ بانتظار الدفع (${pending.length})` : `✅ مدفوعة (${done.length})`}
          </button>
        ))}
      </div>

      {/* Order cards */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", paddingTop: "80px" }}>⏳ جاري التحميل...</div>
      ) : display.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px" }}>
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>{tab === "pending" ? "🎉" : "📋"}</div>
          <div style={{ color: "#94a3b8", fontSize: "15px" }}>{tab === "pending" ? "لا توجد طلبات بانتظار الدفع" : "لا توجد مدفوعات بعد"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
          {display.map(order => {
            const aggItems = aggregate(order.items ?? []);
            return (
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

                {/* Items with prices */}
                {aggItems.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    {aggItems.slice(0, 3).map((it, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                          {catEmoji(it.category)} {it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}
                        </span>
                        <span style={{ color: "#f59e0b", fontSize: "12px", fontWeight: "600" }}>
                          {(it.price * it.qty).toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span>
                        </span>
                      </div>
                    ))}
                    {aggItems.length > 3 && (
                      <div style={{ color: "#64748b", fontSize: "11px" }}>+{aggItems.length - 3} أصناف أخرى</div>
                    )}
                  </div>
                )}

                {order.notes && (
                  <div style={{ background: "rgba(245,158,11,0.06)", borderRadius: "7px", padding: "5px 8px", fontSize: "11px", color: "#94a3b8", marginBottom: "10px" }}>
                    📝 {order.notes}
                  </div>
                )}

                <div style={{ color: "#f59e0b", fontSize: "20px", fontWeight: "800", marginBottom: "10px" }}>
                  {order.total_price.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: "400" }}>د.ع</span>
                </div>

                <div style={{ color: "#64748b", fontSize: "11px", marginBottom: tab === "pending" ? "14px" : "0" }}>
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
