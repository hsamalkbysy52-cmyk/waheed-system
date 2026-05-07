"use client";
import { useState, useEffect } from "react";

type MenuItem = { id: number; name: string; price: number; category: string; };

const API = process.env.NEXT_PUBLIC_API_URL || "https://waheed-system-production.up.railway.app";

const ICONS: Record<string, string> = { "وجبات": "🍔", "مشروبات": "🥤", "حلويات": "🍰", "الكل": "🍽️" };

const card: React.CSSProperties = {
  background: "#13132a", border: "1px solid #2a2a4a", borderRadius: "16px",
  padding: "20px 16px", cursor: "pointer", textAlign: "center",
  transition: "all 0.2s", position: "relative",
};

export default function CashierPage() {
  const [menu, setMenu]               = useState<MenuItem[]>([]);
  const [order, setOrder]             = useState<MenuItem[]>([]);
  const [category, setCategory]       = useState("الكل");
  const [showForm, setShowForm]       = useState(false);
  const [newItem, setNewItem]         = useState({ name: "", price: "", category: "وجبات" });
  const [hovered, setHovered]         = useState<number | null>(null);

  const fetchMenu = () =>
    fetch(`${API}/menu`).then(r => r.json()).then(d => setMenu(d.menu));

  useEffect(() => { fetchMenu(); }, []);

  const cats    = ["الكل", ...Array.from(new Set(menu.map(i => i.category)))];
  const visible = category === "الكل" ? menu : menu.filter(i => i.category === category);
  const total   = order.reduce((s, i) => s + i.price, 0);

  const addToOrder     = (item: MenuItem) => setOrder(o => [...o, item]);
  const removeFromOrder = (idx: number)  => setOrder(o => o.filter((_, i) => i !== idx));

  const confirmOrder = async () => {
    if (!order.length) { alert("الطلب فاضي!"); return; }
    const res  = await fetch(`${API}/orders/create`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: order, table_number: 1 }),
    });
    const data = await res.json();
    alert(`✅ ${data.message}`);
    setOrder([]);
  };

  const saveItem = async () => {
    if (!newItem.name || !newItem.price) { alert("أكمل البيانات!"); return; }
    await fetch(
      `${API}/menu/add?name=${encodeURIComponent(newItem.name)}&price=${newItem.price}&category=${encodeURIComponent(newItem.category)}`,
      { method: "POST" }
    );
    fetchMenu();
    setNewItem({ name: "", price: "", category: "وجبات" });
    setShowForm(false);
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#0a0a1a",
    border: "1px solid #2a2a4a", borderRadius: "10px", color: "white",
    fontSize: "14px", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", direction: "rtl", background: "#0a0a1a", overflow: "hidden" }}>

      {/* ===== LEFT PANEL — Menu ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ margin: 0, color: "white", fontSize: "20px", fontWeight: "700" }}>🍽️ المنيو</h2>
              <p style={{ margin: "3px 0 0", color: "#8892b0", fontSize: "12px" }}>{visible.length} صنف متاح</p>
            </div>
            <button onClick={() => setShowForm(f => !f)} style={{
              padding: "10px 18px",
              background: showForm ? "rgba(231,76,60,0.15)" : "rgba(243,156,18,0.12)",
              color: showForm ? "#e74c3c" : "#f39c12",
              border: `1px solid ${showForm ? "rgba(231,76,60,0.3)" : "rgba(243,156,18,0.3)"}`,
              borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600",
            }}>
              {showForm ? "✕ إغلاق" : "➕ إضافة صنف"}
            </button>
          </div>

          {/* Add item form */}
          {showForm && (
            <div style={{ background: "#13132a", border: "1px solid #2a2a4a", borderRadius: "16px", padding: "18px", marginBottom: "16px" }}>
              <p style={{ margin: "0 0 14px", color: "#f39c12", fontSize: "14px", fontWeight: "700" }}>إضافة صنف جديد</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                <div>
                  <label style={{ color: "#8892b0", fontSize: "11px", display: "block", marginBottom: "5px" }}>اسم الصنف</label>
                  <input placeholder="برجر" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={{ color: "#8892b0", fontSize: "11px", display: "block", marginBottom: "5px" }}>السعر (د.ع)</label>
                  <input placeholder="5000" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={{ color: "#8892b0", fontSize: "11px", display: "block", marginBottom: "5px" }}>الفئة</label>
                  <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} style={inp}>
                    <option>وجبات</option><option>مشروبات</option><option>حلويات</option>
                  </select>
                </div>
                <button onClick={saveItem} style={{
                  padding: "10px 18px", background: "linear-gradient(135deg, #27ae60, #2ecc71)",
                  color: "white", border: "none", borderRadius: "10px", cursor: "pointer",
                  fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap",
                }}>✅ حفظ</button>
              </div>
            </div>
          )}

          {/* Category filter */}
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px", marginBottom: "16px" }}>
            {cats.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                padding: "8px 18px", whiteSpace: "nowrap", borderRadius: "30px",
                background: category === cat ? "linear-gradient(135deg, #f39c12, #e67e22)" : "#13132a",
                color: category === cat ? "white" : "#8892b0",
                border: `1px solid ${category === cat ? "transparent" : "#2a2a4a"}`,
                cursor: "pointer", fontSize: "13px", fontWeight: category === cat ? "700" : "400",
                boxShadow: category === cat ? "0 4px 14px rgba(243,156,18,0.35)" : "none",
              }}>
                {ICONS[cat] || "📦"} {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
          {visible.length === 0 ? (
            <div style={{ textAlign: "center", color: "#8892b0", marginTop: "80px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🍽️</div>
              <p>لا توجد أصناف</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "14px" }}>
              {visible.map(item => (
                <div key={item.id} onClick={() => addToOrder(item)}
                  onMouseEnter={() => setHovered(item.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...card,
                    borderColor: hovered === item.id ? "#f39c12" : "#2a2a4a",
                    transform: hovered === item.id ? "translateY(-4px)" : "none",
                    boxShadow: hovered === item.id ? "0 10px 30px rgba(243,156,18,0.2)" : "none",
                  }}>
                  <div style={{ fontSize: "36px", marginBottom: "10px" }}>{ICONS[item.category] || "🍽️"}</div>
                  <div style={{ color: "white", fontWeight: "700", fontSize: "14px", marginBottom: "8px" }}>{item.name}</div>
                  <div style={{ color: "#f39c12", fontSize: "17px", fontWeight: "800" }}>{item.price.toLocaleString()}</div>
                  <div style={{ color: "#8892b0", fontSize: "11px" }}>د.ع</div>
                  <div style={{
                    position: "absolute", top: "10px", left: "10px",
                    background: "rgba(243,156,18,0.12)", color: "#f39c12",
                    borderRadius: "8px", padding: "3px 8px", fontSize: "10px", fontWeight: "700",
                  }}>+ إضافة</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== RIGHT PANEL — Order ===== */}
      <div style={{
        width: "290px", background: "#13132a", borderRight: "1px solid #2a2a4a",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #2a2a4a" }}>
          <h3 style={{ margin: 0, color: "white", fontSize: "16px", fontWeight: "700" }}>🧾 الطلب الحالي</h3>
          <p style={{ margin: "4px 0 0", color: "#8892b0", fontSize: "12px" }}>{order.length} صنف</p>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {order.length === 0 ? (
            <div style={{ textAlign: "center", color: "#8892b0", marginTop: "50px" }}>
              <div style={{ fontSize: "40px", marginBottom: "10px" }}>🛒</div>
              <p style={{ fontSize: "13px" }}>اضغط على صنف لإضافته</p>
            </div>
          ) : order.map((item, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: "1px solid #1e2140",
            }}>
              <span style={{ color: "white", fontSize: "13px" }}>{item.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "#f39c12", fontSize: "13px", fontWeight: "700" }}>{item.price.toLocaleString()}</span>
                <button onClick={() => removeFromOrder(i)} style={{
                  background: "none", border: "none", color: "#e74c3c",
                  cursor: "pointer", fontSize: "16px", padding: "0", lineHeight: 1,
                }}>✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #2a2a4a" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "16px", padding: "12px 16px",
            background: "#1e2140", borderRadius: "12px",
          }}>
            <span style={{ color: "#8892b0", fontSize: "14px" }}>المجموع</span>
            <span style={{ color: "#f39c12", fontSize: "20px", fontWeight: "800" }}>{total.toLocaleString()} <span style={{ fontSize: "12px" }}>د.ع</span></span>
          </div>
          <button onClick={() => setOrder([])} style={{
            width: "100%", padding: "11px", marginBottom: "10px",
            background: "rgba(231,76,60,0.12)", color: "#e74c3c",
            border: "1px solid rgba(231,76,60,0.3)", borderRadius: "12px",
            cursor: "pointer", fontSize: "13px", fontWeight: "600",
          }}>🗑️ مسح الطلب</button>
          <button onClick={confirmOrder} style={{
            width: "100%", padding: "13px",
            background: "linear-gradient(135deg, #27ae60, #2ecc71)",
            color: "white", border: "none", borderRadius: "12px",
            cursor: "pointer", fontSize: "14px", fontWeight: "700",
            boxShadow: "0 4px 16px rgba(46,204,113,0.35)",
          }}>✅ تأكيد الطلب</button>
        </div>
      </div>
    </div>
  );
}
