"use client";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://waheed-system-production.up.railway.app";

const QUICK = [
  "كم مبيعاتنا اليوم؟",
  "كم عدد الطلبات؟",
  "شو أغلى صنف في المنيو؟",
  "ما هو ملخص أداء المطعم؟",
];

export default function Dashboard() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [apiKey, setApiKey]     = useState("");

  const ask = async () => {
    if (!question || !apiKey) { alert("أكمل السؤال والـ API Key!"); return; }
    setLoading(true);
    setAnswer("");
    const res  = await fetch(`${API}/agent/ask?question=${encodeURIComponent(question)}&api_key=${apiKey}`, { method: "POST" });
    const data = await res.json();
    setAnswer(data.answer || data.error || "لا يوجد رد");
    setLoading(false);
  };

  return (
    <div style={{ padding: "28px", direction: "rtl", background: "var(--bg)", minHeight: "100%", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ margin: 0, color: "white", fontSize: "22px", fontWeight: "700" }}>🤖 المساعد الذكي</h1>
        <p style={{ margin: "6px 0 0", color: "var(--text2)", fontSize: "13px" }}>اسأل عن مبيعاتك وأداء المطعم بالذكاء الاصطناعي</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", alignItems: "start" }}>

        {/* Sidebar */}
        <div>
          {/* API Key */}
          <div style={{ background: "var(--surface)", border: "1px solid #2a2a4a", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <p style={{ margin: "0 0 10px", color: "var(--gold)", fontSize: "13px", fontWeight: "700" }}>🔑 OpenAI API Key</p>
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              style={{
                width: "100%", padding: "11px 14px", background: "var(--bg)",
                border: "1px solid #2a2a4a", borderRadius: "10px", color: "white",
                fontSize: "13px", boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "8px 0 0", color: "var(--text2)", fontSize: "11px" }}>المفتاح لا يُحفظ في أي مكان</p>
          </div>

          {/* Quick questions */}
          <div style={{ background: "var(--surface)", border: "1px solid #2a2a4a", borderRadius: "16px", padding: "20px" }}>
            <p style={{ margin: "0 0 14px", color: "white", fontSize: "13px", fontWeight: "700" }}>⚡ أسئلة سريعة</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {QUICK.map(q => (
                <button key={q} onClick={() => setQuestion(q)} style={{
                  padding: "11px 14px", background: question === q ? "rgba(243,156,18,0.12)" : "var(--bg)",
                  color: question === q ? "var(--gold)" : "var(--text2)",
                  border: `1px solid ${question === q ? "rgba(243,156,18,0.3)" : "#2a2a4a"}`,
                  borderRadius: "10px", cursor: "pointer", fontSize: "13px",
                  textAlign: "right", fontWeight: question === q ? "600" : "400",
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div>
          {/* Input */}
          <div style={{ background: "var(--surface)", border: "1px solid #2a2a4a", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
            <p style={{ margin: "0 0 12px", color: "white", fontSize: "14px", fontWeight: "700" }}>💬 سؤالك</p>
            <textarea
              placeholder="اسأل عن مبيعاتك، الطلبات، أداء المطعم..."
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              style={{
                width: "100%", padding: "12px 14px", background: "var(--bg)",
                border: "1px solid #2a2a4a", borderRadius: "12px", color: "white",
                fontSize: "14px", resize: "none", boxSizing: "border-box",
                fontFamily: "inherit", direction: "rtl",
              }}
            />
            <button onClick={ask} disabled={loading} style={{
              marginTop: "12px", width: "100%", padding: "13px",
              background: loading ? "#333" : "linear-gradient(135deg, #f39c12, #e67e22)",
              color: "white", border: "none", borderRadius: "12px",
              cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "700",
              boxShadow: loading ? "none" : "0 4px 16px rgba(243,156,18,0.35)",
            }}>
              {loading ? "⏳ جاري التفكير..." : "إرسال ←"}
            </button>
          </div>

          {/* Answer */}
          {answer && (
            <div style={{
              background: "var(--surface)", border: "1px solid rgba(243,156,18,0.2)",
              borderRadius: "16px", padding: "24px",
              borderRight: "4px solid #f39c12",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <span style={{ fontSize: "20px" }}>🤖</span>
                <span style={{ color: "var(--gold)", fontSize: "13px", fontWeight: "700" }}>رد المساعد الذكي</span>
              </div>
              <p style={{ margin: 0, color: "white", fontSize: "16px", lineHeight: "1.9", whiteSpace: "pre-wrap" }}>{answer}</p>
            </div>
          )}

          {!answer && !loading && (
            <div style={{
              background: "var(--surface)", border: "1px dashed #2a2a4a",
              borderRadius: "16px", padding: "48px", textAlign: "center", color: "var(--text2)",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "14px" }}>🤖</div>
              <p style={{ margin: 0, fontSize: "14px" }}>اختر سؤالاً أو اكتب سؤالك الخاص</p>
              <p style={{ margin: "6px 0 0", fontSize: "12px" }}>أدخل OpenAI API Key أولاً</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
