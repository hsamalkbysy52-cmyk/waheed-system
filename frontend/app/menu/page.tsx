"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://waheed-system-production.up.railway.app";

type Item    = { id: number; name: string; price: number; category: string; available: boolean; is_available?: boolean; description?: string; modifiers?: ModGroup[]; parent_id?: number | null; variants?: Item[] };
type InvItem = { id: number; name: string; unit: string };
type RecipeRow = { inventory_item_id: number; name: string; unit: string; amount: number };
type ModOption = { id: number; name: string; price_delta: number; inventory_item_id: number | null; quantity_delta: number };
type ModGroup  = { id: number; name: string; max_selections: number; options: ModOption[] };

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

/* ─── Modifier Modal ─── */
function ModifierModal({ menuItem, onClose }: { menuItem: Item; onClose: () => void }) {
  const [recipe,    setRecipe]    = useState<RecipeRow[]>([]);
  const [groups,    setGroups]    = useState<ModGroup[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMax,  setNewGroupMax]  = useState("1");
  const [addingGroup,  setAddingGroup]  = useState(false);
  const [optForms, setOptForms] = useState<Record<number, { ingredient_inv_id: string; type: "add" | "remove"; price_delta: string; name: string }>>({});
  const [addingOpt, setAddingOpt] = useState<Record<number, boolean>>({});
  // edit states
  const [editGroupId,   setEditGroupId]   = useState<number | null>(null);
  const [editGroupForm, setEditGroupForm] = useState<{ name: string; max_selections: string }>({ name: "", max_selections: "1" });
  const [savingGroup,   setSavingGroup]   = useState(false);
  const [editOptId,   setEditOptId]   = useState<number | null>(null);
  const [editOptForm, setEditOptForm] = useState<{ name: string; price_delta: string }>({ name: "", price_delta: "0" });
  const [savingOpt,   setSavingOpt]   = useState(false);
  // drag states
  const [dragGroupIdx, setDragGroupIdx] = useState<number | null>(null);
  const [dragOptState, setDragOptState] = useState<{ groupId: number; optIdx: number } | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/inventory/recipe/${menuItem.id}`).then(r => r.json()),
      fetch(`${API}/menu/${menuItem.id}/modifiers/groups`).then(r => r.json()),
    ]).then(([recipeData, modData]) => {
      setRecipe((recipeData.recipe || []).map((r: { inventory_item_id: number; inventory_name: string; unit: string; amount: number }) => ({
        inventory_item_id: r.inventory_item_id,
        name: r.inventory_name,
        unit: r.unit,
        amount: r.amount,
      })));
      setGroups(modData.groups || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [menuItem.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      await fetch(`${API}/menu/${menuItem.id}/modifiers/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim(), max_selections: parseInt(newGroupMax) || 1 }),
      });
      setNewGroupName(""); setNewGroupMax("1");
      loadData();
    } finally { setAddingGroup(false); }
  };

  const deleteGroup = async (groupId: number) => {
    await fetch(`${API}/modifiers/groups/${groupId}`, { method: "DELETE" });
    loadData();
  };

  const initOptForm = (groupId: number) => {
    setOptForms(p => ({ ...p, [groupId]: { ingredient_inv_id: "", type: "add", price_delta: "0", name: "" } }));
  };

  const setOptIngredient = (groupId: number, invId: string, type?: "add" | "remove") => {
    const rec = recipe.find(r => r.inventory_item_id === parseInt(invId));
    const currentType = type ?? optForms[groupId]?.type ?? "add";
    const autoName = rec ? (currentType === "add" ? `إضافة ${rec.name}` : `بدون ${rec.name}`) : "";
    setOptForms(p => ({
      ...p,
      [groupId]: { ...p[groupId], ingredient_inv_id: invId, type: currentType, name: autoName },
    }));
  };

  const createOption = async (groupId: number) => {
    const f = optForms[groupId];
    if (!f || !f.name.trim() || !f.ingredient_inv_id) return;
    const rec = recipe.find(r => r.inventory_item_id === parseInt(f.ingredient_inv_id));
    setAddingOpt(p => ({ ...p, [groupId]: true }));
    try {
      await fetch(`${API}/modifiers/groups/${groupId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name.trim(),
          price_delta: parseFloat(f.price_delta) || 0,
          inventory_item_id: parseInt(f.ingredient_inv_id),
          quantity_delta: rec ? (f.type === "add" ? rec.amount : -rec.amount) : 0,
        }),
      });
      setOptForms(p => { const n = { ...p }; delete n[groupId]; return n; });
      loadData();
    } finally { setAddingOpt(p => ({ ...p, [groupId]: false })); }
  };

  const deleteOption = async (optionId: number) => {
    await fetch(`${API}/modifiers/options/${optionId}`, { method: "DELETE" });
    loadData();
  };

  const openEditGroup = (group: ModGroup) => {
    setEditGroupId(group.id);
    setEditGroupForm({ name: group.name, max_selections: String(group.max_selections) });
  };

  const saveGroupEdit = async () => {
    if (!editGroupId) return;
    setSavingGroup(true);
    try {
      await fetch(`${API}/modifiers/groups/${editGroupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editGroupForm.name.trim(), max_selections: parseInt(editGroupForm.max_selections) || 1 }),
      });
      setEditGroupId(null);
      loadData();
    } finally { setSavingGroup(false); }
  };

  const openEditOpt = (opt: ModOption) => {
    setEditOptId(opt.id);
    setEditOptForm({ name: opt.name, price_delta: String(opt.price_delta) });
  };

  const saveOptEdit = async () => {
    if (!editOptId) return;
    setSavingOpt(true);
    try {
      await fetch(`${API}/modifiers/options/${editOptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editOptForm.name.trim(), price_delta: parseFloat(editOptForm.price_delta) || 0 }),
      });
      setEditOptId(null);
      loadData();
    } finally { setSavingOpt(false); }
  };

  const handleGroupDrop = (toIdx: number) => {
    if (dragGroupIdx === null || dragGroupIdx === toIdx) { setDragGroupIdx(null); return; }
    const reordered = [...groups];
    const [moved] = reordered.splice(dragGroupIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setGroups(reordered);
    setDragGroupIdx(null);
    fetch(`${API}/menu/${menuItem.id}/modifiers/groups/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map(g => g.id) }),
    });
  };

  const handleOptDrop = (groupId: number, toOptIdx: number) => {
    if (!dragOptState || dragOptState.groupId !== groupId || dragOptState.optIdx === toOptIdx) { setDragOptState(null); return; }
    const reordered = groups.map(g => {
      if (g.id !== groupId) return g;
      const opts = [...g.options];
      const [moved] = opts.splice(dragOptState.optIdx, 1);
      opts.splice(toOptIdx, 0, moved);
      return { ...g, options: opts };
    });
    setGroups(reordered);
    setDragOptState(null);
    const grp = reordered.find(g => g.id === groupId);
    if (grp) {
      fetch(`${API}/modifiers/groups/${groupId}/options/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: grp.options.map(o => o.id) }),
      });
    }
  };

  const getIngredientName = (invId: number | null) => {
    if (!invId) return null;
    return recipe.find(r => r.inventory_item_id === invId)?.name ?? `#${invId}`;
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", background: "#0a0a0f", border: "1px solid #252535",
    borderRadius: "8px", color: "#f1f5f9", fontSize: "12px", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100, padding: "16px" }}>
      <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "520px", maxHeight: "88vh", direction: "rtl", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.04)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "16px" }}>🎛️ تعديلات: {menuItem.name}</div>
            <div style={{ color: "#64748b", fontSize: "12px", marginTop: "3px" }}>الخيارات مبنية على مكونات الوصفة</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "22px" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "18px 22px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: "40px 0" }}>⏳ جاري التحميل...</div>
          ) : (<>

            {recipe.length === 0 && (
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", color: "#f59e0b", fontSize: "12px" }}>
                ⚠️ لا توجد وصفة لهذا الصنف. أضف مكونات الوصفة أولاً لتتمكن من إنشاء خيارات التعديل.
              </div>
            )}

            {/* Create new group */}
            <div style={{ marginBottom: "20px", background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", padding: "14px" }}>
              <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "700", marginBottom: "10px" }}>+ إضافة مجموعة تعديلات جديدة</div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="اسم المجموعة (مثال: تعديلات اللحم)"
                  style={{ ...inputStyle, flex: 3 }}
                />
                <input
                  type="number" min="1" max="10"
                  value={newGroupMax}
                  onChange={e => setNewGroupMax(e.target.value)}
                  placeholder="الحد"
                  title="الحد الأقصى للاختيارات"
                  style={{ ...inputStyle, width: "70px" }}
                />
                <button
                  onClick={createGroup}
                  disabled={addingGroup || !newGroupName.trim()}
                  style={{ padding: "8px 14px", background: newGroupName.trim() ? "rgba(34,197,94,0.15)" : "#252535", color: newGroupName.trim() ? "#22c55e" : "#334155", border: `1px solid ${newGroupName.trim() ? "rgba(34,197,94,0.3)" : "transparent"}`, borderRadius: "8px", cursor: newGroupName.trim() ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: "700", flexShrink: 0 }}
                >
                  {addingGroup ? "⏳" : "أضف"}
                </button>
              </div>
              <div style={{ color: "#64748b", fontSize: "10px" }}>الحد الأقصى = عدد الخيارات التي يمكن للعميل اختيارها (1 = اختيار واحد فقط)</div>
            </div>

            {/* Existing groups */}
            {groups.length === 0 ? (
              <div style={{ textAlign: "center", color: "#334155", padding: "20px 0", fontSize: "12px" }}>لا توجد مجموعات تعديلات بعد</div>
            ) : (
              groups.map((group, idx) => {
                const optForm = optForms[group.id];
                const isDraggingThisGroup = dragGroupIdx === idx;
                return (
                  <div
                    key={group.id}
                    draggable
                    onDragStart={() => setDragGroupIdx(idx)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleGroupDrop(idx)}
                    onDragEnd={() => setDragGroupIdx(null)}
                    style={{ marginBottom: "16px", background: "#1c1c28", border: `1px solid ${isDraggingThisGroup ? "rgba(245,158,11,0.5)" : "#252535"}`, borderRadius: "12px", overflow: "hidden", opacity: isDraggingThisGroup ? 0.5 : 1, transition: "opacity 0.15s, border-color 0.15s" }}
                  >

                    {/* Group header */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #252535", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(245,158,11,0.03)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                        <span style={{ color: "#334155", cursor: "grab", fontSize: "18px", flexShrink: 0, userSelect: "none" }}>≡</span>
                        {editGroupId === group.id ? (
                          <div style={{ display: "flex", gap: "6px", flex: 1, alignItems: "center" }}>
                            <input
                              value={editGroupForm.name}
                              onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))}
                              style={{ ...inputStyle, flex: 3 }}
                              autoFocus
                            />
                            <input
                              type="number" min="1" max="10"
                              value={editGroupForm.max_selections}
                              onChange={e => setEditGroupForm(f => ({ ...f, max_selections: e.target.value }))}
                              style={{ ...inputStyle, width: "56px" }}
                            />
                            <button onClick={saveGroupEdit} disabled={savingGroup} style={{ padding: "5px 10px", background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "7px", cursor: "pointer", fontSize: "12px", fontWeight: "700", flexShrink: 0 }}>{savingGroup ? "⏳" : "✅"}</button>
                            <button onClick={() => setEditGroupId(null)} style={{ padding: "5px 8px", background: "transparent", color: "#64748b", border: "1px solid #252535", borderRadius: "7px", cursor: "pointer", fontSize: "12px", flexShrink: 0 }}>✕</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: "#f1f5f9", fontWeight: "700", fontSize: "13px" }}>{group.name}</span>
                            <span style={{ color: "#64748b", fontSize: "11px" }}>
                              (حتى {group.max_selections} {group.max_selections === 1 ? "اختيار" : "اختيارات"})
                            </span>
                            <button onClick={() => openEditGroup(group)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "13px", padding: "2px 4px", flexShrink: 0 }}>✏️</button>
                          </>
                        )}
                      </div>
                      {editGroupId !== group.id && (
                        <button
                          onClick={() => deleteGroup(group.id)}
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px", padding: "4px 10px", cursor: "pointer", fontSize: "11px", flexShrink: 0 }}
                        >🗑️</button>
                      )}
                    </div>

                    {/* Options list */}
                    <div style={{ padding: "10px 14px" }}>
                      {group.options.length === 0 ? (
                        <div style={{ color: "#334155", fontSize: "11px", marginBottom: "10px" }}>لا توجد خيارات بعد</div>
                      ) : (
                        group.options.map((opt, optIdx) => {
                          const isDraggingThisOpt = dragOptState?.groupId === group.id && dragOptState?.optIdx === optIdx;
                          return (
                            <div
                              key={opt.id}
                              draggable
                              onDragStart={e => { e.stopPropagation(); setDragOptState({ groupId: group.id, optIdx }); }}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => { e.stopPropagation(); handleOptDrop(group.id, optIdx); }}
                              onDragEnd={() => setDragOptState(null)}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #252535", opacity: isDraggingThisOpt ? 0.4 : 1, transition: "opacity 0.15s" }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                                <span style={{ color: "#252535", cursor: "grab", fontSize: "15px", flexShrink: 0, userSelect: "none" }}>≡</span>
                                {editOptId === opt.id ? (
                                  <div style={{ display: "flex", gap: "6px", flex: 1, alignItems: "center" }}>
                                    <input
                                      value={editOptForm.name}
                                      onChange={e => setEditOptForm(f => ({ ...f, name: e.target.value }))}
                                      style={{ ...inputStyle, flex: 2 }}
                                      autoFocus
                                    />
                                    <input
                                      type="number" step="100"
                                      value={editOptForm.price_delta}
                                      onChange={e => setEditOptForm(f => ({ ...f, price_delta: e.target.value }))}
                                      placeholder="فرق السعر"
                                      style={{ ...inputStyle, width: "80px" }}
                                    />
                                    <button onClick={saveOptEdit} disabled={savingOpt} style={{ padding: "4px 8px", background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>{savingOpt ? "⏳" : "✅"}</button>
                                    <button onClick={() => setEditOptId(null)} style={{ padding: "4px 6px", background: "transparent", color: "#64748b", border: "1px solid #252535", borderRadius: "6px", cursor: "pointer", fontSize: "11px", flexShrink: 0 }}>✕</button>
                                  </div>
                                ) : (
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: "#f1f5f9", fontSize: "12px", fontWeight: "600" }}>{opt.name}</div>
                                    <div style={{ color: "#64748b", fontSize: "10px", marginTop: "2px", display: "flex", gap: "8px" }}>
                                      {opt.price_delta !== 0 && (
                                        <span style={{ color: opt.price_delta > 0 ? "#f59e0b" : "#22c55e" }}>
                                          {opt.price_delta > 0 ? "+" : ""}{opt.price_delta.toLocaleString()} د.ع
                                        </span>
                                      )}
                                      {opt.inventory_item_id && (
                                        <span style={{ color: opt.quantity_delta > 0 ? "#ef4444" : "#22c55e" }}>
                                          {opt.quantity_delta > 0 ? "⬆️ إضافة" : "⬇️ حذف"} {getIngredientName(opt.inventory_item_id)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {editOptId !== opt.id && (
                                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                                  <button onClick={() => openEditOpt(opt)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "13px", padding: "2px 4px" }}>✏️</button>
                                  <button onClick={() => deleteOption(opt.id)} style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "6px", padding: "3px 8px", cursor: "pointer", fontSize: "11px" }}>🗑️</button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Add option form */}
                      {optForm ? (
                        <div style={{ marginTop: "10px", padding: "10px", background: "#111118", borderRadius: "10px", border: "1px solid #252535" }}>
                          <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "8px", fontWeight: "700" }}>إضافة خيار من مكونات الوصفة</div>

                          {recipe.length === 0 ? (
                            <div style={{ color: "#f59e0b", fontSize: "11px", marginBottom: "8px" }}>⚠️ أضف مكونات للوصفة أولاً</div>
                          ) : (<>
                            <select
                              value={optForm.ingredient_inv_id}
                              onChange={e => setOptIngredient(group.id, e.target.value)}
                              style={{ ...inputStyle, width: "100%", marginBottom: "6px" }}
                            >
                              <option value="">اختر مكوّن من الوصفة...</option>
                              {recipe.map(r => (
                                <option key={r.inventory_item_id} value={r.inventory_item_id}>
                                  {r.name} ({r.amount} {r.unit})
                                </option>
                              ))}
                            </select>

                            <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                              <button
                                onClick={() => setOptIngredient(group.id, optForm.ingredient_inv_id, "remove")}
                                style={{
                                  flex: 1, padding: "7px",
                                  background: optForm.type === "remove" ? "rgba(239,68,68,0.15)" : "#1c1c28",
                                  color: optForm.type === "remove" ? "#ef4444" : "#64748b",
                                  border: `1px solid ${optForm.type === "remove" ? "rgba(239,68,68,0.3)" : "#252535"}`,
                                  borderRadius: "8px", cursor: "pointer", fontSize: "12px",
                                  fontWeight: optForm.type === "remove" ? "700" : "400",
                                }}
                              >🚫 بدون (حذف)</button>
                              <button
                                onClick={() => setOptIngredient(group.id, optForm.ingredient_inv_id, "add")}
                                style={{
                                  flex: 1, padding: "7px",
                                  background: optForm.type === "add" ? "rgba(34,197,94,0.15)" : "#1c1c28",
                                  color: optForm.type === "add" ? "#22c55e" : "#64748b",
                                  border: `1px solid ${optForm.type === "add" ? "rgba(34,197,94,0.3)" : "#252535"}`,
                                  borderRadius: "8px", cursor: "pointer", fontSize: "12px",
                                  fontWeight: optForm.type === "add" ? "700" : "400",
                                }}
                              >➕ مضاعفة (إضافة)</button>
                            </div>

                            <input
                              value={optForm.name}
                              onChange={e => setOptForms(p => ({ ...p, [group.id]: { ...p[group.id], name: e.target.value } }))}
                              placeholder="اسم الخيار (تلقائي — يمكن تعديله)"
                              style={{ ...inputStyle, width: "100%", marginBottom: "6px" }}
                            />

                            <input
                              type="number" step="100"
                              value={optForm.price_delta}
                              onChange={e => setOptForms(p => ({ ...p, [group.id]: { ...p[group.id], price_delta: e.target.value } }))}
                              placeholder="فرق السعر (0)"
                              title="فرق السعر بالدينار"
                              style={{ ...inputStyle, width: "100%", marginBottom: "8px" }}
                            />
                          </>)}

                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => createOption(group.id)}
                              disabled={addingOpt[group.id] || !optForm.name.trim() || !optForm.ingredient_inv_id}
                              style={{
                                flex: 2, padding: "8px",
                                background: (optForm.name.trim() && optForm.ingredient_inv_id) ? "rgba(34,197,94,0.15)" : "#252535",
                                color: (optForm.name.trim() && optForm.ingredient_inv_id) ? "#22c55e" : "#334155",
                                border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px",
                                cursor: (optForm.name.trim() && optForm.ingredient_inv_id) ? "pointer" : "not-allowed",
                                fontSize: "12px", fontWeight: "700",
                              }}
                            >{addingOpt[group.id] ? "⏳" : "✅ حفظ الخيار"}</button>
                            <button
                              onClick={() => setOptForms(p => { const n = { ...p }; delete n[group.id]; return n; })}
                              style={{ flex: 1, padding: "8px", background: "transparent", color: "#64748b", border: "1px solid #252535", borderRadius: "8px", cursor: "pointer", fontSize: "12px" }}
                            >إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => initOptForm(group.id)}
                          style={{ marginTop: "8px", width: "100%", padding: "8px", background: "rgba(245,158,11,0.06)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "8px", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
                        >+ إضافة خيار</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>)}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #252535", flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: "100%", padding: "12px", background: "#1c1c28", color: "#94a3b8", border: "1px solid #252535", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            ✕ إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Variants Modal ─── */
function VariantsModal({ menuItem, onClose, onChanged, onOpenRecipe, onOpenModifiers }: {
  menuItem: Item;
  onClose: () => void;
  onChanged: () => void;
  onOpenRecipe: (item: Item) => void;
  onOpenModifiers: (item: Item) => void;
}) {
  const [variants, setVariants] = useState<Item[]>(menuItem.variants ?? []);
  const [newName,  setNewName]  = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [adding,   setAdding]   = useState(false);
  const [editId,   setEditId]   = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", price: "" });
  const [saving,   setSaving]   = useState(false);

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", background: "#0a0a0f", border: "1px solid #252535",
    borderRadius: "8px", color: "#f1f5f9", fontSize: "12px", outline: "none",
    boxSizing: "border-box",
  };

  const addVariant = async () => {
    if (!newName.trim() || !newPrice) return;
    setAdding(true);
    try {
      const r = await fetch(`${API}/menu/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), price: parseFloat(newPrice), category: menuItem.category, parent_id: menuItem.id }),
      });
      const d = await r.json();
      setVariants(p => [...p, { id: d.id, name: newName.trim(), price: parseFloat(newPrice), category: menuItem.category, available: true }]);
      setNewName(""); setNewPrice("");
      onChanged();
    } finally { setAdding(false); }
  };

  const saveEdit = async () => {
    if (!editId || !editForm.name.trim() || !editForm.price) return;
    setSaving(true);
    try {
      await fetch(`${API}/menu/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name.trim(), price: parseFloat(editForm.price), category: menuItem.category }),
      });
      setVariants(p => p.map(v => v.id === editId ? { ...v, name: editForm.name.trim(), price: parseFloat(editForm.price) } : v));
      setEditId(null);
      onChanged();
    } finally { setSaving(false); }
  };

  const deleteVariant = async (id: number) => {
    await fetch(`${API}/menu/${id}`, { method: "DELETE" });
    setVariants(p => p.filter(v => v.id !== id));
    onChanged();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1900, padding: "16px" }}>
      <div style={{ background: "#111118", border: "1px solid #252535", borderRadius: "20px", width: "100%", maxWidth: "480px", maxHeight: "85vh", direction: "rtl", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #252535", background: "rgba(245,158,11,0.04)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: "800", fontSize: "16px" }}>🧬 أنواع: {menuItem.name}</div>
            <div style={{ color: "#64748b", fontSize: "12px", marginTop: "3px" }}>كل نوع له سعره ووصفته الخاصة بالمخزون</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "22px" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "18px 22px" }}>

          {/* Add variant */}
          <div style={{ marginBottom: "18px", background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", padding: "14px" }}>
            <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "700", marginBottom: "10px" }}>+ إضافة نوع جديد</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="اسم النوع (مثال: مارغريتا)"
                style={{ ...inputStyle, flex: 2 }}
              />
              <input
                type="number" step="250" min="0"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                placeholder="السعر"
                style={{ ...inputStyle, width: "90px" }}
              />
              <button
                onClick={addVariant}
                disabled={adding || !newName.trim() || !newPrice}
                style={{ padding: "8px 14px", background: (newName.trim() && newPrice) ? "rgba(34,197,94,0.15)" : "#252535", color: (newName.trim() && newPrice) ? "#22c55e" : "#334155", border: `1px solid ${(newName.trim() && newPrice) ? "rgba(34,197,94,0.3)" : "transparent"}`, borderRadius: "8px", cursor: (newName.trim() && newPrice) ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: "700", flexShrink: 0 }}
              >{adding ? "⏳" : "أضف"}</button>
            </div>
          </div>

          {/* Variants list */}
          {variants.length === 0 ? (
            <div style={{ textAlign: "center", color: "#334155", padding: "24px 0", fontSize: "13px" }}>
              لا توجد أنواع بعد — الصنف يُباع كما هو
            </div>
          ) : (
            <div style={{ background: "#1c1c28", border: "1px solid #252535", borderRadius: "12px", overflow: "hidden" }}>
              {variants.map((v, i) => (
                <div key={v.id} style={{ padding: "12px 14px", borderBottom: i < variants.length - 1 ? "1px solid #252535" : "none" }}>
                  {editId === v.id ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        style={{ ...inputStyle, flex: 2 }}
                        autoFocus
                      />
                      <input
                        type="number" step="250"
                        value={editForm.price}
                        onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                        style={{ ...inputStyle, width: "80px" }}
                      />
                      <button onClick={saveEdit} disabled={saving} style={{ padding: "5px 10px", background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "7px", cursor: "pointer", fontSize: "12px", fontWeight: "700", flexShrink: 0 }}>{saving ? "⏳" : "✅"}</button>
                      <button onClick={() => setEditId(null)} style={{ padding: "5px 8px", background: "transparent", color: "#64748b", border: "1px solid #252535", borderRadius: "7px", cursor: "pointer", fontSize: "12px", flexShrink: 0 }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: "700" }}>{v.name}</div>
                        <div style={{ color: "#f59e0b", fontSize: "13px", fontWeight: "800" }}>
                          {v.price.toLocaleString()} <span style={{ fontSize: "10px", fontWeight: "400", color: "#64748b" }}>د.ع</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => { setEditId(v.id); setEditForm({ name: v.name, price: String(v.price) }); }}
                          style={{ flex: 1, padding: "6px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "8px", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
                        >✏️ تعديل</button>
                        <button onClick={() => onOpenRecipe(v)}
                          style={{ flex: 1, padding: "6px", background: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
                        >🔗 وصفة</button>
                        <button onClick={() => onOpenModifiers(v)}
                          style={{ flex: 1, padding: "6px", background: "rgba(99,102,241,0.08)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "8px", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
                        >🎛️ تعديلات</button>
                        <button onClick={() => deleteVariant(v.id)}
                          style={{ padding: "6px 10px", background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "8px", cursor: "pointer", fontSize: "11px" }}
                        >🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #252535", flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: "100%", padding: "12px", background: "#1c1c28", color: "#94a3b8", border: "1px solid #252535", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            ✕ إغلاق
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
  const [recipeItem, setRecipeItem]       = useState<Item | null>(null);
  const [modifierItem, setModifierItem]   = useState<Item | null>(null);
  const [variantsItem, setVariantsItem]   = useState<Item | null>(null);

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
                onClick={() => setModifierItem(item)}
                style={{ width: "100%", padding: "7px", background: "rgba(99,102,241,0.08)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}
              >🎛️ التعديلات</button>

              <button
                onClick={() => setVariantsItem(item)}
                style={{ width: "100%", padding: "7px", background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "9px", cursor: "pointer", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}
              >🧬 الأنواع{(item.variants?.length ?? 0) > 0 ? ` (${item.variants!.length})` : ""}</button>

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

      {/* Modifier modal */}
      {modifierItem && <ModifierModal menuItem={modifierItem} onClose={() => setModifierItem(null)} />}

      {/* Variants modal */}
      {variantsItem && (
        <VariantsModal
          menuItem={variantsItem}
          onClose={() => setVariantsItem(null)}
          onChanged={fetchMenu}
          onOpenRecipe={setRecipeItem}
          onOpenModifiers={setModifierItem}
        />
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
