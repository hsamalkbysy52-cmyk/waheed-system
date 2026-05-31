"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type Item    = { id: number; name: string; price: number; category: string; available: boolean; is_available?: boolean; description?: string };
type InvItem = { id: number; name: string; unit: string };
type RecipeRow = { inventory_item_id: number; name: string; unit: string; amount: number };

const CATS = ["برجر", "بيتزا", "مشروبات", "حلويات", "مقبلات", "رئيسية", "أخرى"];
const ALL_CATS = ["الكل", ...CATS];

const EMPTY_FORM = { name: "", price: "", category: "برجر", description: "" };

/* ─── Recipe Modal ─── */
function RecipeModal({ menuItem, onClose }: { menuItem: Item; onClose: () => void }) {
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [recipe,   setRecipe]   = useState<RecipeRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selId,    setSelId]    = useState<number | "">("");
  const [amount,   setAmount]   = useState("1");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/inventory`).then(r => r.json()),
      fetch(`${API}/inventory/recipe/${menuItem.id}`).then(r => r.json()),
    ]).then(([invData, recipeData]) => {
      setInvItems(invData.items || []);
      setRecipe((recipeData.recipe || []).map((r: { inventory_item_id: number; inventory_name: string; unit: string; amount: number }) => ({
        inventory_item_id: r.inventory_item_id,
        name: r.inventory_name,
        unit: r.unit,
        amount: r.amount,
      })));
    }).finally(() => setLoading(false));
  }, [menuItem.id]);

  const addIngredient = () => {
    if (!selId) return;
    const inv = invItems.find(i => i.id === selId);
    if (!inv || recipe.find(r => r.inventory_item_id === selId)) return;
    setRecipe(p => [...p, { inventory_item_id: inv.id, name: inv.name, unit: inv.unit, amount: parseFloat(amount) || 1 }]);
    setSelId(""); setAmount("1");
  };

  const saveRecipe = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/inventory/recipe/${menuItem.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: recipe.map(r => ({ inventory_item_id: r.inventory_item_id, amount: r.amount })) }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "16px" }}>
      <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "460px", maxHeight: "85vh", direction: "rtl", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.04)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "16px" }}>🔗 وصفة: {menuItem.name}</div>
            <div style={{ color: "#64748b", fontSize: "12px", marginTop: "3px" }}>اربط المكونات ومقدارها لكل وحدة</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "22px" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "18px 22px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>⏳ جاري التحميل...</div>
          ) : (<>
            {/* Add ingredient */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "8px" }}>إضافة مكوّن من المخزون</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select value={selId} onChange={e => setSelId(e.target.value === "" ? "" : parseInt(e.target.value))}
                  style={{ flex: 2, padding: "9px 10px", background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", color: selId === "" ? "#334155" : "#f1f5f9", fontSize: "13px" }}>
                  <option value="">اختر مادة...</option>
                  {invItems.filter(i => !recipe.find(r => r.inventory_item_id === i.id)).map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
                <input type="number" value={amount} min="0.1" step="0.1" onChange={e => setAmount(e.target.value)} placeholder="كمية"
                  style={{ width: "70px", padding: "9px 10px", background: "#0a0a0f", border: "1px solid #252535", borderRadius: "10px", color: "#f1f5f9", fontSize: "13px", textAlign: "center" }} />
                <button onClick={addIngredient} disabled={!selId}
                  style={{ padding: "9px 14px", background: selId ? "rgba(34,197,94,0.15)" : "#1c1c28", color: selId ? "#22c55e" : "#334155", border: `1px solid ${selId ? "rgba(34,197,94,0.3)" : "transparent"}`, borderRadius: "10px", cursor: selId ? "pointer" : "not-allowed", fontSize: "13px", fontWeight: "700" }}>
                  + أضف
                </button>
              </div>
              {invItems.length === 0 && (
                <div style={{ color: "#64748b", fontSize: "11px", marginTop: "6px" }}>لا توجد مواد. أضفها أولاً من صفحة المخزون.</div>
              )}
            </div>

            {/* Current recipe list */}
            {recipe.length === 0 ? (
              <div style={{ textAlign: "center", color: "#334155", padding: "24px 0", fontSize: "13px" }}>لم تُربط أي مكونات بعد</div>
            ) : (
              <div style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", overflow: "hidden" }}>
                {recipe.map((r, i) => (
                  <div key={r.inventory_item_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: i < recipe.length - 1 ? "1px solid #252535" : "none" }}>
                    <div>
                      <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "600" }}>{r.name}</div>
                      <div style={{ color: "#64748b", fontSize: "11px" }}>{r.amount} {r.unit} لكل وحدة</div>
                    </div>
                    <button onClick={() => setRecipe(p => p.filter(x => x.inventory_item_id !== r.inventory_item_id))}
                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" }}>
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>

        {/* Save footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #252535", flexShrink: 0 }}>
          <button onClick={saveRecipe} disabled={saving || loading} style={{
            width: "100%", padding: "13px", border: "none", borderRadius: "12px",
            cursor: (saving || loading) ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "800",
            background: saved ? "rgba(34,197,94,0.15)" : (saving || loading) ? "#252535" : "linear-gradient(135deg,#f59e0b,#d97706)",
            color: saved ? "#22c55e" : (saving || loading) ? "#64748b" : "#000",
          }}>
            {saved ? "✅ تم حفظ الوصفة!" : saving ? "⏳ جاري الحفظ..." : "💾 حفظ الوصفة"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MenuPage() {
  const [items, setItems]       = useState<Item[]>([]);
  const [filter, setFilter]     = useState("الكل");
  const [loading, setLoad]      = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [error, setError]       = useState("");
  const [editId, setEditId]     = useState<number | null>(null);
  const [deleteId, setDeleteId]   = useState<number | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [recipeItem, setRecipeItem] = useState<Item | null>(null);

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
                onClick={() => setRecipeItem(item)}
                style={{ width: "100%", padding: "7px", background: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}
              >🔗 وصفة المكونات</button>

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

      {/* Recipe modal */}
      {recipeItem && <RecipeModal menuItem={recipeItem} onClose={() => setRecipeItem(null)} />}

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
