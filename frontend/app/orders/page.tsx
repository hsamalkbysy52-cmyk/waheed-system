"use client";
import { useState, useEffect } from "react";

type Order = { id: number; table_number: number; total_price: number; status: string; created_at: string; };

const API = process.env.NEXT_PUBLIC_API_URL || "https://waheed-system-production.up.railway.app";

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: string }) {
  return (
    <div style={{
      background: "#13132a", border: `1px solid ${color}33`,
      borderRadius: "16px", padding: "20px 24px",
      borderRight: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: "24px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ color: color, fontSize: "28px", fontWeight: "800" }}>{value}</div>
      <div style={{ color: "#8892b0", fontSize: "13px", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tick, setTick]     = useState(0);

  const fetchOrders = () =>
    fetch(`${API}/orders`).then(r => r.json()).then(d => setOrders(d.orders));

  useEffect(() => {
    fetchOrders();
    const id = setInterval(() => { fetchOrders(); setTick(t => t + 1); }, 10000);
    return () => clearInterval(id);
  }, []);

  const completeOrder = async (id: number) => {
    await fetch(`${API}/orders/${id}/done`, { method: "PUT" });
    fetchOrders();
  };

  const cancelOrder = async (id: number) => {
    const cashier = localStorage.getItem("username") || "unknown";
    await fetch(`${API}/orders/${id}/cancel?cashier=${encodeURIComponent(cashier)}`, { method: "POST" });
    fetchOrders();
  };

  const pending  = orders.filter(o => o.status === "pending");
  const done     = orders.filter(o => o.status === "done");
  const revenue  = done.reduce((s, o) => s + o.total_price, 0);

  return (
    <div style={{ padding: "24px", direction: "rtl", background: "#0a0a1a", minHeight: "100%", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "white", fontSize: "22px", fontWeight: "700" }}>📋 الطلبات</h1>
          <p style={{ margin: "4px 0 0", color: "#8892b0", fontSize: "13px" }}>
            يتحدث تلقائياً كل 10 ثواني • آخر تحديث منذ {tick * 10}ث
          </p>
        </div>
        <button onClick={fetchOrders} style={{
          padding: "10px 20px", background: "rgba(52,152,219,0.12)", color: "#3498db",
          border: "1px solid rgba(52,152,219,0.3)", borderRadius: "12px",
          cursor: "pointer", fontSize: "13px", fontWeight: "600",
        }}>🔄 تحديث الآن</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
        <StatCard icon="🔴" label="طلبات معلقة"  value={pending.length}               color="#e74c3c" />
        <StatCard icon="✅" label="طلبات منجزة"  value={done.length}                  color="#2ecc71" />
        <StatCard icon="💰" label="إجمالي الإيرادات" value={`${revenue.toLocaleString()} د.ع`} color="#f39c12" />
      </div>

      {/* Pending orders */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#e74c3c", boxShadow: "0 0 8px #e74c3c" }} />
          <h2 style={{ margin: 0, color: "white", fontSize: "17px", fontWeight: "700" }}>طلبات جديدة</h2>
          <span style={{
            background: "rgba(231,76,60,0.15)", color: "#e74c3c",
            border: "1px solid rgba(231,76,60,0.3)", borderRadius: "20px",
            padding: "2px 10px", fontSize: "13px", fontWeight: "700",
          }}>{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <div style={{ background: "#13132a", border: "1px solid #2a2a4a", borderRadius: "16px", padding: "40px", textAlign: "center", color: "#8892b0" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>🎉</div>
            <p style={{ margin: 0, fontSize: "14px" }}>لا توجد طلبات معلقة</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
            {pending.map(order => (
              <div key={order.id} style={{
                background: "#13132a", border: "1px solid #2a2a4a",
                borderRadius: "16px", padding: "20px",
                borderRight: "4px solid #e74c3c",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ color: "white", fontSize: "17px", fontWeight: "700" }}>طلب #{order.id}</div>
                    <div style={{ color: "#8892b0", fontSize: "12px", marginTop: "3px" }}>🪑 طاولة {order.table_number}</div>
                  </div>
                  <span style={{
                    background: "rgba(231,76,60,0.12)", color: "#e74c3c",
                    border: "1px solid rgba(231,76,60,0.3)", borderRadius: "8px",
                    padding: "4px 10px", fontSize: "11px", fontWeight: "700",
                  }}>معلق</span>
                </div>
                <div style={{ color: "#f39c12", fontSize: "22px", fontWeight: "800", marginBottom: "4px" }}>
                  {order.total_price.toLocaleString()} <span style={{ fontSize: "13px" }}>د.ع</span>
                </div>
                <div style={{ color: "#8892b0", fontSize: "11px", marginBottom: "16px" }}>
                  🕐 {new Date(order.created_at).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <button onClick={() => completeOrder(order.id)} style={{
                  width: "100%", padding: "10px", marginBottom: "8px",
                  background: "linear-gradient(135deg, #27ae60, #2ecc71)",
                  color: "white", border: "none", borderRadius: "10px",
                  cursor: "pointer", fontSize: "13px", fontWeight: "700",
                  boxShadow: "0 4px 12px rgba(46,204,113,0.3)",
                }}>✅ تم الإنجاز</button>
                <button onClick={() => cancelOrder(order.id)} style={{
                  width: "100%", padding: "10px",
                  background: "rgba(231,76,60,0.12)", color: "#e74c3c",
                  border: "1px solid rgba(231,76,60,0.3)", borderRadius: "10px",
                  cursor: "pointer", fontSize: "13px", fontWeight: "600",
                }}>❌ إلغاء الطلب</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Done orders */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2ecc71" }} />
          <h2 style={{ margin: 0, color: "white", fontSize: "17px", fontWeight: "700" }}>منجزة</h2>
          <span style={{
            background: "rgba(46,204,113,0.15)", color: "#2ecc71",
            border: "1px solid rgba(46,204,113,0.3)", borderRadius: "20px",
            padding: "2px 10px", fontSize: "13px", fontWeight: "700",
          }}>{done.length}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
          {done.map(order => (
            <div key={order.id} style={{
              background: "#13132a", border: "1px solid #2a2a4a",
              borderRadius: "14px", padding: "16px",
              borderRight: "3px solid #2ecc71", opacity: 0.75,
            }}>
              <div style={{ color: "white", fontSize: "14px", fontWeight: "700" }}>طلب #{order.id}</div>
              <div style={{ color: "#8892b0", fontSize: "12px", margin: "4px 0" }}>طاولة {order.table_number}</div>
              <div style={{ color: "#2ecc71", fontSize: "15px", fontWeight: "700" }}>{order.total_price.toLocaleString()} د.ع</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
