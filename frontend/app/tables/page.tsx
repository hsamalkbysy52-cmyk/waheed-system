"use client";
import { useState } from "react";
import QRCode from "react-qr-code";

const BASE_URL = "https://waheed-frontend.vercel.app/table";
const TABLES   = Array.from({ length: 10 }, (_, i) => i + 1);

export default function TablesPage() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div style={{ padding: "28px", direction: "rtl", background: "#0a0a1a", minHeight: "100%", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: 0, color: "white", fontSize: "22px", fontWeight: "700" }}>🪑 خريطة الطاولات</h1>
        <p style={{ margin: "6px 0 0", color: "#8892b0", fontSize: "13px" }}>
          اضغط على طاولة لإنشاء QR Code • {selected ? `الطاولة ${selected} محددة` : "لم تُحدد طاولة"}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "28px", alignItems: "start" }}>

        {/* Table grid */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "14px" }}>
            {TABLES.map(t => {
              const active = selected === t;
              return (
                <div key={t} onClick={() => setSelected(active ? null : t)} style={{
                  background: active ? "rgba(243,156,18,0.12)" : "#13132a",
                  border: `2px solid ${active ? "#f39c12" : "#2a2a4a"}`,
                  borderRadius: "16px", padding: "24px 16px",
                  textAlign: "center", cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: active ? "0 8px 25px rgba(243,156,18,0.2)" : "none",
                  transform: active ? "translateY(-4px)" : "none",
                }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>🪑</div>
                  <div style={{ color: active ? "#f39c12" : "white", fontWeight: "700", fontSize: "15px" }}>
                    طاولة {t}
                  </div>
                  <div style={{
                    marginTop: "8px", padding: "3px 10px", borderRadius: "20px",
                    background: active ? "rgba(243,156,18,0.2)" : "rgba(46,204,113,0.1)",
                    color: active ? "#f39c12" : "#2ecc71",
                    fontSize: "11px", fontWeight: "600", display: "inline-block",
                  }}>
                    {active ? "محددة ✓" : "متاحة"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* QR panel */}
        <div style={{ width: "280px", flexShrink: 0 }}>
          {selected ? (
            <div style={{
              background: "#13132a", border: "1px solid rgba(243,156,18,0.2)",
              borderRadius: "20px", padding: "28px 24px", textAlign: "center",
              borderTop: "4px solid #f39c12",
            }}>
              <div style={{ color: "#f39c12", fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>QR Code</div>
              <div style={{ color: "white", fontSize: "18px", fontWeight: "800", marginBottom: "20px" }}>طاولة {selected}</div>

              <div style={{
                background: "white", padding: "16px", borderRadius: "16px",
                display: "inline-block", marginBottom: "16px",
                boxShadow: "0 8px 30px rgba(243,156,18,0.2)",
              }}>
                <QRCode value={`${BASE_URL}/${selected}`} size={180} />
              </div>

              <div style={{
                background: "#0a0a1a", borderRadius: "10px", padding: "10px 12px",
                marginBottom: "16px",
              }}>
                <p style={{ margin: 0, color: "#8892b0", fontSize: "10px", wordBreak: "break-all" }}>
                  {BASE_URL}/{selected}
                </p>
              </div>

              <p style={{ color: "#8892b0", fontSize: "12px", margin: "0 0 16px" }}>
                امسح الكود لطلب من طاولة {selected}
              </p>

              <button onClick={() => window.print()} style={{
                width: "100%", padding: "12px",
                background: "linear-gradient(135deg, #f39c12, #e67e22)",
                color: "white", border: "none", borderRadius: "12px",
                cursor: "pointer", fontSize: "14px", fontWeight: "700",
                boxShadow: "0 4px 14px rgba(243,156,18,0.35)",
              }}>🖨️ طباعة</button>
            </div>
          ) : (
            <div style={{
              background: "#13132a", border: "1px dashed #2a2a4a",
              borderRadius: "20px", padding: "48px 24px", textAlign: "center",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "14px" }}>📱</div>
              <p style={{ color: "#8892b0", margin: 0, fontSize: "14px" }}>اختر طاولة لعرض QR Code</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
