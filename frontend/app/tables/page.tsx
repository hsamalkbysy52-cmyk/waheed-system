"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "react-qr-code";

const API  = "https://waheed-system-production.up.railway.app";
const GRID = 30;
const snap = (v: number) => Math.round(v / GRID) * GRID;

type ElementType = "round_table" | "rect_table" | "wall" | "door";
type LayoutEl    = { id: string; type: ElementType; x: number; y: number; w: number; h: number; tableNumber?: number; capacity?: number };
type Order       = { id: number; table_number: number; total_price: number; status: string; created_at: string; items?: { name: string; price: number; category: string }[] };

const PALETTE: { type: ElementType; label: string; icon: string; dw: number; dh: number }[] = [
  { type: "round_table", label: "طاولة دائرية", icon: "⭕", dw: 90,  dh: 90  },
  { type: "rect_table",  label: "طاولة عائلية", icon: "⬜", dw: 120, dh: 90  },
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

/* ── Canvas element ── */
function CanvasEl({ el, editMode, selected, occupied, onDown, onResizeDown }: {
  el: LayoutEl; editMode: boolean; selected: boolean; occupied: boolean;
  onDown: (e: React.MouseEvent) => void;
  onResizeDown: (e: React.MouseEvent) => void;
}) {
  const isTable = el.type === "round_table" || el.type === "rect_table";
  const isRound = el.type === "round_table";
  const isWall  = el.type === "wall";
  const isDoor  = el.type === "door";

  let bg    = "#1c1c28";
  let bord  = "#252535";
  let bw    = 1;

  if (isWall)  { bg = "#2d3748"; bord = "#4a5568"; }
  if (isDoor)  { bg = "#1a2744"; bord = "#3b82f6"; }
  if (isTable && !editMode) {
    bg   = occupied ? "rgba(239,68,68,0.12)"  : "rgba(34,197,94,0.09)";
    bord = occupied ? "#ef4444" : "#22c55e";
  }
  if (selected) { bord = "#f59e0b"; bw = 2; }

  const fs = Math.max(10, Math.min(20, Math.min(el.w, el.h) / 5));

  return (
    <div
      onMouseDown={onDown}
      style={{
        position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
        borderRadius: isRound ? "50%" : isWall || isDoor ? "4px" : "14px",
        background: bg,
        border: `${bw}px solid ${bord}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        cursor: editMode ? "grab" : isTable ? "pointer" : "default",
        userSelect: "none", boxSizing: "border-box",
        boxShadow: selected ? `0 0 0 3px ${bord}30` : isTable && !editMode ? `0 2px 10px ${bord}20` : "none",
        transition: editMode ? "none" : "box-shadow 0.2s, border-color 0.2s",
      }}
    >
      {isTable && (
        <>
          <div style={{ color: editMode ? "#f1f5f9" : occupied ? "#ef4444" : "#22c55e", fontWeight: "800", fontSize: fs, lineHeight: 1 }}>
            {el.tableNumber ?? "?"}
          </div>
          {el.capacity && (
            <div style={{ color: "#64748b", fontSize: "9px", marginTop: "3px" }}>
              {el.capacity} 👥
            </div>
          )}
          {!editMode && (
            <div style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: occupied ? "#ef4444" : "#22c55e",
              marginTop: "5px",
              boxShadow: `0 0 6px ${occupied ? "#ef4444" : "#22c55e"}80`,
            }} />
          )}
        </>
      )}
      {isWall && <div style={{ color: "#94a3b8", fontSize: "9px", opacity: 0.6 }}>جدار</div>}
      {isDoor && <div style={{ fontSize: "14px" }}>🚪</div>}

      {/* Resize handle */}
      {editMode && (
        <div
          onMouseDown={e => { e.stopPropagation(); onResizeDown(e); }}
          style={{
            position: "absolute", right: -5, bottom: -5,
            width: "14px", height: "14px",
            background: selected ? "#f59e0b" : "#334155",
            border: `1px solid ${selected ? "#d97706" : "#475569"}`,
            borderRadius: "3px", cursor: "se-resize",
          }}
        />
      )}
    </div>
  );
}

/* ── Page ── */
export default function TablesPage() {
  const [elements, setElements]     = useState<LayoutEl[]>([]);
  const [editMode, setEditMode]     = useState(false);
  const [selected, setSelected]     = useState<string | null>(null);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoad]          = useState(true);
  const [qrBase, setQrBase]         = useState("");
  const [activeTable, setActiveTable] = useState<number | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostPos, setGhostPos]     = useState({ x: 0, y: 0 });

  /* refs so event handlers always see latest values */
  const dragging    = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const resizing    = useRef<{ id: string; mx: number; my: number; ow: number; oh: number } | null>(null);
  const paletteDrag = useRef<{ type: ElementType; dw: number; dh: number } | null>(null);
  const canvasRef   = useRef<HTMLDivElement>(null);
  const elRef       = useRef<LayoutEl[]>([]);
  useEffect(() => { elRef.current = elements; }, [elements]);

  /* ── Data fetching ── */
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

  /* ── Global mouse handlers (drag / resize / palette drop) ── */
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
        const dw = e.clientX - mx;
        const dh = e.clientY - my;
        setElements(els => els.map(el => el.id === id ? {
          ...el,
          w: Math.max(GRID * 2, snap(ow + dw)),
          h: Math.max(GRID,     snap(oh + dh)),
        } : el));
      }

      if (paletteDrag.current) {
        setGhostPos({ x: e.clientX, y: e.clientY });
      }
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
            /* auto next table number */
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
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  /* ── Save layout ── */
  const saveLayout = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/table-layout/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elements: elements.map(el => ({
            element_id:   el.id,
            element_type: el.type,
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

  /* ── Derived state ── */
  const occupiedTables    = new Set(orders.map(o => o.table_number));
  const tableEls          = elements.filter(e => e.type === "round_table" || e.type === "rect_table");
  const occupiedCount     = tableEls.filter(e => e.tableNumber && occupiedTables.has(e.tableNumber)).length;
  const selectedEl        = elements.find(e => e.id === selected);
  const activeTableOrders = activeTable ? orders.filter(o => o.table_number === activeTable) : [];

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "6px 8px",
    background: "#0a0a0f", border: "1px solid #252535",
    borderRadius: "8px", color: "#f1f5f9",
    fontSize: "12px", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "24px", background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editMode ? "18px" : "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>🪑 خريطة الطاولات</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {editMode
              ? `${elements.length} عنصر • اسحب من القائمة الجانبية للإضافة`
              : loading ? "جاري التحميل..."
              : `${occupiedCount} مشغولة • ${tableEls.length - occupiedCount} متاحة • يتحدث كل 20 ث`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {editMode && (
            <button
              onClick={saveLayout} disabled={saving}
              style={{
                padding: "9px 20px", fontSize: "13px", fontWeight: "700",
                cursor: saving ? "not-allowed" : "pointer", borderRadius: "12px", border: "none",
                background: saved ? "rgba(34,197,94,0.15)" : saving ? "#252535" : "linear-gradient(135deg,#f59e0b,#d97706)",
                color: saved ? "#22c55e" : saving ? "#64748b" : "#000",
              }}
            >
              {saved ? "✅ تم الحفظ" : saving ? "⏳..." : "💾 حفظ المخطط"}
            </button>
          )}
          <button
            onClick={() => { setEditMode(v => !v); setSelected(null); setActiveTable(null); }}
            style={{
              padding: "9px 18px", fontSize: "13px", fontWeight: "600",
              cursor: "pointer", borderRadius: "12px",
              background: editMode ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
              color: editMode ? "#ef4444" : "#f59e0b",
              border: `1px solid ${editMode ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.25)"}`,
            }}
          >
            {editMode ? "✕ إنهاء التعديل" : "✏️ تعديل المخطط"}
          </button>
          {!editMode && (
            <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
              🔄 تحديث
            </button>
          )}
        </div>
      </div>

      {/* ── Stats (live only) ── */}
      {!editMode && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "مشغولة",            value: occupiedCount,                                                     color: "#f59e0b", icon: "🟠" },
            { label: "متاحة",             value: tableEls.length - occupiedCount,                                  color: "#22c55e", icon: "🟢" },
            { label: "الإيرادات الحالية", value: `${orders.reduce((s, o) => s + o.total_price, 0).toLocaleString()} د.ع`, color: "#f59e0b", icon: "💰" },
          ].map(s => (
            <div key={s.label} style={{ background: "#111118", border: `1px solid ${s.color}20`, borderRadius: "14px", padding: "14px 18px" }}>
              <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
              <div style={{ color: s.color, fontSize: "22px", fontWeight: "800" }}>{s.value}</div>
              <div style={{ color: "#64748b", fontSize: "12px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ EDIT MODE ══════════════ */}
      {editMode ? (
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>

          {/* Palette sidebar */}
          <div style={{
            width: "160px", flexShrink: 0,
            background: "#111118", border: "1px solid #252535",
            borderRadius: "16px", padding: "14px",
            maxHeight: "640px", overflowY: "auto",
          }}>
            <div style={{ color: "#94a3b8", fontSize: "10px", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "10px" }}>عناصر</div>
            {PALETTE.map(p => (
              <div
                key={p.type}
                onMouseDown={e => {
                  e.preventDefault();
                  paletteDrag.current = { type: p.type, dw: p.dw, dh: p.dh };
                  setGhostPos({ x: e.clientX, y: e.clientY });
                  setGhostVisible(true);
                }}
                style={{
                  padding: "10px 12px", marginBottom: "7px",
                  background: "#1c1c28", border: "1px solid #252535",
                  borderRadius: "10px", cursor: "grab", userSelect: "none",
                }}
              >
                <div style={{ fontSize: "18px", marginBottom: "3px" }}>{p.icon}</div>
                <div style={{ color: "#f1f5f9", fontSize: "11px", fontWeight: "600" }}>{p.label}</div>
                <div style={{ color: "#334155", fontSize: "9px", marginTop: "1px" }}>اسحب للوضع</div>
              </div>
            ))}

            {/* Properties panel */}
            <div style={{ marginTop: "14px", borderTop: "1px solid #1c1c28", paddingTop: "14px" }}>
              <div style={{ color: "#94a3b8", fontSize: "10px", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "10px" }}>خصائص</div>

              {selectedEl ? (<>
                <div style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: "9px", padding: "8px 10px", marginBottom: "10px" }}>
                  <div style={{ color: "#64748b", fontSize: "9px", marginBottom: "3px" }}>الحجم: {selectedEl.w}×{selectedEl.h}</div>
                  <div style={{ color: "#64748b", fontSize: "9px" }}>
                    {selectedEl.type === "round_table" ? "دائرية" : selectedEl.type === "rect_table" ? "عائلية" : selectedEl.type === "wall" ? "جدار" : "باب"}
                  </div>
                </div>

                {(selectedEl.type === "round_table" || selectedEl.type === "rect_table") && (<>
                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ color: "#64748b", fontSize: "10px", display: "block", marginBottom: "3px" }}>رقم الطاولة</label>
                    <input
                      type="number" min="1" value={selectedEl.tableNumber ?? ""}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        setElements(els => els.map(el => el.id === selected ? { ...el, tableNumber: isNaN(v) ? undefined : v } : el));
                      }}
                      style={inputSt}
                    />
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ color: "#64748b", fontSize: "10px", display: "block", marginBottom: "3px" }}>السعة (أشخاص)</label>
                    <input
                      type="number" min="1" value={selectedEl.capacity ?? ""}
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
                  style={{ width: "100%", padding: "7px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
                >
                  🗑️ حذف
                </button>
              </>) : (
                <div style={{ color: "#334155", fontSize: "11px", textAlign: "center", padding: "20px 0" }}>
                  اختر عنصراً لتعديله
                </div>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}
            style={{
              flex: 1, height: "640px",
              background: "#111118",
              border: "1px solid #252535",
              borderRadius: "16px",
              position: "relative", overflow: "hidden",
              backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: `${GRID}px ${GRID}px`,
              cursor: ghostVisible ? "crosshair" : "default",
            }}
          >
            {elements.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: "48px", opacity: 0.1, marginBottom: "12px" }}>🏠</div>
                <div style={{ color: "#252535", fontSize: "13px" }}>اسحب العناصر من الشريط الجانبي</div>
              </div>
            )}
            {elements.map(el => (
              <CanvasEl
                key={el.id}
                el={el}
                editMode={true}
                selected={selected === el.id}
                occupied={false}
                onDown={e => {
                  e.stopPropagation();
                  setSelected(el.id);
                  const rect = canvasRef.current!.getBoundingClientRect();
                  dragging.current = {
                    id: el.id,
                    ox: e.clientX - rect.left - el.x,
                    oy: e.clientY - rect.top  - el.y,
                  };
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
        /* ══════════════ LIVE MODE ══════════════ */
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "flex-start" }}>

          {/* Canvas */}
          <div
            ref={canvasRef}
            style={{
              background: "#111118", border: "1px solid #252535",
              borderRadius: "16px", position: "relative",
              height: "560px", overflow: "hidden",
            }}
          >
            {elements.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "14px" }}>
                <div style={{ fontSize: "48px", opacity: 0.15 }}>🏠</div>
                <div style={{ color: "#334155", fontSize: "14px" }}>لم يتم إنشاء مخطط بعد</div>
                <button onClick={() => setEditMode(true)} style={{ padding: "9px 20px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                  ✏️ إنشاء مخطط الطاولات
                </button>
              </div>
            ) : (
              elements.map(el => {
                const isTable = el.type === "round_table" || el.type === "rect_table";
                const occupied = isTable && el.tableNumber ? occupiedTables.has(el.tableNumber) : false;
                return (
                  <CanvasEl
                    key={el.id}
                    el={el}
                    editMode={false}
                    selected={isTable && activeTable === el.tableNumber}
                    occupied={occupied}
                    onDown={() => {
                      if (isTable && el.tableNumber)
                        setActiveTable(t => t === el.tableNumber ? null : el.tableNumber!);
                    }}
                    onResizeDown={() => {}}
                  />
                );
              })
            )}
          </div>

          {/* Side panel */}
          <div style={{ width: "270px", flexShrink: 0 }}>
            {activeTable ? (
              occupiedTables.has(activeTable) ? (
                <div style={{ background: "#111118", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "18px", padding: "20px", borderTop: "4px solid #f59e0b" }}>
                  <div style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>طاولة {activeTable}</div>
                  <div style={{ color: "#94a3b8", fontSize: "11px", marginBottom: "16px" }}>{activeTableOrders.length} طلب نشط</div>
                  {activeTableOrders.map(o => (
                    <div key={o.id} style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", padding: "14px", marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "700" }}>طلب #{o.id}</span>
                        <span style={{ color: "#64748b", fontSize: "11px" }}>⏱ {elapsedStr(o.created_at)}</span>
                      </div>
                      {(o.items ?? []).slice(0, 4).map((it, j) => (
                        <div key={j} style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "2px" }}>• {it.name}</div>
                      ))}
                      <div style={{ color: "#f59e0b", fontWeight: "800", fontSize: "15px", marginTop: "8px" }}>
                        {o.total_price.toLocaleString()} <span style={{ fontSize: "11px", fontWeight: "400" }}>د.ع</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: "#111118", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "18px", padding: "24px", textAlign: "center", borderTop: "4px solid #22c55e" }}>
                  <div style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>QR Code</div>
                  <div style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: "800", marginBottom: "16px" }}>طاولة {activeTable}</div>
                  {qrBase ? (<>
                    <div style={{ background: "white", padding: "14px", borderRadius: "14px", display: "inline-block", marginBottom: "12px", boxShadow: "0 8px 28px rgba(34,197,94,0.15)" }}>
                      <QRCode value={`${qrBase}/table/${activeTable}`} size={160} />
                    </div>
                    <div
                      style={{ background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", padding: "8px 10px", marginBottom: "12px", cursor: "pointer" }}
                      onClick={() => navigator.clipboard.writeText(`${qrBase}/table/${activeTable}`).catch(() => {})}
                    >
                      <div style={{ color: "#64748b", fontSize: "9px", marginBottom: "3px", textAlign: "right" }}>الرابط (اضغط للنسخ)</div>
                      <div style={{ color: "#94a3b8", fontSize: "10px", wordBreak: "break-all", textAlign: "left", direction: "ltr" }}>
                        {`${qrBase}/table/${activeTable}`}
                      </div>
                    </div>
                  </>) : (
                    <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>⏳</div>
                  )}
                  <button onClick={() => window.print()} style={{ width: "100%", padding: "11px", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "700" }}>
                    🖨️ طباعة
                  </button>
                </div>
              )
            ) : (
              <div style={{ background: "#111118", border: "1px dashed #252535", borderRadius: "18px", padding: "48px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "44px", marginBottom: "14px", opacity: 0.25 }}>🪑</div>
                <p style={{ color: "#64748b", margin: 0, fontSize: "13px" }}>اختر طاولة لعرض التفاصيل</p>
                <p style={{ color: "#334155", margin: "6px 0 0", fontSize: "11px" }}>🟢 متاحة  🔴 مشغولة</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ghost element while dragging from palette */}
      {ghostVisible && paletteDrag.current && (
        <div style={{
          position: "fixed",
          left: ghostPos.x - paletteDrag.current.dw / 2,
          top:  ghostPos.y - paletteDrag.current.dh / 2,
          width:  paletteDrag.current.dw,
          height: paletteDrag.current.dh,
          borderRadius: paletteDrag.current.type === "round_table" ? "50%" : "12px",
          background: "rgba(245,158,11,0.15)",
          border: "2px dashed #f59e0b",
          pointerEvents: "none", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "20px" }}>
            {PALETTE.find(p => p.type === paletteDrag.current!.type)?.icon}
          </span>
        </div>
      )}
    </div>
  );
}
