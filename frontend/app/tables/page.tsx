"use client";
import { useState, useEffect, useCallback } from "react";
import QRCode from "react-qr-code";

const API   = "https://waheed-system-production.up.railway.app";
const TOTAL = 10;

type Order = { id: number; table_number: number; total_price: number; status: string; created_at: string; items?: { name: string; quantity: number }[] };

function elapsed(created_at: string) {
  const ms = Date.now() - new Date(created_at).getTime();
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TablesPage() {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoad]    = useState(true);
  /* Resolved after mount so it reflects the actual browser origin —
     works for http://localhost:3000, http://192.168.x.x:3000, and production. */
  const [baseUrl, setBaseUrl] = useState("");

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/orders`);
      const d = await r.json();
      setOrders((d.orders || []).filter((o: Order) => o.status === "pending"));
    } finally { setLoad(false); }
  }, []);

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    fetchOrders();
    const id = setInterval(fetchOrders, 20000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  const occupiedTables = new Set(orders.map((o) => o.table_number));
  const tableOrders    = (t: number) => orders.filter((o) => o.table_number === t);
  const selectedOrders = selected ? tableOrders(selected) : [];
  const isOccupied     = selected ? occupiedTables.has(selected) : false;

  const stats = {
    occupied: occupiedTables.size,
    free: TOTAL - occupiedTables.size,
    revenue: orders.reduce((s, o) => s + o.total_price, 0),
  };

  return (
    <div style={{ padding: "24px", background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>🪑 خريطة الطاولات</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${stats.occupied} مشغولة • ${stats.free} متاحة • يتحدث كل 20 ثانية`}
          </p>
        </div>
        <button onClick={fetchOrders} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
          🔄 تحديث
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "مشغولة", value: stats.occupied, color: "#f59e0b", icon: "🟠" },
          { label: "متاحة",  value: stats.free,     color: "#22c55e", icon: "🟢" },
          { label: "الإيرادات الحالية", value: `${stats.revenue.toLocaleString()} د.ع`, color: "#f59e0b", icon: "💰" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#111118", border: `1px solid ${s.color}20`, borderRadius: "14px", padding: "14px 18px" }}>
            <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
            <div style={{ color: s.color, fontSize: "22px", fontWeight: "800" }}>{s.value}</div>
            <div style={{ color: "#64748b", fontSize: "12px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "start" }}>

        {/* Floor map */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
            {Array.from({ length: TOTAL }, (_, i) => i + 1).map((t) => {
              const occupied = occupiedTables.has(t);
              const active   = selected === t;
              const color    = occupied ? "#f59e0b" : "#22c55e";
              const tOrders  = tableOrders(t);
              return (
                <div
                  key={t}
                  onClick={() => setSelected(active ? null : t)}
                  style={{
                    background: active
                      ? (occupied ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.12)")
                      : "#111118",
                    border: `2px solid ${active ? color : (occupied ? "rgba(245,158,11,0.3)" : "#252535")}`,
                    borderRadius: "16px", padding: "20px 12px",
                    textAlign: "center", cursor: "pointer",
                    transition: "all 0.2s",
                    transform: active ? "translateY(-3px)" : "none",
                    boxShadow: active ? `0 8px 24px ${color}25` : "none",
                  }}
                >
                  <div style={{ fontSize: "28px", marginBottom: "6px" }}>
                    {occupied ? "🔴" : "🟢"}
                  </div>
                  <div style={{ color: active ? color : "#f1f5f9", fontWeight: "700", fontSize: "14px" }}>
                    {t}
                  </div>
                  <div style={{ marginTop: "6px", padding: "2px 8px", borderRadius: "20px", background: occupied ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.1)", color: occupied ? "#f59e0b" : "#22c55e", fontSize: "10px", fontWeight: "600", display: "inline-block" }}>
                    {occupied ? `${tOrders.length} طلب` : "متاحة"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: "20px", marginTop: "16px", padding: "12px 16px", background: "#111118", border: "1px solid #252535", borderRadius: "12px", width: "fit-content" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f59e0b", fontSize: "12px" }}>🔴 مشغولة</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#22c55e", fontSize: "12px" }}>🟢 متاحة</div>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: "270px", flexShrink: 0 }}>
          {selected ? (
            isOccupied ? (
              /* Occupied: show orders */
              <div style={{ background: "#111118", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "18px", padding: "20px", borderTop: "4px solid #f59e0b" }}>
                <div style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>طاولة {selected}</div>
                <div style={{ color: "#94a3b8", fontSize: "11px", marginBottom: "16px" }}>{selectedOrders.length} طلب نشط</div>

                {selectedOrders.map((o) => (
                  <div key={o.id} style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", padding: "14px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "700" }}>طلب #{o.id}</span>
                      <span style={{ color: "#64748b", fontSize: "11px" }}>⏱ {elapsed(o.created_at)}</span>
                    </div>
                    {o.items?.map((it, j) => (
                      <div key={j} style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "2px" }}>• {it.name} ×{it.quantity}</div>
                    ))}
                    <div style={{ color: "#f59e0b", fontWeight: "800", fontSize: "15px", marginTop: "8px" }}>
                      {o.total_price.toLocaleString()} <span style={{ fontSize: "11px", fontWeight: "400" }}>د.ع</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Free: show QR */
              (() => {
                const qrUrl = baseUrl ? `${baseUrl}/table/${selected}` : "";
                const isLocalhost = baseUrl.includes("localhost");
                return (
                  <div style={{ background: "#111118", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "18px", padding: "24px", textAlign: "center", borderTop: "4px solid #22c55e" }}>
                    <div style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>QR Code</div>
                    <div style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: "800", marginBottom: "16px" }}>طاولة {selected}</div>

                    {/* localhost warning */}
                    {isLocalhost && (
                      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "14px", textAlign: "right" }}>
                        <div style={{ color: "#f59e0b", fontSize: "11px", fontWeight: "700", marginBottom: "3px" }}>⚠️ وضع التطوير</div>
                        <div style={{ color: "#94a3b8", fontSize: "10px", lineHeight: "1.5" }}>
                          الكود يشير إلى localhost — لن يعمل على الجوال.
                          افتح الداشبورد عبر:
                          <br />
                          <span style={{ color: "#f59e0b", fontWeight: "700" }}>http://192.168.1.102:3000</span>
                          <br />
                          ثم افتح هذه الصفحة مرة أخرى.
                        </div>
                      </div>
                    )}

                    {/* QR */}
                    {qrUrl ? (
                      <div style={{ background: "white", padding: "14px", borderRadius: "14px", display: "inline-block", marginBottom: "12px", boxShadow: "0 8px 28px rgba(34,197,94,0.15)" }}>
                        <QRCode value={qrUrl} size={160} />
                      </div>
                    ) : (
                      <div style={{ height: "188px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>⏳</div>
                    )}

                    {/* live URL display */}
                    <div style={{ background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", padding: "8px 10px", marginBottom: "12px", cursor: "pointer" }}
                      onClick={() => qrUrl && navigator.clipboard.writeText(qrUrl).catch(() => {})}
                      title="اضغط للنسخ"
                    >
                      <div style={{ color: "#64748b", fontSize: "9px", marginBottom: "3px", textAlign: "right" }}>الرابط (اضغط للنسخ)</div>
                      <div style={{ color: "#94a3b8", fontSize: "10px", wordBreak: "break-all", textAlign: "left", direction: "ltr" }}>{qrUrl || "..."}</div>
                    </div>

                    <button onClick={() => window.print()} style={{ width: "100%", padding: "11px", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "700" }}>
                      🖨️ طباعة
                    </button>
                  </div>
                );
              })()
            )
          ) : (
            <div style={{ background: "#111118", border: "1px dashed #252535", borderRadius: "18px", padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "44px", marginBottom: "14px" }}>🪑</div>
              <p style={{ color: "#64748b", margin: 0, fontSize: "13px" }}>اختر طاولة لعرض التفاصيل</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
