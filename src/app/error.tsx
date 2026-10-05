"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, Sparkles, Home, ShieldAlert } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fitna AI Runtime caught error:", error);
  }, [error]);


  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#071b3a] text-[#f6f0e4] font-sans selection:bg-amber-400 selection:text-slate-900" dir="rtl">
      <div className="w-full max-w-lg rounded-3xl border border-amber-400/25 bg-[#0b2548]/90 p-8 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-400/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-inner">
          <ShieldAlert size={34} className="animate-pulse" />
        </div>

        <div className="inline-block px-3.5 py-1 rounded-full text-xs font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 mb-4">
          فِطنة AI • نظام المعالجة الذكي
        </div>

        <h1 className="text-2xl font-black text-white mb-2 tracking-tight">
          حدث خطأ غير متوقع أثناء المعالجة
        </h1>

        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          نعتذر عن هذا الخلل المؤقت. يمكنك إعادة تحميل الصفحة فوراً، أو الدخول مباشرة للوحة المحاكاة بالحساب التجريبي بدون أي خطوات تسجيل.
        </p>

        {error?.message && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-mono text-red-200 text-center break-all">
            {error.message}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="w-full py-3.5 px-5 rounded-xl font-bold bg-[#ffb52e] hover:bg-[#ffa700] text-[#071b3a] transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
          >
            <RotateCcw size={18} />
            <span>إعادة المحاولة الآن</span>
          </button>


          <Link
            href="/"
            className="w-full py-3 px-5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 no-underline"
          >
            <Home size={14} />
            <span>العودة إلى الصفحة الرئيسية</span>
          </Link>
        </div>
      </div>
    </div>
  );
}