"use client";
import { useState, useEffect, useRef } from "react";

const API    = "https://waheed-system-production.up.railway.app";
const TABLES = Array.from({ length: 10 }, (_, i) => i + 1);

const CAT_EMOJI: Record<string, string> = {
  "برجر":    "🍔",
  "بيتزا":   "🍕",
  "مشروبات": "🥤",
  "حلويات":  "🍰",
  "مقبلات":  "🥗",
  "رئيسية":  "🍽️",
  "أخرى":    "🍴",
};
const emoji = (c: string) => CAT_EMOJI[c] ?? "🍴";

type RawItem = { id: number; name: string; price: number; category: string; available?: boolean | number | null; is_available?: boolean | number | null; description?: string };
type CartLine = { id: number; name: string; price: number; category: string; qty: number };

export default function NewOrderDrawer({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  /* ── local menu state (not Zustand — avoids hydration timing issues) ── */
  const [menuItems, setMenuItems] = useState<RawItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);   // start TRUE so the spinner shows first
  const [fetchError, setFetchError]   = useState("");

  const [cart, setCart]       = useState<CartLine[]>([]);
  const [table, setTable]     = useState(1);
  const [cat, setCat]         = useState("الكل");
  const [notes, setNotes]     = useState("");
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [success, setSuccess] = useState(false);
  const cartRef               = useRef<HTMLDivElement>(null);

  /* ── fetch menu on open ── */
  useEffect(() => {
    let cancelled = false;
    setLoadingMenu(true);
    setFetchError("");
    fetch(`${API}/menu`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          /* Normalize: API returns `is_available`, not `available` */
          const items: RawItem[] = (d.menu || d.items || d || []).map((i: RawItem) => ({
            ...i,
            available: i.available ?? i.is_available ?? true,
          })).filter((i: RawItem) => i.available !== false && i.available !== 0);
          setMenuItems(items);
        }
      })
      .catch((e) => { if (!cancelled) setFetchError(String(e)); })
      .finally(() => { if (!cancelled) setLoadingMenu(false); });
    return () => { cancelled = true; };
  }, []);

  /* ── scroll cart to bottom on new item ── */
  useEffect(() => {
    cartRef.current?.scrollTo({ top: cartRef.current.scrollHeight, behavior: "smooth" });
  }, [cart.length]);

  /* ── derived ── */
  const categories = ["الكل", ...Array.from(new Set(menuItems.map((m) => m.category)))];
  const filtered   = cat === "الكل" ? menuItems : menuItems.filter((m) => m.category === cat);

  /* ── cart helpers ── */
  const addItem = (item: RawItem) => {
    setCart((prev) => {
      const hit = prev.find((c) => c.id === item.id);
      return hit
        ? prev.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c))
        : [...prev, { id: item.id, name: item.name, price: item.price, category: item.category, qty: 1 }];
    });
  };

  const setQty = (id: number, delta: number) =>
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.id !== id) return [c];
        const next = c.qty + delta;
        return next > 0 ? [{ ...c, qty: next }] : [];
      })
    );

  const total      = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const totalItems = cart.reduce((s, c) => s + c.qty, 0);

  /* ── submit ── */
  const submit = async () => {
    if (!cart.length) { setOrderError("أضف صنفاً واحداً على الأقل"); return; }
    setSending(true);
    setOrderError("");
    try {
      /* Expand qty: backend expects [{name, price}] with no quantity field.
         Repeat each item qty times so total_price is computed correctly. */
      const expandedItems = cart.flatMap((c) =>
        Array.from({ length: c.qty }, () => ({ name: c.name, price: c.price, category: c.category }))
      );
      const cashier = localStorage.getItem("username") || "";

      const r = await fetch(`${API}/orders/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_number: table, items: expandedItems, cashier, notes }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setOrderError(d.detail || `فشل الإرسال (${r.status})`);
        return;
      }
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1400);
    } catch {
      setOrderError("تعذر الاتصال بالسيرفر — تحقق من الشبكة");
    } finally {
      setSending(false);
    }
  };

  /* ══════════════════════════════ RENDER ══════════════════════════════ */
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Modal shell ── */}
      <div style={{
        background: "#111118", border: "1px solid #252535", borderRadius: "22px",
        width: "100%", maxWidth: "1020px", height: "90vh",
        display: "flex", flexDirection: "column", direction: "rtl",
        overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
      }}>

        {/* Header */}
        <div style={{
          padding: "16px 22px", borderBottom: "1px solid #252535",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0, background: "rgba(245,158,11,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>➕</div>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "17px" }}>طلب جديد</div>
              <div style={{ color: "#64748b", fontSize: "11px" }}>
                {loadingMenu
                  ? `جاري تحميل ${0} صنف...`
                  : totalItems > 0
                    ? `${totalItems} صنف في السلة • طاولة ${table}`
                    : `${menuItems.length} صنف متاح • اختر من المنيو`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: "38px", height: "38px", borderRadius: "11px", background: "#1c1c28", border: "1px solid #252535", color: "#64748b", cursor: "pointer", fontSize: "17px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* ══ MENU PANEL (60%) ══ */}
          <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", borderLeft: "1px solid #1c1c28", overflow: "hidden" }}>

            {/* Category tabs — only render once items are loaded */}
            {!loadingMenu && menuItems.length > 0 && (
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #1c1c28", display: "flex", gap: "6px", overflowX: "auto", flexShrink: 0 }}>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    style={{
                      padding: "7px 14px", borderRadius: "20px", whiteSpace: "nowrap",
                      background: cat === c ? "rgba(245,158,11,0.15)" : "#1c1c28",
                      color: cat === c ? "#f59e0b" : "#64748b",
                      border: `1px solid ${cat === c ? "rgba(245,158,11,0.4)" : "#252535"}`,
                      cursor: "pointer", fontSize: "12px", fontWeight: cat === c ? "700" : "400",
                      flexShrink: 0,
                    }}
                  >
                    {emoji(c)} {c}
                    {c !== "الكل" && (
                      <span style={{ marginRight: "4px", color: "#64748b", fontSize: "10px" }}>
                        ({menuItems.filter(m => m.category === c).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Items grid */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))", gap: "10px", alignContent: "start" }}>

              {/* Loading state */}
              {loadingMenu && (
                <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "80px", gap: "16px" }}>
                  <div style={{ fontSize: "36px", animation: "spin 1s linear infinite" }}>⏳</div>
                  <div style={{ color: "#64748b", fontSize: "13px" }}>جاري تحميل المنيو من السيرفر...</div>
                </div>
              )}

              {/* Fetch error */}
              {!loadingMenu && fetchError && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", paddingTop: "60px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
                  <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{fetchError}</div>
                  <button
                    onClick={() => { setFetchError(""); setLoadingMenu(true); fetch(`${API}/menu`).then(r=>r.json()).then(d=>{ setMenuItems((d.menu||[]).filter((i: RawItem)=>i.available!==false&&i.available!==0)); }).catch(e=>setFetchError(String(e))).finally(()=>setLoadingMenu(false)); }}
                    style={{ padding: "8px 18px", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", cursor: "pointer", fontSize: "12px" }}
                  >🔄 إعادة المحاولة</button>
                </div>
              )}

              {/* Empty after load */}
              {!loadingMenu && !fetchError && filtered.length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", paddingTop: "60px", color: "#334155", fontSize: "13px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>🍽️</div>
                  لا توجد أصناف {cat !== "الكل" ? `في فئة "${cat}"` : "متاحة"}
                </div>
              )}

              {/* Menu cards */}
              {!loadingMenu && !fetchError && filtered.map((item) => {
                const inCart = cart.find((c) => c.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    style={{
                      background: inCart ? "rgba(245,158,11,0.1)" : "#1c1c28",
                      border: `2px solid ${inCart ? "rgba(245,158,11,0.55)" : "#252535"}`,
                      borderRadius: "15px", padding: "14px 10px 12px",
                      cursor: "pointer", textAlign: "center",
                      transition: "border-color 0.15s, background 0.15s",
                      position: "relative", minHeight: "108px",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px",
                    }}
                  >
                    {inCart && (
                      <div style={{
                        position: "absolute", top: "7px", left: "7px",
                        background: "#f59e0b", color: "#000",
                        borderRadius: "50%", width: "22px", height: "22px",
                        fontSize: "11px", fontWeight: "900",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {inCart.qty}
                      </div>
                    )}
                    <div style={{ fontSize: "28px", lineHeight: 1 }}>{emoji(item.category)}</div>
                    <div style={{ color: "#f1f5f9", fontSize: "12px", fontWeight: "700", lineHeight: "1.3" }}>{item.name}</div>
                    <div style={{ color: "#f59e0b", fontSize: "12px", fontWeight: "700" }}>
                      {item.price.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ CART PANEL (40%) ══ */}
          <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", background: "#0d0d14", overflow: "hidden" }}>

            {/* Table picker */}
            <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>
              <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: "600", marginBottom: "8px", letterSpacing: "0.5px" }}>🪑 اختر الطاولة</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "5px" }}>
                {TABLES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTable(t)}
                    style={{
                      padding: "11px 4px", borderRadius: "10px",
                      background: table === t ? "rgba(245,158,11,0.2)" : "#1c1c28",
                      color: table === t ? "#f59e0b" : "#64748b",
                      border: `1px solid ${table === t ? "rgba(245,158,11,0.55)" : "#252535"}`,
                      cursor: "pointer", fontSize: "14px", fontWeight: table === t ? "800" : "500",
                      transition: "all 0.12s",
                    }}
                  >{t}</button>
                ))}
              </div>
            </div>

            {/* Cart items */}
            <div ref={cartRef} style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
              {cart.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "10px" }}>
                  <div style={{ fontSize: "40px" }}>🛒</div>
                  <div style={{ color: "#334155", fontSize: "13px", textAlign: "center" }}>
                    السلة فارغة
                    <br />
                    <span style={{ fontSize: "11px", color: "#252535" }}>اضغط على صنف من المنيو</span>
                  </div>
                </div>
              ) : (
                <div style={{ paddingTop: "4px" }}>
                  {cart.map((c, idx) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "10px 0",
                        borderBottom: idx < cart.length - 1 ? "1px solid #1c1c28" : "none",
                      }}
                    >
                      <div style={{ fontSize: "20px", flexShrink: 0, width: "28px", textAlign: "center" }}>
                        {emoji(c.category)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ color: "#f59e0b", fontSize: "11px", marginTop: "1px" }}>
                          {(c.price * c.qty).toLocaleString()} <span style={{ color: "#64748b" }}>د.ع</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <button
                          onClick={() => setQty(c.id, -1)}
                          style={{ width: "30px", height: "30px", borderRadius: "9px", background: c.qty === 1 ? "rgba(239,68,68,0.12)" : "#252535", border: "none", color: c.qty === 1 ? "#ef4444" : "#94a3b8", cursor: "pointer", fontSize: c.qty === 1 ? "14px" : "17px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}
                        >{c.qty === 1 ? "🗑" : "−"}</button>
                        <span style={{ color: "#f1f5f9", fontSize: "15px", fontWeight: "800", minWidth: "22px", textAlign: "center" }}>{c.qty}</span>
                        <button
                          onClick={() => setQty(c.id, 1)}
                          style={{ width: "30px", height: "30px", borderRadius: "9px", background: "rgba(245,158,11,0.15)", border: "none", color: "#f59e0b", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 16px", borderTop: "1px solid #1c1c28", flexShrink: 0 }}>
              {cart.length > 0 && (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  padding: "10px 14px", borderRadius: "12px",
                  background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)",
                  marginBottom: "12px",
                }}>
                  <span style={{ color: "#94a3b8", fontSize: "13px" }}>الإجمالي</span>
                  <span style={{ color: "#f59e0b", fontSize: "22px", fontWeight: "900" }}>
                    {total.toLocaleString()}
                    <span style={{ fontSize: "12px", fontWeight: "400", color: "#64748b", marginRight: "4px" }}>د.ع</span>
                  </span>
                </div>
              )}

              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="ملاحظات خاصة (اختياري) — مثال: بدون بصل، إضافة صوص..."
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#1c1c28", border: "1px solid #252535",
                  borderRadius: "10px", color: "#f1f5f9",
                  padding: "9px 12px", fontSize: "12px",
                  resize: "none", outline: "none", direction: "rtl",
                  fontFamily: "inherit", marginBottom: "10px",
                }}
              />

              {orderError && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "9px 12px", color: "#ef4444", fontSize: "12px", marginBottom: "10px" }}>
                  ⚠️ {orderError}
                </div>
              )}

              {success && (
                <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "12px", color: "#22c55e", fontSize: "14px", fontWeight: "700", textAlign: "center", marginBottom: "10px" }}>
                  ✅ تم إرسال الطلب للمطبخ!
                </div>
              )}

              <button
                onClick={submit}
                disabled={sending || cart.length === 0 || success}
                style={{
                  width: "100%", padding: "15px 12px",
                  background: (sending || cart.length === 0 || success) ? "#1c1c28" : "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: (sending || cart.length === 0 || success) ? "#64748b" : "#000",
                  border: "none", borderRadius: "14px",
                  cursor: (sending || cart.length === 0 || success) ? "not-allowed" : "pointer",
                  fontSize: "15px", fontWeight: "900",
                  boxShadow: (cart.length > 0 && !sending && !success) ? "0 6px 24px rgba(245,158,11,0.4)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {sending ? "⏳ جاري الإرسال..." : success ? "✅ تم!" : "🍳 تأكيد وإرسال للمطبخ"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
