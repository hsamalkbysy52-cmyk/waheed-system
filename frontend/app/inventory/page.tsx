"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type InvItem = { id: number; name: string; unit: string; quantity: number; min_quantity: number };

const UNITS = ["قطعة", "حبة", "كغ", "غرام", "لتر", "مل", "علبة", "زجاجة", "كيس", "رول"];
const EMPTY_FORM = { name: "", unit: "قطعة", quantity: "0", min_quantity: "5" };

function stockColor(item: InvItem) {
  if (item.quantity <= item.min_quantity) return "var(--red)";
  if (item.quantity <= item.min_quantity * 2) return "var(--orange)";
  return "var(--green)";
}

function stockPct(item: InvItem) {
  const max = Math.max(item.quantity, item.min_quantity * 3, 1);
  return Math.min(100, (item.quantity / max) * 100);
}

export default function InventoryPage() {
  const [items, setItems]       = useState<InvItem[]>([]);
  const [loading, setLoad]      = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      const r = await fetch(`${API}/inventory`);
      const d = await r.json();
      setItems(d.items || []);
    } finally { setLoad(false); }
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const lowStock  = items.filter(i => i.quantity <= i.min_quantity);
  const goodStock = items.filter(i => i.quantity > i.min_quantity);

  const openAdd  = () => { setEditId(null); setForm(EMPTY_FORM); setError(""); setShowForm(true); };
  const openEdit = (item: InvItem) => {
    setEditId(item.id);
    setForm({ name: item.name, unit: item.unit, quantity: String(item.quantity), min_quantity: String(item.min_quantity) });
    setError(""); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); setError(""); };

  const saveItem = async () => {
    if (!form.name.trim()) { setError("اسم المادة مطلوب"); return; }
    setSaving(true); setError("");
    try {
      const payload = { name: form.name.trim(), unit: form.unit, quantity: parseFloat(form.quantity) || 0, min_quantity: parseFloat(form.min_quantity) || 5 };
      const r = await fetch(editId ? `${API}/inventory/${editId}` : `${API}/inventory/add`, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || "فشلت العملية"); return; }
      closeForm(); await fetchInventory();
    } catch { setError("تعذر الاتصال بالسيرفر"); }
    finally { setSaving(false); }
  };

  const deleteItem = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`${API}/inventory/${deleteId}`, { method: "DELETE" });
      setItems(p => p.filter(i => i.id !== deleteId));
    } finally { setDeleting(false); setDeleteId(null); }
  };

  const inputStyle = { width: "100%", padding: "10px 12px", background: "var(--bg)", border: "1px solid #252535", borderRadius: "10px", color: "var(--text)", fontSize: "13px", boxSizing: "border-box" as const };

  return (
    <div style={{ padding: "24px", background: "var(--bg)", minHeight: "100vh", direction: "rtl" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text)", fontSize: "20px", fontWeight: "700" }}>📦 المخزون</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${items.length} مادة${lowStock.length > 0 ? ` • ⚠️ ${lowStock.length} منخفضة` : ""}`}
          </p>
        </div>
        <button onClick={showForm ? closeForm : openAdd} style={{
          padding: "10px 20px",
          background: showForm ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.12)",
          color: showForm ? "var(--red)" : "var(--green)",
          border: `1px solid ${showForm ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
          borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "700",
        }}>
          {showForm ? "✕ إلغاء" : "+ إضافة مادة"}
        </button>
      </div>

      {/* Stats */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "إجمالي المواد",  value: items.length,      color: "var(--gold)", icon: "📦" },
            { label: "مخزون منخفض",   value: lowStock.length,   color: "var(--red)", icon: "⚠️" },
            { label: "مخزون كافٍ",    value: goodStock.length,  color: "var(--green)", icon: "✅" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surface)", border: `1px solid ${s.color}20`, borderRadius: "14px", padding: "14px 18px" }}>
              <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
              <div style={{ color: s.color, fontSize: "22px", fontWeight: "800" }}>{s.value}</div>
              <div style={{ color: "var(--muted)", fontSize: "12px" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ background: "var(--surface)", border: "1px solid #252535", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
          <h3 style={{ margin: "0 0 16px", color: "var(--text)", fontSize: "15px", fontWeight: "700" }}>
            {editId ? "✏️ تعديل المادة" : "إضافة مادة جديدة"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "6px" }}>اسم المادة *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: لحم برجر" style={inputStyle} />
            </div>
            <div>
              <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "6px" }}>وحدة القياس</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inputStyle}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "6px" }}>الكمية الحالية</label>
              <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "6px" }}>حد التنبيه (أدنى كمية)</label>
              <input type="number" value={form.min_quantity} onChange={e => setForm(f => ({ ...f, min_quantity: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          <button onClick={saveItem} disabled={saving} style={{
            padding: "11px 28px", background: saving ? "var(--border)" : "linear-gradient(135deg,#f59e0b,#d97706)",
            color: saving ? "var(--muted)" : "#000", border: "none", borderRadius: "12px",
            cursor: saving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "700",
          }}>
            {saving ? "⏳ جاري الحفظ..." : editId ? "💾 حفظ التعديلات" : "✅ إضافة المادة"}
          </button>
        </div>
      )}

      {/* Low stock alert strip */}
      {!loading && lowStock.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "14px", padding: "14px 18px", marginBottom: "20px" }}>
          <div style={{ color: "var(--red)", fontWeight: "700", fontSize: "13px", marginBottom: "8px" }}>⚠️ مواد تحتاج إعادة تخزين</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {lowStock.map(i => (
              <span key={i.id} style={{ background: "rgba(239,68,68,0.12)", color: "var(--red)", borderRadius: "8px", padding: "3px 10px", fontSize: "12px" }}>
                {i.name} — {i.quantity} {i.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Items grid */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: "80px", fontSize: "16px" }}>⏳ جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px" }}>
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>📦</div>
          <div style={{ color: "var(--text2)", fontSize: "15px" }}>المخزون فارغ</div>
          <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "6px" }}>أضف المواد الخام التي تستخدمها في وصفاتك</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}>
          {items.map(item => {
            const color = stockColor(item);
            const isLow = item.quantity <= item.min_quantity;
            return (
              <div key={item.id} style={{
                background: "var(--surface)",
                border: `1px solid ${isLow ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
                borderRadius: "14px", padding: "16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ color: "var(--text)", fontWeight: "700", fontSize: "14px" }}>{item.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "2px" }}>{item.unit}</div>
                  </div>
                  {isLow && (
                    <span style={{ background: "rgba(239,68,68,0.12)", color: "var(--red)", borderRadius: "7px", padding: "2px 8px", fontSize: "10px", fontWeight: "700" }}>منخفض</span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                  <span style={{ color, fontSize: "26px", fontWeight: "800" }}>{item.quantity}</span>
                  <span style={{ color: "var(--muted)", fontSize: "11px" }}>حد أدنى: {item.min_quantity} {item.unit}</span>
                </div>

                <div style={{ background: "var(--border)", borderRadius: "4px", height: "5px", marginBottom: "14px", overflow: "hidden" }}>
                  <div style={{ width: `${stockPct(item)}%`, height: "100%", background: color, borderRadius: "4px", transition: "width 0.3s" }} />
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => openEdit(item)} style={{ flex: 1, padding: "7px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                    ✏️ تعديل
                  </button>
                  <button onClick={() => setDeleteId(item.id)} style={{ padding: "7px 12px", background: "rgba(239,68,68,0.1)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "9px", cursor: "pointer", fontSize: "12px" }}>
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--surface)", border: "1px solid #252535", borderRadius: "20px", padding: "28px", width: "300px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "14px" }}>🗑️</div>
            <h3 style={{ margin: "0 0 10px", color: "var(--text)", fontSize: "16px" }}>حذف المادة؟</h3>
            <p style={{ margin: "0 0 22px", color: "var(--muted)", fontSize: "13px" }}>ستُحذف أيضاً من جميع الوصفات المرتبطة بها</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: "11px", background: "var(--raised)", color: "var(--text2)", border: "1px solid #252535", borderRadius: "12px", cursor: "pointer", fontSize: "13px" }}>إلغاء</button>
              <button onClick={deleteItem} disabled={deleting} style={{ flex: 1, padding: "11px", background: deleting ? "var(--border)" : "rgba(239,68,68,0.15)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", cursor: deleting ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "700" }}>
                {deleting ? "⏳..." : "✅ نعم، احذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
