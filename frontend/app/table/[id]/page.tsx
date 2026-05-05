"use client";
import { useState, useEffect } from "react";

type MenuItem = {
  id: number;
  name: string;
  price: number;
  category: string;
};

export default function TablePage({ params }: { params: { id: string } }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [order, setOrder] = useState<MenuItem[]>([]);
  const [sent, setSent] = useState(false);
  const API = "https://waheed-system-production.up.railway.app";
  useEffect(() => {
    fetch(`${API}/menu`)
      .then((res) => res.json())
      .then((data) => setMenu(data.menu));
  }, []);

  const addToOrder = (item: MenuItem) => {
    setOrder([...order, item]);
  };

  const removeFromOrder = (index: number) => {
    setOrder(order.filter((_, i) => i !== index));
  };

  const total = order.reduce((sum, item) => sum + item.price, 0);

  const confirmOrder = async () => {
    if (order.length === 0) {
      alert("اختر صنف!");
      return;
    }

    await fetch(`${API}/orders/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: order,
        table_number: parseInt(params.id),
      }),
    });

    setSent(true);
  };

  if (sent) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a2e", color: "white", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: "80px" }}>✅</div>
          <h2>تم إرسال طلبك!</h2>
          <p style={{ color: "#888" }}>طاولة {params.id}</p>
          <p style={{ color: "#27ae60", fontSize: "20px" }}>المجموع: {total} د.ع</p>
          <button
            onClick={() => { setOrder([]); setSent(false); }}
            style={{ marginTop: "20px", padding: "12px 30px", background: "#3498db", color: "white", border: "none", borderRadius: "10px", fontSize: "16px", cursor: "pointer" }}
          >
            طلب جديد
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "500px", margin: "0 auto", padding: "20px", fontFamily: "Arial", direction: "rtl" }}>
      
      <div style={{ textAlign: "center", marginBottom: "20px", background: "#1a1a2e", color: "white", padding: "15px", borderRadius: "12px" }}>
        <div style={{ fontSize: "30px" }}>🍔</div>
        <h2 style={{ margin: "5px 0" }}>Waheed Restaurant</h2>
        <p style={{ margin: 0, color: "#888" }}>طاولة {params.id}</p>
      </div>

      {/* المنيو */}
      <h3>📋 المنيو</h3>
      {menu.map((item) => (
        <div
          key={item.id}
          onClick={() => addToOrder(item)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: "15px", marginBottom: "10px", borderRadius: "10px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)", cursor: "pointer" }}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>{item.name}</div>
            <div style={{ color: "#27ae60" }}>{item.price} د.ع</div>
          </div>
          <div style={{ fontSize: "24px", color: "#3498db" }}>+</div>
        </div>
      ))}

      {/* الطلب */}
      {order.length > 0 && (
        <div style={{ background: "#1a1a2e", color: "white", padding: "20px", borderRadius: "12px", marginTop: "20px" }}>
          <h3 style={{ margin: "0 0 15px 0" }}>🧾 طلبك</h3>
          {order.map((item, index) => (
            <div key={index} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #333" }}>
              <span>{item.name}</span>
              <span style={{ display: "flex", gap: "10px" }}>
                <span style={{ color: "#27ae60" }}>{item.price} د.ع</span>
                <span onClick={() => removeFromOrder(index)} style={{ color: "#e74c3c", cursor: "pointer" }}>✕</span>
              </span>
            </div>
          ))}
          <div style={{ fontSize: "20px", fontWeight: "bold", margin: "15px 0" }}>
            المجموع: {total} د.ع
          </div>
          <button
            onClick={confirmOrder}
            style={{ width: "100%", padding: "15px", background: "#27ae60", color: "white", border: "none", borderRadius: "10px", fontSize: "18px", cursor: "pointer" }}
          >
            ✅ أرسل الطلب
          </button>
        </div>
      )}
    </div>
  );
}