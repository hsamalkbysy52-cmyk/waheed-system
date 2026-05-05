"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Order = {
  id: number;
  table_number: number;
  total_price: number;
  status: string;
  created_at: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  const fetchOrders = () => {
    fetch("https://waheed-system-production.up.railway.app/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data.orders));
  };

  useEffect(() => {
    fetchOrders();
    // تحديث كل 10 ثواني تلقائياً
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const completeOrder = async (id: number) => {
    await fetch(`https://waheed-system-production.up.railway.app/orders/${id}/done`, {
      method: "PUT",
    });
    fetchOrders();
  };

  const pending = orders.filter((o) => o.status === "pending");
  const done = orders.filter((o) => o.status === "done");

  return (
    <div style={{ padding: "20px", fontFamily: "Arial", direction: "rtl", background: "#f8f9fa", minHeight: "100vh" }}>
      
      {/* رأس الصفحة */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1>📋 الطلبات</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={fetchOrders} style={{ padding: "10px 20px", background: "#3498db", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
            🔄 تحديث
          </button>
          <Link href="/" style={{ padding: "10px 20px", background: "#1a1a2e", color: "white", borderRadius: "8px", textDecoration: "none" }}>
            🏠 الكاشير
          </Link>
        </div>
      </div>

      {/* الطلبات الجديدة */}
      <h2 style={{ color: "#e74c3c" }}>🔴 طلبات جديدة ({pending.length})</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "15px", marginBottom: "30px" }}>
        {pending.length === 0 && <p style={{ color: "#888" }}>لا توجد طلبات جديدة</p>}
        {pending.map((order) => (
          <div key={order.id} style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", borderRight: "4px solid #e74c3c" }}>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>طلب #{order.id}</div>
            <div style={{ color: "#666", margin: "5px 0" }}>طاولة {order.table_number}</div>
            <div style={{ color: "#27ae60", fontSize: "20px", fontWeight: "bold" }}>{order.total_price} د.ع</div>
            <div style={{ color: "#999", fontSize: "12px", margin: "5px 0" }}>{order.created_at}</div>
            <button
              onClick={() => completeOrder(order.id)}
              style={{ marginTop: "10px", width: "100%", padding: "10px", background: "#27ae60", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "15px" }}
            >
              ✅ تم الإنجاز
            </button>
          </div>
        ))}
      </div>

      {/* الطلبات المنجزة */}
      <h2 style={{ color: "#27ae60" }}>✅ منجزة ({done.length})</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
        {done.map((order) => (
          <div key={order.id} style={{ background: "white", padding: "15px", borderRadius: "10px", opacity: 0.7, borderRight: "4px solid #27ae60" }}>
            <div style={{ fontWeight: "bold" }}>طلب #{order.id}</div>
            <div style={{ color: "#666" }}>طاولة {order.table_number}</div>
            <div style={{ color: "#27ae60" }}>{order.total_price} د.ع</div>
          </div>
        ))}
      </div>

    </div>
  );
}