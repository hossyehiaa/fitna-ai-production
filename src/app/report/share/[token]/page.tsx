import { createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FrameworkScorecard, type FrameworkScoresProps } from "../../[id]/FrameworkScorecard";
import { Logo } from "@/components/Logo";
import { getDictionary, type Language } from "@/lib/i18n";
import { Check } from "lucide-react";
import { cleanPedagogicalText } from "@/lib/utils/pedagogy";

export const revalidate = 0;

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const adminClient = createAdminClient();

  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const t = getDictionary(lang);

  // Find report matching the share token
  const { data: report } = await adminClient
    .from("reports")
    .select("id, session_id, summary_ar, session_signal_ar, strengths, weaknesses, recommendations, evidence_moments, framework_scores, created_at")
    .eq("share_token", token)
    .single();

  if (!report) notFound();

  const { data: session } = await adminClient
    .from("sessions")
    .select(
      "id, duration_minutes, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, classroom_pattern, started_at, ended_at"
    )
    .eq("id", report.session_id)
    .single();

  if (!session) notFound();

  return (
    <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#071B3A] p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-[#071B3A]/10 dark:border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Logo variant="dark" height={32} className="dark:hidden" />
            <Logo variant="light" height={32} className="hidden dark:block" />
            <div>
              <h1 className="text-xl font-bold text-[#071B3A] dark:text-white">
                {lang === "en" ? "Verified Simulation Report — Fitna AI" : "تقرير محاكاة معتمد — Fitna AI"}
              </h1>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50">
                {t.common.date}: {new Date(session.started_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-[#071B3A] dark:bg-white/10 text-white text-xs font-semibold">
            {t.report.publicReportBadge}
          </span>
        </div>

        <div className="bg-white dark:bg-white/5 rounded-2xl p-8 flex flex-col items-center shadow-sm">
          <div className="w-32 h-32 rounded-full border-8 border-teal-500 flex items-center justify-center">
            <span className="text-3xl font-extrabold text-[#071B3A] dark:text-white">{session.overall_score ?? "—"}%</span>
          </div>
          <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-3 font-medium">
            {t.report.classroomPatternLabel}: {patternLabel(session.classroom_pattern, t)}
          </p>
          {report?.session_signal_ar && (
            <p className="text-teal-700 dark:text-teal-300 font-bold text-sm mt-4 text-center">{cleanPedagogicalText(report.session_signal_ar)}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <MetricCard label={t.liveRoom.teacherTalkRatio} value={session.teacher_talk_ratio} />
          <MetricCard label={t.liveRoom.socraticQuestionRate} value={session.socratic_question_rate} />
          <MetricCard label={t.liveRoom.inclusivityIndex} value={session.inclusivity_index} />
        </div>

        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-sm text-[#071B3A] dark:text-white mb-2">{t.report.performanceSummary}</h2>
          <p className="text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed">{cleanPedagogicalText(report.summary_ar)}</p>
        </div>

        {(report.strengths?.length > 0 || report.weaknesses?.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.strengths?.length > 0 && (
              <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-sm text-teal-700 dark:text-teal-300 mb-3">{t.report.strengthsTitle}</h2>
                <ul className="space-y-2">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[#071B3A]/80 dark:text-white/80">
                      <Check className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                      <span>{cleanPedagogicalText(s)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.weaknesses?.length > 0 && (
              <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
                <h2 className="font-bold text-sm text-yellow-700 dark:text-yellow-400 mb-3">{t.report.weaknessesTitle}</h2>
                <ul className="space-y-2">
                  {report.weaknesses.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[#071B3A]/80 dark:text-white/80">
                      <span className="text-yellow-500 font-bold">!</span>
                      <span>{cleanPedagogicalText(w)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {report.recommendations && report.recommendations.length > 0 && (
          <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
            <h2 className="font-bold text-sm text-[#071B3A] dark:text-white mb-3">
              {t.report.recommendationsTitle}
            </h2>
            <ul className="space-y-2">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-2 text-xs text-[#071B3A]/80 dark:text-white/80">
                  <span className="text-teal-600 font-bold">•</span>
                  <span>{cleanPedagogicalText(rec)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FrameworkScorecard scores={report.framework_scores as unknown as FrameworkScoresProps | null} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl p-4 text-center shadow-sm">
      <div className="text-2xl font-bold text-[#071B3A] dark:text-white">{value ?? "—"}%</div>
      <div className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-1">{label}</div>
    </div>
  );
}

function patternLabel(p: string | null, t: ReturnType<typeof getDictionary>) {
  if (p === "balanced") return t.common.balanced;
  if (p === "disruptive") return t.common.disruptive;
  if (p === "disengaged") return t.common.disengaged;
  return "—";
}
