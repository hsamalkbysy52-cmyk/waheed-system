"use client";
import { useState } from "react";
import Link from "next/link";

export default function Dashboard() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const askAgent = async () => {
    if (!question || !apiKey) {
      alert("أكمل السؤال والـ OpenAI API Key!");
      return;
    }

    setLoading(true);
    setAnswer("");

    // سيبقى الرابط كما هو لأننا غيرنا الإعدادات في الباك-إند لاستقبال مفتاح OpenAI
    const response = await fetch(
      `https://waheed-system-production.up.railway.app/agent/ask?question=${encodeURIComponent(question)}&api_key=${apiKey}`,
      { method: "POST" }
    );

    const data = await response.json();
    setAnswer(data.answer || data.error);
    setLoading(false);
  };

  const quickQuestions = [
    "كم مبيعاتنا اليوم؟",
    "كم عدد الطلبات؟",
    "شو أغلى صنف في المنيو؟",
    "ما هو ملخص أداء المطعم؟",
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", fontFamily: "Arial", direction: "rtl", padding: "20px" }}>
      
      {/* رأس الصفحة */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <h1 style={{ color: "white", margin: 0 }}>🤖 المساعد الذكي (OpenAI)</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/orders" style={{ padding: "10px 20px", background: "#3498db", color: "white", borderRadius: "8px", textDecoration: "none" }}>
            📋 الطلبات
          </Link>
          <Link href="/" style={{ padding: "10px 20px", background: "#27ae60", color: "white", borderRadius: "8px", textDecoration: "none" }}>
            🏠 الكاشير
          </Link>
        </div>
      </div>

      {/* API Key */}
      <div style={{ background: "#16213e", padding: "15px", borderRadius: "10px", marginBottom: "20px" }}>
        <p style={{ color: "#888", margin: "0 0 8px 0", fontSize: "13px" }}>🔑 OpenAI API Key</p>
        <input
          type="password"
          placeholder="أدخل OpenAI API Key (sk-...)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "none", background: "#0f3460", color: "white", boxSizing: "border-box" }}
        />
      </div>

      {/* أسئلة سريعة */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ color: "#888", marginBottom: "10px" }}>⚡ أسئلة سريعة:</p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => setQuestion(q)}
              style={{ padding: "8px 15px", background: "#16213e", color: "white", border: "1px solid #3498db", borderRadius: "20px", cursor: "pointer", fontSize: "13px" }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* صندوق السؤال */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          placeholder="اسأل عن مبيعاتك..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askAgent()}
          style={{ flex: 1, padding: "15px", borderRadius: "10px", border: "none", background: "#16213e", color: "white", fontSize: "16px" }}
        />
        <button
          onClick={askAgent}
          disabled={loading}
          style={{ padding: "15px 25px", background: loading ? "#555" : "#3498db", color: "white", border: "none", borderRadius: "10px", cursor: loading ? "not-allowed" : "pointer", fontSize: "16px" }}
        >
          {loading ? "⏳" : "إرسال ←"}
        </button>
      </div>

      {/* الجواب */}
      {answer && (
        <div style={{ background: "#16213e", padding: "25px", borderRadius: "12px", borderRight: "4px solid #3498db" }}>
          <p style={{ color: "#3498db", margin: "0 0 10px 0", fontSize: "13px" }}>🤖 الوكيل الذكي (GPT):</p>
          <p style={{ color: "white", margin: 0, fontSize: "18px", lineHeight: "1.8" }}>{answer}</p>
        </div>
      )}

    </div>
  );
}