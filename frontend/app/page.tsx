"use client";
import { useState, useEffect } from "react";

type MenuItem = {
  id: number;
  name: string;
  price: number;
  category: string;
};

export default function CashierPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [order, setOrder] = useState<MenuItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "وجبات" });

  useEffect(() => {
    fetch("http://127.0.0.1:8000/menu")
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
      alert("الطلب فاضي!");
      return;
    }
    const response = await fetch("http://127.0.0.1:8000/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: order, table_number: 1 }),
    });
    const data = await response.json();
    alert(`✅ ${data.message}`);
    setOrder([]);
  };

  const addNewItem = async () => {
    if (!newItem.name || !newItem.price) {
      alert("أكمل البيانات!");
      return;
    }
    await fetch(
      `http://127.0.0.1:8000/menu/add?name=${newItem.name}&price=${newItem.price}&category=${newItem.category}`,
      { method: "POST" }
    );
    fetch("http://127.0.0.1:8000/menu")
      .then((res) => res.json())
      .then((data) => setMenu(data.menu));
    setNewItem({ name: "", price: "", category: "وجبات" });
    setShowAddItem(false);
    alert("✅ تم إضافة الصنف!");
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial", direction: "rtl" }}>

      {/* ===== يمين - المنيو ===== */}
      <div style={{ flex: 1, padding: "20px", background: "#f8f9fa" }}>
        
        {/* رأس المنيو + زر إضافة */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #333", paddingBottom: "10px", marginBottom: "15px" }}>
          <h2 style={{ margin: 0 }}>🍔 المنيو</h2>
          <button
            onClick={() => setShowAddItem(!showAddItem)}
            style={{ padding: "8px 15px", background: "#3498db", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}
          >
            ➕ إضافة صنف
          </button>
        </div>

        {/* فورم إضافة صنف - هنا في قسم المنيو */}
        {showAddItem && (
          <div style={{ background: "white", padding: "15px", borderRadius: "10px", marginBottom: "15px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <input
              placeholder="اسم الصنف"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              style={{ width: "100%", padding: "8px", marginBottom: "8px", borderRadius: "6px", border: "1px solid #ddd", direction: "rtl", boxSizing: "border-box" }}
            />
            <input
              placeholder="السعر"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
              style={{ width: "100%", padding: "8px", marginBottom: "8px", borderRadius: "6px", border: "1px solid #ddd", direction: "rtl", boxSizing: "border-box" }}
            />
            <select
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              style={{ width: "100%", padding: "8px", marginBottom: "8px", borderRadius: "6px", border: "1px solid #ddd", boxSizing: "border-box" }}
            >
              <option>وجبات</option>
              <option>مشروبات</option>
              <option>حلويات</option>
            </select>
            <button
              onClick={addNewItem}
              style={{ width: "100%", padding: "10px", background: "#27ae60", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}
            >
              ✅ حفظ الصنف
            </button>
          </div>
        )}

        {/* كروت المنيو */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
          {menu.map((item) => (
            <div
              key={item.id}
              onClick={() => addToOrder(item)}
              style={{ background: "white", padding: "20px", borderRadius: "12px", cursor: "pointer", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", transition: "transform 0.1s" }}
              onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.03)")}
              onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div style={{ fontSize: "30px" }}>🍔</div>
              <div style={{ fontWeight: "bold", margin: "8px 0" }}>{item.name}</div>
              <div style={{ color: "#27ae60", fontSize: "18px" }}>{item.price} د.ع</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== يسار - الطلب ===== */}
      <div style={{ width: "320px", background: "#1a1a2e", color: "white", padding: "20px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ borderBottom: "1px solid #444", paddingBottom: "10px", margin: "0 0 15px 0" }}>
          🧾 الطلب الحالي
        </h2>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {order.length === 0 && (
            <p style={{ color: "#888", textAlign: "center", marginTop: "30px" }}>
              اضغط على صنف لإضافته
            </p>
          )}
          {order.map((item, index) => (
            <div key={index} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #333" }}>
              <span>{item.name}</span>
              <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ color: "#27ae60" }}>{item.price} د.ع</span>
                <span onClick={() => removeFromOrder(index)} style={{ color: "#e74c3c", cursor: "pointer", fontWeight: "bold" }}>✕</span>
              </span>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: "22px", fontWeight: "bold", padding: "15px 0", borderTop: "2px solid #444" }}>
            المجموع: {total} د.ع
          </div>
          <button onClick={() => setOrder([])} style={{ width: "100%", padding: "12px", background: "#e74c3c", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", cursor: "pointer", marginBottom: "10px" }}>
            🗑️ مسح الطلب
          </button>
          <button onClick={confirmOrder} style={{ width: "100%", padding: "12px", background: "#27ae60", color: "white", border: "none", borderRadius: "8px", fontSize: "16px", cursor: "pointer" }}>
            ✅ تأكيد الطلب
          </button>
        </div>
      </div>

    </div>
  );
}