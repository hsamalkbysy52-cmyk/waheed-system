"use client";
import { use, useState, useEffect, useCallback } from "react";
import ModifierSelector, { ModGroup, SelectedMod } from "@/components/ModifierSelector";

const RAILWAY = "https://waheed-system-production.up.railway.app";
const MENU_API = "/api/menu";

type RawItem = {
  id: number;
  name: string;
  price: number;
  category: string;
  description?: string;
  available?: boolean;
  is_available?: boolean;
  max_qty?: number | null;
  out_of_stock?: boolean;
  modifiers?: ModGroup[];
  variants?: RawItem[];
};
type MenuItem = RawItem & { available: boolean; max_qty?: number | null };
type CartLine = {
  key: string;        // "${id}:${sorted_option_ids}"
  id: number;
  name: string;
  price: number;      // includes modifier price deltas
  category: string;
  qty: number;
  mods: SelectedMod[];
};

const CAT_EMOJI: Record<string, string> = {
  "برجر": "🍔", "بيتزا": "🍕", "مشروبات": "🥤",
  "حلويات": "🍰", "مقبلات": "🥗", "رئيسية": "🍽️",
  "وجبات": "🍽️", "أخرى": "🍴",
};
const ce = (c: string) => CAT_EMOJI[c] ?? "🍴";

/* ─── tiny reusable components ─────────────────────────────────── */

function QtyButton({ onClick, children, variant = "neutral" }: {
  onClick: () => void; children: React.ReactNode; variant?: "add" | "remove" | "neutral";
}) {
  const bg =
    variant === "add"    ? "rgba(245,158,11,0.2)"  :
    variant === "remove" ? "rgba(239,68,68,0.12)"  : "#1c1c28";
  const color =
    variant === "add"    ? "#f59e0b" :
    variant === "remove" ? "#ef4444" : "#94a3b8";
  return (
    <button
      onClick={onClick}
      style={{
        width: "34px", height: "34px", borderRadius: "10px",
        background: bg, border: "none", color, cursor: "pointer",
        fontSize: "18px", fontWeight: "900",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >{children}</button>
  );
}

/* ─── success screen ─────────────────────────────────────────── */
function SuccessScreen({ tableId, total, onReset }: {
  tableId: string; total: number; onReset: () => void;
}) {
  return (
    <div style={{
      minHeight: "100dvh", background: "#0a0a0f",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 24px", textAlign: "center", direction: "rtl",
    }}>
      <div style={{ fontSize: "80px", marginBottom: "20px", animation: "none" }}>✅</div>
      <h2 style={{ color: "#22c55e", fontSize: "24px", fontWeight: "900", margin: "0 0 8px" }}>
        تم إرسال طلبك!
      </h2>
      <p style={{ color: "#64748b", fontSize: "14px", margin: "0 0 6px" }}>طاولة {tableId}</p>
      <div style={{
        background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
        borderRadius: "16px", padding: "16px 28px", margin: "20px 0",
      }}>
        <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "4px" }}>المبلغ الإجمالي</div>
        <div style={{ color: "#22c55e", fontSize: "28px", fontWeight: "900" }}>
          {total.toLocaleString()} <span style={{ fontSize: "14px", fontWeight: "400" }}>د.ع</span>
        </div>
      </div>
      <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 28px", maxWidth: "280px", lineHeight: "1.6" }}>
        طلبك على الطريق! سيصلك في أقرب وقت 🚀
      </p>
      <button
        onClick={onReset}
        style={{
          padding: "14px 40px", background: "linear-gradient(135deg,#f59e0b,#d97706)",
          color: "#000", border: "none", borderRadius: "14px",
          fontSize: "15px", fontWeight: "800", cursor: "pointer",
          boxShadow: "0 6px 20px rgba(245,158,11,0.4)",
        }}
      >
        ➕ طلب جديد
      </button>
    </div>
  );
}

/* ─── cart sheet ─────────────────────────────────────────────── */
function CartSheet({ cart, total, onClose, onChangeQty, onPlaceOrder, placing, notes, onNotesChange }: {
  cart: CartLine[]; total: number; onClose: () => void;
  onChangeQty: (key: string, delta: number) => void;
  onPlaceOrder: () => void; placing: boolean;
  notes: string; onNotesChange: (v: string) => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }}
      />
      {/* sheet */}
      <div style={{
        position: "relative", background: "#111118",
        borderRadius: "24px 24px 0 0", border: "1px solid #252535",
        borderBottom: "none", maxHeight: "82dvh",
        display: "flex", flexDirection: "column", direction: "rtl",
        boxShadow: "0 -20px 60px rgba(0,0,0,0.8)",
      }}>
        {/* drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#252535" }} />
        </div>

        {/* header */}
        <div style={{ padding: "12px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1c1c28" }}>
          <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "17px" }}>🛒 طلبك</div>
          <button onClick={onClose} style={{ background: "#1c1c28", border: "none", color: "#64748b", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>

        {/* items */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 16px" }}>
          {cart.map((c, idx) => (
            <div key={c.key} style={{
              display: "flex", alignItems: "flex-start", gap: "10px",
              padding: "12px 0",
              borderBottom: idx < cart.length - 1 ? "1px solid #1c1c28" : "none",
            }}>
              <div style={{ fontSize: "24px", flexShrink: 0, marginTop: "2px" }}>{ce(c.category)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "14px" }}>{c.name}</div>
                {c.mods.length > 0 && (
                  <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "3px" }}>
                    {c.mods.map((m, mi) => (
                      <span key={mi} style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: "4px", padding: "1px 5px", fontSize: "10px" }}>
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ color: "#f59e0b", fontSize: "12px", marginTop: "3px" }}>
                  {(c.price * c.qty).toLocaleString()} <span style={{ color: "#64748b" }}>د.ع</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <QtyButton variant="remove" onClick={() => onChangeQty(c.key, -1)}>
                  {c.qty === 1 ? "🗑" : "−"}
                </QtyButton>
                <span style={{ color: "#f1f5f9", fontWeight: "800", minWidth: "20px", textAlign: "center", fontSize: "16px" }}>{c.qty}</span>
                <QtyButton variant="add" onClick={() => onChangeQty(c.key, 1)}>+</QtyButton>
              </div>
            </div>
          ))}
        </div>

        {/* footer */}
        <div style={{ padding: "16px 20px 28px", borderTop: "1px solid #1c1c28" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderRadius: "12px",
            background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)",
            marginBottom: "14px",
          }}>
            <span style={{ color: "#94a3b8", fontSize: "14px" }}>الإجمالي</span>
            <span style={{ color: "#f59e0b", fontSize: "22px", fontWeight: "900" }}>
              {total.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
            </span>
          </div>
          {/* notes */}
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="ملاحظات خاصة — مثال: بدون بصل، حساسية من الفلفل..."
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#1c1c28", border: "1px solid #252535",
              borderRadius: "12px", color: "#f1f5f9",
              padding: "10px 14px", fontSize: "13px",
              resize: "none", outline: "none", direction: "rtl",
              fontFamily: "inherit", marginBottom: "12px",
              lineHeight: "1.5",
            }}
            onFocus={e => { e.target.style.borderColor = "rgba(245,158,11,0.4)"; }}
            onBlur={e => { e.target.style.borderColor = "#252535"; }}
          />
          <button
            onClick={onPlaceOrder}
            disabled={placing}
            style={{
              width: "100%", padding: "16px",
              background: placing ? "#1c1c28" : "linear-gradient(135deg,#f59e0b,#d97706)",
              color: placing ? "#64748b" : "#000",
              border: "none", borderRadius: "14px",
              fontSize: "16px", fontWeight: "900", cursor: placing ? "not-allowed" : "pointer",
              boxShadow: placing ? "none" : "0 6px 24px rgba(245,158,11,0.4)",
            }}
          >
            {placing ? "⏳ جاري الإرسال..." : "✅ إرسال الطلب للمطبخ"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── main page ──────────────────────────────────────────────── */
export default function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tableId } = use(params);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchErr, setFetchErr]   = useState("");
  const [cat, setCat]             = useState("الكل");
  const [cart, setCart]           = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen]   = useState(false);
  const [placing, setPlacing]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [orderTotal, setOrderTotal] = useState(0);
  const [notes, setNotes]         = useState("");
  const [stockAlert, setStockAlert] = useState("");
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [variantPick, setVariantPick] = useState<MenuItem | null>(null);

  /* fetch menu */
  const loadMenu = useCallback(() => {
    setLoading(true);
    setFetchErr("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const url = `${MENU_API}?t=${Date.now()}`;

    fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
        return r.json();
      })
      .then((d) => {
        const raw: RawItem[] = d.menu || [];
        if (raw.length === 0) throw new Error(`API returned 0 items — check Railway /menu`);
        const items: MenuItem[] = raw
          .map((i) => ({
            ...i,
            available: i.available ?? i.is_available ?? true,
            variants: (i.variants || [])
              .map((v) => ({ ...v, available: v.available ?? v.is_available ?? true }))
              .filter((v) => v.available !== false),
          }))
          .filter((i) => i.available !== false);
        setMenuItems(items);
      })
      .catch((e: Error) => {
        const msg = e.name === "AbortError"
          ? `TIMEOUT (12s) — لا يوجد رد من الخادم\n${url}`
          : `${e.message}`;
        setFetchErr(msg);
      })
      .finally(() => { clearTimeout(timeout); setLoading(false); });
  }, []);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  /* derived */
  const categories = ["الكل", ...Array.from(new Set(menuItems.map((m) => m.category)))];
  const filtered   = cat === "الكل" ? menuItems : menuItems.filter((m) => m.category === cat);
  const cartTotal  = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartCount  = cart.reduce((s, c) => s + c.qty, 0);

  const showStockMsg = (name: string) => {
    setStockAlert(name);
    setTimeout(() => setStockAlert(""), 4000);
  };

  /* cart helpers */
  const changeQty = (key: string, delta: number) => {
    if (delta > 0) {
      const line = cart.find(c => c.key === key);
      if (line) {
        const item = menuItems.find(m => m.id === line.id)
          ?? menuItems.flatMap(m => m.variants || []).find(v => v.id === line.id);
        const totalQtyForItem = cart.filter(c => c.id === line.id).reduce((s, c) => s + c.qty, 0);
        if (item?.max_qty != null && totalQtyForItem >= item.max_qty) {
          showStockMsg(item.name);
          return;
        }
      }
    }
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.key !== key) return [c];
        const next = c.qty + delta;
        return next > 0 ? [{ ...c, qty: next }] : [];
      })
    );
  };

  const addItem = (item: MenuItem) => {
    // If item has variants, show variant picker first
    if (item.variants && item.variants.length > 0) {
      setVariantPick(item);
      return;
    }
    // If item has modifier groups, show ModifierSelector first
    if (item.modifiers && item.modifiers.length > 0) {
      setModifierItem(item);
      return;
    }
    const key = `${item.id}:`;
    const currentQty = cart.find(c => c.key === key)?.qty ?? 0;
    if (item.max_qty != null && currentQty >= item.max_qty) {
      showStockMsg(item.name);
      return;
    }
    setCart((prev) => {
      const hit = prev.find((c) => c.key === key);
      return hit
        ? prev.map((c) => c.key === key ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { key, id: item.id, name: item.name, price: item.price, category: item.category, qty: 1, mods: [] }];
    });
  };

  const addItemWithMods = (item: MenuItem, mods: SelectedMod[]) => {
    const sortedIds = mods.map((m) => m.option_id).sort().join(",");
    const key = `${item.id}:${sortedIds}`;
    const finalPrice = item.price + mods.reduce((s, m) => s + m.price_delta, 0);
    const totalQtyForItem = cart.filter(c => c.id === item.id).reduce((s, c) => s + c.qty, 0);
    if (item.max_qty != null && totalQtyForItem >= item.max_qty) {
      showStockMsg(item.name);
      return;
    }
    setCart((prev) => {
      const hit = prev.find((c) => c.key === key);
      return hit
        ? prev.map((c) => c.key === key ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { key, id: item.id, name: item.name, price: finalPrice, category: item.category, qty: 1, mods }];
    });
    setModifierItem(null);
  };

  /* place order */
  const placeOrder = async () => {
    if (!cart.length) return;
    setPlacing(true);
    try {
      const expandedItems = cart.flatMap((c) =>
        Array.from({ length: c.qty }, () => ({
          name: c.name,
          price: c.price,
          category: c.category,
          modifiers: c.mods.map((m) => ({
            name: m.name,
            price_delta: m.price_delta,
            inventory_item_id: m.inventory_item_id,
            quantity_delta: m.quantity_delta,
          })),
        }))
      );
      const r = await fetch(`${RAILWAY}/orders/create`, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_number: parseInt(tableId), items: expandedItems, notes: notes.trim() || null }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setOrderTotal(cartTotal);
      setCartOpen(false);
      setNotes("");
      setSuccess(true);
    } catch (e) {
      alert(`فشل إرسال الطلب: ${e}`);
    } finally {
      setPlacing(false);
    }
  };

  /* ── success screen ── */
  if (success) {
    return (
      <SuccessScreen
        tableId={tableId}
        total={orderTotal}
        onReset={() => { setCart([]); setSuccess(false); }}
      />
    );
  }

  /* ── main render ── */
  return (
    <div style={{ minHeight: "100dvh", background: "#0a0a0f", direction: "rtl", maxWidth: "480px", margin: "0 auto" }}>

      {/* ── hero header ── */}
      <div style={{
        background: "linear-gradient(180deg, #1a1208 0%, #0a0a0f 100%)",
        padding: "28px 20px 20px", textAlign: "center",
        borderBottom: "1px solid #1c1c28",
      }}>
        <div style={{ fontSize: "44px", marginBottom: "6px" }}>🍔</div>
        <div style={{ color: "#f59e0b", fontWeight: "900", fontSize: "22px", letterSpacing: "1px" }}>Waheed</div>
        <div style={{ color: "#64748b", fontSize: "11px", letterSpacing: "2px", marginTop: "2px" }}>RESTAURANT</div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          marginTop: "12px", padding: "6px 16px",
          background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: "20px",
        }}>
          <span style={{ fontSize: "14px" }}>🪑</span>
          <span style={{ color: "#f59e0b", fontWeight: "700", fontSize: "13px" }}>طاولة {tableId}</span>
        </div>
      </div>

      {/* ── body ── */}
      <div style={{ paddingBottom: cartCount > 0 ? "96px" : "24px" }}>

        {/* loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: "16px" }}>
            <div style={{ fontSize: "36px" }}>⏳</div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>جاري تحميل المنيو...</div>
          </div>
        )}

        {/* error */}
        {!loading && fetchErr && (
          <div style={{ padding: "24px 16px" }}>
            <div style={{
              background: "#1a0a0a", border: "2px solid #ef4444",
              borderRadius: "16px", padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "28px" }}>🚨</span>
                <span style={{ color: "#ef4444", fontWeight: "800", fontSize: "16px" }}>خطأ في تحميل المنيو</span>
              </div>

              <pre style={{
                color: "#fca5a5", fontSize: "11px", background: "#0a0a0f",
                border: "1px solid #3f1f1f", borderRadius: "8px",
                padding: "10px 12px", margin: "0 0 8px",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
                direction: "ltr", textAlign: "left", lineHeight: "1.7",
                fontFamily: "monospace",
              }}>
                {fetchErr}
              </pre>

              <div style={{ color: "#64748b", fontSize: "10px", direction: "ltr", textAlign: "left", marginBottom: "16px" }}>
                API: {MENU_API}
              </div>

              <button
                onClick={loadMenu}
                style={{
                  width: "100%", padding: "13px",
                  background: "rgba(245,158,11,0.15)", color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.3)", borderRadius: "12px",
                  cursor: "pointer", fontSize: "14px", fontWeight: "700",
                }}
              >
                🔄 إعادة المحاولة
              </button>
            </div>
          </div>
        )}

        {/* menu */}
        {!loading && !fetchErr && (
          <>
            {/* category tabs */}
            <div style={{ display: "flex", gap: "8px", padding: "14px 16px", overflowX: "auto", borderBottom: "1px solid #1c1c28" }}>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  style={{
                    padding: "8px 16px", borderRadius: "20px", whiteSpace: "nowrap", flexShrink: 0,
                    background: cat === c ? "rgba(245,158,11,0.15)" : "#111118",
                    color: cat === c ? "#f59e0b" : "#64748b",
                    border: `1px solid ${cat === c ? "rgba(245,158,11,0.4)" : "#252535"}`,
                    cursor: "pointer", fontSize: "13px", fontWeight: cat === c ? "700" : "400",
                  }}
                >
                  {ce(c)} {c}
                </button>
              ))}
            </div>

            {/* items */}
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>🍽️</div>
                  <div style={{ fontSize: "14px" }}>لا توجد أصناف في هذه الفئة</div>
                </div>
              ) : (
                filtered.map((item) => {
                  const hasVariants = !!(item.variants && item.variants.length > 0);
                  const cartIds = hasVariants ? item.variants!.map(v => v.id) : [item.id];
                  const totalQtyForItem = cart.filter(c => cartIds.includes(c.id)).reduce((s, c) => s + c.qty, 0);
                  const line = hasVariants ? undefined : cart.find((c) => c.id === item.id);
                  const hasMods = item.modifiers && item.modifiers.length > 0;
                  const displayPrice = hasVariants
                    ? Math.min(...item.variants!.map(v => v.price))
                    : item.price;
                  return (
                    <div
                      key={item.id}
                      style={{
                        background: totalQtyForItem > 0 ? "rgba(245,158,11,0.05)" : "#111118",
                        border: `1px solid ${totalQtyForItem > 0 ? "rgba(245,158,11,0.3)" : "#1c1c28"}`,
                        borderRadius: "16px", padding: "14px 16px",
                        display: "flex", alignItems: "center", gap: "12px",
                        transition: "border-color 0.15s",
                      }}
                    >
                      {/* icon */}
                      <div style={{
                        width: "52px", height: "52px", borderRadius: "14px", flexShrink: 0,
                        background: totalQtyForItem > 0 ? "rgba(245,158,11,0.15)" : "#1c1c28",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "26px", transition: "background 0.15s",
                      }}>
                        {ce(item.category)}
                      </div>

                      {/* info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "14px", marginBottom: "2px" }}>
                          {item.name}
                          {hasVariants && (
                            <span style={{ marginRight: "6px", background: "rgba(34,197,94,0.15)", color: "#4ade80", borderRadius: "4px", padding: "1px 6px", fontSize: "10px", fontWeight: "600" }}>
                              {item.variants!.length} أنواع
                            </span>
                          )}
                          {hasMods && !hasVariants && (
                            <span style={{ marginRight: "6px", background: "rgba(99,102,241,0.15)", color: "#818cf8", borderRadius: "4px", padding: "1px 6px", fontSize: "10px", fontWeight: "600" }}>
                              تعديلات
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "4px", lineHeight: "1.4", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                            {item.description}
                          </div>
                        )}
                        <div style={{ color: "#f59e0b", fontWeight: "800", fontSize: "14px" }}>
                          {hasVariants && <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>من </span>}
                          {displayPrice.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
                        </div>
                      </div>

                      {/* add / qty */}
                      {line && !hasMods ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          <QtyButton variant="remove" onClick={() => changeQty(line.key, -1)}>
                            {line.qty === 1 ? "🗑" : "−"}
                          </QtyButton>
                          <span style={{ color: "#f1f5f9", fontWeight: "900", minWidth: "20px", textAlign: "center", fontSize: "16px" }}>{line.qty}</span>
                          <QtyButton variant="add" onClick={() => changeQty(line.key, 1)}>+</QtyButton>
                        </div>
                      ) : (
                        <button
                          onClick={() => addItem(item)}
                          style={{
                            width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                            background: "linear-gradient(135deg,#f59e0b,#d97706)",
                            border: "none", color: "#000", cursor: "pointer",
                            fontSize: "22px", fontWeight: "900",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 3px 10px rgba(245,158,11,0.4)",
                          }}
                        >+</button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── stock alert toast ── */}
      {stockAlert && (
        <div style={{
          position: "fixed", bottom: cartCount > 0 ? "96px" : "24px",
          left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 32px)", maxWidth: "448px",
          background: "#1a0a0a", border: "1px solid rgba(239,68,68,0.5)",
          borderRadius: "14px", padding: "14px 18px",
          zIndex: 450, direction: "rtl",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "22px", flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ color: "#f87171", fontWeight: "700", fontSize: "14px", marginBottom: "4px" }}>
                عذراً، لا يمكنك طلب هذه الكمية من "{stockAlert}"
              </div>
              <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.5" }}>
                الكمية المتاحة محدودة — يرجى التواصل مع الغرسون للمساعدة
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── floating cart button ── */}
      {cartCount > 0 && !cartOpen && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", padding: "12px 16px 20px", zIndex: 400 }}>
          <button
            onClick={() => setCartOpen(true)}
            style={{
              width: "100%", padding: "16px 20px",
              background: "linear-gradient(135deg,#f59e0b,#d97706)",
              color: "#000", border: "none", borderRadius: "16px",
              cursor: "pointer", fontSize: "15px", fontWeight: "900",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              boxShadow: "0 8px 32px rgba(245,158,11,0.5)",
            }}
          >
            <span style={{ background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "3px 10px", fontSize: "13px", fontWeight: "800" }}>
              {cartCount} صنف
            </span>
            <span>عرض الطلب 🛒</span>
            <span style={{ fontSize: "14px" }}>
              {cartTotal.toLocaleString()} د.ع
            </span>
          </button>
        </div>
      )}

      {/* ── cart sheet ── */}
      {cartOpen && (
        <CartSheet
          cart={cart}
          total={cartTotal}
          onClose={() => setCartOpen(false)}
          onChangeQty={changeQty}
          onPlaceOrder={placeOrder}
          placing={placing}
          notes={notes}
          onNotesChange={setNotes}
        />
      )}

      {/* ── variant picker ── */}
      {variantPick && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setVariantPick(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 550,
            background: "rgba(0,0,0,0.75)",
            display: "flex", flexDirection: "column", justifyContent: "flex-end",
          }}
        >
          <div style={{
            background: "#111118", borderRadius: "24px 24px 0 0",
            border: "1px solid #252535", borderBottom: "none",
            maxHeight: "70dvh", display: "flex", flexDirection: "column",
            direction: "rtl", maxWidth: "480px", margin: "0 auto", width: "100%",
            boxShadow: "0 -20px 60px rgba(0,0,0,0.8)",
          }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#252535" }} />
            </div>
            <div style={{ padding: "12px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1c1c28" }}>
              <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "16px" }}>
                {ce(variantPick.category)} اختر نوع {variantPick.name}
              </div>
              <button onClick={() => setVariantPick(null)} style={{ background: "#1c1c28", border: "none", color: "#64748b", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px 28px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {variantPick.variants!.map((v) => {
                const soldOut = v.out_of_stock === true;
                return (
                  <button
                    key={v.id}
                    disabled={soldOut}
                    onClick={() => {
                      const variant: MenuItem = { ...v, available: v.available ?? true };
                      setVariantPick(null);
                      addItem(variant);
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "14px 16px", borderRadius: "14px",
                      background: soldOut ? "#0d0d14" : "#1c1c28",
                      border: "1px solid #252535",
                      color: soldOut ? "#475569" : "#f1f5f9",
                      cursor: soldOut ? "not-allowed" : "pointer",
                      fontSize: "14px", fontWeight: "700", direction: "rtl",
                      fontFamily: "inherit",
                    }}
                  >
                    <span>{v.name}{soldOut && " (نفد)"}</span>
                    <span style={{ color: soldOut ? "#475569" : "#f59e0b", fontWeight: "800" }}>
                      {v.price.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── modifier selector ── */}
      {modifierItem && (
        <ModifierSelector
          item={{ name: modifierItem.name, price: modifierItem.price }}
          groups={modifierItem.modifiers ?? []}
          onConfirm={(mods) => addItemWithMods(modifierItem, mods)}
          onClose={() => setModifierItem(null)}
        />
      )}
    </div>
  );
}
