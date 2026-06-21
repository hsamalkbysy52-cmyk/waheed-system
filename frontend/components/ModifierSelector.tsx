"use client";
import { useState } from "react";

export type SelectedMod = {
  option_id: number;
  name: string;
  price_delta: number;
  inventory_item_id: number | null;
  quantity_delta: number;
};

export type ModOption = {
  id: number;
  name: string;
  price_delta: number;
  inventory_item_id: number | null;
  quantity_delta: number;
};

export type ModGroup = {
  id: number;
  name: string;
  max_selections: number;
  options: ModOption[];
};

type Props = {
  item: { name: string; price: number };
  groups: ModGroup[];
  onConfirm: (mods: SelectedMod[]) => void;
  onClose: () => void;
};

export default function ModifierSelector({ item, groups, onConfirm, onClose }: Props) {
  // Map: groupId -> list of selected option ids
  const [selected, setSelected] = useState<Record<number, number[]>>({});

  const toggle = (group: ModGroup, option: ModOption) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(option.id);
      if (isSelected) {
        return { ...prev, [group.id]: current.filter((id) => id !== option.id) };
      }
      if (group.max_selections === 1) {
        // Radio behavior — replace selection
        return { ...prev, [group.id]: [option.id] };
      }
      // Checkbox — add if under limit
      if (current.length >= group.max_selections) {
        return prev; // already at max
      }
      return { ...prev, [group.id]: [...current, option.id] };
    });
  };

  // Flatten all selected options
  const selectedMods: SelectedMod[] = groups.flatMap((g) => {
    const ids = selected[g.id] ?? [];
    return g.options
      .filter((o) => ids.includes(o.id))
      .map((o) => ({
        option_id: o.id,
        name: o.name,
        price_delta: o.price_delta,
        inventory_item_id: o.inventory_item_id,
        quantity_delta: o.quantity_delta,
      }));
  });

  const totalDelta = selectedMods.reduce((s, m) => s + m.price_delta, 0);
  const finalPrice = item.price + totalDelta;

  const formatDelta = (delta: number) => {
    if (delta === 0) return "";
    const sign = delta > 0 ? "+" : "";
    return ` (${sign}${delta.toLocaleString()} د.ع)`;
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", border: "1px solid #252535", borderRadius: "22px",
        width: "100%", maxWidth: "460px", maxHeight: "88vh",
        display: "flex", flexDirection: "column", direction: "rtl",
        overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.95)",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 22px", borderBottom: "1px solid #252535",
          background: "rgba(245,158,11,0.04)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ color: "var(--text)", fontWeight: "800", fontSize: "16px" }}>
              🎛️ خيارات: {item.name}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "3px" }}>
              السعر الأساسي: {item.price.toLocaleString()} د.ع
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--muted)",
              cursor: "pointer", fontSize: "22px",
            }}
          >✕</button>
        </div>

        {/* Groups */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 22px" }}>
          {groups.length === 0 && (
            <div style={{ color: "var(--muted)", textAlign: "center", padding: "32px 0", fontSize: "13px" }}>
              لا توجد تعديلات متاحة
            </div>
          )}
          {groups.map((group) => {
            const currentIds = selected[group.id] ?? [];
            const isRadio = group.max_selections === 1;
            return (
              <div key={group.id} style={{ marginBottom: "20px" }}>
                <div style={{
                  color: "var(--text2)", fontSize: "12px", fontWeight: "700",
                  marginBottom: "10px", letterSpacing: "0.5px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span>{group.name}</span>
                  <span style={{ color: "var(--muted)", fontWeight: "400", fontSize: "11px" }}>
                    {isRadio ? "اختر واحداً" : `اختر حتى ${group.max_selections}`}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {group.options.map((option) => {
                    const isOn = currentIds.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        onClick={() => toggle(group, option)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 14px", borderRadius: "12px", cursor: "pointer",
                          background: isOn ? "rgba(245,158,11,0.12)" : "var(--raised)",
                          border: `1.5px solid ${isOn ? "rgba(245,158,11,0.55)" : "var(--border)"}`,
                          transition: "all 0.12s",
                          textAlign: "right",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{
                            width: "20px", height: "20px", borderRadius: isRadio ? "50%" : "6px",
                            border: `2px solid ${isOn ? "var(--gold)" : "var(--subtle)"}`,
                            background: isOn ? "var(--gold)" : "transparent",
                            flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {isOn && (
                              <div style={{
                                width: isRadio ? "8px" : "10px", height: isRadio ? "8px" : "10px",
                                borderRadius: isRadio ? "50%" : "3px",
                                background: "#000",
                              }} />
                            )}
                          </div>
                          <span style={{ color: isOn ? "var(--text)" : "var(--text2)", fontSize: "13px", fontWeight: isOn ? "600" : "400" }}>
                            {option.name}
                          </span>
                        </div>
                        {option.price_delta !== 0 && (
                          <span style={{
                            color: option.price_delta > 0 ? "var(--gold)" : "var(--green)",
                            fontSize: "12px", fontWeight: "700", flexShrink: 0,
                          }}>
                            {formatDelta(option.price_delta)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px 18px", borderTop: "1px solid #252535", flexShrink: 0 }}>
          {totalDelta !== 0 && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", borderRadius: "10px",
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)",
              marginBottom: "12px",
            }}>
              <span style={{ color: "var(--text2)", fontSize: "13px" }}>إجمالي التعديلات</span>
              <span style={{
                color: totalDelta > 0 ? "var(--gold)" : "var(--green)",
                fontSize: "14px", fontWeight: "700",
              }}>
                {totalDelta > 0 ? "+" : ""}{totalDelta.toLocaleString()} د.ع
              </span>
            </div>
          )}
          <button
            onClick={() => onConfirm(selectedMods)}
            style={{
              width: "100%", padding: "14px",
              background: "linear-gradient(135deg,#f59e0b,#d97706)",
              color: "#000", border: "none", borderRadius: "14px",
              fontSize: "15px", fontWeight: "900", cursor: "pointer",
              boxShadow: "0 6px 20px rgba(245,158,11,0.4)",
            }}
          >
            ✅ إضافة للسلة — {finalPrice.toLocaleString()} د.ع
          </button>
        </div>
      </div>
    </div>
  );
}
