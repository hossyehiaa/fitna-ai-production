import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getDictionary, type Language } from "@/lib/i18n";
import { Check } from "lucide-react";
import { cleanPedagogicalText } from "@/lib/utils/pedagogy";

export default async function SessionComparePage({
  searchParams,
}: {
  searchParams: Promise<{ sessionA?: string; sessionB?: string }>;
}) {
  const { sessionA: idA, sessionB: idB } = await searchParams;

  if (!idA || !idB) {
    redirect("/history");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const t = getDictionary(lang);
  const isEn = lang === "en";
  const isRtl = lang === "ar";

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, teacher_id, topic_id, duration_minutes, classroom_style, training_objective, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, classroom_pattern, started_at"
    )
    .in("id", [idA, idB]);

  if (!sessions || sessions.length !== 2) {
    redirect("/history");
  }

  const sessionA = sessions.find((s) => s.id === idA) ?? sessions[0];
  const sessionB = sessions.find((s) => s.id === idB) ?? sessions[1];

  if (sessionA.teacher_id !== user.id || sessionB.teacher_id !== user.id) {
    redirect("/unauthorized");
  }

  // Fetch topics
  const topicIds = [sessionA.topic_id, sessionB.topic_id].filter(Boolean) as string[];
  const { data: topics } = topicIds.length
    ? await supabase.from("lesson_topics").select("id, title_ar, title_en").in("id", topicIds)
    : { data: [] as { id: string; title_ar: string; title_en: string | null }[] };
  const topicMap = new Map((topics ?? []).map((item) => [item.id, isEn && item.title_en ? item.title_en : item.title_ar]));

  // Fetch reports
  const { data: reports } = await supabase
    .from("reports")
    .select("session_id, summary_ar, session_signal_ar, strengths, weaknesses, recommendations")
    .in("session_id", [idA, idB]);

  const reportA = reports?.find((r) => r.session_id === idA);
  const reportB = reports?.find((r) => r.session_id === idB);

  return (
    <div
      className="bg-[#F6F0E4] dark:bg-[#05142B] text-[#071B3A] dark:text-white font-readex antialiased min-h-screen flex flex-col selection:bg-[#12B8C4]/20 selection:text-[#071B3A] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Sticky Nile Top Navigation Bar */}
      <nav className="bg-[#071B3A]/95 backdrop-blur-md text-[#F6F0E4] border-b border-[#F6F0E4]/10 sticky top-0 z-30 shadow-md transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[#12B8C4]/40 after:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard/teacher" className="flex items-center gap-3.5 py-2 group">
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
              className="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-[#F6F0E4] hover:text-white text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              title={isRtl ? "العودة إلى لوحة التحكم" : "Return to Dashboard"}
            >
              <svg
                className="w-3.5 h-3.5 text-[#12B8C4] shrink-0 rtl:rotate-0 ltr:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>{isRtl ? "لوحة التحكم" : "Dashboard"}</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content Canvas */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow space-y-8">
        {/* Header Breadcrumb & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#071B3A]/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#071B3A]/60 dark:text-white/60 mb-1">
              <Link href="/history" className="hover:text-[#12B8C4] transition">
                {isRtl ? "سجل المحاكاة" : "Simulation History"}
              </Link>
              <span>/</span>
              <span className="text-[#12B8C4] font-bold">{t.history.compareTitle}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#071B3A] dark:text-white tracking-tight">
              {t.history.compareTitle}
            </h1>
            <p className="text-xs sm:text-sm text-[#071B3A]/60 dark:text-white/60 mt-1 leading-relaxed">
              {t.history.compareSubtitle}
            </p>
          </div>

          <Link
            href="/history"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-white/5 hover:bg-[#F6F0E4] dark:hover:bg-white/10 text-xs font-bold text-[#071B3A] dark:text-white border border-[#071B3A]/10 dark:border-white/10 shadow-sm transition active:scale-95 shrink-0"
          >
            <span>{t.history.backToHistory}</span>
          </Link>
        </div>

        {/* Headline Comparison Matrix (No Cluttered Arrows) */}
        <div className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#071B3A]/5 dark:border-white/10">
            <h2 className="font-bold text-base text-[#071B3A] dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#12B8C4]" />
              <span>{t.history.metricsComparisonTitle}</span>
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-[#12B8C4] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                {isRtl ? "الجلسة الأولى (أ)" : "Session A"}
              </span>
              <span className="text-[#071B3A]/30 dark:text-white/30">|</span>
              <span className="flex items-center gap-1.5 text-[#FFB52E] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#FFB52E]" />
                {isRtl ? "الجلسة الثانية (ب)" : "Session B"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCompareCard
              label={t.growth.overallScoreAvg}
              valA={sessionA.overall_score}
              valB={sessionB.overall_score}
              unit="%"
              t={t}
            />
            <MetricCompareCard
              label={t.growth.teacherTalkAvg}
              valA={sessionA.teacher_talk_ratio}
              valB={sessionB.teacher_talk_ratio}
              unit="%"
              invertGood
              t={t}
            />
            <MetricCompareCard
              label={t.growth.socraticRateAvg}
              valA={sessionA.socratic_question_rate}
              valB={sessionB.socratic_question_rate}
              unit="%"
              t={t}
            />
            <MetricCompareCard
              label={t.growth.inclusivityAvg}
              valA={sessionA.inclusivity_index}
              valB={sessionB.inclusivity_index}
              unit="%"
              t={t}
            />
          </div>
        </div>

        {/* Side by Side Comparative Dossiers (Organized, No Arrows) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Session A Card */}
          <div className="bg-white dark:bg-white/5 rounded-3xl p-6 sm:p-7 space-y-6 shadow-sm border-t-4 border-[#12B8C4] border-x border-b border-[#071B3A]/10 dark:border-white/10 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Header Box */}
              <div className="flex items-start justify-between border-b border-[#071B3A]/10 dark:border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-[#12B8C4] bg-[#12B8C4]/15 px-2.5 py-0.5 rounded-md">
                      {isRtl ? "الجلسة الأولى (أ)" : "Session A"}
                    </span>
                    <span className="text-xs font-bold bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A]/70 dark:text-white/70 px-2 py-0.5 rounded-md border border-[#071B3A]/10 dark:border-white/10">
                      {patternLabel(sessionA.classroom_pattern, t)}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-[#071B3A] dark:text-white mt-1">
                    {sessionA.topic_id ? topicMap.get(sessionA.topic_id) ?? "—" : "—"}
                  </h3>
                </div>

                <div className="text-end">
                  <div className="text-2xl font-black font-mono text-[#12B8C4]">
                    {sessionA.overall_score ?? 0}%
                  </div>
                  <div className="text-[11px] font-mono text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {new Date(sessionA.started_at).toLocaleDateString(isEn ? "en-US" : "ar-EG")}
                  </div>
                </div>
              </div>

              {/* Session Signal Notice */}
              {reportA?.session_signal_ar && (
                <div className="bg-[#12B8C4]/10 border border-[#12B8C4]/20 p-3.5 rounded-2xl">
                  <p className="text-xs text-[#071B3A] dark:text-white font-bold leading-relaxed">
                    {cleanPedagogicalText(reportA.session_signal_ar)}
                  </p>
                </div>
              )}

              {/* Performance Summary */}
              {reportA?.summary_ar && (
                <div className="bg-[#F6F0E4]/40 dark:bg-white/5 p-4 rounded-2xl border border-[#071B3A]/5 dark:border-white/5">
                  <h4 className="text-xs font-bold text-[#071B3A]/60 dark:text-white/60 mb-1">
                    {t.report.performanceSummary}
                  </h4>
                  <p className="text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed">
                    {cleanPedagogicalText(reportA.summary_ar)}
                  </p>
                </div>
              )}

              {/* Strengths */}
              {reportA?.strengths && reportA.strengths.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#12B8C4] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                    <span>{t.report.strengthsTitle}</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#071B3A]/80 dark:text-white/80">
                    {reportA.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 bg-[#F6F0E4]/30 dark:bg-white/5 p-3 rounded-xl border border-[#071B3A]/5 dark:border-white/5 leading-relaxed">
                        <span className="w-4 h-4 rounded-full bg-[#12B8C4]/20 text-[#12B8C4] flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                        <span>{cleanPedagogicalText(s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses / Areas for Improvement */}
              {reportA?.weaknesses && reportA.weaknesses.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#D96B58] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
                    <span>{t.report.weaknessesTitle}</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#071B3A]/80 dark:text-white/80">
                    {reportA.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2.5 bg-[#F6F0E4]/30 dark:bg-white/5 p-3 rounded-xl border border-[#071B3A]/5 dark:border-white/5 leading-relaxed">
                        <span className="w-4 h-4 rounded-full bg-[#D96B58]/20 text-[#D96B58] flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">!</span>
                        <span>{cleanPedagogicalText(w)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action Link */}
            <div className="pt-4 border-t border-[#071B3A]/10 dark:border-white/10 mt-6">
              <Link
                href={`/report/${sessionA.id}`}
                className="w-full inline-flex items-center justify-center py-2.5 rounded-xl bg-[#12B8C4]/15 hover:bg-[#12B8C4] text-[#12B8C4] hover:text-[#071B3A] text-xs font-bold transition duration-150 active:scale-98"
              >
                <span>{t.history.viewFullReportA}</span>
              </Link>
            </div>
          </div>

          {/* Session B Card */}
          <div className="bg-white dark:bg-white/5 rounded-3xl p-6 sm:p-7 space-y-6 shadow-sm border-t-4 border-[#FFB52E] border-x border-b border-[#071B3A]/10 dark:border-white/10 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Header Box */}
              <div className="flex items-start justify-between border-b border-[#071B3A]/10 dark:border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-[#FFB52E] bg-[#FFB52E]/15 px-2.5 py-0.5 rounded-md">
                      {isRtl ? "الجلسة الثانية (ب)" : "Session B"}
                    </span>
                    <span className="text-xs font-bold bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A]/70 dark:text-white/70 px-2 py-0.5 rounded-md border border-[#071B3A]/10 dark:border-white/10">
                      {patternLabel(sessionB.classroom_pattern, t)}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-[#071B3A] dark:text-white mt-1">
                    {sessionB.topic_id ? topicMap.get(sessionB.topic_id) ?? "—" : "—"}
                  </h3>
                </div>

                <div className="text-end">
                  <div className="text-2xl font-black font-mono text-[#FFB52E]">
                    {sessionB.overall_score ?? 0}%
                  </div>
                  <div className="text-[11px] font-mono text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {new Date(sessionB.started_at).toLocaleDateString(isEn ? "en-US" : "ar-EG")}
                  </div>
                </div>
              </div>

              {/* Session Signal Notice */}
              {reportB?.session_signal_ar && (
                <div className="bg-[#FFB52E]/10 border border-[#FFB52E]/20 p-3.5 rounded-2xl">
                  <p className="text-xs text-[#071B3A] dark:text-white font-bold leading-relaxed">
                    {cleanPedagogicalText(reportB.session_signal_ar)}
                  </p>
                </div>
              )}

              {/* Performance Summary */}
              {reportB?.summary_ar && (
                <div className="bg-[#F6F0E4]/40 dark:bg-white/5 p-4 rounded-2xl border border-[#071B3A]/5 dark:border-white/5">
                  <h4 className="text-xs font-bold text-[#071B3A]/60 dark:text-white/60 mb-1">
                    {t.report.performanceSummary}
                  </h4>
                  <p className="text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed">
                    {cleanPedagogicalText(reportB.summary_ar)}
                  </p>
                </div>
              )}

              {/* Strengths */}
              {reportB?.strengths && reportB.strengths.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#12B8C4] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                    <span>{t.report.strengthsTitle}</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#071B3A]/80 dark:text-white/80">
                    {reportB.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 bg-[#F6F0E4]/30 dark:bg-white/5 p-3 rounded-xl border border-[#071B3A]/5 dark:border-white/5 leading-relaxed">
                        <span className="w-4 h-4 rounded-full bg-[#12B8C4]/20 text-[#12B8C4] flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                        <span>{cleanPedagogicalText(s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses / Areas for Improvement */}
              {reportB?.weaknesses && reportB.weaknesses.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#D96B58] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
                    <span>{t.report.weaknessesTitle}</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#071B3A]/80 dark:text-white/80">
                    {reportB.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2.5 bg-[#F6F0E4]/30 dark:bg-white/5 p-3 rounded-xl border border-[#071B3A]/5 dark:border-white/5 leading-relaxed">
                        <span className="w-4 h-4 rounded-full bg-[#D96B58]/20 text-[#D96B58] flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">!</span>
                        <span>{cleanPedagogicalText(w)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action Link */}
            <div className="pt-4 border-t border-[#071B3A]/10 dark:border-white/10 mt-6">
              <Link
                href={`/report/${sessionB.id}`}
                className="w-full inline-flex items-center justify-center py-2.5 rounded-xl bg-[#FFB52E]/20 hover:bg-[#FFB52E] text-[#071B3A] dark:text-[#FFB52E] dark:hover:text-[#071B3A] text-xs font-bold transition duration-150 active:scale-98"
              >
                <span>{t.history.viewFullReportB}</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Corporate Footer */}
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

function MetricCompareCard({
  label,
  valA,
  valB,
  unit = "",
  invertGood = false,
  t,
}: {
  label: string;
  valA: number | null;
  valB: number | null;
  unit?: string;
  invertGood?: boolean;
  t: ReturnType<typeof getDictionary>;
}) {
  const diff = valA !== null && valB !== null ? Math.round(valB - valA) : null;
  const isPositive = diff !== null && diff > 0;
  const isNegative = diff !== null && diff < 0;
  const isGood = invertGood ? isNegative : isPositive;

  return (
    <div className="bg-[#F6F0E4]/60 dark:bg-white/[0.04] p-4 rounded-2xl border border-[#071B3A]/5 dark:border-white/5 text-center space-y-3">
      <div className="text-xs text-[#071B3A]/70 dark:text-white/70 font-bold">{label}</div>
      
      {/* Side-by-side cleanly labeled values, NO arrows */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-white/70 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/5">
          <span className="text-[10px] text-[#12B8C4] font-bold block mb-0.5">جلسة (أ)</span>
          <span className="font-mono font-black text-sm text-[#071B3A] dark:text-white">{valA ?? "—"}{unit}</span>
        </div>
        <div className="p-2 rounded-xl bg-white/70 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/5">
          <span className="text-[10px] text-[#FFB52E] font-bold block mb-0.5">جلسة (ب)</span>
          <span className="font-mono font-black text-sm text-[#071B3A] dark:text-white">{valB ?? "—"}{unit}</span>
        </div>
      </div>

      {/* Delta badge */}
      <div>
        {diff !== null ? (
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
              diff === 0
                ? "text-[#071B3A]/60 bg-[#071B3A]/10 dark:text-white/60 dark:bg-white/10"
                : isGood
                ? "text-[#12B8C4] bg-[#12B8C4]/15"
                : "text-[#D96B58] bg-[#D96B58]/15"
            }`}
          >
            {diff > 0 ? `+${diff}` : `${diff}`}{unit} {diff === 0 ? t.history.equal : isGood ? t.history.improved : t.history.declined}
          </span>
        ) : (
          <span className="text-xs text-[#071B3A]/30">—</span>
        )}
      </div>
    </div>
  );
}

function patternLabel(p: string | null, t: ReturnType<typeof getDictionary>) {
  if (p === "balanced") return t.common.balanced;
  if (p === "disruptive") return t.common.disruptive;
  if (p === "disengaged") return t.common.disengaged;
  return "—";
}
