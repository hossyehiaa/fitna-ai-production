"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOutAction } from "@/app/(auth)/login/actions";
import { type Language } from "@/lib/i18n";

export type SessionItem = {
  id: string;
  started_at: string;
  dateStr: string;
  timeStr: string;
  topicTitle: string;
  topicSubtitle: string;
  overall_score: number | null;
  classroom_pattern: string | null;
};

export function HistoryClient({
  sessions,
  totalCount,
  currentPage,
  totalPages,
  lang,
}: {
  sessions: SessionItem[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  lang: Language;
}) {
  const router = useRouter();
  const isRtl = lang === "ar";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [patternFilter, setPatternFilter] = useState<string>("all");

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }

  function handleCompare() {
    if (selectedIds.length === 2) {
      router.push(`/history/compare?sessionA=${selectedIds[0]}&sessionB=${selectedIds[1]}`);
    }
  }

  // Filter sessions client-side by search query & pattern
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      s.topicTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.dateStr.includes(searchQuery) ||
      s.timeStr.includes(searchQuery);

    const matchesPattern =
      patternFilter === "all" ||
      (patternFilter === "balanced" && s.classroom_pattern === "balanced") ||
      (patternFilter === "disengaged" && (s.classroom_pattern === "disengaged" || !s.classroom_pattern)) ||
      (patternFilter === "disruptive" && s.classroom_pattern === "disruptive");

    return matchesSearch && matchesPattern;
  });

  return (
    <div
      className="bg-[#F6F0E4] dark:bg-[#05142B] text-[#071B3A] dark:text-white font-readex antialiased min-h-screen flex flex-col selection:bg-[#12B8C4]/20 selection:text-[#071B3A] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Sticky Nile Top Navigation Bar (Identical to Growth & Dashboard) */}
      <nav className="bg-[#071B3A]/95 backdrop-blur-md text-[#F6F0E4] border-b border-[#F6F0E4]/10 sticky top-0 z-30 shadow-md transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[#12B8C4]/40 after:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3.5 py-2 group">
            <Logo variant="light" height={38} className="transition-transform duration-200 group-hover:scale-105" />
            <div className="h-4 w-px bg-white/20 mx-1 hidden md:block" />
            <div className="hidden md:flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] animate-pulse" />
              <span className="text-xs text-[#12B8C4] font-medium tracking-wide">
                {isRtl ? "نظام محاكاة الفصول الذكي" : "Classroom Simulation System"}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5 text-xs">
            <LanguageSwitcher className="hover:scale-105 active:scale-95 transition-transform duration-150" />
            <div className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <ThemeToggle />
            </div>

            {/* Return to Dashboard Button */}
            <Link
              href="/dashboard/teacher"
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-[#F6F0E4] hover:text-white text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              title={isRtl ? "العودة إلى لوحة التحكم" : "Return to Dashboard"}
            >
              <svg
                className="w-3.5 h-3.5 text-[#12B8C4] shrink-0 transition-transform duration-200 rtl:group-hover:translate-x-0.5 ltr:group-hover:-translate-x-0.5 rtl:rotate-0 ltr:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>{isRtl ? "العودة للوحة التحكم" : "Return to Dashboard"}</span>
            </Link>

            <div className="h-3.5 w-[1px] bg-white/20 mx-1 hidden sm:block" />

            <form action={signOutAction} className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <button
                type="submit"
                className="text-[#D96B58] hover:text-[#D96B58]/80 font-medium px-2 py-1 transition cursor-pointer"
              >
                {isRtl ? "تسجيل الخروج" : "Logout"}
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 w-full flex-grow space-y-8">
        {/* Header & Comparison Top Bar */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-[#071B3A]/10 dark:border-white/10">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-[#071B3A] dark:text-white tracking-tight">
              {isRtl ? "سجل المحاكاة" : "Simulation History"}
            </h1>
            <p className="text-xs sm:text-sm text-[#071B3A]/60 dark:text-white/60">
              {isRtl
                ? "حدد جلستين لتفعيل المقارنة التحليلية المباشرة جنباً إلى جنب"
                : "Select two sessions for side-by-side comparative analysis"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white dark:bg-white/5 border border-[#071B3A]/10 dark:border-white/10 text-xs font-semibold shadow-sm text-[#071B3A] dark:text-white">
              <span className="w-2 h-2 rounded-full bg-[#12B8C4] animate-pulse" />
              <span>{isRtl ? "المحدد للمقارنة:" : "Selected:"}</span>
              <span className="font-bold text-[#071B3A] dark:text-[#FFB52E] font-mono text-sm">
                {selectedIds.length} / 2
              </span>
            </div>

            <button
              type="button"
              onClick={handleCompare}
              disabled={selectedIds.length !== 2}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-sm transition border transform active:scale-95 cursor-pointer ${
                selectedIds.length === 2
                  ? "bg-[#FFB52E] hover:bg-[#FFB52E]/90 text-[#071B3A] border-amber-400 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                  : "bg-gray-200 dark:bg-white/10 text-gray-400 dark:text-white/30 border-transparent cursor-not-allowed opacity-60"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M7 12h10m-7 6h4" />
              </svg>
              <span>{isRtl ? "مقارنة الجلستين المحددة" : "Compare Selected Sessions"}</span>
            </button>
          </div>
        </section>

        {/* Table & Filter Container */}
        <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 shadow-sm overflow-hidden">
          {/* Toolbar: Search and Filter Pills */}
          <div className="p-5 sm:p-6 border-b border-[#071B3A]/5 dark:border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? "بحث باسم الموضوع أو التاريخ..." : "Search by topic or date..."}
                className="w-full bg-[#F6F0E4]/50 dark:bg-white/5 border border-[#071B3A]/10 dark:border-white/10 rounded-2xl px-4 py-2.5 pr-10 rtl:pr-10 ltr:pl-10 text-xs font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 transition"
              />
              <svg
                className="w-4 h-4 text-[#071B3A]/40 dark:text-white/40 absolute right-3.5 rtl:right-3.5 ltr:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-[#071B3A]/60 dark:text-white/60">
              <button
                type="button"
                onClick={() => setPatternFilter("all")}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                  patternFilter === "all"
                    ? "bg-[#071B3A] dark:bg-white/20 text-white shadow-sm font-bold"
                    : "hover:bg-[#F6F0E4] dark:hover:bg-white/10"
                }`}
              >
                {isRtl ? `الكل (${sessions.length})` : `All (${sessions.length})`}
              </button>
              <button
                type="button"
                onClick={() => setPatternFilter("balanced")}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                  patternFilter === "balanced"
                    ? "bg-[#071B3A] dark:bg-white/20 text-white shadow-sm font-bold"
                    : "hover:bg-[#F6F0E4] dark:hover:bg-white/10"
                }`}
              >
                {isRtl ? "متوازن" : "Balanced"}
              </button>
              <button
                type="button"
                onClick={() => setPatternFilter("disengaged")}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                  patternFilter === "disengaged"
                    ? "bg-[#071B3A] dark:bg-white/20 text-white shadow-sm font-bold"
                    : "hover:bg-[#F6F0E4] dark:hover:bg-white/10"
                }`}
              >
                {isRtl ? "خامل" : "Disengaged"}
              </button>
              <button
                type="button"
                onClick={() => setPatternFilter("disruptive")}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                  patternFilter === "disruptive"
                    ? "bg-[#071B3A] dark:bg-white/20 text-white shadow-sm font-bold"
                    : "hover:bg-[#F6F0E4] dark:hover:bg-white/10"
                }`}
              >
                {isRtl ? "مشتت" : "Disruptive"}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right rtl:text-right ltr:text-left border-collapse">
              <thead>
                <tr className="bg-[#F6F0E4]/40 dark:bg-white/[0.03] border-b border-[#071B3A]/10 dark:border-white/10 text-xs font-bold text-[#071B3A]/60 dark:text-white/60">
                  <th className="py-4 px-6 w-16 text-center">
                    <span className="sr-only">تحديد</span>
                    <svg className="w-4 h-4 mx-auto text-[#FFB52E]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l9-4 9 4m-9-4v20m-9-4l9 4 9-4M6 14l6 3 6-3" />
                    </svg>
                  </th>
                  <th className="py-4 px-6">{isRtl ? "التاريخ والوقت" : "Date & Time"}</th>
                  <th className="py-4 px-6">{isRtl ? "موضوع المحاكاة" : "Simulation Topic"}</th>
                  <th className="py-4 px-6 text-center">{isRtl ? "الدرجة الإجمالية" : "Overall Score"}</th>
                  <th className="py-4 px-6">{isRtl ? "نمط الفصل وتفاعله" : "Classroom Pattern"}</th>
                  <th className="py-4 px-6 text-left rtl:text-left ltr:text-right">{isRtl ? "الإجراء" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#071B3A]/5 dark:divide-white/10 text-sm">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-[#071B3A]/50 dark:text-white/50">
                      {isRtl ? "لا توجد جلسات تطابق البحث أو الفلتر المحدد." : "No sessions match your search or filter."}
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s) => {
                    const isSelected = selectedIds.includes(s.id);
                    const isDisengaged = s.classroom_pattern === "disengaged" || !s.classroom_pattern;
                    const isDisruptive = s.classroom_pattern === "disruptive";
                    const isBalanced = s.classroom_pattern === "balanced";
                    const score = s.overall_score ?? 0;
                    const isLowScore = score < 50;

                    return (
                      <tr
                        key={s.id}
                        className={`transition ${
                          isSelected
                            ? "bg-[#12B8C4]/[0.07] dark:bg-[#12B8C4]/15"
                            : "hover:bg-[#F6F0E4]/30 dark:hover:bg-white/[0.02]"
                        }`}
                      >
                        <td className="py-5 px-6 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(s.id)}
                            className="w-4 h-4 rounded-lg text-[#12B8C4] accent-[#12B8C4] border-[#071B3A]/20 focus:ring-[#12B8C4] cursor-pointer"
                          />
                        </td>
                        <td className="py-5 px-6 font-mono text-xs font-semibold text-[#071B3A]/70 dark:text-white/70 whitespace-nowrap">
                          {s.dateStr}
                          <span className="block text-[10px] text-[#071B3A]/40 dark:text-white/40">
                            {s.timeStr}
                          </span>
                        </td>
                        <td className="py-5 px-6 font-bold text-[#071B3A] dark:text-white">
                          {s.topicTitle}
                          <span className="block text-xs font-normal text-[#071B3A]/50 dark:text-white/50">
                            {s.topicSubtitle}
                          </span>
                        </td>
                        <td className="py-5 px-6 text-center">
                          <span
                            className={`inline-block font-black text-base px-3 py-1 rounded-xl ${
                              isLowScore
                                ? "text-[#D96B58] bg-[#D96B58]/10 dark:bg-[#D96B58]/20"
                                : "text-[#071B3A] dark:text-white bg-[#F6F0E4] dark:bg-white/10 border border-[#071B3A]/5 dark:border-white/10"
                            }`}
                          >
                            {s.overall_score !== null ? `${score}%` : "—"}
                          </span>
                        </td>
                        <td className="py-5 px-6">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                              isBalanced
                                ? "bg-[#12B8C4]/15 text-[#12B8C4] border-[#12B8C4]/20"
                                : isDisruptive
                                ? "bg-[#FFB52E]/15 text-amber-700 dark:text-[#FFB52E] border-[#FFB52E]/20"
                                : "bg-[#D96B58]/15 text-[#D96B58] border-[#D96B58]/20"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isBalanced ? "bg-[#12B8C4]" : isDisruptive ? "bg-[#FFB52E]" : "bg-[#D96B58]"
                              }`}
                            />
                            <span>
                              {isBalanced
                                ? (isRtl ? "متوازن" : "Balanced")
                                : isDisruptive
                                ? (isRtl ? "مشتت" : "Disruptive")
                                : (isRtl ? "خامل" : "Disengaged")}
                            </span>
                          </span>
                        </td>
                        <td className="py-5 px-6 text-left rtl:text-left ltr:text-right whitespace-nowrap">
                          <Link
                            href={`/report/${s.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#12B8C4] hover:text-[#12B8C4]/80 px-3 py-1.5 rounded-xl hover:bg-[#12B8C4]/10 transition"
                          >
                            <span>{isRtl ? "عرض التقرير" : "View Report"}</span>
                            <span>↗</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          <div className="p-5 sm:p-6 border-t border-[#071B3A]/5 dark:border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-semibold text-[#071B3A]/50 dark:text-white/50">
            <span>
              {isRtl
                ? `عرض ${filteredSessions.length} من إجمالي ${totalCount} جلسات مسجلة`
                : `Showing ${filteredSessions.length} of ${totalCount} recorded sessions`}
            </span>

            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Link
                  href={`/history?page=${Math.max(1, currentPage - 1)}`}
                  className={`px-3.5 py-1.5 rounded-xl border border-[#071B3A]/10 dark:border-white/10 transition ${
                    currentPage <= 1
                      ? "opacity-40 pointer-events-none"
                      : "hover:bg-[#F6F0E4] dark:hover:bg-white/10 text-[#071B3A] dark:text-white"
                  }`}
                >
                  {isRtl ? "السابق" : "Prev"}
                </Link>
                <span className="px-3 py-1 rounded-xl bg-[#071B3A] text-white">
                  {currentPage}
                </span>
                <Link
                  href={`/history?page=${Math.min(totalPages, currentPage + 1)}`}
                  className={`px-3.5 py-1.5 rounded-xl border border-[#071B3A]/10 dark:border-white/10 transition ${
                    currentPage >= totalPages
                      ? "opacity-40 pointer-events-none"
                      : "hover:bg-[#F6F0E4] dark:hover:bg-white/10 text-[#071B3A] dark:text-white"
                  }`}
                >
                  {isRtl ? "التالي" : "Next"}
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-1.5 rounded-xl border border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/30 dark:text-white/30 cursor-not-allowed">
                  {isRtl ? "السابق" : "Prev"}
                </span>
                <span className="px-3 py-1 rounded-xl bg-[#071B3A] text-white">1</span>
                <span className="px-3.5 py-1.5 rounded-xl border border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/30 dark:text-white/30 cursor-not-allowed">
                  {isRtl ? "التالي" : "Next"}
                </span>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Clean Corporate Footer (Identical to Growth & Dashboard) */}
      <footer className="border-t border-[#071B3A]/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-xs text-[#071B3A]/50 dark:text-white/50 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>
            {isRtl
              ? "جميع الحقوق محفوظة © 2026 نظام فطنة للذكاء الاصطناعي التربوي"
              : "All rights reserved © 2026 Fitna AI Pedagogical System"}
          </span>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {isRtl ? "المعايير المعتمدة" : "Standards"}
            </Link>
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {isRtl ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {isRtl ? "المساعدة والدعم" : "Help & Support"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
