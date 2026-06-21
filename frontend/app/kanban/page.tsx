"use client";
import { useState, useEffect, useCallback } from "react";
import { DndContext, DragEndEvent, useDroppable, useDraggable, closestCenter } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import NewOrderDrawer from "@/components/NewOrderDrawer";
import { BillModal } from "@/components/BillModal";
import { getPendingSyncOrders } from "@/src/services/db";

const API = "https://waheed-system-production.up.railway.app";

async function fetchWithRetry(url: string, retries = 4, delayMs = 3000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch {}
    if (i < retries - 1) await new Promise(res => setTimeout(res, delayMs));
  }
  return fetch(url);
}

type OrderItem = { name: string; price: number; category: string; modifiers?: { name: string }[] };
type Order = {
  id: number;
  table_number: number;
  total_price: number;
  status: string;
  created_at: string;
  items: OrderItem[];
  cashier: string;
  notes: string;
  payment_method?: string | null;
};
type Stage = "preparing" | "ready" | "served";
type MenuItem = { id: number; name: string; price: number; category: string; is_available?: boolean; out_of_stock?: boolean };
type EditCartLine = { name: string; price: number; category: string; qty: number };

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "preparing", label: "🟠 قيد التحضير", color: "#f97316" },
  { id: "ready",     label: "🟢 جاهز",        color: "#22c55e" },
  { id: "served",    label: "⚪ تم التقديم",   color: "#64748b" },
];
const STAGE_ORDER: Stage[] = ["preparing", "ready", "served"];

const CAT_EMOJI: Record<string, string> = {
  "برجر": "🍔", "بيتزا": "🍕", "مشروبات": "🥤",
  "حلويات": "🍰", "مقبلات": "🥗", "رئيسية": "🍽️",
  "وجبات": "🍽️", "أخرى": "🍴",
};
const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🍴";

function aggregateItems(items: OrderItem[]) {
  const map: Record<string, { name: string; price: number; category: string; qty: number; mods: string[] }> = {};
  for (const item of items) {
    const modKey = (item.modifiers || []).map(m => m.name).join(",");
    const key = `${item.name}|${modKey}`;
    if (map[key]) map[key].qty++;
    else map[key] = { name: item.name, price: item.price, category: item.category || "", qty: 1, mods: (item.modifiers || []).map(m => m.name) };
  }
  return Object.values(map);
}

/* Always parse server time as UTC — appends Z if missing */
function parseUTC(dateStr: string): number {
  const s = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  return new Date(s).getTime();
}

function elapsedMins(created_at: string, now: number) {
  return Math.max(0, Math.floor((now - parseUTC(created_at)) / 60000));
}

function stageColor(mins: number, stage: Stage) {
  if (stage === "served") return "#64748b";
  if (mins < 15) return "#22c55e";
  return "#ef4444";
}

function timeAgo(created_at: string, now: number) {
  const mins = Math.floor(Math.max(0, now - parseUTC(created_at)) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  return `منذ ${Math.floor(mins / 60)} ساعة`;
}

/* ── Draggable card ── */
function Card({ order, stage, now, onNext, onPrev, onEdit, onDelete, isDeleting, onInvoice, isPaid, onComplete }: {
  order: Order; stage: Stage; now: number;
  onNext: () => void; onPrev: () => void;
  onEdit: () => void; onDelete: () => void; isDeleting: boolean;
  onInvoice: () => void; isPaid: boolean;
  onComplete: () => void;
}) {
  const isLocal = order.id < 0;
  const [confirmDel, setConfirmDel] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(order.id) });
  const mins = elapsedMins(order.created_at, now);
  const tc   = isLocal ? "#f59e0b" : stageColor(mins, stage);
  const aggregated = order.items?.length ? aggregateItems(order.items) : [];

  return (
    <div
      ref={setNodeRef}
      {...(isLocal ? {} : listeners)}
      {...(isLocal ? {} : attributes)}
      style={{
        background: "#1c1c28",
        border: `1px solid ${tc}35`,
        borderRight: `4px solid ${tc}`,
        borderRadius: "14px",
        padding: "14px",
        marginBottom: "10px",
        cursor: isLocal ? "default" : "grab",
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1,
        userSelect: "none",
      }}
    >
      {/* Offline badge for local-only orders */}
      {isLocal && (
        <div style={{
          background: "rgba(245,158,11,0.12)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: "7px",
          padding: "4px 8px",
          fontSize: "11px",
          color: "#f59e0b",
          fontWeight: "700",
          marginBottom: "8px",
          textAlign: "center",
          letterSpacing: "0.3px",
        }}>
          ⏳ محفوظ محلياً — بانتظار المزامنة
        </div>
      )}

      {/* 1. Order number */}
      <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "15px", marginBottom: "2px" }}>
        {isLocal ? `طلب محلي #${Math.abs(order.id)}` : `طلب #${order.id}`}
      </div>

      {/* 2. Table number + time ago */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ color: "#64748b", fontSize: "12px" }}>
          {order.table_number === 0 ? "🛵 سفري" : `🪑 طاولة ${order.table_number}`}
        </div>
        <div style={{ color: "#64748b", fontSize: "11px" }}>🕐 {timeAgo(order.created_at, now)}</div>
      </div>

      {/* 3. Items */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid #252535",
        borderRadius: "10px",
        padding: "8px 10px",
        marginBottom: "10px",
      }}>
        {aggregated.length > 0 ? aggregated.map((item, i) => (
          <div key={i} style={{
            padding: "4px 0",
            borderBottom: i < aggregated.length - 1 ? "1px solid #1e2030" : "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
                {catEmoji(item.category)} {item.name}
                {item.qty > 1 && (
                  <span style={{
                    background: "rgba(245,158,11,0.18)",
                    color: "#f59e0b",
                    borderRadius: "5px",
                    padding: "1px 6px",
                    fontSize: "11px",
                    fontWeight: "700",
                    marginRight: "6px",
                  }}>
                    ×{item.qty}
                  </span>
                )}
              </span>
              <span style={{ color: "#94a3b8", fontSize: "11px", flexShrink: 0, marginRight: "8px" }}>
                {(item.price * item.qty).toLocaleString()} <span style={{ fontSize: "10px" }}>د.ع</span>
              </span>
            </div>
            {item.mods.length > 0 && (
              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "2px" }}>
                {item.mods.map((m, mi) => (
                  <span key={mi} style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: "4px", padding: "1px 5px", fontSize: "10px" }}>{m}</span>
                ))}
              </div>
            )}
          </div>
        )) : (
          <div style={{ color: "#334155", fontSize: "12px", textAlign: "center", padding: "4px 0" }}>
            — طلب قديم —
          </div>
        )}
      </div>

      {/* 4. Total price */}
      <div style={{
        color: "#f59e0b",
        fontSize: "20px",
        fontWeight: "800",
        marginBottom: "10px",
      }}>
        {order.total_price.toLocaleString()}
        <span style={{ fontSize: "12px", fontWeight: "400", color: "#64748b", marginRight: "4px" }}>د.ع</span>
      </div>

      {/* 5. Extra notes */}
      {order.notes ? (
        <div style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: "9px",
          padding: "8px 12px",
          fontSize: "13px",
          color: "#fbbf24",
          lineHeight: "1.5",
        }}>
          📝 {order.notes}
        </div>
      ) : null}

      {/* Next/Prev buttons — server orders only */}
      {!isLocal && <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
        {stage !== "preparing" && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onPrev(); }}
            style={{ flex: 1, padding: "7px", background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid #252535", borderRadius: "9px", cursor: "pointer", fontSize: "12px" }}
          >← رجوع</button>
        )}
        {stage !== "served" && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onNext(); }}
            style={{
              flex: 2, padding: "7px",
              background: stage === "ready" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.12)",
              color: stage === "ready" ? "#22c55e" : "#f59e0b",
              border: `1px solid ${stage === "ready" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
              borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
            }}
          >{stage === "ready" ? "✅ تقديم" : "التالي →"}</button>
        )}
      </div>}

      {/* Edit / Delete — only while preparing and not a local order */}
      {stage === "preparing" && !isLocal && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px", borderTop: "1px solid #1c1c28", paddingTop: "10px" }}>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setConfirmDel(false); onEdit(); }}
            style={{ flex: 1, padding: "7px", background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
          >✏️ تعديل</button>
          {confirmDel ? (
            <div style={{ flex: 1, display: "flex", gap: "4px" }}>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onDelete(); }}
                disabled={isDeleting}
                style={{ flex: 1, padding: "7px", background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "9px", cursor: isDeleting ? "not-allowed" : "pointer", fontSize: "11px", fontWeight: "700" }}
              >{isDeleting ? "⏳" : "تأكيد"}</button>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setConfirmDel(false); }}
                style={{ padding: "7px 8px", background: "transparent", color: "#64748b", border: "1px solid #252535", borderRadius: "9px", cursor: "pointer", fontSize: "11px" }}
              >لا</button>
            </div>
          ) : (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setConfirmDel(true); }}
              style={{ flex: 1, padding: "7px", background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "9px", cursor: "pointer", fontSize: "12px" }}
            >🗑️ حذف</button>
          )}
        </div>
      )}

      {/* Invoice / Paid — server orders only */}
      {!isLocal && (() => {
        const prePaid   = !!order.payment_method;
        const fullyPaid = prePaid || isPaid;
        const methodIcon = order.payment_method === "card" ? "💳" : order.payment_method === "qr" ? "📱" : "💵";
        return (
          <div style={{ marginTop: "8px", borderTop: "1px solid #1c1c28", paddingTop: "10px" }}>
            {fullyPaid ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
                  borderRadius: "9px", padding: "8px",
                }}>
                  <span style={{ fontSize: "15px" }}>✅</span>
                  <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>تم الدفع</span>
                  {prePaid && <span style={{ fontSize: "14px" }}>{methodIcon}</span>}
                </div>
                {/* Prepaid served order: let cashier close it */}
                {prePaid && stage === "served" && (
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onComplete(); }}
                    style={{
                      width: "100%", padding: "7px",
                      background: "rgba(100,116,139,0.12)", color: "#94a3b8",
                      border: "1px solid #252535", borderRadius: "9px",
                      cursor: "pointer", fontSize: "12px", fontWeight: "600",
                    }}
                  >✓ أغلق الطلب</button>
                )}
              </div>
            ) : (
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onInvoice(); }}
                style={{
                  width: "100%", padding: "8px",
                  background: "linear-gradient(135deg,rgba(245,158,11,0.18),rgba(217,119,6,0.12))",
                  color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.35)",
                  borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "700",
                }}
              >🧾 عرض الفاتورة والدفع</button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Droppable column ── */
function Column({ stage, orders, now, onNext, onPrev, onEdit, onDelete, deletingId, onInvoice, paidIds, onComplete }: {
  stage: typeof STAGES[0]; orders: Order[]; now: number;
  onNext: (id: number) => void; onPrev: (id: number) => void;
  onEdit: (order: Order) => void; onDelete: (id: number) => void; deletingId: number | null;
  onInvoice: (order: Order) => void; paidIds: Set<number>;
  onComplete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div style={{ flex: 1, minWidth: "260px", maxWidth: "320px" }}>
      <div style={{
        background: `${stage.color}10`, border: `1px solid ${stage.color}25`,
        borderRadius: "14px", padding: "10px 14px", marginBottom: "12px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: stage.color, fontWeight: "700", fontSize: "13px" }}>{stage.label}</span>
        <span style={{ background: `${stage.color}20`, color: stage.color, borderRadius: "20px", padding: "2px 9px", fontSize: "12px", fontWeight: "700" }}>{orders.length}</span>
      </div>

      <div
        ref={setNodeRef}
        style={{
          minHeight: "180px", borderRadius: "12px",
          border: isOver ? `2px dashed ${stage.color}50` : "2px solid transparent",
          background: isOver ? `${stage.color}06` : "transparent",
          transition: "all 0.15s", padding: "2px",
        }}
      >
        {orders.map(o => (
          <Card key={o.id} order={o} stage={stage.id} now={now}
            onNext={() => onNext(o.id)} onPrev={() => onPrev(o.id)}
            onEdit={() => onEdit(o)} onDelete={() => onDelete(o.id)}
            isDeleting={deletingId === o.id}
            onInvoice={() => onInvoice(o)} isPaid={paidIds.has(o.id)}
            onComplete={() => onComplete(o.id)} />
        ))}
        {!orders.length && (
          <div style={{ textAlign: "center", color: "#334155", padding: "32px 0", fontSize: "13px" }}>اسحب هنا</div>
        )}
      </div>
    </div>
  );
}

/* ── Page ── */
export default function KanbanPage() {
  const [orders, setOrders]     = useState<Order[]>([]);
  const [stageMap, setStageMap] = useState<Record<number, Stage>>({});
  const [tableList, setTableList] = useState<number[]>([]);
  const [now, setNow]           = useState(Date.now());
  const [loading, setLoading]   = useState(true);
  const [waking, setWaking]     = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const [invoiceOrder, setInvoiceOrder]     = useState<Order | null>(null);
  const [paidIds, setPaidIds]               = useState<Set<number>>(new Set());

  const [editOrderId, setEditOrderId]       = useState<number | null>(null);
  const [editCart, setEditCart]             = useState<EditCartLine[]>([]);
  const [editTable, setEditTable]           = useState(1);
  const [editNotes, setEditNotes]           = useState("");
  const [editMenu, setEditMenu]             = useState<MenuItem[]>([]);
  const [loadingEditMenu, setLoadingEditMenu] = useState(false);
  const [savingEdit, setSavingEdit]         = useState(false);
  const [editError, setEditError]           = useState("");
  const [deletingId, setDeletingId]         = useState<number | null>(null);

  const fetchOrders = useCallback(async () => {
    // Always load local (offline) orders — works without internet
    let localList: Order[] = [];
    try {
      const pending = await getPendingSyncOrders();
      localList = pending.map(lo => ({
        id: -(lo.localId!),
        table_number: lo.table_number,
        total_price: lo.total_price,
        status: "preparing" as const,
        created_at: lo.created_at,
        items: lo.items.map(i => ({ name: i.name, price: i.price, category: i.category || "", modifiers: i.modifiers })),
        cashier: lo.cashier,
        notes: lo.notes,
        payment_method: null,
      }));
    } catch {}

    try {
      let r: Response;
      try {
        r = await fetch(`${API}/orders`);
        if (!r.ok) throw new Error("not ok");
      } catch {
        setWaking(true);
        r = await fetchWithRetry(`${API}/orders`);
        setWaking(false);
      }
      const d = await r.json();
      const list: Order[] = (d.orders || []).filter((o: Order) => o.status !== "cancelled" && o.status !== "done");
      setOrders([...list, ...localList]);
      setStageMap(prev => {
        const next = { ...prev };
        list.forEach(o => {
          const backendStage: Stage =
            o.status === "served" ? "served" :
            o.status === "ready"  ? "ready"  : "preparing";
          if (!(o.id in next)) {
            next[o.id] = backendStage;
          } else {
            // always trust backend for terminal/forward moves; never downgrade locally
            if (backendStage === "served" || backendStage === "ready") {
              next[o.id] = backendStage;
            }
          }
        });
        return next;
      });
    } catch {
      // Server unreachable — show local orders only
      setOrders(localList);
    } finally { setLoading(false); setWaking(false); }
  }, []);


  useEffect(() => {
    fetchOrders();
    const refresh = setInterval(fetchOrders, 30000);
    const tick    = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [fetchOrders]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("waheed_tables_v1");
      if (cached) {
        const parsed = JSON.parse(cached) as number[];
        if (parsed.length > 0) { setTableList(parsed); return; }
      }
    } catch {}
    setTableList(Array.from({ length: 20 }, (_, i) => i + 1));
  }, []);

  const moveTo = async (orderId: number, stage: Stage) => {
    const endpoint: Record<Stage, string> = {
      preparing: `${API}/orders/${orderId}/preparing`,
      ready:     `${API}/orders/${orderId}/ready`,
      served:    `${API}/orders/${orderId}/served`,   // food delivered, NOT paid
    };
    await fetch(endpoint[stage], { method: "PUT" });
    setStageMap(p => ({ ...p, [orderId]: stage }));
  };

  const next = (id: number) => {
    const idx = STAGE_ORDER.indexOf(stageMap[id] ?? "preparing");
    if (idx < STAGE_ORDER.length - 1) moveTo(id, STAGE_ORDER[idx + 1]);
  };
  const prev = (id: number) => {
    const idx = STAGE_ORDER.indexOf(stageMap[id] ?? "preparing");
    if (idx > 0) moveTo(id, STAGE_ORDER[idx - 1]);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const id = parseInt(String(e.active.id));
    if (id < 0) return; // local offline orders can't be moved to server stages
    moveTo(id, String(e.over.id) as Stage);
  };

  const openEdit = async (order: Order) => {
    const aggCart: EditCartLine[] = [];
    for (const item of order.items ?? []) {
      const ex = aggCart.find(c => c.name === item.name);
      if (ex) ex.qty++;
      else aggCart.push({ name: item.name, price: item.price, category: item.category, qty: 1 });
    }
    setEditCart(aggCart);
    setEditTable(order.table_number);
    setEditNotes(order.notes || "");
    setEditError("");
    setEditOrderId(order.id);
    if (editMenu.length === 0) {
      setLoadingEditMenu(true);
      try {
        const r = await fetch(`${API}/menu`);
        const d = await r.json();
        setEditMenu((d.menu || []).filter((i: MenuItem) => i.is_available !== false));
      } finally { setLoadingEditMenu(false); }
    }
  };

  const saveEdit = async () => {
    if (!editOrderId || editCart.length === 0) return;
    setSavingEdit(true); setEditError("");
    try {
      const expanded = editCart.flatMap(c =>
        Array.from({ length: c.qty }, () => ({ name: c.name, price: c.price, category: c.category }))
      );
      const r = await fetch(`${API}/orders/${editOrderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: expanded, table_number: editTable, notes: editNotes }),
      });
      const d = await r.json();
      if (!r.ok) { setEditError(d.detail || d.error || "فشل التعديل"); return; }
      setEditOrderId(null);
      fetchOrders();
    } catch { setEditError("تعذر الاتصال بالسيرفر"); }
    finally { setSavingEdit(false); }
  };

  const deleteOrder = async (orderId: number) => {
    setDeletingId(orderId);
    try {
      await fetch(`${API}/orders/${orderId}`, { method: "DELETE" });
      setOrders(p => p.filter(o => o.id !== orderId));
      setStageMap(p => { const n = { ...p }; delete n[orderId]; return n; });
    } finally { setDeletingId(null); }
  };

  const completeOrder = async (orderId: number) => {
    await fetch(`${API}/orders/${orderId}/done`, { method: "PUT" });
    setOrders(p => p.filter(o => o.id !== orderId));
    setStageMap(p => { const n = { ...p }; delete n[orderId]; return n; });
  };

  const byStage = (s: Stage) => orders.filter(o => {
    if (o.id < 0) return s === "preparing"; // local orders are always in preparing
    return (stageMap[o.id] ?? "preparing") === s;
  });
  const active  = orders.length;

  return (
    <div style={{ padding: "24px 24px 0", background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>📋 لوحة الطلبات</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {waking ? "الخادم يستيقظ، لحظة..." : loading ? "جاري التحميل..." : `${active} طلب نشط • يتحدث كل 30 ثانية`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => setShowDrawer(true)}
            style={{
              padding: "10px 20px", display: "flex", alignItems: "center", gap: "7px",
              background: "linear-gradient(135deg,#f59e0b,#d97706)",
              color: "#000", border: "none", borderRadius: "12px",
              cursor: "pointer", fontSize: "14px", fontWeight: "800",
              boxShadow: "0 4px 16px rgba(245,158,11,0.4)",
            }}
          >
            ➕ طلب جديد
          </button>
          <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            🔄 تحديث
          </button>
        </div>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "24px", alignItems: "flex-start" }}>
          {STAGES.map(s => (
            <Column key={s.id} stage={s} orders={byStage(s.id)} now={now}
              onNext={next} onPrev={prev}
              onEdit={openEdit} onDelete={deleteOrder} deletingId={deletingId}
              onInvoice={setInvoiceOrder} paidIds={paidIds}
              onComplete={completeOrder} />
          ))}
        </div>
      </DndContext>

      {/* ── Edit Order Modal ── */}
      {editOrderId !== null && (() => {
        const editTotal = editCart.reduce((s, c) => s + c.price * c.qty, 0);
        const addToCart = (item: MenuItem) => {
          if (item.out_of_stock) return;
          setEditCart(prev => {
            const ex = prev.find(c => c.name === item.name);
            return ex ? prev.map(c => c.name === item.name ? { ...c, qty: c.qty + 1 } : c)
                      : [...prev, { name: item.name, price: item.price, category: item.category, qty: 1 }];
          });
        };
        const setEditQty = (name: string, delta: number) =>
          setEditCart(prev => prev.flatMap(c => {
            if (c.name !== name) return [c];
            const q = c.qty + delta;
            return q > 0 ? [{ ...c, qty: q }] : [];
          }));
        return (
          <div onClick={() => !savingEdit && setEditOrderId(null)}
            style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "860px", maxHeight: "88vh", display: "flex", flexDirection: "column", direction: "rtl", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.9)" }}>

              {/* Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #252535", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "16px" }}>✏️ تعديل طلب #{editOrderId}</div>
                <button onClick={() => setEditOrderId(null)} style={{ width: "34px", height: "34px", borderRadius: "10px", background: "#1c1c28", border: "1px solid #252535", color: "#64748b", cursor: "pointer", fontSize: "16px" }}>✕</button>
              </div>

              <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

                {/* Left — add from menu */}
                <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", borderLeft: "1px solid #1c1c28", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", color: "#64748b", fontSize: "11px", fontWeight: "700", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>إضافة أصناف</div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: "8px", alignContent: "start" }}>
                    {loadingEditMenu ? (
                      <div style={{ gridColumn: "1/-1", textAlign: "center", paddingTop: "40px", color: "#64748b" }}>⏳ تحميل...</div>
                    ) : editMenu.map(item => {
                      const inCart = editCart.find(c => c.name === item.name);
                      const sold = item.out_of_stock === true;
                      return (
                        <button key={item.id} onClick={() => addToCart(item)} disabled={sold}
                          style={{ background: sold ? "#16161f" : inCart ? "rgba(245,158,11,0.1)" : "#1c1c28", border: `1px solid ${sold ? "#1c1c28" : inCart ? "rgba(245,158,11,0.45)" : "#252535"}`, borderRadius: "12px", padding: "10px 8px", cursor: sold ? "not-allowed" : "pointer", textAlign: "center", opacity: sold ? 0.4 : 1, position: "relative" }}>
                          {sold && <span style={{ position: "absolute", top: "5px", right: "5px", background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: "4px", padding: "1px 5px", fontSize: "8px", fontWeight: "700", border: "1px solid rgba(239,68,68,0.3)" }}>نفد</span>}
                          {inCart && !sold && <span style={{ position: "absolute", top: "5px", left: "5px", background: "#f59e0b", color: "#000", borderRadius: "50%", width: "18px", height: "18px", fontSize: "10px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center" }}>{inCart.qty}</span>}
                          <div style={{ fontSize: "22px", marginBottom: "4px" }}>{catEmoji(item.category)}</div>
                          <div style={{ color: "#f1f5f9", fontSize: "11px", fontWeight: "600" }}>{item.name}</div>
                          <div style={{ color: "#f59e0b", fontSize: "11px", fontWeight: "700", marginTop: "2px" }}>{item.price.toLocaleString()}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right — cart + options */}
                <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", background: "#0d0d14", overflow: "hidden" }}>

                  {/* Table picker */}
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: "600", marginBottom: "6px" }}>🪑 الطاولة</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "4px", maxHeight: "108px", overflowY: "auto" }}>
                      <button onClick={() => setEditTable(0)}
                        style={{ gridColumn: "span 2", padding: "8px 2px", borderRadius: "8px",
                          background: editTable === 0 ? "rgba(99,102,241,0.18)" : "#1c1c28",
                          color: editTable === 0 ? "#818cf8" : "#64748b",
                          border: `1px solid ${editTable === 0 ? "rgba(99,102,241,0.5)" : "#252535"}`,
                          cursor: "pointer", fontSize: "12px", fontWeight: editTable === 0 ? "800" : "500",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                        }}>🛵 سفري</button>
                      {tableList.map(t => (
                        <button key={t} onClick={() => setEditTable(t)}
                          style={{ padding: "8px 2px", borderRadius: "8px", background: editTable === t ? "rgba(245,158,11,0.2)" : "#1c1c28", color: editTable === t ? "#f59e0b" : "#64748b", border: `1px solid ${editTable === t ? "rgba(245,158,11,0.5)" : "#252535"}`, cursor: "pointer", fontSize: "13px", fontWeight: editTable === t ? "800" : "500" }}>{t}</button>
                      ))}
                    </div>
                  </div>

                  {/* Cart items */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
                    {editCart.length === 0
                      ? <div style={{ textAlign: "center", color: "#334155", paddingTop: "40px", fontSize: "12px" }}>السلة فارغة</div>
                      : editCart.map(c => (
                        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid #1c1c28" }}>
                          <div style={{ fontSize: "18px", flexShrink: 0 }}>{catEmoji(c.category)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: "#f1f5f9", fontSize: "12px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                            <div style={{ color: "#f59e0b", fontSize: "11px" }}>{(c.price * c.qty).toLocaleString()} <span style={{ color: "#64748b" }}>د.ع</span></div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
                            <button onClick={() => setEditQty(c.name, -1)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: c.qty === 1 ? "rgba(239,68,68,0.12)" : "#252535", border: "none", color: c.qty === 1 ? "#ef4444" : "#94a3b8", cursor: "pointer", fontSize: c.qty === 1 ? "12px" : "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>{c.qty === 1 ? "🗑" : "−"}</button>
                            <span style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "800", minWidth: "18px", textAlign: "center" }}>{c.qty}</span>
                            <button onClick={() => setEditQty(c.name, 1)} style={{ width: "26px", height: "26px", borderRadius: "7px", background: "rgba(245,158,11,0.15)", border: "none", color: "#f59e0b", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: "12px 14px", borderTop: "1px solid #1c1c28", flexShrink: 0 }}>
                    {editCart.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", padding: "8px 12px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)", borderRadius: "10px" }}>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>الإجمالي</span>
                        <span style={{ color: "#f59e0b", fontSize: "18px", fontWeight: "900" }}>{editTotal.toLocaleString()} <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "400" }}>د.ع</span></span>
                      </div>
                    )}
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="ملاحظات..." rows={2}
                      style={{ width: "100%", boxSizing: "border-box", background: "#1c1c28", border: "1px solid #252535", borderRadius: "8px", color: "#f1f5f9", padding: "7px 10px", fontSize: "11px", resize: "none", outline: "none", direction: "rtl", fontFamily: "inherit", marginBottom: "8px" }} />
                    {editError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "7px 10px", color: "#ef4444", fontSize: "11px", marginBottom: "8px" }}>⚠️ {editError}</div>}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setEditOrderId(null)} style={{ flex: 1, padding: "11px", background: "rgba(100,116,139,0.1)", color: "#94a3b8", border: "1px solid #252535", borderRadius: "11px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>إلغاء</button>
                      <button onClick={saveEdit} disabled={savingEdit || editCart.length === 0}
                        style={{ flex: 2, padding: "11px", background: savingEdit || editCart.length === 0 ? "#1c1c28" : "linear-gradient(135deg,#f59e0b,#d97706)", color: savingEdit || editCart.length === 0 ? "#64748b" : "#000", border: "none", borderRadius: "11px", cursor: savingEdit || editCart.length === 0 ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "800" }}>
                        {savingEdit ? "⏳ جاري الحفظ..." : "💾 حفظ التعديلات"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showDrawer && (
        <NewOrderDrawer
          onClose={() => setShowDrawer(false)}
          onSuccess={() => { fetchOrders(); setShowDrawer(false); }}
        />
      )}

      {invoiceOrder && (
        <BillModal
          order={invoiceOrder}
          onClose={() => setInvoiceOrder(null)}
          payOnly
          onPaid={() => {
            const id = invoiceOrder.id;
            setPaidIds(p => new Set(p).add(id));
            // Update local order so prePaid badge shows immediately without waiting for next poll
            setOrders(p => p.map(o => o.id === id ? { ...o, payment_method: o.payment_method ?? "cash" } : o));
          }}
        />
      )}
    </div>
  );
}
