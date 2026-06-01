"use client";
import { useState, useEffect, useCallback } from "react";
import { DndContext, DragEndEvent, useDroppable, useDraggable, closestCenter } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import NewOrderDrawer from "@/components/NewOrderDrawer";

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

type OrderItem = { name: string; price: number; category: string };
type Order = {
  id: number;
  table_number: number;
  total_price: number;
  status: string;
  created_at: string;
  items: OrderItem[];
  cashier: string;
  notes: string;
};
type Stage = "new" | "preparing" | "ready" | "served";

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "new",       label: "🟡 جديد",       color: "#f59e0b" },
  { id: "preparing", label: "🟠 قيد التحضير", color: "#f97316" },
  { id: "ready",     label: "🟢 جاهز",        color: "#22c55e" },
  { id: "served",    label: "⚪ تم التقديم",   color: "#64748b" },
];
const STAGE_ORDER: Stage[] = ["new", "preparing", "ready", "served"];

const CAT_EMOJI: Record<string, string> = {
  "برجر": "🍔", "بيتزا": "🍕", "مشروبات": "🥤",
  "حلويات": "🍰", "مقبلات": "🥗", "رئيسية": "🍽️",
  "وجبات": "🍽️", "أخرى": "🍴",
};
const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🍴";

function aggregateItems(items: OrderItem[]) {
  const map: Record<string, { name: string; price: number; category: string; qty: number }> = {};
  for (const item of items) {
    if (map[item.name]) map[item.name].qty++;
    else map[item.name] = { name: item.name, price: item.price, category: item.category || "", qty: 1 };
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
function Card({ order, stage, now, onNext, onPrev }: {
  order: Order; stage: Stage; now: number;
  onNext: () => void; onPrev: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(order.id) });
  const mins = elapsedMins(order.created_at, now);
  const tc   = stageColor(mins, stage);
  const aggregated = order.items?.length ? aggregateItems(order.items) : [];

  return (
    <div
      ref={setNodeRef}
      {...listeners} {...attributes}
      style={{
        background: "#1c1c28",
        border: `1px solid ${tc}35`,
        borderRight: `4px solid ${tc}`,
        borderRadius: "14px",
        padding: "14px",
        marginBottom: "10px",
        cursor: "grab",
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1,
        userSelect: "none",
      }}
    >
      {/* 1. Order number */}
      <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "15px", marginBottom: "2px" }}>
        طلب #{order.id}
      </div>

      {/* 2. Table number + time ago */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ color: "#64748b", fontSize: "12px" }}>🪑 طاولة {order.table_number}</div>
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 0",
            borderBottom: i < aggregated.length - 1 ? "1px solid #1e2030" : "none",
          }}>
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

      {/* Next/Prev buttons — kept for usability */}
      <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
        {stage !== "new" && (
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
      </div>
    </div>
  );
}

/* ── Droppable column ── */
function Column({ stage, orders, now, onNext, onPrev }: {
  stage: typeof STAGES[0]; orders: Order[]; now: number;
  onNext: (id: number) => void; onPrev: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div style={{ flex: 1, minWidth: "240px", maxWidth: "300px" }}>
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
            onNext={() => onNext(o.id)} onPrev={() => onPrev(o.id)} />
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
  const [now, setNow]           = useState(Date.now());
  const [loading, setLoading]   = useState(true);
  const [waking, setWaking]     = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const fetchOrders = useCallback(async () => {
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
      setOrders(list);
      setStageMap(prev => {
        const next = { ...prev };
        list.forEach(o => {
          if (!(o.id in next)) {
            if (o.status === "done")        next[o.id] = "served";
            else if (o.status === "ready")  next[o.id] = "ready";
            else                            next[o.id] = "new";
          } else {
            if (o.status === "done") {
              next[o.id] = "served";
            } else if (o.status === "ready" && (next[o.id] === "new" || next[o.id] === "preparing")) {
              // kitchen marked ready → push to جاهز column
              next[o.id] = "ready";
            }
          }
        });
        return next;
      });
    } finally { setLoading(false); setWaking(false); }
  }, []);

  // Load saved stages from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kanban_stages");
      if (saved) setStageMap(JSON.parse(saved));
    } catch {}
  }, []);

  // Persist stage positions to localStorage on every change
  useEffect(() => {
    if (Object.keys(stageMap).length > 0) {
      localStorage.setItem("kanban_stages", JSON.stringify(stageMap));
    }
  }, [stageMap]);

  useEffect(() => {
    fetchOrders();
    const refresh = setInterval(fetchOrders, 30000);
    const tick    = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [fetchOrders]);

  const moveTo = async (orderId: number, stage: Stage) => {
    if (stage === "served") {
      await fetch(`${API}/orders/${orderId}/done`, { method: "PUT" });
    }
    setStageMap(p => ({ ...p, [orderId]: stage }));
  };

  const next = (id: number) => {
    const idx = STAGE_ORDER.indexOf(stageMap[id] ?? "new");
    if (idx < STAGE_ORDER.length - 1) moveTo(id, STAGE_ORDER[idx + 1]);
  };
  const prev = (id: number) => {
    const idx = STAGE_ORDER.indexOf(stageMap[id] ?? "new");
    if (idx > 0) setStageMap(p => ({ ...p, [id]: STAGE_ORDER[idx - 1] }));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    moveTo(parseInt(String(e.active.id)), String(e.over.id) as Stage);
  };

  const byStage = (s: Stage) => orders.filter(o => (stageMap[o.id] ?? "new") === s);
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
              onNext={next} onPrev={prev} />
          ))}
        </div>
      </DndContext>

      {showDrawer && (
        <NewOrderDrawer
          onClose={() => setShowDrawer(false)}
          onSuccess={() => { fetchOrders(); setShowDrawer(false); }}
        />
      )}
    </div>
  );
}
