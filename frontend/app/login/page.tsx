"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) {
      setError("أكمل البيانات!");
      return;
    }

    const response = await fetch(
      `http://127.0.0.1:8000/login?username=${username}&password=${password}`,
      { method: "POST" }
    );

    const data = await response.json();

    if (data.error) {
      setError(data.error);
      return;
    }

    // حفظ التوكن والدور
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("username", data.username);

    // توجيه حسب الدور
    if (data.role === "admin") {
      router.push("/orders");
    } else {
      router.push("/");
    }
  };

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#1a1a2e",
      fontFamily: "Arial",
      direction: "rtl",
    }}>
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "16px",
        width: "350px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
      }}>
        {/* اللوغو */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <div style={{ fontSize: "50px" }}>🍔</div>
          <h2 style={{ margin: "10px 0 0 0", color: "#1a1a2e" }}>نظام Waheed</h2>
          <p style={{ color: "#888", margin: "5px 0" }}>تسجيل الدخول</p>
        </div>

        {/* الفورم */}
        <input
          placeholder="اسم المستخدم"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
            borderRadius: "8px",
            border: "1px solid #ddd",
            fontSize: "16px",
            boxSizing: "border-box",
            direction: "rtl",
          }}
        />

        <input
          type="password"
          placeholder="كلمة السر"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
            borderRadius: "8px",
            border: "1px solid #ddd",
            fontSize: "16px",
            boxSizing: "border-box",
            direction: "rtl",
          }}
        />

        {/* رسالة الخطأ */}
        {error && (
          <p style={{ color: "#e74c3c", textAlign: "center", margin: "0 0 15px 0" }}>
            ❌ {error}
          </p>
        )}

        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            padding: "14px",
            background: "#1a1a2e",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          دخول ←
        </button>

        {/* تلميح */}
        <div style={{ marginTop: "20px", padding: "10px", background: "#f8f9fa", borderRadius: "8px", fontSize: "13px", color: "#666" }}>
          <p style={{ margin: "3px 0" }}>👤 admin / admin123</p>
          <p style={{ margin: "3px 0" }}>👤 cashier / cashier123</p>
        </div>
      </div>
    </div>
  );
}