"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authFetch, clearSession } from "@/lib/apiFetch";

type RestaurantRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string | null;
};

function statusColor(status: string) {
  return status === "suspended" ? "var(--red)" : "var(--green)";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleDateString("ar-IQ", { year: "numeric", month: "short", day: "numeric" });
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [ready, setReady]           = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // أول حماية بالدور بكل التطبيق — ما فيه بنية جاهزة أصلاً (middleware/HOC)، فحص محلي كافٍ هنا
  useEffect(() => {
    if (localStorage.getItem("role") !== "super_admin") {
      router.push("/login");
      return;
    }
    setReady(true);
  }, [router]);

  const fetchRestaurants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await authFetch("/admin/restaurants");
      if (!r.ok) { setError("تعذر جلب قائمة المطاعم"); return; }
      const d = await r.json();
      setRestaurants(d.restaurants || []);
    } catch {
      setError("تعذر الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready) fetchRestaurants(); }, [ready, fetchRestaurants]);

  const toggleStatus = async (r: RestaurantRow) => {
    const next = r.status === "suspended" ? "active" : "suspended";
    setTogglingId(r.id);
    try {
      const res = await authFetch(`/admin/restaurants/${r.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setRestaurants(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const logout = () => { clearSession(); router.push("/login"); };

  if (!ready) return null;

  return (
    <div style={{ padding: "24px", background: "var(--bg)", minHeight: "100vh", direction: "rtl" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--text)", fontSize: "20px", fontWeight: "700" }}>🏢 لوحة إدارة المطاعم</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "12px" }}>
            {loading ? "جاري التحميل..." : `${restaurants.length} مطعم مسجّل`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={fetchRestaurants} style={{ padding: "10px 20px", background: "rgba(245,158,11,0.1)", color: "var(--gold)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            🔄 تحديث
          </button>
          <button onClick={logout} style={{ padding: "10px 20px", background: "rgba(239,68,68,0.1)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            تسجيل الخروج
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", color: "var(--red)", fontSize: "13px" }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--muted)", paddingTop: "80px", fontSize: "16px" }}>⏳ جاري التحميل...</div>
      ) : restaurants.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "80px" }}>
          <div style={{ fontSize: "48px", marginBottom: "14px" }}>🏢</div>
          <div style={{ color: "var(--text2)", fontSize: "15px" }}>لا يوجد مطاعم مسجّلة بعد</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {restaurants.map(r => {
            const suspended = r.status === "suspended";
            return (
              <div key={r.id} style={{
                background: "var(--surface)",
                border: `1px solid ${suspended ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
                borderRadius: "14px", padding: "16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                  <div>
                    <div style={{ color: "var(--text)", fontWeight: "700", fontSize: "15px" }}>{r.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "3px" }}>#{r.id} • {formatDate(r.created_at)}</div>
                  </div>
                  <span style={{
                    background: suspended ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                    color: statusColor(r.status),
                    borderRadius: "7px", padding: "3px 10px", fontSize: "11px", fontWeight: "700",
                  }}>
                    {suspended ? "موقوف" : "نشط"}
                  </span>
                </div>

                <div style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "4px" }}>📧 {r.email || "—"}</div>
                <div style={{ color: "var(--text2)", fontSize: "12px", marginBottom: "14px" }}>📱 {r.phone || "—"}</div>

                <button
                  onClick={() => toggleStatus(r)}
                  disabled={togglingId === r.id}
                  style={{
                    width: "100%", padding: "9px",
                    background: suspended ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                    color: suspended ? "var(--green)" : "var(--red)",
                    border: `1px solid ${suspended ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.25)"}`,
                    borderRadius: "9px", cursor: togglingId === r.id ? "not-allowed" : "pointer",
                    fontSize: "12px", fontWeight: "700",
                  }}
                >
                  {togglingId === r.id ? "⏳..." : suspended ? "✅ تفعيل" : "⛔ إيقاف"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
