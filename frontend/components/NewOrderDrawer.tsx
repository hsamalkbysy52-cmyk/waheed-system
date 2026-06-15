"use client";
import { useState, useEffect, useRef } from "react";
import { BillModal, OrderForBill } from "@/components/BillModal";
import ModifierSelector, { ModGroup, SelectedMod } from "@/components/ModifierSelector";
import { saveLocalOrder, updateOrderSyncStatus } from "@/src/services/db";

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

type RawItem = {
  id: number;
  name: string;
  price: number;
  category: string;
  available?: boolean | number | null;
  is_available?: boolean | number | null;
  description?: string;
  out_of_stock?: boolean;
  max_qty?: number | null;
  modifiers?: ModGroup[];
  variants?: RawItem[];
};

type CartLine = {
  key: string;      // "${id}:${sorted_option_ids}"
  id: number;
  name: string;
  price: number;    // includes modifier price deltas
  category: string;
  qty: number;
  mods: SelectedMod[];
};

export default function NewOrderDrawer({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  /* ── local menu state ── */
  const [menuItems, setMenuItems] = useState<RawItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [fetchError, setFetchError]   = useState("");

  const [cart, setCart]       = useState<CartLine[]>([]);
  const [table, setTable]     = useState(1);
  const [cat, setCat]         = useState("الكل");
  const [notes, setNotes]     = useState("");
  const [sending, setSending]   = useState(false);
  const [orderError, setOrderError] = useState("");
  const [success, setSuccess]   = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [stockAlert, setStockAlert] = useState("");
  const [pendingBillOrder, setPendingBillOrder] = useState<OrderForBill | null>(null);
  const [modifierItem, setModifierItem] = useState<RawItem | null>(null);
  const [variantPick, setVariantPick] = useState<RawItem | null>(null);
  const cartRef                 = useRef<HTMLDivElement>(null);
  const paidRef                 = useRef(false);

  const showStockAlert = (msg: string) => {
    setStockAlert(msg);
    setTimeout(() => setStockAlert(""), 3500);
  };

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
          const items: RawItem[] = (d.menu || d.items || d || []).map((i: RawItem) => ({
            ...i,
            available: i.available ?? i.is_available ?? true,
            variants: (i.variants || [])
              .map((v: RawItem) => ({ ...v, available: v.available ?? v.is_available ?? true }))
              .filter((v: RawItem) => v.available !== false && v.available !== 0),
          })).filter((i: RawItem) => i.available !== false && i.available !== 0)
            .sort((a: RawItem, b: RawItem) => (a.out_of_stock ? 1 : 0) - (b.out_of_stock ? 1 : 0));
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
    const currentQty = cart.find((c) => c.key === key)?.qty ?? 0;
    if (item.max_qty != null && currentQty >= item.max_qty) {
      showStockAlert(`⚠️ الكمية المتاحة من "${item.name}" في المخزون: ${item.max_qty} فقط`);
      return;
    }
    setCart((prev) => {
      const hit = prev.find((c) => c.key === key);
      return hit
        ? prev.map((c) => (c.key === key ? { ...c, qty: c.qty + 1 } : c))
        : [...prev, { key, id: item.id, name: item.name, price: item.price, category: item.category, qty: 1, mods: [] }];
    });
  };

  const addItemWithMods = (item: RawItem, mods: SelectedMod[]) => {
    const sortedIds = mods.map((m) => m.option_id).sort().join(",");
    const key = `${item.id}:${sortedIds}`;
    const finalPrice = item.price + mods.reduce((s, m) => s + m.price_delta, 0);
    // For max_qty check, count total qty of this item across all mod variants
    const totalItemQty = cart.filter((c) => c.id === item.id).reduce((s, c) => s + c.qty, 0);
    if (item.max_qty != null && totalItemQty >= item.max_qty) {
      showStockAlert(`⚠️ الكمية المتاحة من "${item.name}" في المخزون: ${item.max_qty} فقط`);
      return;
    }
    setCart((prev) => {
      const hit = prev.find((c) => c.key === key);
      return hit
        ? prev.map((c) => (c.key === key ? { ...c, qty: c.qty + 1 } : c))
        : [...prev, { key, id: item.id, name: item.name, price: finalPrice, category: item.category, qty: 1, mods }];
    });
    setModifierItem(null);
  };

  const setQty = (key: string, delta: number) =>
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.key !== key) return [c];
        const next = c.qty + delta;
        return next > 0 ? [{ ...c, qty: next }] : [];
      })
    );

  const total      = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const totalItems = cart.reduce((s, c) => s + c.qty, 0);

  /* ── submit (shared by both buttons) ── */
  const doSubmit = async (withPayment?: "cash" | "card" | "qr") => {
    if (!cart.length) { setOrderError("أضف صنفاً واحداً على الأقل"); return; }
    setSending(true);
    setOrderError("");

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
    const cashier = localStorage.getItem("username") || "";
    const local_uuid = crypto.randomUUID();

    // 1. Save locally first — order is protected even if power cuts now
    let localId: number | null = null;
    try {
      localId = await saveLocalOrder({
        local_uuid,
        table_number: table,
        total_price: total,
        items: expandedItems,
        cashier,
        notes,
        payment_method: withPayment ?? null,
        created_at: new Date().toISOString(),
      });
    } catch {
      // IndexedDB unavailable — continue to server sync anyway
    }

    // 2. If online, try to sync to server immediately
    if (navigator.onLine) {
      try {
        const body: Record<string, unknown> = {
          table_number: table,
          items: expandedItems,
          cashier,
          notes,
          client_id: local_uuid,
        };
        if (withPayment) body.payment_method = withPayment;

        const r = await fetch(`${API}/orders/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (r.ok && localId !== null) {
          const d = await r.json();
          await updateOrderSyncStatus(localId, "Synced", d.order_id).catch(() => {});
        } else if (!r.ok && localId !== null) {
          await updateOrderSyncStatus(localId, "SyncFailed").catch(() => {});
        }
      } catch {
        if (localId !== null) await updateOrderSyncStatus(localId, "SyncFailed").catch(() => {});
      }
    } else {
      setSavedOffline(true);
    }

    // 3. Always succeed — order is safe in local DB regardless of sync result
    setSending(false);
    setSuccess(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1400);
  };

  /* ── pay + send ── */
  const doPayAndSend = async () => {
    if (!cart.length) { setOrderError("أضف صنفاً واحداً على الأقل"); return; }
    setSending(true);
    setOrderError("");

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
    const cashier = localStorage.getItem("username") || "";
    const local_uuid = crypto.randomUUID();

    // 1. Save locally first
    let localId: number | null = null;
    try {
      localId = await saveLocalOrder({
        local_uuid,
        table_number: table,
        total_price: total,
        items: expandedItems,
        cashier,
        notes,
        payment_method: null,
        created_at: new Date().toISOString(),
      });
    } catch {
      // IndexedDB unavailable — continue to server sync anyway
    }

    // 2. Offline: order saved locally, payment will be handled after reconnect
    if (!navigator.onLine) {
      setSavedOffline(true);
      setSending(false);
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1400);
      return;
    }

    // 3. Online: sync to server, then open BillModal for payment
    try {
      const r = await fetch(`${API}/orders/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_number: table, items: expandedItems, cashier, notes, client_id: local_uuid }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (localId !== null) await updateOrderSyncStatus(localId, "SyncFailed").catch(() => {});
        setOrderError(d.detail || `فشل الإرسال (${r.status})`);
        return;
      }
      const d = await r.json();
      if (localId !== null) await updateOrderSyncStatus(localId, "Synced", d.order_id).catch(() => {});
      paidRef.current = false;
      setPendingBillOrder({ id: d.order_id, table_number: table, total_price: total, notes, items: expandedItems });
    } catch {
      if (localId !== null) await updateOrderSyncStatus(localId, "SyncFailed").catch(() => {});
      setOrderError("تعذر الاتصال بالسيرفر — تحقق من الشبكة");
    } finally {
      setSending(false);
    }
  };

  const finishAfterPay = () => {
    // BillModal's success button calls onPaid() then onClose() — flag so
    // cancelPendingOrder doesn't delete the order that was just paid
    paidRef.current = true;
    setPendingBillOrder(null);
    setSuccess(true);
    setTimeout(() => { onSuccess(); onClose(); }, 1400);
  };

  const cancelPendingOrder = async () => {
    if (!pendingBillOrder || paidRef.current) return;
    try {
      await fetch(`${API}/orders/${pendingBillOrder.id}`, { method: "DELETE" });
    } catch { /* silent — order will stay unpaid, cashier can handle from payments page */ }
    setPendingBillOrder(null);
  };

  /* ══════════════════════════════ RENDER ══════════════════════════════ */
  return (
    <>
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

            {/* Category tabs */}
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

              {loadingMenu && (
                <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "80px", gap: "16px" }}>
                  <div style={{ fontSize: "36px", animation: "spin 1s linear infinite" }}>⏳</div>
                  <div style={{ color: "#64748b", fontSize: "13px" }}>جاري تحميل المنيو من السيرفر...</div>
                </div>
              )}

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

              {!loadingMenu && !fetchError && filtered.length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", paddingTop: "60px", color: "#334155", fontSize: "13px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>🍽️</div>
                  لا توجد أصناف {cat !== "الكل" ? `في فئة "${cat}"` : "متاحة"}
                </div>
              )}

              {!loadingMenu && !fetchError && filtered.map((item) => {
                const hasVariants = (item.variants?.length ?? 0) > 0;
                const cartIds   = hasVariants ? item.variants!.map((v) => v.id) : [item.id];
                const inCartQty = cart.filter((c) => cartIds.includes(c.id)).reduce((s, c) => s + c.qty, 0);
                const inCart    = inCartQty > 0;
                const soldOut   = hasVariants
                  ? item.variants!.every((v) => v.out_of_stock === true)
                  : item.out_of_stock === true;
                const hasMods   = item.modifiers && item.modifiers.length > 0;
                const minPrice  = hasVariants ? Math.min(...item.variants!.map((v) => v.price)) : item.price;
                return (
                  <button
                    key={item.id}
                    onClick={() => !soldOut && addItem(item)}
                    disabled={soldOut}
                    style={{
                      background: soldOut ? "#16161f" : inCart ? "rgba(245,158,11,0.1)" : "#1c1c28",
                      border: `2px solid ${soldOut ? "#1c1c28" : inCart ? "rgba(245,158,11,0.55)" : "#252535"}`,
                      borderRadius: "15px", padding: "14px 10px 12px",
                      cursor: soldOut ? "not-allowed" : "pointer", textAlign: "center",
                      transition: "border-color 0.15s, background 0.15s",
                      position: "relative", minHeight: "108px", opacity: soldOut ? 0.45 : 1,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px",
                    }}
                  >
                    {soldOut && (
                      <div style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: "6px", padding: "2px 6px", fontSize: "9px", fontWeight: "700", border: "1px solid rgba(239,68,68,0.3)" }}>نفد</div>
                    )}
                    {!soldOut && item.max_qty != null && item.max_qty <= 10 && (
                      <div style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(245,158,11,0.15)", color: "#f59e0b", borderRadius: "6px", padding: "2px 6px", fontSize: "9px", fontWeight: "700", border: "1px solid rgba(245,158,11,0.3)" }}>متبقي {item.max_qty}</div>
                    )}
                    {inCart && !soldOut && (
                      <div style={{ position: "absolute", top: "7px", left: "7px", background: "#f59e0b", color: "#000", borderRadius: "50%", width: "22px", height: "22px", fontSize: "11px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {inCartQty}
                      </div>
                    )}
                    {hasMods && !soldOut && !hasVariants && (
                      <div style={{ position: "absolute", bottom: "6px", left: "6px", background: "rgba(99,102,241,0.2)", color: "#818cf8", borderRadius: "4px", padding: "1px 5px", fontSize: "8px", fontWeight: "700" }}>تعديلات</div>
                    )}
                    {hasVariants && !soldOut && (
                      <div style={{ position: "absolute", bottom: "6px", left: "6px", background: "rgba(34,197,94,0.2)", color: "#22c55e", borderRadius: "4px", padding: "1px 5px", fontSize: "8px", fontWeight: "700" }}>{item.variants!.length} أنواع</div>
                    )}
                    <div style={{ fontSize: "28px", lineHeight: 1 }}>{emoji(item.category)}</div>
                    <div style={{ color: soldOut ? "#64748b" : "#f1f5f9", fontSize: "12px", fontWeight: "700", lineHeight: "1.3" }}>{item.name}</div>
                    <div style={{ color: soldOut ? "#334155" : "#f59e0b", fontSize: "12px", fontWeight: "700" }}>
                      {hasVariants && <span style={{ fontSize: "9px", fontWeight: "400", color: "#64748b" }}>من </span>}
                      {minPrice.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
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
                  {cart.map((c, idx) => {
                    const menuItem = menuItems.find(m => m.id === c.id);
                    const maxQty   = menuItem?.max_qty;
                    const totalQtyForItem = cart.filter(x => x.id === c.id).reduce((s, x) => s + x.qty, 0);
                    const atMax    = maxQty != null && totalQtyForItem >= maxQty;
                    return (
                      <div
                        key={c.key}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: "8px",
                          padding: "10px 0",
                          borderBottom: idx < cart.length - 1 ? "1px solid #1c1c28" : "none",
                        }}
                      >
                        <div style={{ fontSize: "20px", flexShrink: 0, width: "28px", textAlign: "center", marginTop: "2px" }}>
                          {emoji(c.category)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                          {c.mods.length > 0 && (
                            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "3px" }}>
                              {c.mods.map((m, mi) => (
                                <span key={mi} style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: "4px", padding: "1px 5px", fontSize: "10px" }}>
                                  {m.name}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ color: "#f59e0b", fontSize: "11px", marginTop: "3px" }}>
                            {(c.price * c.qty).toLocaleString()} <span style={{ color: "#64748b" }}>د.ع</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                          <button
                            onClick={() => setQty(c.key, -1)}
                            style={{ width: "30px", height: "30px", borderRadius: "9px", background: c.qty === 1 ? "rgba(239,68,68,0.12)" : "#252535", border: "none", color: c.qty === 1 ? "#ef4444" : "#94a3b8", cursor: "pointer", fontSize: c.qty === 1 ? "14px" : "17px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}
                          >{c.qty === 1 ? "🗑" : "−"}</button>
                          <span style={{ color: "#f1f5f9", fontSize: "15px", fontWeight: "800", minWidth: "22px", textAlign: "center" }}>{c.qty}</span>
                          <button
                            onClick={() => {
                              if (atMax) {
                                showStockAlert(`⚠️ الكمية المتاحة من "${c.name}" في المخزون: ${maxQty} فقط`);
                                return;
                              }
                              setQty(c.key, 1);
                            }}
                            style={{ width: "30px", height: "30px", borderRadius: "9px", background: atMax ? "#1c1c28" : "rgba(245,158,11,0.15)", border: `1px solid ${atMax ? "#252535" : "transparent"}`, color: atMax ? "#334155" : "#f59e0b", cursor: atMax ? "not-allowed" : "pointer", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
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

              {stockAlert && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "9px 12px", color: "#ef4444", fontSize: "12px", fontWeight: "600", marginBottom: "10px" }}>
                  {stockAlert}
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
                <div style={{ background: savedOffline ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)", border: `1px solid ${savedOffline ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)"}`, borderRadius: "10px", padding: "12px", color: savedOffline ? "#f59e0b" : "#22c55e", fontSize: "14px", fontWeight: "700", textAlign: "center", marginBottom: "10px" }}>
                  {savedOffline ? "💾 تم الحفظ محلياً — سيُرسل للمطبخ عند استعادة الاتصال" : "✅ تم إرسال الطلب للمطبخ!"}
                </div>
              )}

              <button
                onClick={() => doSubmit()}
                disabled={sending || cart.length === 0 || success}
                style={{
                  width: "100%", padding: "13px 12px", marginBottom: "8px",
                  background: (sending || cart.length === 0 || success) ? "#1c1c28" : "rgba(245,158,11,0.12)",
                  color: (sending || cart.length === 0 || success) ? "#64748b" : "#f59e0b",
                  border: `1px solid ${(sending || cart.length === 0 || success) ? "#252535" : "rgba(245,158,11,0.35)"}`,
                  borderRadius: "14px",
                  cursor: (sending || cart.length === 0 || success) ? "not-allowed" : "pointer",
                  fontSize: "14px", fontWeight: "700",
                  transition: "all 0.15s",
                }}
              >
                {sending ? "⏳ جاري الإرسال..." : success ? "✅ تم!" : "🍳 إرسال للمطبخ فقط"}
              </button>

              <button
                onClick={doPayAndSend}
                disabled={sending || cart.length === 0 || success}
                style={{
                  width: "100%", padding: "15px 12px",
                  background: (sending || cart.length === 0 || success) ? "#1c1c28" : "linear-gradient(135deg,#22c55e,#16a34a)",
                  color: (sending || cart.length === 0 || success) ? "#64748b" : "#000",
                  border: "none", borderRadius: "14px",
                  cursor: (sending || cart.length === 0 || success) ? "not-allowed" : "pointer",
                  fontSize: "15px", fontWeight: "900",
                  boxShadow: (cart.length > 0 && !sending && !success) ? "0 6px 24px rgba(34,197,94,0.35)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {sending ? "⏳ جاري الإرسال..." : success ? "✅ تم!" : `💰 دفع وإرسال للمطبخ`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Variant picker overlay */}
    {variantPick && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 350, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) setVariantPick(null); }}
      >
        <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "380px", direction: "rtl", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #252535", background: "rgba(34,197,94,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "15px" }}>{emoji(variantPick.category)} {variantPick.name}</div>
              <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>اختر النوع</div>
            </div>
            <button onClick={() => setVariantPick(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px" }}>✕</button>
          </div>
          <div style={{ padding: "14px 20px", maxHeight: "55vh", overflowY: "auto" }}>
            {variantPick.variants!.map((v) => {
              const vSoldOut = v.out_of_stock === true;
              return (
                <button
                  key={v.id}
                  disabled={vSoldOut}
                  onClick={() => { setVariantPick(null); addItem(v); }}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "13px 16px", marginBottom: "8px",
                    background: vSoldOut ? "#16161f" : "#1c1c28",
                    border: `1px solid ${vSoldOut ? "#1c1c28" : "#252535"}`,
                    borderRadius: "12px", cursor: vSoldOut ? "not-allowed" : "pointer",
                    opacity: vSoldOut ? 0.45 : 1, direction: "rtl",
                  }}
                >
                  <span style={{ color: vSoldOut ? "#64748b" : "#f1f5f9", fontSize: "13px", fontWeight: "700" }}>
                    {v.name} {vSoldOut && <span style={{ color: "#ef4444", fontSize: "10px" }}>(نفد)</span>}
                  </span>
                  <span style={{ color: vSoldOut ? "#334155" : "#f59e0b", fontSize: "13px", fontWeight: "800" }}>
                    {v.price.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}

    {/* Modifier selector overlay */}
    {modifierItem && (
      <ModifierSelector
        item={{ name: modifierItem.name, price: modifierItem.price }}
        groups={modifierItem.modifiers ?? []}
        onConfirm={(mods) => addItemWithMods(modifierItem, mods)}
        onClose={() => setModifierItem(null)}
      />
    )}

    {pendingBillOrder && (
      <BillModal
        order={pendingBillOrder}
        payOnly
        onClose={cancelPendingOrder}
        onPaid={finishAfterPay}
      />
    )}
    </>
  );
}
