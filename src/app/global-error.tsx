"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, padding: 0, backgroundColor: "#071b3a", color: "#f6f0e4", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ maxWidth: "480px", width: "100%", background: "#0b2548", borderRadius: "24px", padding: "32px", border: "1px solid rgba(255, 181, 46, 0.25)", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ width: "48px", height: "48px", margin: "0 auto 16px", borderRadius: "12px", background: "rgba(255, 181, 46, 0.15)", border: "1px solid rgba(255, 181, 46, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffb52e" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#ffffff", marginBottom: "12px" }}>
              نعتذر، حدث خطأ في النظام
            </h1>
            <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: "1.6", marginBottom: "24px" }}>
              يمكنك إعادة المحاولة أو العودة للصفحة الرئيسية.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                onClick={() => reset()}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#ffb52e", color: "#071b3a", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}
              >
                إعادة المحاولة
              </button>
              <a
                href="/"
                style={{ color: "#64748b", fontSize: "13px", textDecoration: "none", marginTop: "8px" }}
              >
                العودة للصفحة الرئيسية
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}