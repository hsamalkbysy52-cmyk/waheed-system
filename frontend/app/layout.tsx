"use client";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login" || pathname.startsWith("/table");

  const navItems = [
    { href: "/", label: "🏠 الكاشير" },
    { href: "/tables", label: "🪑 الطاولات" },
    { href: "/orders", label: "📋 الطلبات" },
    { href: "/dashboard", label: "🤖 المساعد" },
  ];
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Arial" }}>
        
        {/* شريط التنقل - يظهر في كل الصفحات ما عدا Login */}
        {!isLoginPage && (
          <div style={{
            background: "#1a1a2e",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "60px",
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
          }}>
            {/* اللوغو */}
            <div style={{ color: "white", fontWeight: "bold", fontSize: "18px" }}>
              🍔 Waheed System
            </div>

            {/* روابط التنقل */}
            <div style={{ display: "flex", gap: "5px" }}>
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  style={{
                    padding: "8px 16px",
                    background: pathname === item.href ? "#3498db" : "transparent",
                    color: "white",
                    border: pathname === item.href ? "none" : "1px solid #444",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "all 0.2s",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* زر تسجيل الخروج */}
            <button
              onClick={() => {
                localStorage.clear();
                router.push("/login");
              }}
              style={{
                padding: "8px 16px",
                background: "#e74c3c",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              خروج 🚪
            </button>
          </div>
        )}

        {/* محتوى الصفحة */}
        <div style={{ height: isLoginPage ? "100vh" : "calc(100vh - 60px)" }}>
          {children}
        </div>

      </body>
    </html>
  );
}