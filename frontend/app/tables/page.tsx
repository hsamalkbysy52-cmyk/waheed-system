"use client";
import { useState } from "react";
import QRCode from "react-qr-code";

export default function TablesPage() {
  const [tables] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const [selected, setSelected] = useState<number | null>(null);

  const baseUrl = "https://uninjured-launder-fresh.ngrok-free.dev";

  return (
    <div style={{ padding: "20px", direction: "rtl" }}>
      <h1>🪑 الطاولات</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "15px" }}>
        {tables.map((table) => (
          <div
            key={table}
            onClick={() => setSelected(selected === table ? null : table)}
            style={{
              background: selected === table ? "#1a1a2e" : "white",
              color: selected === table ? "white" : "#1a1a2e",
              padding: "20px",
              borderRadius: "12px",
              textAlign: "center",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: selected === table ? "2px solid #3498db" : "2px solid transparent",
            }}
          >
            <div style={{ fontSize: "30px" }}>🪑</div>
            <div style={{ fontWeight: "bold", fontSize: "18px" }}>طاولة {table}</div>
          </div>
        ))}
      </div>

      {/* QR Code */}
      {selected && (
        <div style={{
          marginTop: "30px",
          background: "white",
          padding: "30px",
          borderRadius: "16px",
          textAlign: "center",
          maxWidth: "300px",
          margin: "30px auto",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
        }}>
          <h2>QR طاولة {selected}</h2>
          <QRCode value={`${baseUrl}/${selected}`} size={200} />
          <p style={{ color: "#666", marginTop: "15px" }}>
            امسح الكود لطلب من طاولة {selected}
          </p>
          <button
            onClick={() => window.print()}
            style={{
              marginTop: "10px",
              padding: "10px 20px",
              background: "#1a1a2e",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            🖨️ طباعة
          </button>
        </div>
      )}
    </div>
  );
}