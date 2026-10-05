import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#071b3a] text-[#f6f0e4]" dir="rtl">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b2548] p-8 text-center shadow-2xl">
        <div className="text-5xl font-black text-amber-400 mb-3">404</div>
        <h1 className="text-xl font-bold text-white mb-2">الصفحة غير موجودة</h1>
        <p className="text-sm text-slate-400 mb-6">الصفحة التي تبحث عنها قد تكون انتقلت أو حُذفت.</p>
        <Link
          href="/"
          className="inline-flex py-3 px-6 rounded-xl font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition-all no-underline"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}