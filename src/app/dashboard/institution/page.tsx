import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { CreateCohortModal } from "./CreateCohortModal";
import { getDictionary, type Language } from "@/lib/i18n";

export default async function InstitutionDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const t = getDictionary(lang);

  const { data: profile } = await supabase
    .from("users")
    .select("institution_id, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "institution_admin") redirect("/unauthorized");
  if (!profile.institution_id) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#071B3A]">
        <AppHeader />
        <div className="flex items-center justify-center py-24">
          <p className="text-xs text-[#071B3A]/60 dark:text-white/60">
            {lang === "en"
              ? "Your account is not linked to an institution yet. Please contact support."
              : "حسابك لسه مش مربوط بمؤسسة. تواصل مع الدعم لربط حسابك."}
          </p>
        </div>
      </div>
    );
  }
  const institutionId = profile.institution_id;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthSessions } = await supabase
    .from("sessions")
    .select("overall_score, teacher_id, status")
    .eq("institution_id", institutionId)
    .eq("status", "completed")
    .gte("started_at", startOfMonth.toISOString());

  const { data: allSessions } = await supabase
    .from("sessions")
    .select("overall_score, teacher_id, status")
    .eq("institution_id", institutionId)
    .eq("status", "completed");

  const { data: teachers } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("institution_id", institutionId)
    .eq("role", "teacher");

  // Fetch Cohorts and Members
  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, description, created_at")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false });

  const cohortIds = (cohorts ?? []).map((c) => c.id);
  const { data: cohortMembers } = cohortIds.length
    ? await supabase.from("cohort_members").select("cohort_id, teacher_id").in("cohort_id", cohortIds)
    : { data: [] as { cohort_id: string; teacher_id: string }[] };

  // Calculate cohort stats
  const memberTeacherIdsByCohort = new Map<string, Set<string>>();
  for (const m of cohortMembers ?? []) {
    if (!memberTeacherIdsByCohort.has(m.cohort_id)) {
      memberTeacherIdsByCohort.set(m.cohort_id, new Set());
    }
    memberTeacherIdsByCohort.get(m.cohort_id)!.add(m.teacher_id);
  }

  const completedThisMonth = monthSessions?.length ?? 0;
  const avgScore =
    completedThisMonth > 0
      ? Math.round(
          (monthSessions ?? []).reduce((sum, s) => sum + (s.overall_score ?? 0), 0) /
            completedThisMonth
        )
      : null;
  const teacherCount = teachers?.length ?? 0;

  const teacherOptions = (teachers ?? []).map((tItem) => ({
    id: tItem.id,
    name: tItem.full_name || "",
    email: tItem.email,
  }));

  return (
    <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#071B3A]">
      <AppHeader title={t.institution.pageTitle} />
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-[#071B3A] dark:text-white">{t.institution.pageTitle}</h1>
          <CreateCohortModal teachers={teacherOptions} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label={t.institution.completedThisMonth} value={completedThisMonth} />
          <StatCard label={t.institution.avgScoreMonth} value={avgScore ? `${avgScore}%` : "—"} />
          <StatCard label={t.institution.registeredTeachers} value={teacherCount} />
        </div>

        {/* Cohorts Section */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-[#071B3A] dark:text-white">
                {t.institution.cohortsTitle}
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                {t.institution.cohortsSubtitle}
              </p>
            </div>
          </div>

          {!cohorts || cohorts.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-[#071B3A]/15 dark:border-white/15 rounded-xl">
              <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mb-2">
                {t.institution.noCohortsYet}
              </p>
              <p className="text-[11px] text-[#071B3A]/40 dark:text-white/40">
                {t.institution.noCohortsDesc}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cohorts.map((c) => {
                const members = memberTeacherIdsByCohort.get(c.id) ?? new Set();
                const cohortSessions = (allSessions ?? []).filter((s) => members.has(s.teacher_id));
                const cohortAvg =
                  cohortSessions.length > 0
                    ? Math.round(
                        cohortSessions.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) /
                          cohortSessions.length
                      )
                    : null;

                return (
                  <div
                    key={c.id}
                    className="border border-[#071B3A]/10 dark:border-white/10 rounded-xl p-4 bg-[#071B3A]/[0.02] dark:bg-white/[0.02] space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-[#071B3A] dark:text-white text-sm">
                          {c.name}
                        </h3>
                        {c.description && (
                          <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1">
                            {c.description}
                          </p>
                        )}
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-bold">
                        {members.size} {lang === "ar" ? "معلمين" : "teachers"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#071B3A]/5 dark:border-white/5 text-[#071B3A]/70 dark:text-white/70">
                      <span>{t.institution.totalSessions}: {cohortSessions.length}</span>
                      <span>{t.institution.cohortAverage}: <strong className="text-teal-600 dark:text-teal-400">{cohortAvg ? `${cohortAvg}%` : "—"}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Teachers List */}
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-base text-[#071B3A] dark:text-white mb-4">{t.institution.teachersListTitle}</h2>
          {teacherCount === 0 ? (
            <p className="text-xs text-[#071B3A]/50 dark:text-white/50">
              {t.institution.noTeachersYet}
            </p>
          ) : (
            <ul className="divide-y divide-[#071B3A]/5 dark:divide-white/10">
              {teachers!.map((tItem) => (
                <li key={tItem.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-xs">
                      {(tItem.full_name || tItem.email).charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-[#071B3A] dark:text-white block">
                        {tItem.full_name || tItem.email}
                      </span>
                      {tItem.full_name && (
                        <span className="text-[11px] text-[#071B3A]/40 dark:text-white/40">{tItem.email}</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/institution/teachers/${tItem.id}`}
                    className="text-teal-600 dark:text-teal-400 hover:underline text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition"
                  >
                    {t.institution.viewTeacherDossier}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 text-center shadow-sm">
      <div className="text-3xl font-extrabold text-[#071B3A] dark:text-white">{value}</div>
      <div className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-1 font-medium">{label}</div>
    </div>
  );
}
