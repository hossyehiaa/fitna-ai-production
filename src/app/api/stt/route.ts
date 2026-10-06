import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transcribeTeacherAudio } from "@/lib/ai/stt";

export const runtime = "nodejs";

/**
 * Real Speech-to-Text via Groq's whisper-large-v3-turbo.
 *
 * The transcription logic itself lives in src/lib/ai/stt.ts so the
 * low-latency streaming turn route can run Whisper INLINE (one request:
 * audio → transcript → routing → LLM → TTS). This standalone route keeps
 * serving the classic turn path unchanged.
 *
 * GET = warmup ping (auth + Groq TLS): fired by the live room when the
 * microphone opens so the function is hot BEFORE the teacher stops
 * talking (latency: the STT hop sits on time-to-first-audio whenever
 * the browser SpeechRecognition path is unavailable).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  // Warm the outbound TLS pool to Groq so the first real transcription
  // skips the handshake (a bare HEAD is enough to open the connection).
  if (process.env.GROQ_API_KEY) {
    fetch("https://api.groq.com/", { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
  return NextResponse.json({ ok: true, warmed: true });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "لا يوجد تسجيل صوتي" }, { status: 400 });
  }

  const lessonContext = formData.get("lessonContext");
  const dialect = formData.get("dialect");
  const language = formData.get("language");

  const buf = Buffer.from(await audio.arrayBuffer());
  const outcome = await transcribeTeacherAudio(
    { buffer: buf, name: audio.name, type: audio.type },
    {
      lessonContext: typeof lessonContext === "string" ? lessonContext : null,
      dialect: typeof dialect === "string" ? dialect : null,
      language: typeof language === "string" ? language : null,
    }
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  return NextResponse.json({ text: outcome.text });
}
