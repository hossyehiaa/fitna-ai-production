import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ReportClient } from "./ReportClient";
import { RegenerateReportButton } from "./RegenerateReportButton";
import { type Language } from "@/lib/i18n";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;

  const supabase = await createClient();
  let user: any = null;
  try {
    const userRes = await supabase.auth.getUser();
    user = userRes?.data?.user ?? null;
  } catch {}

  if (!user) redirect("/login");

  const db = createAdminClient();

  const { data: session } = await db
    .from("sessions")
    .select(
      "id, teacher_id, institution_id, duration_minutes, status, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, classroom_pattern, started_at, ended_at"
    )
    .eq("id", id)
    .single();

  if (!session) notFound();

  const { data: profile } = await db
    .from("users")
    .select("role, institution_id")
    .eq("id", user.id)
    .maybeSingle();

  const isDemoSession = session.teacher_id === "d3300000-0000-4000-8000-000000000001";
  const isOwner = session.teacher_id === user.id;
  const isTeacher = profile?.role === "teacher";
  const isSameInstitutionAdmin =
    (profile?.role === "institution_admin" || profile?.role === "super_admin") &&
    (!session.institution_id || !profile.institution_id || profile.institution_id === session.institution_id);

  if (!isOwner && !isDemoSession && !isSameInstitutionAdmin) {
    redirect("/unauthorized");
  }

  if (session.status === "in_progress") redirect(`/session/live/${id}`);

  const { data: report } = await db
    .from("reports")
    .select("summary_ar, session_signal_ar, strengths, weaknesses, recommendations, evidence_moments, framework_scores, share_token")
    .eq("session_id", id)
    .single();

  const { data: events } = await db
    .from("session_events")
    .select("id, event_type, actor, content, occurred_at_ms, audio_url, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  const { data: personaRows } = await db.from("student_personas").select("id, name");
  const personaNameById = new Map((personaRows ?? []).map((p) => [p.id, p.name]));

  const sortedEvents = [...(events ?? [])].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    if (a.occurred_at_ms !== b.occurred_at_ms && Math.abs(a.occurred_at_ms - b.occurred_at_ms) > 5) {
      return a.occurred_at_ms - b.occurred_at_ms;
    }
    if (a.event_type === "teacher_utterance" && b.event_type !== "teacher_utterance") return -1;
    if (b.event_type === "teacher_utterance" && a.event_type !== "teacher_utterance") return 1;
    return 0;
  });

  const rawTranscript = sortedEvents.filter(
    (e) => e.event_type === "teacher_utterance" || e.event_type === "student_response"
  );

  let cumulativeTimeMs = 0;
  const transcript = rawTranscript.map((e, idx) => {
    let ts = typeof e.occurred_at_ms === "number" && e.occurred_at_ms > 0 ? e.occurred_at_ms : 0;
    if (ts <= cumulativeTimeMs && idx > 0) {
      ts = cumulativeTimeMs + 2500;
    }
    cumulativeTimeMs = Math.max(cumulativeTimeMs, ts);

    return {
      id: e.id,
      speaker: e.actor === "teacher" ? (lang === "en" ? "Teacher" : "المعلم") : personaNameById.get(e.actor) ?? e.actor,
      content: e.content,
      timestampMs: ts,
      isTeacher: e.actor === "teacher",
      audioUrl: e.audio_url as string | null | undefined,
    };
  });

  const evidenceMoments = (
    (report?.evidence_moments as { label: string; timestamp_ms: number; event_id: string }[] | null) ?? []
  ).map((m) => ({ eventId: m.event_id, label: m.label, timestampMs: m.timestamp_ms }));

  if (!report) {
    return (
      <div className="min-h-screen bg-[#F6F0E4] dark:bg-[#05142B] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-white/5 rounded-3xl p-8 max-w-md w-full shadow-lg text-center space-y-4">
          <h2 className="text-xl font-bold text-[#071B3A] dark:text-white">
            {lang === "ar" ? "لم يتم توليد التقرير بعد" : "Report not generated yet"}
          </h2>
          <p className="text-xs text-[#071B3A]/60 dark:text-white/60">
            {lang === "ar"
              ? "يمكنك توليد التقرير التحليلي الآن بناءً على قياسات الجلسة المسجلة."
              : "Generate the analytical report from recorded session metrics."}
          </p>
          <RegenerateReportButton sessionId={session.id} />
        </div>
      </div>
    );
  }

  return (
    <ReportClient
      session={{
        id: session.id,
        overall_score: session.overall_score,
        teacher_talk_ratio: session.teacher_talk_ratio,
        socratic_question_rate: session.socratic_question_rate,
        inclusivity_index: session.inclusivity_index,
        classroom_pattern: session.classroom_pattern,
        duration_minutes: session.duration_minutes ?? 5,
        started_at: session.started_at,
      }}
      report={report}
      transcript={transcript}
      evidenceMoments={evidenceMoments}
      lang={lang}
    />
  );
}
