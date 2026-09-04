"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API } from "@/lib/apiFetch";

export default function RegisterPage() {
  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone]                   = useState("");
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [error, setError]                   = useState("");
  const [loading, setLoading]               = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!restaurantName || !phone || !email || !password) { setError("أكمل كل الحقول!"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_name: restaurantName, phone, email, password }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      localStorage.setItem("token", data.token);
      localStorage.setItem("refresh", data.refresh);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);
      router.push("/orders");
    } catch {
      setError("تعذر الاتصال بالسيرفر");
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px",
    background: "var(--bg)", border: "1px solid #2a2a4a",
    borderRadius: "12px", color: "white", fontSize: "15px",
    direction: "rtl", boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a1a 0%, #13132a 60%, #0f3460 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', Arial, sans-serif", direction: "rtl",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "rgba(243,156,18,0.04)", top: -150, right: -150, pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 350, height: 350, borderRadius: "50%", background: "rgba(52,152,219,0.04)", bottom: -80, left: -80, pointerEvents: "none" }} />

      <div style={{
        background: "rgba(19,19,42,0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(243,156,18,0.15)",
        borderRadius: "24px",
        padding: "48px 44px",
        width: "100%", maxWidth: "420px",
        boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
        position: "relative",
      }}>

        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "68px", marginBottom: "10px", filter: "drop-shadow(0 4px 12px rgba(243,156,18,0.4))" }}>🍔</div>
          <div style={{ color: "var(--gold)", fontSize: "30px", fontWeight: "800", letterSpacing: "2px" }}>WAHEED</div>
          <div style={{ color: "var(--text2)", fontSize: "13px", marginTop: "6px", letterSpacing: "1px" }}>تسجيل مطعم جديد</div>
          <div style={{ width: "50px", height: "3px", background: "linear-gradient(90deg, #f39c12, #e67e22)", borderRadius: "2px", margin: "14px auto 0" }} />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "7px", fontWeight: "600", letterSpacing: "0.5px" }}>اسم المطعم</label>
          <input placeholder="مطعم الوحيد" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "7px", fontWeight: "600", letterSpacing: "0.5px" }}>رقم الهاتف</label>
          <input placeholder="07701234567" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "7px", fontWeight: "600", letterSpacing: "0.5px" }}>البريد الإلكتروني</label>
          <input placeholder="owner@restaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: "28px" }}>
          <label style={{ color: "var(--text2)", fontSize: "12px", display: "block", marginBottom: "7px", fontWeight: "600", letterSpacing: "0.5px" }}>كلمة السر</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{
            background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)",
            borderRadius: "12px", padding: "12px 16px", marginBottom: "20px",
            color: "var(--red)", fontSize: "14px", textAlign: "center",
          }}>❌ {error}</div>
        )}

        <button onClick={handleRegister} disabled={loading} style={{
          width: "100%", padding: "16px",
          background: loading ? "#333" : "linear-gradient(135deg, #f39c12, #e67e22)",
          color: "white", border: "none", borderRadius: "14px",
          fontSize: "16px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer",
          boxShadow: loading ? "none" : "0 6px 20px rgba(243,156,18,0.4)",
          letterSpacing: "0.5px",
        }}>
          {loading ? "⏳ جاري التسجيل..." : "تسجيل المطعم  ←"}
        </button>

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <a href="/login" style={{ color: "var(--text2)", fontSize: "13px", textDecoration: "none" }}>
            عندك حساب؟ <span style={{ color: "var(--gold)" }}>دخول</span>
          </a>
        </div>
      </div>
    </div>
  );
}
