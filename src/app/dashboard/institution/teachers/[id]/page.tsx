import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { getDictionary, type Language } from "@/lib/i18n";
import { Award } from "lucide-react";

export default async function SupervisorTeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: teacherId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const t = getDictionary(lang);
  const isEn = lang === "en";

  const { data: adminProfile } = await supabase
    .from("users")
    .select("role, institution_id")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "institution_admin" || !adminProfile.institution_id) {
    redirect("/unauthorized");
  }

  // Fetch the teacher profile (ensuring same institution)
  const { data: teacher } = await supabase
    .from("users")
    .select(
      "id, full_name, email, institution_id, teaching_experience, teaching_level, subject, training_goals, created_at"
    )
    .eq("id", teacherId)
    .eq("institution_id", adminProfile.institution_id)
    .single();

  if (!teacher) notFound();

  // Fetch teacher's completed sessions
  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, started_at, duration_minutes, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, classroom_pattern, topic_id"
    )
    .eq("teacher_id", teacherId)
    .eq("status", "completed")
    .order("started_at", { ascending: false });

  const completedSessions = sessions ?? [];
  const completedCount = completedSessions.length;

  const avg = (key: "overall_score" | "teacher_talk_ratio" | "socratic_question_rate" | "inclusivity_index") => {
    const vals = completedSessions.map((s) => s[key]).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  // Fetch topics
  const topicIds = [...new Set(completedSessions.map((s) => s.topic_id).filter(Boolean))] as string[];
  const { data: topics } = topicIds.length
    ? await supabase.from("lesson_topics").select("id, title_ar, title_en").in("id", topicIds)
    : { data: [] as { id: string; title_ar: string; title_en: string | null }[] };
  const topicMap = new Map((topics ?? []).map((item) => [item.id, isEn && item.title_en ? item.title_en : item.title_ar]));

  // Fetch badges
  const { data: badges } = await supabase
    .from("badges")
    .select("badge_key, unlocked_at")
    .eq("user_id", teacherId);

  return (
    <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#071B3A]">
      <AppHeader title={t.institution.teacherProfileTitle} />
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
              {t.institution.teacherProfileSubtitle}
            </span>
            <h1 className="text-2xl font-bold text-[#071B3A] dark:text-white mt-1">
              {teacher.full_name || teacher.email}
            </h1>
          </div>
          <Link
            href="/dashboard/institution"
            className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
          >
            ← {t.institution.pageTitle}
          </Link>
        </div>

        {/* Profile Card */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xs font-bold text-[#071B3A]/60 dark:text-white/60 mb-4 uppercase tracking-wider">
            {t.institution.professionalInfo}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-[#071B3A]/40 dark:text-white/40">{t.institution.email}</p>
              <p className="font-bold text-[#071B3A] dark:text-white mt-0.5">{teacher.email}</p>
            </div>
            <div>
              <p className="text-[#071B3A]/40 dark:text-white/40">{t.institution.experience}</p>
              <p className="font-bold text-[#071B3A] dark:text-white mt-0.5">
                {teacher.teaching_experience ? `${teacher.teaching_experience} ${t.institution.years}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[#071B3A]/40 dark:text-white/40">{t.institution.teachingLevel}</p>
              <p className="font-bold text-[#071B3A] dark:text-white mt-0.5">
                {teacher.teaching_level || "—"}
              </p>
            </div>
            <div>
              <p className="text-[#071B3A]/40 dark:text-white/40">{t.institution.subject}</p>
              <p className="font-bold text-[#071B3A] dark:text-white mt-0.5">
                {teacher.subject || "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Aggregated Performance Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t.growth.overallScoreAvg} value={avg("overall_score") ? `${avg("overall_score")}%` : "—"} />
          <StatCard label={t.growth.teacherTalkAvg} value={avg("teacher_talk_ratio") ? `${avg("teacher_talk_ratio")}%` : "—"} />
          <StatCard label={t.growth.socraticRateAvg} value={avg("socratic_question_rate") ? `${avg("socratic_question_rate")}%` : "—"} />
          <StatCard label={t.growth.inclusivityAvg} value={avg("inclusivity_index") ? `${avg("inclusivity_index")}%` : "—"} />
        </div>

        {/* Simulation History Table */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#071B3A] dark:text-white">
              {t.institution.completedSimulations} ({completedCount})
            </h2>
            {badges && badges.length > 0 && (
              <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                <span>{badges.length} {isEn ? "badges unlocked" : "شارات مفتوحة"}</span>
              </span>
            )}
          </div>

          {completedCount === 0 ? (
            <p className="text-xs text-[#071B3A]/50 dark:text-white/50 py-4">
              {t.institution.noTeacherSimulations}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#071B3A]/50 dark:text-white/50 text-start border-b border-[#071B3A]/5 dark:border-white/10">
                  <th className="px-4 py-3 font-semibold">{t.common.date}</th>
                  <th className="px-4 py-3 font-semibold">{t.common.topic}</th>
                  <th className="px-4 py-3 font-semibold">{t.common.score}</th>
                  <th className="px-4 py-3 font-semibold">{t.common.pattern}</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {completedSessions.map((s) => (
                  <tr key={s.id} className="border-t border-[#071B3A]/5 dark:border-white/10">
                    <td className="px-4 py-3 text-[#071B3A] dark:text-white font-medium">
                      {new Date(s.started_at).toLocaleDateString(isEn ? "en-US" : "ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-[#071B3A] dark:text-white">
                      {s.topic_id ? topicMap.get(s.topic_id) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#071B3A] dark:text-white font-bold">
                      {s.overall_score ?? "—"}%
                    </td>
                    <td className="px-4 py-3 text-[#071B3A] dark:text-white">
                      {patternLabel(s.classroom_pattern, t)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Link
                        href={`/report/${s.id}`}
                        className="text-teal-600 dark:text-teal-400 hover:underline text-xs font-semibold"
                      >
                        {t.institution.inspectReport}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl p-4 text-center shadow-sm">
      <div className="text-2xl font-bold text-[#071B3A] dark:text-white">{value}</div>
      <div className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-1 font-medium">{label}</div>
    </div>
  );
}

function patternLabel(p: string | null, t: ReturnType<typeof getDictionary>) {
  if (p === "balanced") return t.common.balanced;
  if (p === "disruptive") return t.common.disruptive;
  if (p === "disengaged") return t.common.disengaged;
  return "—";
}
