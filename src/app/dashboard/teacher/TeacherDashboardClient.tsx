"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOutAction } from "@/app/(auth)/login/actions";
import { getDictionary, type Language } from "@/lib/i18n";
import { SettingsModal } from "./SettingsModal";
import { Sparkles } from "lucide-react";

type Profile = {
  full_name: string | null;
  email: string;
  teaching_experience: string | null;
  teaching_level: string | null;
  subject: string | null;
  preferred_theme: "light" | "dark";
  preferred_language: "ar" | "en";
  role: string;
};

type SessionItem = {
  id: string;
  overall_score: number | null;
  teacher_talk_ratio: number | null;
  socratic_question_rate: number | null;
  inclusivity_index: number | null;
  classroom_pattern: string | null;
  started_at: string;
  status: string;
  topic_id: string | null;
};

export function TeacherDashboardClient({
  profile,
  completed,
  avgScore,
  topicTitleObj,
  lang,
}: {
  profile: Profile;
  completed: SessionItem[];
  avgScore: number | null;
  topicTitleObj: Record<string, string>;
  lang: Language;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const t = getDictionary(lang);
  const isRtl = lang === "ar";

  // Radius 38, Circumference = 238.76
  const radius = 38;
  const circumference = 238.76;
  const strokeDashoffset =
    avgScore !== null
      ? circumference - (circumference * Math.min(100, Math.max(0, avgScore))) / 100
      : circumference;

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || (lang === "ar" ? "المعلم" : "Teacher");

  const latestSession = completed[0] || null;
  const latestTtt = latestSession?.teacher_talk_ratio ?? null;
  const tttSum = completed.reduce((sum, s) => sum + (s.teacher_talk_ratio ?? 0), 0);
  const avgTtt = completed.length > 0 ? Math.round(tttSum / completed.length) : null;

  return (
    <div
      className="bg-[#F6F0E4] dark:bg-[#05142B] text-[#071B3A] dark:text-white font-readex antialiased min-h-screen flex flex-col selection:bg-[#12B8C4]/20 selection:text-[#071B3A] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Sticky Nile Top Navigation Bar with Official Logo & Animation */}
      <nav className="bg-[#071B3A]/95 backdrop-blur-md text-[#F6F0E4] border-b border-[#F6F0E4]/10 sticky top-0 z-30 shadow-md transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[#12B8C4]/40 after:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3.5 py-2 group">
            <Logo variant="light" height={38} className="transition-transform duration-200 group-hover:scale-105" />
            <div className="h-4 w-px bg-white/20 mx-1 hidden md:block" />
            <div className="hidden md:flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] animate-pulse" />
              <span className="text-xs text-[#12B8C4] font-medium tracking-wide">
                {lang === "ar" ? "نظام محاكاة الفصول الذكي" : "Classroom Simulation System"}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5 text-xs">
            <LanguageSwitcher className="hover:scale-105 active:scale-95 transition-transform duration-150" />
            <div className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <ThemeToggle />
            </div>

            {/* Open Settings Card in Dashboard Button */}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="text-[#F6F0E4]/75 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-all duration-150 hover:scale-105 active:scale-95 hidden sm:inline-flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>{t.nav.settings}</span>
            </button>

            <div className="h-3.5 w-[1px] bg-white/20 mx-1 hidden sm:block" />

            <form action={signOutAction} className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <button
                type="submit"
                className="text-[#D96B58] hover:text-[#D96B58]/80 font-medium px-2 py-1 transition cursor-pointer"
              >
                {t.nav.logout}
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-grow flex flex-col gap-6">
        {/* Welcome Card - Clean & Compact SaaS Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-white/5 px-5 py-3.5 sm:py-4 rounded-xl border border-[#071B3A]/10 dark:border-white/10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#12B8C4]/15 text-[#12B8C4] flex items-center justify-center font-bold text-sm shrink-0 border border-[#12B8C4]/25">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="!text-sm sm:!text-base !font-bold text-[#071B3A] dark:text-white !leading-normal !m-0">
                  {lang === "ar" ? "أهلاً بك، " : "Hello, "}
                  <span className="text-[#12B8C4] !text-sm sm:!text-base !font-bold">{displayName}</span>
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#12B8C4]/15 text-[#12B8C4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] animate-pulse" />
                  {lang === "ar" ? "متصل" : "Online"}
                </span>
              </div>
              <p className="text-[11px] text-[#071B3A]/45 dark:text-white/45 mt-0.5">
                {new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
            <div className="bg-[#F6F0E4]/70 dark:bg-white/10 p-0.5 rounded-lg flex items-center border border-[#071B3A]/5 dark:border-white/5 text-xs font-medium">
              <Link
                href="/growth"
                className="px-3 py-1.5 rounded-md bg-[#071B3A] text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 text-xs font-semibold"
              >
                {t.nav.growth}
              </Link>
              <Link
                href="/history"
                className="px-3 py-1.5 rounded-md text-[#071B3A]/70 dark:text-white/70 hover:text-[#071B3A] dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 text-xs"
              >
                {t.nav.history}
              </Link>
            </div>

            <Link
              href="/session/setup"
              className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFB52E] hover:bg-[#E5A93C] text-[#071B3A] font-bold text-xs shadow-md shadow-amber-400/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-400/30 active:translate-y-0 active:scale-95 overflow-hidden"
            >
              <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none" />
              <svg className="w-3.5 h-3.5 shrink-0 transition-transform duration-300 group-hover:rotate-90 relative z-10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="relative z-10">{lang === "ar" ? "جلسة جديدة" : "New Session"}</span>
            </Link>
          </div>
        </header>

        {/* Dashboard Sections Grid: 2/3 and 1/3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Section 1 (2/3 width): Recent Simulations */}
          <section className="lg:col-span-2 bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 sm:p-6 shadow-sm">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-[#071B3A]/5 dark:border-white/10">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#071B3A] dark:text-white">
                  {t.teacherDashboard.recentSimulations || (lang === "ar" ? "المحاكاة الأخيرة" : "Recent Simulations")}
                </h2>
                <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                  {lang === "ar"
                    ? "سجل الجلسات التفاعلية السابقة ونتائجها الفورية"
                    : "History and live telemetry of past interactive sessions"}
                </p>
              </div>
              <Link
                href="/history"
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-[#12B8C4] hover:text-[#12B8C4]/80 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <span>{lang === "ar" ? "عرض الأرشيف" : "View Archive"}</span>
                <span className="transition-transform duration-200 group-hover:-translate-x-1 rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1">
                  {isRtl ? "←" : "→"}
                </span>
              </Link>
            </div>

            {completed.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center justify-center">
                <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mb-2.5">
                  {t.teacherDashboard.noSessionsYet}
                </p>
                <Link
                  href="/session/setup"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#12B8C4] hover:bg-[#0D9488] text-white text-xs font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                >
                  <span>{t.teacherDashboard.startFirstSession}</span>
                  <Sparkles className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {completed.map((s) => {
                  const score = s.overall_score ?? 0;
                  const pattern = s.classroom_pattern;
                  const isBalanced = pattern === "balanced";
                  const isDisruptive = pattern === "disruptive";

                  const topicTitle =
                    (s.topic_id && topicTitleObj[s.topic_id]) ||
                    (lang === "ar" ? "محاكاة تفاعل الفصل" : "Classroom Dynamic Simulation");
                  const formattedDate = new Date(s.started_at).toLocaleDateString(
                    lang === "ar" ? "ar-EG" : "en-US"
                  );

                  return (
                    <div
                      key={s.id}
                      className={`flex flex-wrap items-center justify-between p-3.5 rounded-xl bg-[#F6F0E4]/40 dark:bg-white/[0.03] border border-[#071B3A]/5 dark:border-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm gap-3.5 ${
                        isBalanced
                          ? "hover:border-[#12B8C4]/40 hover:bg-[#F6F0E4]/60 dark:hover:bg-white/[0.06]"
                          : isDisruptive
                          ? "hover:border-[#FFB52E]/40 hover:bg-[#F6F0E4]/60 dark:hover:bg-white/[0.06]"
                          : "hover:border-[#D96B58]/40 hover:bg-[#F6F0E4]/60 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                          {topicTitle}
                        </h3>
                        <p className="text-[11px] text-[#071B3A]/40 dark:text-white/40 font-medium">
                          {formattedDate}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5 sm:gap-3 justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isBalanced
                              ? "bg-[#12B8C4]/15 text-[#12B8C4] border-[#12B8C4]/20"
                              : isDisruptive
                              ? "bg-[#FFB52E]/15 text-[#FFB52E] border-[#FFB52E]/20"
                              : "bg-[#D96B58]/15 text-[#D96B58] border-[#D96B58]/20"
                          }`}
                        >
                          {patternLabel(pattern, t)}
                        </span>

                        <span
                          className={`w-10 text-center font-bold text-sm sm:text-base ${
                            score >= 50 ? "text-[#071B3A] dark:text-white" : "text-[#D96B58]"
                          }`}
                        >
                          {s.overall_score !== null ? `${score}%` : "—"}
                        </span>

                        <Link
                          href={`/report/${s.id}`}
                          className="group/btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#12B8C4]/25 hover:border-[#12B8C4] bg-[#12B8C4]/5 hover:bg-[#12B8C4]/15 text-xs font-semibold text-[#12B8C4] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                        >
                          <span>{lang === "ar" ? "تقرير الجلسة" : "Session Report"}</span>
                          <span className="transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5">↗</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-[#071B3A]/5 dark:border-white/10 flex justify-between items-center text-[11px] text-[#071B3A]/40 dark:text-white/40">
              <span>{lang === "ar" ? "حالة النظام: متصل وجاهز" : "System Status: Online"}</span>
              <span>
                {lang === "ar"
                  ? "يتم تحديث المؤشرات فور انتهاء كل جلسة"
                  : "Metrics update upon session completion"}
              </span>
            </div>
          </section>

          {/* Section 2 (1/3 width): Overall Level Donut */}
          <section className="bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <h2 className="text-sm sm:text-base font-bold text-[#071B3A] dark:text-white">
                {lang === "ar" ? "المستوى العام" : "Overall Level"}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A]/70 dark:text-white/70 border border-[#071B3A]/10 dark:border-white/10">
                {completed.length > 0
                  ? (lang === "ar" ? `آخر ${completed.length} جلسات` : `Last ${completed.length} sessions`)
                  : (lang === "ar" ? "لا توجد جلسات" : "No sessions")}
              </span>
            </div>

            <div className="my-5 flex flex-col items-center justify-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="9"
                    className="text-[#F6F0E4] dark:text-white/10"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#12B8C4"
                    strokeWidth="9"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl sm:text-3xl font-extrabold text-[#071B3A] dark:text-white tracking-tight">
                    {avgScore !== null ? `${avgScore}%` : "—"}
                  </span>
                  <span className="text-[11px] font-medium text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {lang === "ar" ? "متوسط الأداء" : "Average Score"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5 mt-4 text-[11px] text-[#071B3A]/60 dark:text-white/60">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                  {lang === "ar" ? "تفاعل نشط" : "Active"}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
                  {lang === "ar" ? "بحاجة لدعم" : "Needs Support"}
                </span>
              </div>
            </div>

            <div className="bg-[#F6F0E4]/60 dark:bg-white/[0.04] border-r-3 rtl:border-r-3 ltr:border-l-3 border-[#FFB52E] p-3.5 rounded-xl text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed">
              <p className="font-semibold text-[#071B3A] dark:text-white mb-0.5 text-xs">
                {lang === "ar" ? "توصية النظام:" : "System Recommendation:"}
              </p>
              {avgScore === null
                ? (lang === "ar"
                    ? "ابدأ أول جلسة محاكاة تدريبية لتحليل أدائك وتوليد مؤشرات تفاعلك مع الطلاب."
                    : "Start your first session to analyze performance and generate live feedback.")
                : ((latestTtt !== null && latestTtt > 60) || (avgTtt !== null && avgTtt > 60))
                ? (lang === "ar"
                    ? `أسئلتك وتوجيهك نشط، لكن وقت حديث المعلم مرتفع (${latestTtt ?? avgTtt}%). ركّز على تقليل وقت شرحك ومنح الطلاب وقتاً أطول للتفكير والإجابة.`
                    : `Your questioning is active, but Teacher Talk Time is high (${latestTtt ?? avgTtt}%). Focus on reducing monologues and giving students more floor time.`)
                : avgScore >= 75
                ? (lang === "ar"
                    ? "أداء متوازن ومتميز في إدارة وتوجيه النقاش الصفي؛ استمر في تعزيز الأسئلة السقراطية ومشاركة الطلاب."
                    : "Exceptional discussion management; keep fostering open-ended inquiry and student participation.")
                : avgScore >= 50
                ? (lang === "ar"
                    ? "أداء متوازن ومستقر؛ ركّز على تقليل وقت حديث المعلم لإفساح مجال أوسع للطلاب."
                    : "Balanced performance; focus on reducing teacher talk time to give students more room.")
                : (lang === "ar"
                    ? "أداؤك الحالي يحتاج تركيزاً إضافياً لرفع نسبة التفاعل وتخطي نمط الخمول في الجلسات القادمة."
                    : "Your score indicates room for more active questioning and student participation.")}
            </div>
          </section>
        </div>
      </main>

      {/* Clean Corporate Footer */}
      <footer className="border-t border-[#071B3A]/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-xs text-[#071B3A]/50 dark:text-white/50 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>
            {lang === "ar"
              ? "جميع الحقوق محفوظة © 2026 نظام فطنة للذكاء الاصطناعي التربوي"
              : "All rights reserved © 2026 Fitna AI Pedagogical System"}
          </span>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {lang === "ar" ? "المعايير المعتمدة" : "Standards"}
            </Link>
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {lang === "ar" ? "المساعدة والدعم" : "Help & Support"}
            </Link>
          </div>
        </div>
      </footer>

      {/* Floating Scrollable Settings Card Modal */}
      {profile && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          profile={profile}
        />
      )}
    </div>
  );
}

function patternLabel(p: string | null, t: ReturnType<typeof getDictionary>) {
  if (p === "balanced") return t.common.balanced;
  if (p === "disruptive") return t.common.disruptive;
  if (p === "disengaged") return t.common.disengaged;
  return "—";
}
