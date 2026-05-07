"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const hidden = pathname === "/login" || pathname.startsWith("/table");

  useEffect(() => {
    setUsername(localStorage.getItem("username") || "");
  }, [pathname]);

  const nav = [
    { href: "/",          icon: "🏠", label: "الكاشير"  },
    { href: "/tables",    icon: "🪑", label: "الطاولات" },
    { href: "/orders",    icon: "📋", label: "الطلبات"  },
    { href: "/dashboard", icon: "🤖", label: "المساعد"  },
  ];

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "'Segoe UI', Arial, sans-serif", background: "#0a0a1a" }}>

        {!hidden && (
          <nav style={{
            background: "#13132a",
            borderBottom: "1px solid #2a2a4a",
            padding: "0 28px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "30px" }}>🍔</span>
              <div>
                <div style={{ color: "#f39c12", fontWeight: "800", fontSize: "18px", lineHeight: 1 }}>Waheed</div>
                <div style={{ color: "#8892b0", fontSize: "10px", letterSpacing: "1px" }}>RESTAURANT OS</div>
              </div>
            </div>

            {/* Nav links */}
            <div style={{ display: "flex", gap: "4px" }}>
              {nav.map(({ href, icon, label }) => {
                const active = pathname === href;
                return (
                  <button key={href} onClick={() => router.push(href)} style={{
                    padding: "9px 20px",
                    background: active ? "rgba(243,156,18,0.12)" : "transparent",
                    color: active ? "#f39c12" : "#8892b0",
                    border: `1px solid ${active ? "rgba(243,156,18,0.35)" : "transparent"}`,
                    borderRadius: "12px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: active ? "700" : "400",
                    display: "flex", alignItems: "center", gap: "6px",
                  }}>
                    <span>{icon}</span><span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* User + logout */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {username && (
                <div style={{ color: "#8892b0", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "30px", height: "30px", borderRadius: "50%", background: "rgba(243,156,18,0.15)", border: "1px solid rgba(243,156,18,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>👤</span>
                  {username}
                </div>
              )}
              <button onClick={() => { localStorage.clear(); router.push("/login"); }} style={{
                padding: "9px 18px",
                background: "rgba(231,76,60,0.12)",
                color: "#e74c3c",
                border: "1px solid rgba(231,76,60,0.3)",
                borderRadius: "12px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
              }}>
                خروج 🚪
              </button>
            </div>
          </nav>
        )}

        <div style={{ minHeight: hidden ? "100vh" : "calc(100vh - 64px)" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
