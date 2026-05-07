"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type Item = { id: number; name: string; price: number; category: string; available: boolean; is_available?: boolean; description?: string };

const CATS = ["برجر", "بيتزا", "مشروبات", "حلويات", "مقبلات", "رئيسية", "أخرى"];
const ALL_CATS = ["الكل", ...CATS];

const EMPTY_FORM = { name: "", price: "", category: "برجر", description: "" };

export default function MenuPage() {
  const [items, setItems]       = useState<Item[]>([]);
  const [filter, setFilter]     = useState("الكل");
  const [loading, setLoad]      = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [error, setError]       = useState("");
  const [editId, setEditId]     = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMenu = useCallback(async () => {
    try {
      const r = await fetch(`${API}/menu`);
      const d = await r.json();
      /* normalize is_available → available */
      const normalized = (d.menu || []).map((i: Item) => ({
        ...i,
        available: i.available ?? i.is_available ?? true,
      }));
      setItems(normalized);
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const filtered = filter === "الكل" ? items : items.filter((i) => i.category === filter);
  const categories = ALL_CATS.filter((c) => c === "الكل" || items.some((i) => i.category === c));

  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setError(""); setShowForm(true); };
  const openEdit = (item: Item) => {
    setEditId(item.id);
    setForm({ name: item.name, price: String(item.price), category: item.category, description: item.description || "" });
    setError("");
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); setError(""); };

  const saveItem = async () => {
    if (!form.name.trim() || !form.price) { setError("اسم الصنف والسعر مطلوبان"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        name: form.name.trim(),
        price: parseFloat(form.price),
        category: form.category,
        description: form.description.trim() || undefined,
      };

      let r: Response;
      if (editId) {
        r = await fetch(`${API}/menu/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`${API}/menu/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!r.ok) { const d = await r.json(); setError(d.detail || "فشلت العملية"); return; }
      closeForm();
      await fetchMenu();
    } catch { setError("تعذر الاتصال بالسيرفر"); }
    finally { setSaving(false); }
  };

  const toggleAvailable = async (item: Item) => {
    try {
      await fetch(`${API}/menu/${item.id}/toggle`, { method: "PUT" });
      setItems((p) => p.map((i) => i.id === item.id ? { ...i, available: !i.available } : i));
    } catch { /* silent */ }
  };

  const deleteItem = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`${API}/menu/${deleteId}`, { method: "DELETE" });
      setItems((p) => p.filter((i) => i.id !== deleteId));
    } finally { setDeleting(false); setDeleteId(null); }
  };

  return (
    <div style={{ padding: "24px", background: "#0a0a0f", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>🍽️ إدارة المنيو</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${items.length} صنف • ${items.filter((i) => i.available).length} متاح`}
          </p>
        </div>
        <button
          onClick={showForm ? closeForm : openAdd}
          style={{ padding: "10px 20px", background: showForm ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.12)", color: showForm ? "#ef4444" : "#22c55e", border: `1px solid ${showForm ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`, borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "700" }}
        >
          {showForm ? "✕ إلغاء" : "+ إضافة صنف"}
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
          <h3 style={{ margin: "0 0 16px", color: "#f1f5f9", fontSize: "15px", fontWeight: "700" }}>
            {editId ? "✏️ تعديل الصنف" : "إضافة صنف جديد"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "12px", display: "block", marginBottom: "6px" }}>اسم الصنف *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: برجر كلاسيك"
                style={{ width: "100%", padding: "10px 12px", background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", color: "#f1f5f9", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "12px", display: "block", marginBottom: "6px" }}>السعر (د.ع) *</label>
              <input
                type="number" value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="مثال: 5000"
                style={{ width: "100%", padding: "10px 12px", background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", color: "#f1f5f9", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "12px", display: "block", marginBottom: "6px" }}>الفئة</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", color: "#f1f5f9", fontSize: "13px", boxSizing: "border-box" }}
              >
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "12px", display: "block", marginBottom: "6px" }}>الوصف (اختياري)</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="وصف مختصر..."
                style={{ width: "100%", padding: "10px 12px", background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", color: "#f1f5f9", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          <button
            onClick={saveItem} disabled={saving}
            style={{ padding: "11px 28px", background: saving ? "#252535" : "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", border: "none", borderRadius: "12px", cursor: saving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "700" }}
          >
            {saving ? "⏳ جاري الحفظ..." : editId ? "💾 حفظ التعديلات" : "✅ إضافة الصنف"}
          </button>
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
        {categories.map((c) => (
          <button key={c} onClick={() => setFilter(c)} style={{
            padding: "7px 16px", borderRadius: "20px",
            background: filter === c ? "rgba(245,158,11,0.15)" : "#111118",
            color: filter === c ? "#f59e0b" : "#64748b",
            border: `1px solid ${filter === c ? "rgba(245,158,11,0.4)" : "#252535"}`,
            cursor: "pointer", fontSize: "12px", fontWeight: filter === c ? "700" : "400",
          }}>
            {c} {c !== "الكل" && `(${items.filter((i) => i.category === c).length})`}
          </button>
        ))}
      </div>

      {/* Items grid */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", paddingTop: "80px", fontSize: "16px" }}>⏳ جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px" }}>
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>🍽️</div>
          <div style={{ color: "#94a3b8", fontSize: "15px" }}>لا توجد أصناف في هذه الفئة</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
          {filtered.map((item) => (
            <div key={item.id} style={{
              background: "#111118", border: `1px solid ${item.available ? "#252535" : "rgba(239,68,68,0.2)"}`,
              borderRadius: "14px", padding: "16px", opacity: item.available ? 1 : 0.65,
              transition: "opacity 0.2s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "14px", marginBottom: "2px" }}>{item.name}</div>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>{item.category}</div>
                </div>
                <div style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderRadius: "8px", padding: "4px 10px", fontSize: "13px", fontWeight: "800", flexShrink: 0, marginRight: "8px" }}>
                  {item.price.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400" }}>د.ع</span>
                </div>
              </div>
              {item.description && (
                <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "10px", lineHeight: "1.5" }}>{item.description}</div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <button
                  onClick={() => openEdit(item)}
                  style={{ flex: 1, padding: "7px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
                >✏️ تعديل</button>
                <button
                  onClick={() => setDeleteId(item.id)}
                  style={{ padding: "7px 12px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "9px", cursor: "pointer", fontSize: "12px" }}
                >🗑️</button>
              </div>

              <button
                onClick={() => toggleAvailable(item)}
                style={{
                  width: "100%", padding: "8px",
                  background: item.available ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                  color: item.available ? "#22c55e" : "#ef4444",
                  border: `1px solid ${item.available ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                  borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600",
                }}
              >
                {item.available ? "✅ متاح — إخفاء" : "🚫 غير متاح — إظهار"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", padding: "28px", width: "300px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "14px" }}>🗑️</div>
            <h3 style={{ margin: "0 0 10px", color: "#f1f5f9", fontSize: "16px" }}>حذف الصنف؟</h3>
            <p style={{ margin: "0 0 22px", color: "#64748b", fontSize: "13px" }}>هذه العملية لا يمكن التراجع عنها</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: "11px", background: "#1c1c28", color: "#94a3b8", border: "1px solid #252535", borderRadius: "12px", cursor: "pointer", fontSize: "13px" }}>إلغاء</button>
              <button onClick={deleteItem} disabled={deleting} style={{ flex: 1, padding: "11px", background: deleting ? "#252535" : "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", cursor: deleting ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "700" }}>
                {deleting ? "⏳..." : "✅ نعم، احذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
