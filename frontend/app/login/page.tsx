"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "https://waheed-system-production.up.railway.app";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) { setError("أكمل البيانات!"); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`${API}/login?username=${username}&password=${password}`, { method: "POST" });
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      localStorage.setItem("token",    data.token);
      localStorage.setItem("role",     data.role);
      localStorage.setItem("username", data.username);
      router.push(data.role === "admin" ? "/orders" : "/");
    } catch {
      setError("تعذر الاتصال بالسيرفر");
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px",
    background: "#0a0a1a", border: "1px solid #2a2a4a",
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
      {/* Background decoration */}
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

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "68px", marginBottom: "10px", filter: "drop-shadow(0 4px 12px rgba(243,156,18,0.4))" }}>🍔</div>
          <div style={{ color: "#f39c12", fontSize: "30px", fontWeight: "800", letterSpacing: "2px" }}>WAHEED</div>
          <div style={{ color: "#8892b0", fontSize: "13px", marginTop: "6px", letterSpacing: "1px" }}>نظام إدارة المطعم</div>
          <div style={{ width: "50px", height: "3px", background: "linear-gradient(90deg, #f39c12, #e67e22)", borderRadius: "2px", margin: "14px auto 0" }} />
        </div>

        {/* Username */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ color: "#8892b0", fontSize: "12px", display: "block", marginBottom: "7px", fontWeight: "600", letterSpacing: "0.5px" }}>اسم المستخدم</label>
          <input
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: "28px" }}>
          <label style={{ color: "#8892b0", fontSize: "12px", display: "block", marginBottom: "7px", fontWeight: "600", letterSpacing: "0.5px" }}>كلمة السر</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={inputStyle}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(231,76,60,0.1)", border: "1px solid rgba(231,76,60,0.3)",
            borderRadius: "12px", padding: "12px 16px", marginBottom: "20px",
            color: "#e74c3c", fontSize: "14px", textAlign: "center",
          }}>❌ {error}</div>
        )}

        {/* Submit */}
        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", padding: "16px",
          background: loading ? "#333" : "linear-gradient(135deg, #f39c12, #e67e22)",
          color: "white", border: "none", borderRadius: "14px",
          fontSize: "16px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer",
          boxShadow: loading ? "none" : "0 6px 20px rgba(243,156,18,0.4)",
          letterSpacing: "0.5px",
        }}>
          {loading ? "⏳ جاري الدخول..." : "دخول  ←"}
        </button>

        {/* Hint */}
        <div style={{
          marginTop: "28px", padding: "16px",
          background: "rgba(255,255,255,0.03)", borderRadius: "14px",
          border: "1px solid #2a2a4a",
        }}>
          <div style={{ color: "#8892b0", fontSize: "11px", marginBottom: "8px", fontWeight: "600", letterSpacing: "0.5px" }}>بيانات تجريبية</div>
          <div style={{ color: "#a0a8c0", fontSize: "13px", marginBottom: "4px" }}>👤 admin / admin123</div>
          <div style={{ color: "#a0a8c0", fontSize: "13px" }}>👤 cashier / cashier123</div>
        </div>
      </div>
    </div>
  );
}
