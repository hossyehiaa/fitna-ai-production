import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attach the teacher's real microphone recording to the just-persisted
 * teacher_utterance event — AFTER the turn already streamed its first
 * audio, so this upload never sits on the time-to-first-audio path.
 *
 * Called by the live room right after the stream's `persisted` event
 * (fire-and-forget with keepalive). The report/history playback reads
 * session_events.audio_url exactly as before.
 *
 * Body: { audioBase64: string (data URL), teacherEventId?: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

    const { data: session } = await supabase
      .from("sessions")
      .select("id, teacher_id, status")
      .eq("id", sessionId)
      .single();
    if (!session || session.teacher_id !== user.id) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول إلى هذه الجلسة" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { audioBase64, teacherEventId } = body as { audioBase64?: string; teacherEventId?: string };
    if (!audioBase64 || typeof audioBase64 !== "string" || !audioBase64.startsWith("data:audio")) {
      return NextResponse.json({ error: "صيغة الصوت غير صالحة" }, { status: 400 });
    }
    // Bound the payload (defensive — a short utterance at 128kbps is ~1MB max).
    if (audioBase64.length > 8_000_000) {
      return NextResponse.json({ error: "حجم التسجيل كبير جدًا" }, { status: 413 });
    }

    // Resolve the target event: the id handed over by the stream when
    // possible, otherwise the latest teacher utterance in this session.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let targetId: string | null = typeof teacherEventId === "string" ? teacherEventId : null;
    if (!targetId) {
      const { data: latest } = await supabase
        .from("session_events")
        .select("id")
        .eq("session_id", sessionId)
        .eq("event_type", "teacher_utterance")
        .order("occurred_at_ms", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetId = (latest as { id?: string } | null)?.id ?? null;
    } else {
      // Verify the referenced event really belongs to this session.
      const { data: row } = await supabase
        .from("session_events")
        .select("id, session_id")
        .eq("id", targetId)
        .maybeSingle();
      const evt = row as { id?: string; session_id?: string } | null;
      if (!evt || evt.session_id !== sessionId) {
        return NextResponse.json({ error: "حدث غير موجود في هذه الجلسة" }, { status: 404 });
      }
    }
    if (!targetId) {
      return NextResponse.json({ error: "لا يوجد حديث معلم لحفظ الصوت معه" }, { status: 404 });
    }

    // Ownership was verified against the session row above — the admin
    // client performs the single-column write.
    const admin = createAdminClient();
    const { error } = await admin.from("session_events").update({ audio_url: audioBase64 }).eq("id", targetId);
    if (error) {
      console.error("Attach teacher audio failed:", error);
      return NextResponse.json({ error: "تعذّر حفظ تسجيل الصوت" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Attach teacher audio route failed:", err);
    return NextResponse.json({ error: "تعذّر حفظ تسجيل الصوت" }, { status: 500 });
  }
}
