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

type Order = { id: number; table_number: number; total_price: number; status: string; created_at: string; };
type Stage = "new" | "preparing" | "ready" | "served";

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "new",       label: "🟡 جديد",       color: "#f59e0b" },
  { id: "preparing", label: "🟠 قيد التحضير", color: "#f97316" },
  { id: "ready",     label: "🟢 جاهز",        color: "#22c55e" },
  { id: "served",    label: "⚪ تم التقديم",   color: "#64748b" },
];
const STAGE_ORDER: Stage[] = ["new", "preparing", "ready", "served"];

function elapsed(created_at: string, now: number) {
  const ms = now - new Date(created_at).getTime();
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  return { label: `${m}:${s.toString().padStart(2, "0")}`, mins: m };
}

function timerColor(mins: number, stage: Stage) {
  if (stage === "ready")  return "#22c55e";
  if (stage === "served") return "#64748b";
  if (mins < 5)  return "#f59e0b";
  if (mins < 15) return "#f97316";
  return "#ef4444";
}

/* ── Draggable card ── */
function Card({ order, stage, now, onNext, onPrev }: {
  order: Order; stage: Stage; now: number;
  onNext: () => void; onPrev: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(order.id) });
  const { label: timer, mins } = elapsed(order.created_at, now);
  const tc = timerColor(mins, stage);

  return (
    <div
      ref={setNodeRef}
      {...listeners} {...attributes}
      style={{
        background: "#1c1c28", border: `1px solid ${tc}30`,
        borderRight: `4px solid ${tc}`, borderRadius: "14px",
        padding: "14px", marginBottom: "10px", cursor: "grab",
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1, userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "14px" }}>طلب #{order.id}</div>
          <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>🪑 طاولة {order.table_number}</div>
        </div>
        <div style={{ background: `${tc}18`, color: tc, borderRadius: "8px", padding: "4px 9px", fontSize: "12px", fontWeight: "700" }}>
          ⏱ {timer}
        </div>
      </div>

      <div style={{ color: "#f59e0b", fontSize: "18px", fontWeight: "800", marginBottom: "4px" }}>
        {order.total_price.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: "400" }}>د.ع</span>
      </div>

      {mins >= 15 && stage !== "ready" && stage !== "served" && (
        <div style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "4px 10px", fontSize: "11px", marginBottom: "10px" }}>
          ⚠️ تأخر — {mins} دقيقة
        </div>
      )}

      <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
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
    <div style={{ flex: 1, minWidth: "230px", maxWidth: "300px" }}>
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
  const [orders, setOrders]   = useState<Order[]>([]);
  const [stageMap, setStageMap] = useState<Record<number, Stage>>({});
  const [now, setNow]         = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [waking, setWaking]   = useState(false);
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
      const list: Order[] = (d.orders || []).filter((o: Order) => o.status !== "cancelled");
      setOrders(list);
      setStageMap(prev => {
        const next = { ...prev };
        list.forEach(o => {
          if (!(o.id in next)) next[o.id] = o.status === "done" ? "served" : "new";
          if (o.status === "done") next[o.id] = "served";
        });
        return next;
      });
    } finally { setLoading(false); setWaking(false); }
  }, []);

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
  const active  = orders.filter(o => o.status === "pending").length;

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
