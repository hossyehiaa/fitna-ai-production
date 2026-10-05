import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateSessionReport } from "@/lib/ai/report";

export const runtime = "nodejs";

/**
 * Regenerates the AI narrative for an already-completed session.
 * Uses admin client for guaranteed persistence and gracefully handles
 * databases where the optional framework_scores column is not yet migrated.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

    const { data: session } = await supabase
      .from("sessions")
      .select(
        "id, teacher_id, status, lesson_context, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, classroom_pattern"
      )
      .eq("id", sessionId)
      .single();

    if (!session || session.teacher_id !== user.id) {
      return NextResponse.json({ error: "الجلسة دي مش بتاعتك" }, { status: 403 });
    }
    if (session.status !== "completed") {
      return NextResponse.json({ error: "الجلسة دي لسه مخلّصتش" }, { status: 400 });
    }

    const { data: events } = await supabase
      .from("session_events")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const { data: personaRows } = await supabase.from("student_personas").select("id, name");
    const personaNameById = new Map((personaRows ?? []).map((p) => [p.id, p.name]));

    const report = await generateSessionReport({
      events: events ?? [],
      personaNameById,
      metrics: {
        overallScore: session.overall_score ?? 0,
        teacherTalkRatio: session.teacher_talk_ratio ?? 0,
        socraticQuestionRate: session.socratic_question_rate ?? 0,
        inclusivityIndex: session.inclusivity_index ?? 0,
        classroomPattern: session.classroom_pattern ?? "balanced",
      },
      lessonContext: session.lesson_context,
    });

    const adminClient = createAdminClient();

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

    // Try saving with framework_scores
    const { error: reportError } = await adminClient.from("reports").upsert(
      {
        ...basePayload,
        framework_scores: report.frameworkScores,
      },
      { onConflict: "session_id" }
    );

    if (reportError) {
      console.warn("Retrying report save without framework_scores (migration check):", reportError);
      // Fallback in case framework_scores column is not yet migrated in Postgres
      const { error: fallbackError } = await adminClient.from("reports").upsert(
        basePayload,
        { onConflict: "session_id" }
      );

      if (fallbackError) {
        console.error("Report regeneration save failed completely:", fallbackError);
        return NextResponse.json(
          { error: `حصل خطأ أثناء حفظ التقرير: ${fallbackError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Report regeneration crashed:", err);
    return NextResponse.json({ error: "حصل خطأ أثناء توليد التقرير. جرب تاني." }, { status: 500 });
  }
}
