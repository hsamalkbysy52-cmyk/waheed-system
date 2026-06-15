"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./globals.css";
import ChatBot from "@/components/ChatBot";
import { useSyncEngine } from "@/src/services/useSyncEngine";

const NAV = [
  { href: "/kanban",    icon: "📋", label: "لوحة الطلبات" },
  { href: "/kitchen",   icon: "🍳", label: "المطبخ"       },
  { href: "/tables",    icon: "🪑", label: "الطاولات"     },
  { href: "/menu",      icon: "🍽️", label: "المنيو"       },
  { href: "/payments",  icon: "💳", label: "المدفوعات"    },
  { href: "/inventory", icon: "📦", label: "المخزون"      },
  { href: "/dashboard", icon: "🤖", label: "المساعد AI"   },
];

const HIDDEN_PATHS = ["/login", "/table"];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  useSyncEngine();

  const hidden = HIDDEN_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));

  useEffect(() => {
    fetch("/api/warmup").catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    setUser(localStorage.getItem("username") || "");
  }, [pathname]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, display: "flex", minHeight: "100vh", background: "#0a0a0f" }}>

        {/* ── Offline banner ── */}
        {!isOnline && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
            background: "#f59e0b", color: "#000",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "8px 16px", fontSize: "13px", fontWeight: "700",
          }}>
            <span>⚠️</span>
            <span>أنت غير متصل — الطلبات ستُحفظ محلياً وتُرفع تلقائياً عند استعادة الاتصال</span>
          </div>
        )}

        {/* ── Sidebar ── */}
        {!hidden && (
          <aside style={{
            width: "220px", flexShrink: 0,
            background: "#111118",
            borderLeft: "1px solid #252535",
            display: "flex", flexDirection: "column",
            position: "fixed", right: 0, top: 0, bottom: 0,
            zIndex: 50,
          }}>
            {/* Logo */}
            <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #252535" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "32px" }}>🍔</span>
                <div>
                  <div style={{ color: "#f59e0b", fontWeight: "800", fontSize: "18px", lineHeight: 1 }}>Waheed</div>
                  <div style={{ color: "#64748b", fontSize: "10px", letterSpacing: "1px", marginTop: "2px" }}>RESTAURANT OS</div>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
              {NAV.map(({ href, icon, label }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <button key={href} onClick={() => router.push(href)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "12px",
                    padding: "11px 14px", marginBottom: "4px", borderRadius: "12px",
                    background: active ? "rgba(245,158,11,0.12)" : "transparent",
                    color: active ? "#f59e0b" : "#64748b",
                    border: `1px solid ${active ? "rgba(245,158,11,0.25)" : "transparent"}`,
                    cursor: "pointer", fontSize: "14px", fontWeight: active ? "700" : "400",
                    textAlign: "right",
                  }}>
                    <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
                    <span>{label}</span>
                    {active && <span style={{ marginRight: "auto", width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </nav>

            {/* User + Logout */}
            <div style={{ padding: "14px 10px", borderTop: "1px solid #252535" }}>
              {user && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", marginBottom: "8px" }}>
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>👤</span>
                  <span style={{ color: "#94a3b8", fontSize: "13px" }}>{user}</span>
                </div>
              )}
              <button onClick={() => { localStorage.clear(); router.push("/login"); }} style={{
                width: "100%", padding: "10px 14px", borderRadius: "12px",
                background: "rgba(239,68,68,0.1)", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.25)",
                cursor: "pointer", fontSize: "13px", fontWeight: "600",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span>🚪</span><span>تسجيل الخروج</span>
              </button>
            </div>
          </aside>
        )}

        {/* ── Main content ── */}
        <main style={{
          flex: 1,
          marginLeft: 0,
          marginRight: hidden ? 0 : "220px",
          minHeight: "100vh",
          direction: "rtl",
          overflow: "hidden",
        }}>
          {children}
        </main>

        {/* ── Floating Chatbot ── */}
        {!hidden && <ChatBot />}
      </body>
    </html>
  );
}
