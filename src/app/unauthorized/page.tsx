import Link from "next/link";
import { cookies } from "next/headers";
import { getDictionary, type Language } from "@/lib/i18n";
import { ShieldAlert } from "lucide-react";

export default async function UnauthorizedPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const isEn = lang === "en";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F1E8] dark:bg-[#071B3A] p-6 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-1">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h1 className="text-2xl md:text-3xl font-bold text-[#071B3A] dark:text-white">
        {isEn ? "Access Unauthorized" : "غير مصرّح لك بالوصول"}
      </h1>
      <p className="text-xs text-[#071B3A]/60 dark:text-white/60 max-w-sm">
        {isEn
          ? "You do not have permission to access this page with your current account role."
          : "لا تملك صلاحية الوصول إلى هذه الصفحة بحسابك الحالي."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
        <Link
          href="/dashboard/teacher"
          className="px-4 py-2 rounded-xl bg-[#12B8C4] hover:bg-[#0ea2ad] text-white font-semibold text-xs shadow-sm transition-all"
        >
          {isEn ? "Teacher Dashboard" : "لوحة تحكم المعلم"}
        </Link>
        <Link
          href="/dashboard/institution"
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-[#071B3A] dark:text-white font-semibold text-xs transition-all"
        >
          {isEn ? "School / Admin Dashboard" : "لوحة تحكم الإدارة"}
        </Link>
        <Link
          href="/login"
          className="px-4 py-2 rounded-xl bg-transparent hover:underline text-teal-600 dark:text-teal-400 font-semibold text-xs transition-all"
        >
          {isEn ? "Log In as Different User" : "تسجيل الدخول بحساب آخر"}
        </Link>
      </div>
      <Link href="/" className="text-xs text-[#071B3A]/50 dark:text-white/50 hover:underline mt-2">
        {isEn ? "← Return to Home" : "← العودة إلى الصفحة الرئيسية"}
      </Link>
    </div>
  );
}
