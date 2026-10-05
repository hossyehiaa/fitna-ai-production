import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  computeTeacherTalkRatio,
  computeSocraticQuestionRate,
  computeInclusivityIndex,
  computeOverallScore,
  computeClassroomPattern,
} from "@/lib/metrics/compute";
import { generateSessionReport } from "@/lib/ai/report";

export const runtime = "nodejs";

/**
 * "End Simulation" (spec Stage 6 close-out): marks the session
 * completed and computes every headline metric for real, from the
 * events actually logged during the session — the same computation
 * used for the live HUD, just run one final time on the full transcript.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handleEnd(request, params);
  } catch (err) {
    console.error("Ending session failed:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنهاء الجلسة. يُرجى المحاولة مرة أخرى." }, { status: 500 });
  }
}

async function handleEnd(request: NextRequest, params: Promise<{ id: string }>) {
  const { id: sessionId } = await params;

  let bodyJson: { liveTeacherTalkRatio?: number } | null = null;
  try {
    bodyJson = await request.json();
  } catch {}

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const { data: session } = await supabase
    .from("sessions")
    .select("id, teacher_id, status, started_at, duration_minutes, lesson_context")
    .eq("id", sessionId)
    .single();

  if (!session || session.teacher_id !== user.id) {
    return NextResponse.json({ error: "لا تملك صلاحية الوصول إلى هذه الجلسة" }, { status: 403 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json({ error: "انتهت هذه الجلسة بالفعل" }, { status: 400 });
  }

  const { data: events } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const { count: studentCount } = await supabase
    .from("session_students")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  const allEvents = events ?? [];
  const totalElapsedMs = allEvents.length
    ? Math.max(...allEvents.map((e) => e.occurred_at_ms))
    : session.duration_minutes * 60 * 1000;

  const computedRatio = computeTeacherTalkRatio(allEvents, totalElapsedMs);
  const teacherTalkRatio =
    typeof bodyJson?.liveTeacherTalkRatio === "number" && bodyJson.liveTeacherTalkRatio > 0
      ? bodyJson.liveTeacherTalkRatio
      : computedRatio;
  const socraticQuestionRate = computeSocraticQuestionRate(allEvents);
  const inclusivityIndex = computeInclusivityIndex(allEvents, studentCount ?? 0);
  const overallScore = computeOverallScore({
    teacherTalkRatio,
    socraticQuestionRate,
    inclusivityIndex,
  });
  const classroomPattern = computeClassroomPattern(allEvents, inclusivityIndex);

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      overall_score: overallScore,
      teacher_talk_ratio: teacherTalkRatio,
      socratic_question_rate: socraticQuestionRate,
      inclusivity_index: inclusivityIndex,
      classroom_pattern: classroomPattern,
    })
    .eq("id", sessionId);

  if (updateError) {
    console.error("Failed to finalize session:", updateError);
    return NextResponse.json({ error: "حدث خطأ أثناء إنهاء الجلسة" }, { status: 500 });
  }

  // Badge unlock checks (spec Stage 3 / FR-46): real code-defined conditions
  // evaluated against this session's real metrics and history.
  const badgesToAward: string[] = [];

  // 1. Socrates Incarnate: Socratic rate > 80%
  if (socraticQuestionRate > 80) {
    badgesToAward.push("socrates_incarnate");
  }

  // 2. Master Listener: Teacher talk ratio between 25% and 50%
  if (teacherTalkRatio >= 25 && teacherTalkRatio <= 50) {
    badgesToAward.push("master_listener");
  }

  // 3. Inclusive Educator: 100% inclusivity
  if (inclusivityIndex === 100) {
    badgesToAward.push("inclusive_educator");
  }

  // 4. Classroom Captain: Overall score >= 90
  if (overallScore >= 90) {
    badgesToAward.push("classroom_captain");
  }

  // Check total completed sessions for milestone badges
  const { count: totalCompletedSessions } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", user.id)
    .eq("status", "completed");

  const completedCount = totalCompletedSessions ?? 1;

  // 5. Pioneer Teacher: Completed at least 1 session
  if (completedCount >= 1) {
    badgesToAward.push("pioneer_teacher");
  }

  // 6. Streak Master: Completed 3 or more sessions
  if (completedCount >= 3) {
    badgesToAward.push("streak_master");
  }

  const adminClient = createAdminClient();
  for (const badgeKey of badgesToAward) {
    await adminClient
      .from("badges")
      .upsert(
        { user_id: user.id, badge_key: badgeKey, session_id: sessionId },
        { onConflict: "user_id,badge_key", ignoreDuplicates: true }
      );
  }

  // Real LLM report generation (spec Stage 7): reads the actual
  // transcript once, here, right when the session truly ends — a
  // single source of truth instead of regenerating on every report
  // page view (which would also make repeated visits non-deterministic
  // and burn Groq quota for no reason).
  const { data: personaRows } = await supabase.from("student_personas").select("id, name");
  const personaNameById = new Map((personaRows ?? []).map((p) => [p.id, p.name]));

  try {
    const report = await generateSessionReport({
      events: allEvents,
      personaNameById,
      metrics: { overallScore, teacherTalkRatio, socraticQuestionRate, inclusivityIndex, classroomPattern },
      lessonContext: session.lesson_context,
    });

    // Save report using existing adminClient
    const basePayload = {
      session_id: sessionId,
      summary_ar: report.summaryAr,
      session_signal_ar: report.sessionSignalAr,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      recommendations: report.recommendations,
      evidence_moments: report.evidenceMoments.map((m) => ({
        label: m.label,
        timestamp_ms: m.timestampMs,
        event_id: m.eventId,
      })),
    };

    const { error: reportError } = await adminClient.from("reports").insert({
      ...basePayload,
      framework_scores: report.frameworkScores,
    });

    if (reportError) {
      console.warn("Retrying report insert without framework_scores (migration fallback):", reportError);
      const { error: fallbackError } = await adminClient.from("reports").insert(basePayload);
      if (fallbackError) {
        console.error("Failed to save generated report completely:", fallbackError);
      }
    }
  } catch (err) {
    console.error("Report generation failed:", err);
  }

  return NextResponse.json({
    overallScore,
    teacherTalkRatio,
    socraticQuestionRate,
    inclusivityIndex,
    classroomPattern,
  });
}
