"use client";
import { useState } from "react";

const API = "https://waheed-system-production.up.railway.app";

type PayMethod = "cash" | "card" | "qr";
type SplitMode = "none" | "equal" | "items";

export type BillOrder = {
  id: number;
  table_number: number;
  total_price: number;
  status: string;
  items?: { name: string; price: number; category: string }[];
  payment_method?: string | null;
};

const PAY_METHODS = [
  { id: "cash" as PayMethod, label: "كاش",        icon: "💵" },
  { id: "card" as PayMethod, label: "بطاقة",      icon: "💳" },
  { id: "qr"   as PayMethod, label: "QR / محفظة", icon: "📱" },
];

const PALETTE = ["var(--gold)","var(--green)","#818cf8","#f472b6","#38bdf8","#fb923c","#a3e635","#e879f9","#34d399","#f87171"];
const guestColor = (i: number) => PALETTE[i % PALETTE.length];

const CAT_EMOJI: Record<string, string> = {
  "برجر": "🍔", "بيتزا": "🍕", "مشروبات": "🥤",
  "حلويات": "🍰", "مقبلات": "🥗", "رئيسية": "🍽️", "وجبات": "🍽️",
};
const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🍴";

type AggItem = { name: string; price: number; category: string; qty: number };
function aggregate(items: { name: string; price: number; category: string }[]): AggItem[] {
  const m: Record<string, AggItem> = {};
  for (const i of items) {
    if (m[i.name]) m[i.name].qty++;
    else m[i.name] = { ...i, qty: 1 };
  }
  return Object.values(m);
}

export function CombinedBillModal({
  tableNumber,
  paidOrders,
  unpaidOrders,
  onClose,
  onAllPaid,
}: {
  tableNumber: number;
  paidOrders: BillOrder[];
  unpaidOrders: BillOrder[];
  onClose: () => void;
  onAllPaid: () => void;
}) {
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [method, setMethod]       = useState<PayMethod>("cash");
  const [paying, setPaying]       = useState(false);
  const [done, setDone]           = useState(false);

  const [numPeople, setNumPeople]       = useState(2);
  const [equalPaid, setEqualPaid]       = useState<boolean[]>([false, false]);
  const [equalMethods, setEqualMethods] = useState<PayMethod[]>(["cash", "cash"]);

  const [numGuests, setNumGuests]       = useState(2);
  const [assign, setAssign]             = useState<Record<string, string>>({});
  const [guestPaid, setGuestPaid]       = useState<Record<string, boolean>>({});
  const [guestMethods, setGuestMethods] = useState<Record<string, PayMethod>>({});

  const allItems  = aggregate(unpaidOrders.flatMap(o => o.items ?? []));
  const grandTotal = unpaidOrders.reduce((s, o) => s + o.total_price, 0);
  const paidTotal  = paidOrders.reduce((s, o) => s + o.total_price, 0);

  const markAllPaid = async (payMethod: PayMethod) => {
    setPaying(true);
    try {
      await Promise.all(unpaidOrders.map(o =>
        fetch(`${API}/orders/${o.id}/pay`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_method: payMethod }),
        })
      ));
      setDone(true);
    } catch {}
    finally { setPaying(false); }
  };

  const changeNumPeople = (n: number) => {
    const c = Math.max(2, n);
    setNumPeople(c);
    setEqualPaid(Array(c).fill(false));
    setEqualMethods(Array(c).fill("cash" as PayMethod));
  };
  const share     = Math.ceil(grandTotal / numPeople);
  const paidCount = equalPaid.filter(Boolean).length;
  const remaining = Math.max(0, grandTotal - paidCount * share);
  const payEqualGuest = async (i: number) => {
    const p = equalPaid.map((v, j) => j === i ? true : v);
    setEqualPaid(p);
    if (p.every(Boolean)) await markAllPaid(equalMethods[i]);
  };

  const guestLabels = Array.from({ length: numGuests }, (_, i) => String(i + 1));
  const changeNumGuests = (n: number) => {
    const c = Math.max(2, n);
    setNumGuests(c); setAssign({}); setGuestPaid({}); setGuestMethods({});
  };
  const guests      = guestLabels.filter(g => Object.values(assign).includes(g));
  const guestItems  = (g: string) => allItems.filter(it => assign[it.name] === g);
  const guestTotal  = (g: string) => guestItems(g).reduce((s, it) => s + it.price * it.qty, 0);
  const unassigned  = allItems.filter(it => !assign[it.name]).reduce((s, it) => s + it.price * it.qty, 0);
  const payGuestItems = async (g: string) => {
    const p = { ...guestPaid, [g]: true };
    setGuestPaid(p);
    if (unassigned === 0 && guestLabels.every(x => p[x])) await markAllPaid(guestMethods[g] ?? "cash");
  };

  const partiallyPaid = paidCount > 0 && paidCount < numPeople;
  const someGuestPaid = Object.values(guestPaid).some(Boolean);

  if (done) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}>
      <div style={{ background: "var(--surface)", border: "1px solid #252535", borderRadius: "20px", padding: "48px 32px", textAlign: "center", direction: "rtl", minWidth: "300px" }}>
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>✅</div>
        <div style={{ color: "var(--green)", fontSize: "18px", fontWeight: "800", marginBottom: "6px" }}>تم الدفع بنجاح!</div>
        <div style={{ color: "var(--muted)", fontSize: "13px", marginBottom: "24px" }}>{grandTotal.toLocaleString()} د.ع</div>
        <button onClick={() => { onAllPaid(); onClose(); }}
          style={{ padding: "12px 36px", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000", border: "none", borderRadius: "12px", cursor: "pointer", fontSize: "14px", fontWeight: "800" }}>
          إغلاق
        </button>
      </div>
    </div>
  );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: "16px" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "var(--surface)", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "460px", maxHeight: "90vh", direction: "rtl", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.04)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <div style={{ color: "var(--text)", fontWeight: "800", fontSize: "17px" }}>🧾 حساب شامل — طاولة {tableNumber}</div>
              <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "3px" }}>
                {unpaidOrders.length} طلب غير مدفوع
                {paidOrders.length > 0 && ` · ${paidOrders.length} مدفوع (${paidTotal.toLocaleString()} د.ع)`}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "22px", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {([
              { id: "none"  as SplitMode, label: "دفع كامل" },
              { id: "equal" as SplitMode, label: "تقسيم بالتساوي" },
              { id: "items" as SplitMode, label: "تقسيم بالأصناف" },
            ]).map(m => (
              <button key={m.id} onClick={() => setSplitMode(m.id)} style={{
                flex: 1, padding: "7px 4px", borderRadius: "9px", fontSize: "11px",
                fontWeight: splitMode === m.id ? "700" : "400",
                background: splitMode === m.id ? "rgba(245,158,11,0.15)" : "var(--raised)",
                color: splitMode === m.id ? "var(--gold)" : "var(--muted)",
                border: `1px solid ${splitMode === m.id ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
                cursor: "pointer",
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* Paid orders reference (shown in all modes) */}
          {paidOrders.length > 0 && (
            <div style={{ padding: "10px 22px 0" }}>
              <div style={{ color: "var(--green)", fontSize: "11px", fontWeight: "700", marginBottom: "6px" }}>✅ مدفوعة مسبقاً ({paidTotal.toLocaleString()} د.ع)</div>
              {paidOrders.map(o => (
                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", marginBottom: "4px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "8px" }}>
                  <span style={{ color: "var(--green)", fontSize: "12px" }}>
                    طلب #{o.id} {o.payment_method === "card" ? "💳" : o.payment_method === "qr" ? "📱" : "💵"}
                  </span>
                  <span style={{ color: "var(--green)", fontSize: "12px", fontWeight: "700" }}>{o.total_price.toLocaleString()} د.ع ✓</span>
                </div>
              ))}
            </div>
          )}

          {/* ══ FULL PAYMENT ══ */}
          {splitMode === "none" && (<>
            <div style={{ padding: "14px 22px" }}>
              {allItems.length > 0 ? allItems.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < allItems.length - 1 ? "1px solid #1c1c28" : "none" }}>
                  <span style={{ color: "var(--text)", fontSize: "13px" }}>
                    {catEmoji(it.category)} {it.name}
                    {it.qty > 1 && <span style={{ color: "var(--gold)", fontSize: "11px", marginRight: "5px" }}>×{it.qty}</span>}
                  </span>
                  <span style={{ color: "var(--gold)", fontSize: "13px", fontWeight: "700" }}>{(it.price * it.qty).toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span></span>
                </div>
              )) : (
                <div style={{ color: "var(--muted)", fontSize: "12px", textAlign: "center", padding: "14px 0" }}>لا توجد تفاصيل أصناف</div>
              )}
            </div>
            <div style={{ padding: "10px 22px", background: "rgba(245,158,11,0.06)", borderTop: "1px solid #1c1c28", borderBottom: "1px solid #1c1c28" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text2)", fontSize: "14px", fontWeight: "600" }}>المبلغ المتبقي</span>
                <span style={{ color: "var(--gold)", fontSize: "22px", fontWeight: "800" }}>{grandTotal.toLocaleString()} <span style={{ fontSize: "13px", fontWeight: "400" }}>د.ع</span></span>
              </div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <div style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "10px" }}>طريقة الدفع</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {PAY_METHODS.map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)} style={{
                    flex: 1, padding: "10px 6px", borderRadius: "10px", cursor: "pointer", textAlign: "center", fontSize: "12px",
                    fontWeight: method === m.id ? "700" : "400",
                    background: method === m.id ? "rgba(245,158,11,0.15)" : "var(--raised)",
                    color: method === m.id ? "var(--gold)" : "var(--muted)",
                    border: `1px solid ${method === m.id ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
                  }}>
                    <div style={{ fontSize: "18px", marginBottom: "2px" }}>{m.icon}</div>{m.label}
                  </button>
                ))}
              </div>
              {unpaidOrders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px 0", color: "var(--green)", fontSize: 14, fontWeight: 700 }}>✅ الطاولة مسوّاة بالكامل</div>
              ) : (
                <button onClick={() => markAllPaid(method)} disabled={paying} style={{
                  width: "100%", padding: "14px", border: "none", borderRadius: "12px",
                  cursor: paying ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: "800",
                  background: paying ? "var(--border)" : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: paying ? "var(--muted)" : "#000",
                  boxShadow: paying ? "none" : "0 6px 20px rgba(245,158,11,0.35)",
                }}>
                  {paying ? "⏳ جاري المعالجة..." : `✅ تأكيد الدفع — ${grandTotal.toLocaleString()} د.ع`}
                </button>
              )}
            </div>
          </>)}

          {/* ══ EQUAL SPLIT ══ */}
          {splitMode === "equal" && (
            <div style={{ padding: "16px 22px" }}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "10px" }}>عدد الأشخاص</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button onClick={() => changeNumPeople(numPeople - 1)} disabled={numPeople <= 2}
                    style={{ width: "40px", height: "40px", borderRadius: "10px", fontSize: "20px", fontWeight: "700", background: "var(--raised)", color: numPeople <= 2 ? "var(--subtle)" : "var(--gold)", border: "1px solid #252535", cursor: numPeople <= 2 ? "not-allowed" : "pointer" }}>−</button>
                  <input type="number" min={2} value={numPeople} onChange={e => changeNumPeople(parseInt(e.target.value) || 2)}
                    style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: "10px", background: "rgba(245,158,11,0.08)", color: "var(--gold)", border: "1px solid rgba(245,158,11,0.35)", fontSize: "18px", fontWeight: "800", outline: "none" }} />
                  <button onClick={() => changeNumPeople(numPeople + 1)}
                    style={{ width: "40px", height: "40px", borderRadius: "10px", fontSize: "20px", fontWeight: "700", background: "var(--raised)", color: "var(--gold)", border: "1px solid #252535", cursor: "pointer" }}>+</button>
                </div>
              </div>
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "12px", padding: "12px 16px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text2)", fontSize: "13px" }}>نصيب كل شخص</span>
                <span style={{ color: "var(--gold)", fontSize: "18px", fontWeight: "800" }}>{share.toLocaleString()} <span style={{ fontSize: "11px", fontWeight: "400" }}>د.ع</span></span>
              </div>
              {partiallyPaid && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--gold)", fontSize: "12px", fontWeight: "600" }}>⏳ مدفوع جزئياً — {paidCount}/{numPeople}</span>
                  <span style={{ color: "var(--gold)", fontSize: "13px", fontWeight: "800" }}>متبقي {remaining.toLocaleString()} د.ع</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Array.from({ length: numPeople }, (_, i) => (
                  <div key={i} style={{ background: equalPaid[i] ? "rgba(34,197,94,0.08)" : "var(--raised)", border: `1px solid ${equalPaid[i] ? "rgba(34,197,94,0.3)" : "var(--border)"}`, borderRadius: "12px", padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ color: equalPaid[i] ? "var(--green)" : "var(--text)", fontWeight: "700", fontSize: "13px" }}>{equalPaid[i] ? "✅" : "👤"} زبون {i + 1}</div>
                        <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "2px" }}>{share.toLocaleString()} د.ع</div>
                      </div>
                      {equalPaid[i] ? (
                        <span style={{ color: "var(--green)", fontSize: "12px", fontWeight: "600" }}>مدفوع ✓</span>
                      ) : (
                        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                          {PAY_METHODS.map(m => (
                            <button key={m.id} onClick={() => { const ms = [...equalMethods]; ms[i] = m.id; setEqualMethods(ms); }} title={m.label}
                              style={{ width: "30px", height: "30px", borderRadius: "8px", fontSize: "15px", cursor: "pointer", background: equalMethods[i] === m.id ? "rgba(245,158,11,0.15)" : "var(--border)", border: `1px solid ${equalMethods[i] === m.id ? "rgba(245,158,11,0.4)" : "transparent"}` }}>{m.icon}</button>
                          ))}
                          <button onClick={() => payEqualGuest(i)}
                            style={{ padding: "6px 14px", background: "rgba(34,197,94,0.15)", color: "var(--green)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "700" }}>دفع</button>
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
              {allItems.length === 0 ? (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>لا توجد تفاصيل أصناف</div>
              ) : (<>
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "10px" }}>عدد الزبائن</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button onClick={() => changeNumGuests(numGuests - 1)} disabled={numGuests <= 2}
                      style={{ width: "40px", height: "40px", borderRadius: "10px", fontSize: "20px", fontWeight: "700", background: "var(--raised)", color: numGuests <= 2 ? "var(--subtle)" : "var(--gold)", border: "1px solid #252535", cursor: numGuests <= 2 ? "not-allowed" : "pointer" }}>−</button>
                    <input type="number" min={2} value={numGuests} onChange={e => changeNumGuests(parseInt(e.target.value) || 2)}
                      style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: "10px", background: "rgba(245,158,11,0.08)", color: "var(--gold)", border: "1px solid rgba(245,158,11,0.35)", fontSize: "18px", fontWeight: "800", outline: "none" }} />
                    <button onClick={() => changeNumGuests(numGuests + 1)}
                      style={{ width: "40px", height: "40px", borderRadius: "10px", fontSize: "20px", fontWeight: "700", background: "var(--raised)", color: "var(--gold)", border: "1px solid #252535", cursor: "pointer" }}>+</button>
                  </div>
                </div>
                <div style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "10px" }}>وزّع الأصناف على الزبائن</div>
                <div style={{ background: "var(--raised)", border: "1px solid #252535", borderRadius: "12px", padding: "4px 12px", marginBottom: "16px" }}>
                  {allItems.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < allItems.length - 1 ? "1px solid #252535" : "none" }}>
                      <div style={{ flex: 1, minWidth: 0, marginLeft: "10px" }}>
                        <div style={{ color: "var(--text)", fontSize: "13px" }}>{catEmoji(it.category)} {it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</div>
                        <div style={{ color: "var(--muted)", fontSize: "11px" }}>{(it.price * it.qty).toLocaleString()} د.ع</div>
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "160px" }}>
                        {guestLabels.map((g, gi) => {
                          const col = guestColor(gi);
                          return (
                            <button key={g}
                              onClick={() => setAssign(prev => ({ ...prev, [it.name]: prev[it.name] === g ? "" : g }))}
                              style={{ width: "28px", height: "28px", borderRadius: "7px", fontSize: "11px", fontWeight: "800", cursor: "pointer", background: assign[it.name] === g ? col + "25" : "var(--border)", color: assign[it.name] === g ? col : "var(--muted)", border: `1px solid ${assign[it.name] === g ? col + "70" : "transparent"}` }}>{g}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {unassigned > 0 && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "9px 14px", marginBottom: "14px" }}>
                    <span style={{ color: "var(--red)", fontSize: "12px" }}>⚠️ غير موزع: {unassigned.toLocaleString()} د.ع — وزّع جميع الأصناف أولاً</span>
                  </div>
                )}
                {someGuestPaid && (
                  <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "9px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--gold)", fontSize: "12px", fontWeight: "600" }}>⏳ مدفوع جزئياً</span>
                    <span style={{ color: "var(--gold)", fontSize: "13px", fontWeight: "800" }}>
                      متبقي {guestLabels.filter(g => !guestPaid[g] && Object.values(assign).includes(g)).reduce((s, g) => s + guestTotal(g), 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}
                {guests.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {guests.map((g, gi) => {
                      const total = guestTotal(g);
                      const paid  = guestPaid[g];
                      const color = guestColor(guestLabels.indexOf(g));
                      return (
                        <div key={g} style={{ background: paid ? "rgba(34,197,94,0.08)" : "var(--raised)", border: `1px solid ${paid ? "rgba(34,197,94,0.3)" : "var(--border)"}`, borderRadius: "12px", padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: paid ? 0 : "10px" }}>
                            <div>
                              <div style={{ color: paid ? "var(--green)" : color, fontWeight: "700", fontSize: "13px" }}>{paid ? "✅" : "👤"} زبون {g}</div>
                              <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "3px" }}>{guestItems(g).map(it => `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ""}`).join("، ")}</div>
                            </div>
                            <div style={{ color, fontSize: "16px", fontWeight: "800" }}>{total.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span></div>
                          </div>
                          {!paid && (
                            <div style={{ display: "flex", gap: "6px" }}>
                              {PAY_METHODS.map(m => (
                                <button key={m.id} onClick={() => setGuestMethods(prev => ({ ...prev, [g]: m.id }))} title={m.label}
                                  style={{ flex: 1, padding: "6px 4px", borderRadius: "8px", fontSize: "14px", cursor: "pointer", background: (guestMethods[g] ?? "cash") === m.id ? "rgba(245,158,11,0.15)" : "var(--border)", border: `1px solid ${(guestMethods[g] ?? "cash") === m.id ? "rgba(245,158,11,0.4)" : "transparent"}` }}>{m.icon}</button>
                              ))}
                              <button onClick={() => { if (unassigned === 0) payGuestItems(g); }} disabled={unassigned > 0}
                                style={{ flex: 2, padding: "6px 10px", borderRadius: "9px", cursor: unassigned > 0 ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: "700", background: unassigned > 0 ? "var(--raised)" : "rgba(34,197,94,0.15)", color: unassigned > 0 ? "var(--subtle)" : "var(--green)", border: `1px solid ${unassigned > 0 ? "transparent" : "rgba(34,197,94,0.3)"}` }}>دفع</button>
                            </div>
                          )}
                          {paid && <div style={{ color: "var(--green)", fontSize: "11px", fontWeight: "600" }}>مدفوع ✓</div>}
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
