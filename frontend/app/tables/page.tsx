"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "react-qr-code";

const API  = "https://waheed-system-production.up.railway.app";
const GRID = 30;
const snap = (v: number) => Math.round(v / GRID) * GRID;

const TABLE_FILL     = "#A88C77";
const TABLE_STROKE   = "#333333";
const TABLE_STROKE_W = 2;

type ElementType = "round_table" | "rect_table" | "wall" | "door";
type LayoutEl    = { id: string; type: ElementType; x: number; y: number; w: number; h: number; tableNumber?: number; capacity?: number };
type Order       = { id: number; table_number: number; total_price: number; status: string; created_at: string; items?: { name: string; price: number; category: string }[] };

const PALETTE: { type: ElementType; label: string; icon: string; dw: number; dh: number }[] = [
  { type: "round_table", label: "طاولة دائرية", icon: "⭕", dw: 100, dh: 100 },
  { type: "rect_table",  label: "طاولة عائلية", icon: "⬜", dw: 140, dh: 100 },
  { type: "wall",        label: "جدار",          icon: "🧱", dw: 180, dh: 30  },
  { type: "door",        label: "باب",           icon: "🚪", dw: 60,  dh: 30  },
];

function elapsedStr(created_at: string) {
  const s  = created_at.endsWith("Z") || created_at.includes("+") ? created_at : created_at + "Z";
  const ms = Math.max(0, Date.now() - new Date(s).getTime());
  const m  = Math.floor(ms / 60000);
  const sc = Math.floor((ms % 60000) / 1000);
  return `${m}:${sc.toString().padStart(2, "0")}`;
}

/* ── Chair: seat (cushion) faces toward table, backrest arches away ── */
function Chair({ cx, cy, angleDeg, size = 16 }: {
  cx: number; cy: number; angleDeg: number; size?: number;
}) {
  const hw  = size * 0.48;
  const sh  = size * 0.50;  // seat height
  const bh  = size * 0.42;  // backrest height
  const tot = sh + bh;
  const sy1 = -tot / 2;     // seat top (toward table)
  const sy2 = sy1 + sh;     // seat bottom / backrest start

  return (
    <g transform={`translate(${cx},${cy}) rotate(${angleDeg - 90})`}>
      {/* Backrest arch — away from table */}
      <path
        d={`M ${-hw},${sy2} L ${-hw},${sy2 + bh * 0.6}
            A ${hw * 1.1},${bh * 0.55} 0 0,0 ${hw},${sy2 + bh * 0.6}
            L ${hw},${sy2} Z`}
        fill="#D4BC9E" stroke={TABLE_STROKE} strokeWidth={1.2} strokeLinejoin="round"
      />
      {/* Seat cushion */}
      <rect x={-hw} y={sy1} width={hw * 2} height={sh} rx={3}
        fill="#E8D5BE" stroke={TABLE_STROKE} strokeWidth={1.2} />
    </g>
  );
}

/* ── Distribute chair count along table sides ── */
function getChairLayout(seats: number) {
  if (seats <= 0) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (seats === 1) return { top: 0, bottom: 1, left: 0, right: 0 };
  if (seats === 2) return { top: 1, bottom: 1, left: 0, right: 0 };
  const side = seats > 4 ? Math.min(2, seats - 4) : 0;
  const tb   = seats - side;
  return { top: Math.ceil(tb / 2), bottom: Math.floor(tb / 2), left: Math.floor(side / 2), right: Math.ceil(side / 2) };
}

/* ── Round table blueprint ── */
function DynamicRoundTable({ w, h, seats, occupied, editMode, selected, tableNumber }: {
  w: number; h: number; seats: number; occupied: boolean;
  editMode: boolean; selected: boolean; tableNumber?: number;
}) {
  const cx = w / 2;
  const cy = h / 2;
  const minDim  = Math.min(w, h);
  const chairSz = Math.max(10, Math.min(16, minDim * 0.16));
  const tableR  = minDim / 2 - chairSz * 1.35;
  const chairR  = tableR + chairSz * 0.75;
  const statusC = editMode ? "#64748b" : occupied ? "#ef4444" : "#22c55e";
  const bordC   = selected ? "#f59e0b" : editMode ? TABLE_STROKE : statusC;

  return (
    <svg width={w} height={h} style={{ overflow: "visible", display: "block" }}>
      {/* Wood grain rings */}
      {[0.80, 0.58, 0.34].map((f, i) => (
        <circle key={i} cx={cx} cy={cy} r={Math.max(2, tableR * f)}
          fill="none" stroke={TABLE_STROKE} strokeWidth={0.5} opacity={0.22} />
      ))}
      {/* Table body */}
      <circle cx={cx} cy={cy} r={tableR}
        fill={TABLE_FILL} stroke={bordC} strokeWidth={selected ? 3 : TABLE_STROKE_W} />
      {/* Status ring (live only) */}
      {!editMode && (
        <circle cx={cx} cy={cy} r={tableR + 5} fill="none"
          stroke={statusC} strokeWidth={1.8} opacity={0.5}
          strokeDasharray={occupied ? undefined : "4 3"} />
      )}
      {/* Table number */}
      {tableNumber != null && (
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" direction="ltr"
          fill={editMode ? "#f1f5f9" : occupied ? "#ef4444" : "#22c55e"}
          fontSize={Math.max(9, Math.min(16, tableR * 0.62))} fontWeight="800"
          fontFamily="Arial,sans-serif">
          {tableNumber}
        </text>
      )}
      {/* Status dot (live only) */}
      {!editMode && (
        <circle cx={cx + tableR * 0.58} cy={cy - tableR * 0.58} r={4}
          fill={statusC} stroke="#111118" strokeWidth={1.5} />
      )}
      {/* Chairs */}
      {Array.from({ length: seats }, (_, i) => {
        const a   = (i * 360 / seats) - 90;
        const rad = (a * Math.PI) / 180;
        return <Chair key={i} cx={cx + chairR * Math.cos(rad)} cy={cy + chairR * Math.sin(rad)} angleDeg={a} size={chairSz} />;
      })}
    </svg>
  );
}

/* ── Rectangular table blueprint ── */
function DynamicRectangularTable({ w, h, seats, occupied, editMode, selected, tableNumber }: {
  w: number; h: number; seats: number; occupied: boolean;
  editMode: boolean; selected: boolean; tableNumber?: number;
}) {
  const chairSz = 16;
  const pad     = 22;
  const tx = pad, ty = pad;
  const tw = w - pad * 2;
  const th = h - pad * 2;
  const tot     = chairSz * 0.50 + chairSz * 0.42;  // sh + bh
  const half    = tot / 2;
  const layout  = getChairLayout(seats);
  const statusC = editMode ? "#64748b" : occupied ? "#ef4444" : "#22c55e";
  const bordC   = selected ? "#f59e0b" : editMode ? TABLE_STROKE : statusC;

  const span = (n: number, len: number, off: number) =>
    Array.from({ length: n }, (_, i) => off + len * (i + 1) / (n + 1));

  const topXs   = span(layout.top,    tw, tx);
  const botXs   = span(layout.bottom, tw, tx);
  const leftYs  = span(layout.left,   th, ty);
  const rightYs = span(layout.right,  th, ty);

  return (
    <svg width={w} height={h} style={{ overflow: "visible", display: "block" }}>
      {/* Wood grain lines */}
      {Array.from({ length: 4 }, (_, i) => (
        <line key={i}
          x1={tx + 8} y1={ty + (th * (i + 1) / 5)}
          x2={tx + tw - 8} y2={ty + (th * (i + 1) / 5)}
          stroke={TABLE_STROKE} strokeWidth={0.6} opacity={0.18} />
      ))}
      {/* Table body */}
      <rect x={tx} y={ty} width={tw} height={th} rx={8}
        fill={TABLE_FILL} stroke={bordC} strokeWidth={selected ? 3 : TABLE_STROKE_W} />
      {/* Status border (live only) */}
      {!editMode && (
        <rect x={tx - 5} y={ty - 5} width={tw + 10} height={th + 10} rx={12}
          fill="none" stroke={statusC} strokeWidth={1.8} opacity={0.45}
          strokeDasharray={occupied ? undefined : "4 3"} />
      )}
      {/* Table number */}
      {tableNumber != null && (
        <text x={tx + tw / 2} y={ty + th / 2 + 1}
          textAnchor="middle" dominantBaseline="middle" direction="ltr"
          fill={editMode ? "#f1f5f9" : occupied ? "#ef4444" : "#22c55e"}
          fontSize={Math.max(9, Math.min(16, th * 0.38))} fontWeight="800"
          fontFamily="Arial,sans-serif">
          {tableNumber}
        </text>
      )}
      {/* Status dot (live only) */}
      {!editMode && (
        <circle cx={tx + tw - 10} cy={ty + 10} r={4}
          fill={statusC} stroke="#111118" strokeWidth={1.5} />
      )}
      {/* Chairs — each side's center is half a chair away from the table edge */}
      {topXs.map((x, i)   => <Chair key={`t${i}`} cx={x}           cy={ty - half}      angleDeg={270} size={chairSz} />)}
      {botXs.map((x, i)   => <Chair key={`b${i}`} cx={x}           cy={ty + th + half} angleDeg={90}  size={chairSz} />)}
      {leftYs.map((y, i)  => <Chair key={`l${i}`} cx={tx - half}   cy={y}              angleDeg={180} size={chairSz} />)}
      {rightYs.map((y, i) => <Chair key={`r${i}`} cx={tx + tw + half} cy={y}           angleDeg={0}   size={chairSz} />)}
    </svg>
  );
}

/* ── Canvas element wrapper ── */
function CanvasEl({ el, editMode, selected, occupied, onDown, onResizeDown }: {
  el: LayoutEl; editMode: boolean; selected: boolean; occupied: boolean;
  onDown: (e: React.MouseEvent) => void;
  onResizeDown: (e: React.MouseEvent) => void;
}) {
  const isTable = el.type === "round_table" || el.type === "rect_table";
  const isRound = el.type === "round_table";
  const isWall  = el.type === "wall";

  if (isTable) {
    const seats = el.capacity ?? (isRound ? 4 : 6);
    return (
      <div
        onMouseDown={onDown}
        style={{
          position: "absolute", left: el.x, top: el.y,
          width: el.w, height: el.h,
          cursor: editMode ? "grab" : "pointer",
          userSelect: "none", overflow: "visible",
        }}
      >
        {isRound
          ? <DynamicRoundTable w={el.w} h={el.h} seats={seats} occupied={occupied} editMode={editMode} selected={selected} tableNumber={el.tableNumber} />
          : <DynamicRectangularTable w={el.w} h={el.h} seats={seats} occupied={occupied} editMode={editMode} selected={selected} tableNumber={el.tableNumber} />
        }
        {editMode && (
          <div
            onMouseDown={e => { e.stopPropagation(); onResizeDown(e); }}
            style={{
              position: "absolute", right: -5, bottom: -5,
              width: 14, height: 14, zIndex: 10,
              background: selected ? "#f59e0b" : "#334155",
              border: `1px solid ${selected ? "#d97706" : "#475569"}`,
              borderRadius: 3, cursor: "se-resize",
            }}
          />
        )}
      </div>
    );
  }

  /* Wall / Door */
  const bg   = isWall ? "#2d3748" : "#1a2744";
  const bord = selected ? "#f59e0b" : isWall ? "#4a5568" : "#3b82f6";
  return (
    <div
      onMouseDown={onDown}
      style={{
        position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        borderRadius: 4, background: bg, border: `${selected ? 2 : 1}px solid ${bord}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: editMode ? "grab" : "default", userSelect: "none", boxSizing: "border-box",
      }}
    >
      {isWall  && <div style={{ color: "#94a3b8", fontSize: 9, opacity: 0.6 }}>جدار</div>}
      {!isWall && <div style={{ fontSize: 14 }}>🚪</div>}
      {editMode && (
        <div
          onMouseDown={e => { e.stopPropagation(); onResizeDown(e); }}
          style={{
            position: "absolute", right: -5, bottom: -5, width: 14, height: 14,
            background: selected ? "#f59e0b" : "#334155",
            border: `1px solid ${selected ? "#d97706" : "#475569"}`,
            borderRadius: 3, cursor: "se-resize",
          }}
        />
      )}
    </div>
  );
}

/* ── Page ── */
export default function TablesPage() {
  const [elements, setElements]       = useState<LayoutEl[]>([]);
  const [editMode, setEditMode]       = useState(false);
  const [selected, setSelected]       = useState<string | null>(null);
  const [orders, setOrders]           = useState<Order[]>([]);
  const [loading, setLoad]            = useState(true);
  const [qrBase, setQrBase]           = useState("");
  const [activeTable, setActiveTable] = useState<number | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostPos, setGhostPos]       = useState({ x: 0, y: 0 });
  const [showQuickSetup, setShowQuickSetup] = useState(false);
  const [quickCount, setQuickCount]   = useState(10);

  const dragging    = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const resizing    = useRef<{ id: string; mx: number; my: number; ow: number; oh: number } | null>(null);
  const paletteDrag = useRef<{ type: ElementType; dw: number; dh: number } | null>(null);
  const canvasRef   = useRef<HTMLDivElement>(null);
  const elRef       = useRef<LayoutEl[]>([]);
  useEffect(() => { elRef.current = elements; }, [elements]);

  const fetchLayout = useCallback(async () => {
    try {
      const r = await fetch(`${API}/table-layout`);
      const d = await r.json();
      if (d.elements?.length > 0) {
        setElements(d.elements.map((e: Record<string, unknown>) => ({
          id: e.element_id as string,
          type: e.element_type as ElementType,
          x: e.x as number, y: e.y as number,
          w: e.w as number, h: e.h as number,
          tableNumber: (e.table_number as number) ?? undefined,
          capacity:    (e.capacity    as number) ?? undefined,
        })));
      }
    } catch {}
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/orders`);
      const d = await r.json();
      setOrders((d.orders || []).filter((o: Order) => o.status === "pending"));
    } finally { setLoad(false); }
  }, []);

  useEffect(() => {
    fetchLayout();
    fetchOrders();
    fetch("/api/site-url").then(r => r.json()).then(d => setQrBase(d.url as string)).catch(() => {});
    const id = setInterval(fetchOrders, 20000);
    return () => clearInterval(id);
  }, [fetchLayout, fetchOrders]);

  /* Global drag / resize / palette-drop handlers */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (dragging.current) {
        const nx = Math.max(0, snap(e.clientX - rect.left - dragging.current.ox));
        const ny = Math.max(0, snap(e.clientY - rect.top  - dragging.current.oy));
        const id = dragging.current.id;
        setElements(els => els.map(el => el.id === id ? { ...el, x: nx, y: ny } : el));
      }

      if (resizing.current) {
        const { id, mx, my, ow, oh } = resizing.current;
        setElements(els => els.map(el => el.id === id ? {
          ...el,
          w: Math.max(GRID * 2, snap(ow + e.clientX - mx)),
          h: Math.max(GRID,     snap(oh + e.clientY - my)),
        } : el));
      }

      if (paletteDrag.current) setGhostPos({ x: e.clientX, y: e.clientY });
    };

    const onUp = (e: MouseEvent) => {
      if (paletteDrag.current) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          if (cx >= 0 && cy >= 0 && cx <= rect.width && cy <= rect.height) {
            const pd = paletteDrag.current;
            const isTable = pd.type === "round_table" || pd.type === "rect_table";
            const used = new Set(elRef.current.filter(e => e.tableNumber).map(e => e.tableNumber!));
            let nextNum = 1;
            while (used.has(nextNum)) nextNum++;
            const newEl: LayoutEl = {
              id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              type: pd.type,
              x: snap(Math.max(0, cx - pd.dw / 2)),
              y: snap(Math.max(0, cy - pd.dh / 2)),
              w: pd.dw, h: pd.dh,
              tableNumber: isTable ? nextNum : undefined,
              capacity:    pd.type === "round_table" ? 4 : pd.type === "rect_table" ? 6 : undefined,
            };
            setElements(els => [...els, newEl]);
            setSelected(newEl.id);
          }
        }
        paletteDrag.current = null;
        setGhostVisible(false);
      }
      dragging.current = null;
      resizing.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const saveLayout = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/table-layout/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elements: elements.map(el => ({
            element_id: el.id, element_type: el.type,
            x: el.x, y: el.y, w: el.w, h: el.h,
            table_number: el.tableNumber ?? null,
            capacity:     el.capacity    ?? null,
            label: "",
          })),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const handleQuickSetup = async () => {
    const cols = 5;
    const tableW = 100, tableH = 100;
    const gapX = 35, gapY = 48;
    const startX = 30, startY = 30;
    const newEls: LayoutEl[] = Array.from({ length: quickCount }, (_, i) => ({
      id: `quick_${i + 1}_${Date.now()}_${i}`,
      type: "round_table" as ElementType,
      x: startX + (i % cols) * (tableW + gapX),
      y: startY + Math.floor(i / cols) * (tableH + gapY),
      w: tableW, h: tableH,
      tableNumber: i + 1,
      capacity: 4,
    }));
    setElements(newEls);
    setShowQuickSetup(false);
    setSaving(true);
    try {
      await fetch(`${API}/table-layout/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elements: newEls.map(el => ({
            element_id: el.id, element_type: el.type,
            x: el.x, y: el.y, w: el.w, h: el.h,
            table_number: el.tableNumber ?? null,
            capacity: el.capacity ?? null,
            label: "",
          })),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const occupiedTables    = new Set(orders.map(o => o.table_number));
  const tableEls          = elements.filter(e => e.type === "round_table" || e.type === "rect_table");
  const occupiedCount     = tableEls.filter(e => e.tableNumber && occupiedTables.has(e.tableNumber)).length;
  const selectedEl        = elements.find(e => e.id === selected);
  const activeTableOrders = activeTable ? orders.filter(o => o.table_number === activeTable) : [];

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "6px 8px",
    background: "#0a0a0f", border: "1px solid #252535",
    borderRadius: 8, color: "#f1f5f9",
    fontSize: 12, boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 24, background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editMode ? 18 : 24 }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: 20, fontWeight: 700 }}>🪑 خريطة الطاولات</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
            {editMode
              ? `${elements.length} عنصر • اسحب من القائمة الجانبية للإضافة`
              : loading ? "جاري التحميل..."
              : `${occupiedCount} مشغولة • ${tableEls.length - occupiedCount} متاحة • يتحدث كل 20 ث`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {editMode && (
            <button onClick={saveLayout} disabled={saving} style={{
              padding: "9px 20px", fontSize: 13, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer", borderRadius: 12, border: "none",
              background: saved ? "rgba(34,197,94,0.15)" : saving ? "#252535" : "linear-gradient(135deg,#f59e0b,#d97706)",
              color: saved ? "#22c55e" : saving ? "#64748b" : "#000",
            }}>
              {saved ? "✅ تم الحفظ" : saving ? "⏳..." : "💾 حفظ المخطط"}
            </button>
          )}
          <button
            onClick={() => setShowQuickSetup(true)}
            style={{ padding: "9px 18px", background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            ⚡ إعداد سريع
          </button>
          <button
            onClick={() => { setEditMode(v => !v); setSelected(null); setActiveTable(null); }}
            style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 12,
              background: editMode ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
              color: editMode ? "#ef4444" : "#f59e0b",
              border: `1px solid ${editMode ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.25)"}`,
            }}
          >
            {editMode ? "✕ إنهاء التعديل" : "✏️ تعديل المخطط"}
          </button>
          {!editMode && (
            <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              🔄 تحديث
            </button>
          )}
        </div>
      </div>

      {/* Stats (live mode) */}
      {!editMode && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "مشغولة",            value: occupiedCount,                                                          color: "#f59e0b", icon: "🟠" },
            { label: "متاحة",             value: tableEls.length - occupiedCount,                                        color: "#22c55e", icon: "🟢" },
            { label: "الإيرادات الحالية", value: `${orders.reduce((s, o) => s + o.total_price, 0).toLocaleString()} د.ع`, color: "#f59e0b", icon: "💰" },
          ].map(s => (
            <div key={s.label} style={{ background: "#111118", border: `1px solid ${s.color}20`, borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{s.value}</div>
              <div style={{ color: "#64748b", fontSize: 12 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ════ EDIT MODE ════ */}
      {editMode ? (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>

          {/* Palette sidebar */}
          <div style={{ width: 160, flexShrink: 0, background: "#111118", border: "1px solid #252535", borderRadius: 16, padding: 14, maxHeight: 640, overflowY: "auto" }}>
            <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 10 }}>عناصر</div>
            {PALETTE.map(p => (
              <div key={p.type}
                onMouseDown={e => {
                  e.preventDefault();
                  paletteDrag.current = { type: p.type, dw: p.dw, dh: p.dh };
                  setGhostPos({ x: e.clientX, y: e.clientY });
                  setGhostVisible(true);
                }}
                style={{ padding: "10px 12px", marginBottom: 7, background: "#1c1c28", border: "1px solid #252535", borderRadius: 10, cursor: "grab", userSelect: "none" }}
              >
                {/* Mini preview in palette */}
                <div style={{ width: p.dw * 0.55, height: p.dh * 0.55, margin: "0 auto 6px", overflow: "visible", pointerEvents: "none" }}>
                  {p.type === "round_table" && (
                    <DynamicRoundTable w={p.dw * 0.55} h={p.dh * 0.55} seats={4} occupied={false} editMode={true} selected={false} />
                  )}
                  {p.type === "rect_table" && (
                    <DynamicRectangularTable w={p.dw * 0.55} h={p.dh * 0.55} seats={6} occupied={false} editMode={true} selected={false} />
                  )}
                  {(p.type === "wall" || p.type === "door") && (
                    <div style={{ width: "100%", height: "100%", background: p.type === "wall" ? "#2d3748" : "#1a2744", border: "1px solid #4a5568", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 14 }}>{p.icon}</span>
                    </div>
                  )}
                </div>
                <div style={{ color: "#f1f5f9", fontSize: 11, fontWeight: 600, textAlign: "center" }}>{p.label}</div>
                <div style={{ color: "#334155", fontSize: 9, marginTop: 1, textAlign: "center" }}>اسحب للوضع</div>
              </div>
            ))}

            {/* Properties panel */}
            <div style={{ marginTop: 14, borderTop: "1px solid #1c1c28", paddingTop: 14 }}>
              <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 10 }}>خصائص</div>
              {selectedEl ? (<>
                <div style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: 9, padding: "8px 10px", marginBottom: 10 }}>
                  <div style={{ color: "#64748b", fontSize: 9, marginBottom: 3 }}>الحجم: {selectedEl.w}×{selectedEl.h}</div>
                  <div style={{ color: "#64748b", fontSize: 9 }}>
                    {selectedEl.type === "round_table" ? "دائرية" : selectedEl.type === "rect_table" ? "عائلية" : selectedEl.type === "wall" ? "جدار" : "باب"}
                  </div>
                </div>
                {(selectedEl.type === "round_table" || selectedEl.type === "rect_table") && (<>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ color: "#64748b", fontSize: 10, display: "block", marginBottom: 3 }}>رقم الطاولة</label>
                    <input type="number" min="1" value={selectedEl.tableNumber ?? ""}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        setElements(els => els.map(el => el.id === selected ? { ...el, tableNumber: isNaN(v) ? undefined : v } : el));
                      }}
                      style={inputSt}
                    />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ color: "#64748b", fontSize: 10, display: "block", marginBottom: 3 }}>السعة (أشخاص)</label>
                    <input type="number" min="1" max="10" value={selectedEl.capacity ?? ""}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        setElements(els => els.map(el => el.id === selected ? { ...el, capacity: isNaN(v) ? undefined : v } : el));
                      }}
                      style={inputSt}
                    />
                  </div>
                </>)}
                <button
                  onClick={() => { setElements(els => els.filter(el => el.id !== selected)); setSelected(null); }}
                  style={{ width: "100%", padding: 7, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                >
                  🗑️ حذف
                </button>
              </>) : (
                <div style={{ color: "#334155", fontSize: 11, textAlign: "center", padding: "20px 0" }}>اختر عنصراً لتعديله</div>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}
            style={{
              flex: 1, height: 640,
              background: "#111118", border: "1px solid #252535", borderRadius: 16,
              position: "relative", overflow: "hidden",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)",
              backgroundSize: `${GRID}px ${GRID}px`,
              cursor: ghostVisible ? "crosshair" : "default",
            }}
          >
            {elements.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 48, opacity: 0.1, marginBottom: 12 }}>🏠</div>
                <div style={{ color: "#252535", fontSize: 13 }}>اسحب العناصر من الشريط الجانبي</div>
              </div>
            )}
            {elements.map(el => (
              <CanvasEl key={el.id} el={el} editMode selected={selected === el.id} occupied={false}
                onDown={e => {
                  e.stopPropagation();
                  setSelected(el.id);
                  const rect = canvasRef.current!.getBoundingClientRect();
                  dragging.current = { id: el.id, ox: e.clientX - rect.left - el.x, oy: e.clientY - rect.top - el.y };
                }}
                onResizeDown={e => {
                  e.stopPropagation();
                  resizing.current = { id: el.id, mx: e.clientX, my: e.clientY, ow: el.w, oh: el.h };
                }}
              />
            ))}
          </div>
        </div>

      ) : (
        /* ════ LIVE MODE ════ */
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "flex-start" }}>
          <div ref={canvasRef} style={{ background: "#111118", border: "1px solid #252535", borderRadius: 16, position: "relative", height: 560, overflow: "hidden" }}>
            {elements.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
                <div style={{ fontSize: 48, opacity: 0.12, marginBottom: 4 }}>🏠</div>
                <div style={{ color: "#64748b", fontSize: 14, marginBottom: 4 }}>اختر طريقة إنشاء الطاولات</div>
                <div style={{ display: "flex", gap: 14 }}>
                  {/* Quick Setup option */}
                  <div
                    onClick={() => setShowQuickSetup(true)}
                    style={{
                      width: 180, padding: "20px 16px", cursor: "pointer",
                      background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)",
                      borderRadius: 16, textAlign: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 10 }}>⚡</div>
                    <div style={{ color: "#22c55e", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>إعداد سريع</div>
                    <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.5 }}>
                      أنشئ طاولات دائرية بعدد تختاره
                      <br />مثالي للمطاعم السريعة
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 12 }}>
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: "#22c55e", opacity: 0.5 }} />
                      ))}
                    </div>
                  </div>
                  {/* Custom layout option */}
                  <div
                    onClick={() => setEditMode(true)}
                    style={{
                      width: 180, padding: "20px 16px", cursor: "pointer",
                      background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)",
                      borderRadius: 16, textAlign: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 10 }}>✏️</div>
                    <div style={{ color: "#f59e0b", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>تصميم مخصص</div>
                    <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.5 }}>
                      صمم مخطط المطعم بالكامل
                      <br />طاولات وجدران وأبواب
                    </div>
                    <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 12, alignItems: "center" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#f59e0b", opacity: 0.4 }} />
                      <div style={{ width: 30, height: 18, borderRadius: 4, background: "#f59e0b", opacity: 0.4 }} />
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#f59e0b", opacity: 0.4 }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              elements.map(el => {
                const isTable = el.type === "round_table" || el.type === "rect_table";
                const occ = isTable && el.tableNumber ? occupiedTables.has(el.tableNumber) : false;
                return (
                  <CanvasEl key={el.id} el={el} editMode={false}
                    selected={isTable && activeTable === el.tableNumber}
                    occupied={occ}
                    onDown={() => { if (isTable && el.tableNumber) setActiveTable(t => t === el.tableNumber ? null : el.tableNumber!); }}
                    onResizeDown={() => {}}
                  />
                );
              })
            )}
          </div>

          {/* Side panel */}
          <div style={{ width: 270, flexShrink: 0 }}>
            {activeTable ? (
              occupiedTables.has(activeTable) ? (
                <div style={{ background: "#111118", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 18, padding: 20, borderTop: "4px solid #f59e0b" }}>
                  <div style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>طاولة {activeTable}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 16 }}>{activeTableOrders.length} طلب نشط</div>
                  {activeTableOrders.map(o => (
                    <div key={o.id} style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }}>طلب #{o.id}</span>
                        <span style={{ color: "#64748b", fontSize: 11 }}>⏱ {elapsedStr(o.created_at)}</span>
                      </div>
                      {(o.items ?? []).slice(0, 4).map((it, j) => (
                        <div key={j} style={{ color: "#94a3b8", fontSize: 12, marginBottom: 2 }}>• {it.name}</div>
                      ))}
                      <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 15, marginTop: 8 }}>
                        {o.total_price.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>د.ع</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: "#111118", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 18, padding: 24, textAlign: "center", borderTop: "4px solid #22c55e" }}>
                  <div style={{ color: "#22c55e", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>QR Code</div>
                  <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 800, marginBottom: 16 }}>طاولة {activeTable}</div>
                  {qrBase ? (<>
                    <div style={{ background: "white", padding: 14, borderRadius: 14, display: "inline-block", marginBottom: 12, boxShadow: "0 8px 28px rgba(34,197,94,0.15)" }}>
                      <QRCode value={`${qrBase}/table/${activeTable}`} size={160} />
                    </div>
                    <div style={{ background: "#0a0a0f", border: "1px solid #252535", borderRadius: 10, padding: "8px 10px", marginBottom: 12, cursor: "pointer" }}
                      onClick={() => navigator.clipboard.writeText(`${qrBase}/table/${activeTable}`).catch(() => {})}>
                      <div style={{ color: "#64748b", fontSize: 9, marginBottom: 3, textAlign: "right" }}>الرابط (اضغط للنسخ)</div>
                      <div style={{ color: "#94a3b8", fontSize: 10, wordBreak: "break-all", textAlign: "left", direction: "ltr" }}>{`${qrBase}/table/${activeTable}`}</div>
                    </div>
                  </>) : (
                    <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>⏳</div>
                  )}
                  <button onClick={() => window.print()} style={{ width: "100%", padding: 11, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    🖨️ طباعة
                  </button>
                </div>
              )
            ) : (
              <div style={{ background: "#111118", border: "1px dashed #252535", borderRadius: 18, padding: "48px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.25 }}>🪑</div>
                <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>اختر طاولة لعرض التفاصيل</p>
                <p style={{ color: "#334155", margin: "6px 0 0", fontSize: 11 }}>🟢 متاحة  🔴 مشغولة</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Setup Modal ── */}
      {showQuickSetup && (
        <div
          onClick={() => setShowQuickSetup(false)}
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#111118", border: "1px solid #252535", borderRadius: 20, padding: "28px 28px 24px", width: 380, direction: "rtl", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}
          >
            <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 800, marginBottom: 4 }}>⚡ إعداد سريع</div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 24 }}>
              طاولات دائرية مرتبة بشكل تلقائي — مثالي للمطاعم السريعة
            </div>

            {/* Counter */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>عدد الطاولات</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <button
                  onClick={() => setQuickCount(c => Math.max(1, c - 1))}
                  style={{ width: 40, height: 40, borderRadius: "50%", background: "#1c1c28", border: "1px solid #252535", color: "#f1f5f9", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
                >−</button>
                <div style={{ flex: 1, textAlign: "center", color: "#f59e0b", fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{quickCount}</div>
                <button
                  onClick={() => setQuickCount(c => Math.min(30, c + 1))}
                  style={{ width: 40, height: 40, borderRadius: "50%", background: "#1c1c28", border: "1px solid #252535", color: "#f1f5f9", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
                >+</button>
              </div>
              <input
                type="range" min={1} max={30} value={quickCount}
                onChange={e => setQuickCount(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: "#f59e0b", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", color: "#334155", fontSize: 10, marginTop: 2 }}>
                <span>١</span><span>١٥</span><span>٣٠</span>
              </div>
            </div>

            {/* Dots preview */}
            <div style={{ background: "#0a0a0f", border: "1px solid #1c1c28", borderRadius: 12, padding: "12px 14px", marginBottom: 22, minHeight: 58 }}>
              <div style={{ color: "#334155", fontSize: 10, marginBottom: 8 }}>معاينة</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {Array.from({ length: quickCount }, (_, i) => (
                  <div key={i} style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "rgba(34,197,94,0.25)", border: "1px solid rgba(34,197,94,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, color: "#22c55e", fontWeight: 700,
                  }}>{i + 1}</div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowQuickSetup(false)}
                style={{ flex: 1, padding: 11, background: "rgba(100,116,139,0.1)", color: "#94a3b8", border: "1px solid #252535", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >إلغاء</button>
              <button
                onClick={handleQuickSetup}
                style={{ flex: 2, padding: 11, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#000", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 800 }}
              >⚡ إنشاء {quickCount} طاولة</button>
            </div>
          </div>
        </div>
      )}

      {/* Ghost element while dragging from palette */}
      {ghostVisible && paletteDrag.current && (() => {
        const pd = paletteDrag.current!;
        return (
          <div style={{
            position: "fixed",
            left: ghostPos.x - pd.dw / 2, top: ghostPos.y - pd.dh / 2,
            width: pd.dw, height: pd.dh,
            pointerEvents: "none", zIndex: 9999, opacity: 0.65, overflow: "visible",
          }}>
            {pd.type === "round_table" && <DynamicRoundTable w={pd.dw} h={pd.dh} seats={4} occupied={false} editMode={true} selected={false} />}
            {pd.type === "rect_table"  && <DynamicRectangularTable w={pd.dw} h={pd.dh} seats={6} occupied={false} editMode={true} selected={false} />}
            {(pd.type === "wall" || pd.type === "door") && (
              <div style={{ width: pd.dw, height: pd.dh, background: pd.type === "wall" ? "rgba(45,55,72,0.85)" : "rgba(26,39,68,0.85)", border: "2px dashed #f59e0b", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span>{pd.type === "wall" ? "🧱" : "🚪"}</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
