import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, type AuthUserRow } from "@/lib/auth/session";
import { toShimUser, type ShimUser } from "@/lib/supabase/shim";
import {
  classifyTeacherUtterance,
  buildTurnPlan,
  ritualFastReply,
  sanitizeStudentResponse,
  generateStudentReactions,
  type TurnPlanParams,
  type QuestionType,
} from "@/lib/ai/turn";
import { callGroqStreamWithFallback, preloadGroqModels, groqErrorSignature } from "@/lib/ai/groq";
import { buildCandidateStudentPrompt } from "@/lib/ai/personas";
import { normalizeSpeechTranscription } from "@/lib/audio/speechNormalizer";
import { synthesizeStudentSpeech, synthesizeStudentSpeechStreaming, type PersonaVoice } from "@/app/api/tts/route";
import { parseDialect } from "@/lib/ai/dialects";
import { resolveTargetCharacter, explicitTargetFromUtterance } from "@/lib/ai/speakerRouting";
import { createSentenceChunker, createJsonTextFieldExtractor } from "@/lib/ai/streamChunker";
import { transcribeTeacherAudio } from "@/lib/ai/stt";
import { db as prismaDb } from "@/lib/db";
import type { StudentPhysicalAction } from "@/lib/simulation/classroomState";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------
// INSTANCE-BOOT WARMING (latency): open the Neon pool + upstream TLS the
// moment a cold serverless instance loads this module — BEFORE any
// request arrives. Without this, the first request on a cold instance
// pays the full Prisma/Neon TLS handshake chain (~800ms from fra1) plus
// the Fish/Groq TLS handshakes inline on the critical path.
// (warmUpstreamConnections is a hoisted function declaration below.)
// ---------------------------------------------------------------------
if (process.env.DATABASE_URL) {
  void prismaDb.$queryRaw`SELECT 1`.catch(() => {});
}
warmUpstreamConnections();

type Persona = Database["public"]["Tables"]["student_personas"]["Row"];

// =====================================================================
// LOW-LATENCY STREAMING TURN PIPELINE.
//
// Same classroom decision logic as /api/sessions/[id]/turn (buildTurnPlan
// is shared), but every stage that can overlap DOES overlap:
//
//   auth ─┬─ parallel DB batch (students+profile+events, capped)
//         ├─ classify LLM fired async (needed only before persistence)
//         ├─ routing + turn plan (CPU)
//         ├─ Groq LLM *streamed* token-by-token
//         │     └─ first sentence cut → Fish TTS chunk 0 immediately
//         │           └─ audio event flushed to the client → PLAYBACK
//         ├─ remaining TTS chunks overlap the LLM tail + playback
//         └─ DB persistence starts only AFTER the first audio is out
//
// The response is an NDJSON event stream:
//   {type:"stage"}    — per-stage latency ticks
//   {type:"meta"}     — speaker routing resolution
//   {type:"students"} — card state updates (before audio, cards animate)
//   {type:"speech"}   — a student's complete reply text (chat log)
//   {type:"audio"}    — one base64 MP3 chunk (play immediately)
//   {type:"persisted"}— teacher event stored (client attaches mic audio)
//   {type:"done"}     — questionType + full per-stage latency block
//   {type:"error"}    — explicit MSA failure (never a silent turn)
// =====================================================================

/** Persona rows are immutable character identities — cache per roster. */
const personaCache = new Map<string, { at: number; rows: Persona[] }>();
const PERSONA_CACHE_TTL_MS = 10 * 60_000;

/** Cap the history scan — O(1) per turn instead of the full event table. */
const EVENTS_CAP = 150;

// ---------------------------------------------------------------------
// LATENCY CACHES (per serverless instance).
//
// authUserCache: fitna_session token → user row (TTL 120s). The warmup
// GET primes it at room-open, so the POST's auth hop becomes a memory
// read instead of a Neon round trip on the critical path. Logout
// invalidates the DB session; the cache honors it within ≤120s.
//
// waveCache: sessionId → {session, students, profile, events} (TTL 10s).
// Primed by the warmup GET and refreshed right after each turn's own
// persistence, so the parallel DB wave collapses to a memory read on
// every real turn (the write is always followed by a refresh).
// ---------------------------------------------------------------------
const authUserCache = new Map<string, { row: AuthUserRow; shim: ShimUser; at: number }>();
const AUTH_CACHE_TTL_MS = 120_000;

type WaveRow = {
  session: {
    id: string;
    teacher_id: string;
    status: string;
    lesson_context: string | null;
    started_at: string | null;
    dialect: string | null;
  };
  sessionStudents: { id: string; persona_id: string; final_attention: number | null; times_spoken: number | null }[];
  teacherFullName: string;
  events: {
    actor: string | null;
    content: string | null;
    event_type: string;
    metadata: unknown;
    occurred_at_ms: number | null;
  }[]; // DESCENDING (newest first) — mirrors the uncapped query order
  at: number;
  fetchMs: number; // 0 on cache hit; real DB wave duration on a miss
};
const waveCache = new Map<string, WaveRow>();
const WAVE_CACHE_TTL_MS = 10_000;

/** Extract the session token straight off the request cookie (no DB). */
function sessionToken(request: NextRequest): string {
  return request.cookies.get("fitna_session")?.value ?? "";
}

/** Cached auth: token → {row, shim}. Full DB verification on cache miss;
 *  the row feeds createClient({user}) so the shim NEVER re-queries Neon. */
async function getUserCached(request: NextRequest): Promise<{ row: AuthUserRow; shim: ShimUser } | null> {
  const token = sessionToken(request);
  if (token) {
    const hit = authUserCache.get(token);
    if (hit && Date.now() - hit.at < AUTH_CACHE_TTL_MS) return { row: hit.row, shim: hit.shim };
  }
  // getCurrentUser() reads the request-scoped cookies and verifies the
  // session token against the DB (logout-safe, expiry-checked).
  const row = await getCurrentUser();
  if (!row) return null;
  const shim = toShimUser(row);
  if (token) {
    authUserCache.set(token, { row, shim, at: Date.now() });
    if (authUserCache.size > 512) {
      const first = authUserCache.keys().next().value as string;
      authUserCache.delete(first);
    }
  }
  return { row, shim };
}

/** The ownership-gated parallel DB wave, cached per session. */
async function getWave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string
): Promise<WaveRow | null> {
  const cached = waveCache.get(sessionId);
  if (cached && Date.now() - cached.at < WAVE_CACHE_TTL_MS) {
    return cached;
  }
  const tWave = Date.now();
  const [sessionRes, studentsRes, profileRes, eventsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, teacher_id, status, lesson_context, started_at, dialect")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.from("session_students").select("id, persona_id, final_attention, times_spoken").eq("session_id", sessionId),
    supabase.from("users").select("full_name").eq("id", userId).single(),
    supabase
      .from("session_events")
      .select("actor, content, event_type, metadata, occurred_at_ms")
      .eq("session_id", sessionId)
      .order("occurred_at_ms", { ascending: false })
      .limit(EVENTS_CAP),
  ]);
  const session = sessionRes.data as WaveRow["session"] | null;
  if (!session || session.teacher_id !== userId) return null;
  const row: WaveRow = {
    session,
    sessionStudents: (studentsRes.data ?? []) as WaveRow["sessionStudents"],
    teacherFullName: (profileRes.data as { full_name?: string } | null)?.full_name || "",
    events: (eventsRes.data ?? []) as WaveRow["events"],
    at: Date.now(),
    fetchMs: Date.now() - tWave,
  };
  waveCache.set(sessionId, row);
  if (waveCache.size > 128) {
    const first = waveCache.keys().next().value as string;
    waveCache.delete(first);
  }
  return row;
}

/** Refresh after our own writes so the next turn reads a fresh wave. */
function refreshWave(sessionId: string, userRow: AuthUserRow) {
  waveCache.delete(sessionId);
  void (async () => {
    try {
      const supabase = await createClient({ user: userRow });
      await getWave(supabase, sessionId, userRow.id);
    } catch {}
  })();
}

const NDJSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stateLabel(state: string) {
  if (state === "hand_raised") return "رفع يده";
  if (state === "distracted") return "تشتّت";
  return "منتبه";
}

/** Warm outbound TLS pools (Fish + Groq) so the first real call skips handshakes.
 * Also primes the Groq model-discovery cache so chain resolution (which
 * auto-migrates across model deprecations) costs nothing on the first turn. */
function warmUpstreamConnections() {
  const warm = (url: string) => {
    fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(() => {});
  };
  if (process.env.FISH_AUDIO_API_KEY) warm("https://api.fish.audio/");
  if (process.env.GROQ_API_KEY) {
    warm("https://api.groq.com/");
    void preloadGroqModels();
  }
}

// GET — warmup ping. The live room fires this on mount so the function,
// the Prisma/Neon connection, the auth token cache, the session's DB wave
// AND the upstream TLS pools are hot BEFORE the teacher ever finishes a
// sentence.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const auth = await getUserCached(request);
  if (!auth) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  // {user} skips createClient's own getCurrentUser() DB round trip.
  const supabase = await createClient({ user: auth.row });
  const wave = await getWave(supabase, sessionId, auth.row.id);
  if (!wave) {
    return NextResponse.json({ error: "لا تملك صلاحية الوصول إلى هذه الجلسة" }, { status: 403 });
  }

  // Prime the persona module cache too (roster is immutable).
  const personaIds = wave.sessionStudents.map((s) => s.persona_id);
  const cacheKey = [...personaIds].sort().join(",");
  const cached = personaCache.get(cacheKey);
  if (!cached || Date.now() - cached.at >= PERSONA_CACHE_TTL_MS) {
    if (personaIds.length > 0) {
      const { data: personaRows } = await supabase.from("student_personas").select("*").in("id", personaIds);
      personaCache.set(cacheKey, { at: Date.now(), rows: (personaRows as Persona[]) ?? [] });
    }
  }

  warmUpstreamConnections();
  return NextResponse.json({ ok: true, warmed: true, status: wave.session.status });
}

// ---------------------------------------------------------------------
// POST — one streaming turn.
//
// Body is EITHER:
//   application/json        { teacherText, elapsedMs, speechDurationMs, voiceGender }
//   multipart/form-data     audio=<blob>, lessonContext, dialect, language,
//                           elapsedMs, speechDurationMs, voiceGender
//                           → Whisper STT runs INLINE inside this request:
//                           the browser skips the separate /api/stt round
//                           trip entirely (latency: that hop sat on the
//                           time-to-first-audio path for every teacher
//                           whose browser has no SpeechRecognition).
// ---------------------------------------------------------------------
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id: sessionId } = await params;
  const auth = await getUserCached(request);
  if (!auth) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  const user = auth.shim;
  const tAuth = Date.now();

  // ---- Parse the request body (JSON text OR multipart audio) ----
  let inputTeacherText = "";
  let elapsedMs: number | undefined;
  let speechDurationMs: number | undefined;
  let voiceGender: "male" | "female" | null | undefined;
  let audioFile: { buffer: Buffer; name?: string; type?: string } | null = null;
  let sttOpts: { lessonContext?: string | null; dialect?: string | null; language?: string | null } = {};
  const ctype = request.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    const form = await request.formData();
    const f = form.get("audio");
    if (f instanceof File && f.size > 0) {
      audioFile = { buffer: Buffer.from(await f.arrayBuffer()), name: f.name, type: f.type };
    }
    inputTeacherText = String(form.get("teacherText") || "");
    const e = Number(form.get("elapsedMs") || 0);
    const s = Number(form.get("speechDurationMs") || 0);
    elapsedMs = Number.isFinite(e) ? e : undefined;
    speechDurationMs = Number.isFinite(s) ? s : undefined;
    const vg = String(form.get("voiceGender") || "");
    voiceGender = vg === "male" || vg === "female" ? vg : null;
    sttOpts = {
      lessonContext: String(form.get("lessonContext") || "") || null,
      dialect: String(form.get("dialect") || "") || null,
      language: String(form.get("language") || "") || null,
    };
  } else {
    const body = await request.json().catch(() => ({}));
    const b = body as {
      teacherText?: string;
      elapsedMs?: number;
      speechDurationMs?: number;
      voiceGender?: "male" | "female" | null;
    };
    inputTeacherText = b.teacherText || "";
    elapsedMs = b.elapsedMs;
    speechDurationMs = b.speechDurationMs;
    voiceGender = b.voiceGender;
  }

  let teacherText = normalizeSpeechTranscription((inputTeacherText || "").trim());
  const tParse = Date.now();

  // ---- LATENCY: inline Whisper STT runs IN PARALLEL with the DB wave ----
  // {user} = the auth-cache row: createClient skips its own DB lookup.
  const supabase = await createClient({ user: auth.row });
  const wavePromise = getWave(supabase, sessionId, user.id);
  const sttPromise: Promise<{ text: string | null; error: string | null; ms: number } | null> = audioFile
    ? (async () => {
        const ts = Date.now();
        const outcome = await transcribeTeacherAudio(audioFile!, sttOpts);
        return { text: outcome.ok ? outcome.text : null, error: outcome.ok ? null : outcome.error, ms: Date.now() - ts };
      })()
    : Promise.resolve(null);

  const wave = await wavePromise;
  if (!wave) {
    return NextResponse.json({ error: "لا تملك صلاحية الوصول إلى هذه الجلسة" }, { status: 403 });
  }
  if (wave.session.status !== "in_progress") {
    return NextResponse.json({ error: "انتهت هذه الجلسة بالفعل" }, { status: 400 });
  }
  const sttResult = await sttPromise;
  if (!teacherText && audioFile) {
    if (sttResult?.text) {
      teacherText = normalizeSpeechTranscription(sttResult.text);
    } else {
      // Whisper heard nothing usable — explicit MSA retry state, never silent.
      const err = sttResult?.error || "تعذّر فهم الصوت. يُرجى المحاولة مرة أخرى.";
      return NextResponse.json({ error: err }, { status: 400 });
    }
  }
  if (!teacherText) {
    return NextResponse.json({ error: "لم يتم التقاط أي كلام" }, { status: 400 });
  }

  const classifyPromise = classifyTeacherUtterance(teacherText).catch(() => "statement" as QuestionType);

  const session = wave.session;
  const sessionStudents = wave.sessionStudents;
  const teacherFullName =
    wave.teacherFullName ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user as any).user_metadata?.full_name ||
    user.email ||
    "";
  const waveEvents = wave.events;

  // Personas: immutable character identities → module cache.
  const tPersonas = Date.now();
  const personaIds = sessionStudents.map((s) => s.persona_id);
  const cacheKey = [...personaIds].sort().join(",");
  let personas: Persona[] = [];
  const cached = personaCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PERSONA_CACHE_TTL_MS) {
    personas = cached.rows;
  } else if (personaIds.length > 0) {
    const { data: personaRows } = await supabase.from("student_personas").select("*").in("id", personaIds);
    personas = (personaRows as Persona[]) ?? [];
    personaCache.set(cacheKey, { at: Date.now(), rows: personas });
    if (personaCache.size > 32) {
      const firstKey = personaCache.keys().next().value as string;
      personaCache.delete(firstKey);
    }
  }
  const personasMs = Date.now() - tPersonas;
  const tDb = Date.now();
  const dbMs = tDb - tParse; // wave + stt-wait + personas (overlapped stages)

  const encoder = new TextEncoder();
  const abortSignal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true; // client disconnected (barge-in abort)
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L: Record<string, any> = {};
      L.authMs = tAuth - t0;
      L.parseMs = tParse - tAuth; // request-body read (multipart upload)
      L.dbMs = dbMs;
      L.personasMs = personasMs;
      L.waveCached = wave.at > t0 - WAVE_CACHE_TTL_MS && wave.at < t0; // cache hit on this turn
      L.waveFetchMs = wave.fetchMs;
      L.sttMs = sttResult?.ms ?? null;

      // The teacher's confirmed transcript goes out FIRST (banner + chat)
      // — for the inline-STT (multipart) path this is the moment the
      // browser learns what Whisper heard.
      send({ type: "transcript", text: teacherText, viaInlineStt: Boolean(audioFile) });

      try {
        // -----------------------------------------------------------
        // Memory structures (mirror of the legacy route, capped input).
        // -----------------------------------------------------------
        const chronologicalEvents = [...waveEvents].reverse() as Array<{
          actor: string | null;
          content: string | null;
          event_type: string;
          metadata: unknown;
          occurred_at_ms: number | null;
        }>;
        const descendingEvents = [...chronologicalEvents].reverse();

        const personaNameById = new Map(personas.map((p) => [p.id as string, p.name as string]));
        const fullLessonHistory = chronologicalEvents
          .filter((e) => e.event_type === "teacher_utterance" || e.event_type === "student_response")
          .map((e) => `${e.actor === "teacher" ? "المعلم" : personaNameById.get(e.actor as string) ?? e.actor}: ${e.content}`)
          .join("\n");
        const recentHistory = chronologicalEvents
          .slice(-25)
          .filter((e) => e.event_type === "teacher_utterance" || e.event_type === "student_response")
          .map((e) => `${e.actor === "teacher" ? "المعلم" : personaNameById.get(e.actor as string) ?? e.actor}: ${e.content}`)
          .join("\n");
        const teacherExplanations = chronologicalEvents
          .filter((e) => e.event_type === "teacher_utterance")
          .map((e) => (e.content ?? "").trim())
          .filter((txt) => txt.length > 5);
        const studentContributions: Record<string, string[]> = {};
        for (const p of personas) {
          studentContributions[p.name] = chronologicalEvents
            .filter((e) => e.event_type === "student_response" && e.actor === p.id)
            .map((e) => (e.content ?? "").trim());
        }

        const studentsWithHandRaised: string[] = [];
        const lastPhysicalActions: Record<string, StudentPhysicalAction> = {};
        for (const e of descendingEvents) {
          if (e.event_type === "state_change" && e.actor && !lastPhysicalActions[e.actor]) {
            const meta = e.metadata as { physical_action?: StudentPhysicalAction } | null;
            if (meta?.physical_action) {
              lastPhysicalActions[e.actor] = meta.physical_action;
              if (meta.physical_action === "hand_raised") {
                const sName = personaNameById.get(e.actor);
                if (sName && !studentsWithHandRaised.includes(sName)) studentsWithHandRaised.push(sName);
              }
            }
          }
        }

        const greetingCompleted = descendingEvents.some(
          (e) =>
            e.event_type === "student_response" &&
            /وعليكم\s*السلام|صباح\s*الخير|مساء\s*الخير|أهلاً\s*يا\s*ميس|اهلا\s*يا\s*ميس|أهلاً\s*يا\s*مستر|اهلا\s*يا\s*مستر/i.test(
              e.content ?? ""
            )
        );

        const lastTeacherEvent = descendingEvents.find((e) => e.event_type === "teacher_utterance");
        const lastTeacherUtterance = lastTeacherEvent ? lastTeacherEvent.content : null;

        // Server-side idempotency guard (same window as the legacy route).
        if (lastTeacherEvent) {
          const cleanLast = (lastTeacherEvent.content || "").replace(/[\s\p{P}]+/gu, "").toLowerCase();
          const cleanCurrent = teacherText.replace(/[\s\p{P}]+/gu, "").toLowerCase();
          const lastOccurredMs = lastTeacherEvent.occurred_at_ms ?? 0;
          if (cleanLast && cleanCurrent && cleanLast === cleanCurrent && Math.abs((elapsedMs ?? 0) - lastOccurredMs) < 4000) {
            send({ type: "deduplicated" });
            send({ type: "done", questionType: "statement", latency: { deduplicated: true, authMs: L.authMs, dbMs: L.dbMs } });
            return;
          }
        }

        const currentAttention: Record<string, number> = {};
        const timesSpoken: Record<string, number> = {};
        for (const s of sessionStudents) {
          const persona = personas.find((p) => p.id === s.persona_id);
          currentAttention[s.persona_id] = s.final_attention ?? persona?.base_attention ?? 70;
          timesSpoken[s.persona_id] = s.times_spoken ?? 0;
        }

        const lastStudentEvent = descendingEvents.find((e) => e.event_type === "student_response");
        const lastSpeakingPersonaId = lastStudentEvent ? (lastStudentEvent.actor as string | null) : null;
        const lastSpeakingStudentName = lastStudentEvent ? personaNameById.get(lastStudentEvent.actor as string) ?? null : null;
        const recentSpeakerPersonaIds = descendingEvents
          .filter((e) => e.event_type === "student_response")
          .map((e) => e.actor as string)
          .filter((a): a is string => Boolean(a))
          .slice(0, 3);
        const turnIndex = descendingEvents.filter((e) => e.event_type === "teacher_utterance").length + 1;

        // Teacher gender + locked title (mirror of the legacy route).
        let effectiveVoiceGender = voiceGender ?? null;
        if (!effectiveVoiceGender) {
          for (const e of descendingEvents) {
            if (e.event_type === "teacher_utterance") {
              const meta = e.metadata as { voice_gender?: "male" | "female" } | null;
              if (meta?.voice_gender) {
                effectiveVoiceGender = meta.voice_gender;
                break;
              }
            }
          }
        }
        let lockedTeacherTitle: string | null = null;
        for (const e of chronologicalEvents) {
          if (e.event_type === "session_config" && e.metadata) {
            const meta = e.metadata as { teacher_title?: string; full_teacher_title?: string };
            if (meta.full_teacher_title) {
              lockedTeacherTitle = meta.full_teacher_title;
              break;
            } else if (meta.teacher_title) {
              lockedTeacherTitle = meta.teacher_title;
              break;
            }
          }
        }
        if (!lockedTeacherTitle) {
          for (const e of descendingEvents) {
            const meta = e.metadata as { teacher_title?: string; full_teacher_title?: string } | null;
            if (meta?.full_teacher_title) {
              lockedTeacherTitle = meta.full_teacher_title;
              break;
            } else if (meta?.teacher_title) {
              lockedTeacherTitle = meta.teacher_title;
              break;
            }
          }
        }
        const isFemaleSelf =
          /(?:أنا|انا)\s*(?:مش|غير)\s*(?:مستر|استاذ|أستاذ)|(?:أنا|انا)\s*(?:ميس|مس|معلمة|استاذة|أستاذة)/i.test(teacherText);
        const isMaleSelf =
          /(?:أنا|انا)\s*(?:مش|غير)\s*(?:ميس|مس|ابلة|أبلة)|(?:أنا|انا)\s*(?:مستر|استاذ|أستاذ|معلم)/i.test(teacherText);
        if (isFemaleSelf) lockedTeacherTitle = "يا ميس";
        else if (isMaleSelf) lockedTeacherTitle = "يا مستر";
        else if (!lockedTeacherTitle) {
          if (effectiveVoiceGender === "female") lockedTeacherTitle = "يا ميس";
          else if (effectiveVoiceGender === "male") lockedTeacherTitle = "يا مستر";
          else {
            const isFemaleName =
              /(?:مريم|سارة|فاطمة|نور|منى|هدى|رنا|ياسمين|اية|آية|اماني|أماني|ايمان|إيمان|سلمى|ندى|ريم|شهد|حنين|ملك|ملاك|هاجر|إسراء|اسراء|دعاء|سمر|وفاء|زينب|عائشة|خديجة|maryam|mariam|sara|sarah|fatima|nour)/i.test(
                teacherFullName || ""
              );
            lockedTeacherTitle = isFemaleName ? "يا ميس" : "يا مستر";
          }
        }
        const resolvedUnknownNames: string[] = [];
        for (const e of chronologicalEvents) {
          if (e.event_type === "student_response") {
            const m = (e.content ?? "").match(/مين\s+([^\s.,?!،؛:]+)\s+يا\s+(?:ميس|مستر)/);
            if (m && m[1]) resolvedUnknownNames.push(m[1].trim());
          }
        }

        // -----------------------------------------------------------
        // SPEAKER ROUTING (persistent character identities).
        // -----------------------------------------------------------
        const routingParticipants = personas.map((p) => ({
          personaId: p.id as string,
          name: p.name as string,
          characterKey: (p as { character_key?: string | null }).character_key ?? null,
          gender: (p as { gender?: string }).gender,
          hasHandRaised: studentsWithHandRaised.includes(p.name),
          timesSpoken: timesSpoken[p.id] ?? 0,
          attention: currentAttention[p.id] ?? (p as { base_attention?: number }).base_attention ?? 70,
        }));
        const routing = resolveTargetCharacter(teacherText, routingParticipants, {
          lastSpeakingPersonaId,
          recentSpeakerPersonaIds,
        });
        const explicitTarget = explicitTargetFromUtterance(teacherText, routingParticipants);
        const participantNames = routingParticipants.map((p) => p.name);
        L.routingMs = Date.now() - tDb;

        send({
          type: "meta",
          routing: {
            reason: routing.reason,
            targetPersonaId: explicitTarget ? explicitTarget.personaId : routing.targetPersonaId,
            targetCharacterKey: explicitTarget ? explicitTarget.characterKey : routing.targetCharacterKey,
            targetName: explicitTarget ? explicitTarget.name : routing.targetName,
            explicitlyAddressed: Boolean(explicitTarget),
          },
        });

        const sessionDialect = parseDialect((session as { dialect?: string } | null)?.dialect);

        // -----------------------------------------------------------
        // TURN PLAN — shared decision engine (identical to legacy).
        // -----------------------------------------------------------
        const planParams: TurnPlanParams = {
          personas,
          currentAttention,
          timesSpoken,
          lastSpeakingPersonaId,
          recentSpeakerPersonaIds,
          lastPhysicalActions,
          lastSpeakingStudentName,
          greetingCompleted,
          lastTeacherUtterance,
          lessonContext: session.lesson_context ?? null,
          teacherUtterance: teacherText,
          questionType: "statement",
          recentHistory,
          fullLessonHistory,
          teacherExplanations,
          studentContributions,
          studentsWithHandRaised,
          turnIndex,
          voiceGender: effectiveVoiceGender,
          lockedTeacherTitle,
          resolvedUnknownNames,
          teacherFullName,
          dialect: sessionDialect,
          participantNames,
        };
        const plan = buildTurnPlan(planParams);

        // Early card-state update so the classroom animates while audio
        // is still being generated.
        const candidatesSet = new Set(plan.decision.candidateSpeakers.map((c) => c.personaId));
        const studentsPayload = personas.map((p) => {
          const updated = plan.decision.updatedStudents.find((s) => s.personaId === p.id);
          const action = updated?.physicalAction ?? "attentive";
          const desc = updated?.actionDescriptionAr ?? "";
          const delta = updated?.attentionDelta ?? 0;
          const isSpeaker = candidatesSet.has(p.id);
          const newState = isSpeaker
            ? "attentive"
            : action === "hand_raised"
            ? "hand_raised"
            : action === "fidgeting" || action === "looking_away"
            ? "distracted"
            : "attentive";
          return {
            personaId: p.id,
            name: p.name,
            state: newState,
            attention: clamp((currentAttention[p.id] ?? 70) + delta, 0, 100),
            physicalAction: action,
            actionDescriptionAr: desc,
          };
        });
        send({ type: "students", students: studentsPayload });

        // -----------------------------------------------------------
        // PERSISTENCE (fires AFTER the first audio chunk is enqueued).
        // -----------------------------------------------------------
        let persistencePromise: Promise<void> | null = null;
        const speakerTexts: {
          personaId: string;
          name: string;
          text: string;
          action: string;
          desc: string;
          delta: number;
          emotion?: string;
        }[] = [];

        const persistTurn = async () => {
          const questionType = await classifyPromise;
          const serverElapsedMs = session.started_at
            ? Math.max(0, Date.now() - new Date(session.started_at).getTime())
            : 0;
          const lastEventElapsedMs =
            chronologicalEvents.length > 0 ? Math.max(...chronologicalEvents.map((e) => e.occurred_at_ms || 0)) : 0;
          const effectiveTeacherMs = Math.max(
            elapsedMs || 0,
            serverElapsedMs,
            lastEventElapsedMs > 0 ? lastEventElapsedMs + 1000 : 0
          );
          const teacherSpeechDurationMs = speechDurationMs ? Math.round(speechDurationMs * 1000) : 2500;
          const effectiveStudentMs = effectiveTeacherMs + Math.max(1200, teacherSpeechDurationMs);

          const activeStudentTitle =
            lockedTeacherTitle || (speakerTexts.find((s) => s.text.includes("يا ميس")) ? "يا ميس" : "يا مستر");

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eventsToInsert: any[] = [
            {
              session_id: sessionId,
              event_type: "teacher_utterance",
              actor: "teacher",
              content: teacherText,
              audio_url: null,
              metadata: {
                question_type: questionType,
                voice_gender: effectiveVoiceGender,
                teacher_title: activeStudentTitle,
                full_teacher_title: lockedTeacherTitle || activeStudentTitle,
                duration_ms: teacherSpeechDurationMs,
                latency: L,
                streaming: true,
              },
              occurred_at_ms: effectiveTeacherMs,
            },
          ];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updatePromises: Promise<any>[] = [];
          for (const sp of speakerTexts) {
            eventsToInsert.push({
              session_id: sessionId,
              event_type: "student_response",
              actor: sp.personaId,
              content: sp.text,
              occurred_at_ms: effectiveStudentMs,
            });
          }
          for (const p of personas) {
            const sp = speakerTexts.find((s) => s.personaId === p.id);
            const updated = plan.decision.updatedStudents.find((s) => s.personaId === p.id);
            const action = updated?.physicalAction ?? "attentive";
            const desc = updated?.actionDescriptionAr ?? `${p.name}: ${stateLabel(action)}`;
            const delta = sp ? sp.delta ?? 5 : updated?.attentionDelta ?? 0;
            eventsToInsert.push({
              session_id: sessionId,
              event_type: "state_change",
              actor: p.id,
              content: `${p.name}: ${sp?.desc || desc}`,
              metadata: {
                state: sp ? "attentive" : action === "hand_raised" ? "hand_raised" : "attentive",
                physical_action: action,
              },
              occurred_at_ms: effectiveStudentMs + 50,
            });
            const row = sessionStudents.find((s) => s.persona_id === p.id);
            if (row) {
              updatePromises.push(
                Promise.resolve(
                  supabase
                    .from("session_students")
                    .update({
                      final_attention: clamp((currentAttention[p.id] ?? 70) + delta, 0, 100),
                      times_spoken: sp ? (row.times_spoken ?? 0) + 1 : (row.times_spoken ?? 0),
                    })
                    .eq("id", row.id)
                )
              );
            }
          }

          try {
            await Promise.all([supabase.from("session_events").insert(eventsToInsert), Promise.all(updatePromises)]);
            // Hand the teacher-event row id to the client so it can attach
            // the real microphone recording off the critical path.
            const { data: latestTeacherEvent } = await supabase
              .from("session_events")
              .select("id")
              .eq("session_id", sessionId)
              .eq("event_type", "teacher_utterance")
              .order("occurred_at_ms", { ascending: false })
              .limit(1)
              .maybeSingle();
            send({ type: "persisted", teacherEventId: (latestTeacherEvent as { id?: string } | null)?.id ?? null });
          } catch (persistErr) {
            console.error("Turn stream persistence failed:", persistErr);
            send({ type: "warn", error: "تعذّر حفظ أحداث هذه الجولة في السجل." });
          }
        };

        // NOTE: persistence deliberately fires AFTER the speakers loop (all
        // reply texts known) — never on the first audio, and never awaited
        // before the first audio chunk is already flowing to the client.

        // -----------------------------------------------------------
        // SPEECH GENERATION + SENTENCE-CHUNKED TTS STREAMING.
        // -----------------------------------------------------------
        let firstAudioEnqueued = false;
        let audioChunkIndex = 0;
        let ttsFirstChunkStart = Date.now();

        const sendAudioChunk = (
          buffer: Buffer,
          mime: string,
          candidate: { personaId: string; name: string }
        ) => {
          send({
            type: "audio",
            personaId: candidate.personaId,
            name: candidate.name,
            index: audioChunkIndex++,
            mime,
            b64: buffer.toString("base64"),
          });
        };

        const markFirstAudio = () => {
          if (!firstAudioEnqueued) {
            firstAudioEnqueued = true;
            L.ttsFirstMs = Date.now() - ttsFirstChunkStart;
            L.ttfaServerMs = Date.now() - t0;
          }
        };

        const synthesizeAndSendChunk = async (
          text: string,
          candidate: { personaId: string; name: string },
          personaVoice: PersonaVoice | undefined,
          dialectForVoice: string
        ): Promise<boolean> => {
          // LATENCY: chunk 0 streams — Fish returns raw MP3 frames as they
          // are synthesized (measured first-bytes ≈ 430-480ms vs 700-2400ms
          // for the full buffer). A ~1.2s frame-aligned prefix is flushed
          // the moment it arrives; the remainder follows as a gapless
          // follow-up chunk. Later chunks keep 128kbps "normal" quality —
          // they hide under playback anyway.
          if (!firstAudioEnqueued) {
            let anySent = false;
            const result = await synthesizeStudentSpeechStreaming(
              text,
              candidate.name,
              dialectForVoice,
              personaVoice,
              (prefix, mime) => {
                sendAudioChunk(prefix, mime, candidate);
                anySent = true;
                markFirstAudio();
              },
              { fishLatencyMode: "balanced", fishMp3Bitrate: 64 }
            );
            if (result.buffer && result.buffer.length > 0) {
              sendAudioChunk(result.buffer, result.contentType, candidate);
              anySent = true;
              markFirstAudio();
            }
            return anySent;
          }
          const audio = await synthesizeStudentSpeech(text, candidate.name, undefined, dialectForVoice, personaVoice, {
            fishLatencyMode: "normal",
            fishMp3Bitrate: 128,
          });
          if (!audio || audio.buffer.length === 0) return false;
          sendAudioChunk(audio.buffer, audio.contentType, candidate);
          return true;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sanitizeCtx = (candidate: any) => ({
          isDistracted: candidate.isDistracted,
          unknownStudentName: plan.intentAnalysis.unknownStudentName,
          isWhyQuestion: plan.qContext.isWhyQuestion,
          isTeacherApology: plan.intentAnalysis.intent === "teacher_apology",
          currentFractions: plan.qContext.fractions,
          hasUnlikeDenominators: plan.qContext.hasUnlikeDenominators,
          isCommonDenominatorTaught: plan.isCommonDenominatorTaught,
          activeMisconception: candidate.activeMisconception,
          isGreeting: plan.isGreeting,
          teacherUtterance: teacherText,
          dialect: sessionDialect,
        });

        let classroomSilence = false;
        if (plan.isSilent) {
          // SILENCE IS A VALID ACTION — cards update, no audio, explicit
          // client-side "students listened" feedback (no silent failure).
          classroomSilence = true;
          if (!persistencePromise) persistencePromise = persistTurn();
          await persistencePromise;
        } else {
          // Explicit-address enforcement: ONLY the named character speaks.
          let speakers = plan.decision.candidateSpeakers;
          if (explicitTarget) speakers = speakers.filter((c) => c.personaId === explicitTarget.personaId);

          if (speakers.length === 0) {
            classroomSilence = true;
            if (!persistencePromise) persistencePromise = persistTurn();
            await persistencePromise;
          } else {
            for (const candidate of speakers) {
              const persona = personas.find((p) => p.id === candidate.personaId);
              if (!persona) continue;
              const personaVoice: PersonaVoice | undefined = {
                fishVoiceId: (persona as { voice_id?: string | null }).voice_id ?? null,
                edgeVoice: (persona as { edge_voice?: string | null }).edge_voice ?? null,
                gender: (persona as { gender?: string }).gender ?? null,
              };
              const dialectForVoice = persona.dialect ?? sessionDialect;
              const studentBrain = plan.studentBrains.find((s) => s.personaId === candidate.personaId);

              // 1. Ritual fast path — deterministic text, zero LLM latency.
              const fastText = ritualFastReply(plan.intentAnalysis, teacherText, plan.dialect, plan.cleanTitle);

              let fullRawText: string | null = fastText;
              let anyAudioSent = false;
              const pendingTts: Promise<unknown>[] = [];
              ttsFirstChunkStart = Date.now();

              // The chunker/extractor pair is RECREATABLE: when the LLM
              // chain restarts on another model mid-stream (walk + reset),
              // already-played audio stays and the reply restarts cleanly
              // — no duplicated text in the new attempt's pipeline.
              let chunker = createSentenceChunker((chunkText) => {
                pendingTts.push(
                  synthesizeAndSendChunk(chunkText, candidate, personaVoice, dialectForVoice).then((ok) => {
                    if (ok) anyAudioSent = true;
                  })
                );
              });

              if (fastText) {
                chunker.push(fastText);
                chunker.flush();
                await Promise.all(pendingTts);
                fullRawText = fastText;
              } else {
                // 2. STREAMED LLM reply — tokens → JSON field → sentence
                //    chunks → TTS, all overlapping.
                const studentPrompt = buildCandidateStudentPrompt({
                  studentName: candidate.name,
                  age: studentBrain?.age ?? persona.age ?? 10,
                  understanding: studentBrain?.understanding ?? 75,
                  confidence: studentBrain?.confidence ?? 70,
                  emotion: candidate.spokenEmotion || "confident",
                  reasonToSpeak: candidate.reasonToSpeak,
                  lessonContext: plan.isGreeting ? null : session.lesson_context ?? null,
                  teacherUtterance: teacherText,
                  recentHistory: recentHistory.slice(-900),
                  currentQuestionText: plan.currentQuestionText,
                  targetConceptAspect: plan.qContext.targetConceptAspect,
                  teacherTitle: plan.cleanTitle,
                  isTargetStudent: true,
                  activeMisconception: candidate.activeMisconception,
                  teacherExplanations,
                  studentContributions,
                  fullLessonHistory: fullLessonHistory.slice(-4000),
                  dialect: sessionDialect,
                  classmates: plan.saudiClassmates,
                });
                const userPrompt =
                  `${studentPrompt}\n\nرد بصيغة JSON فقط بهذا الشكل تماماً:\n{\n  "text": "كلام الطالب المنطوق هنا فقط"\n}` +
                  `\nمهم للسرعة: ابدأ نص "text" بجملة قصيرة جداً (كلمة إلى ثلاث كلمات مثل «أيوه يا مستر!» أو «صراحة مش متأكد») ثم أكمل باقي الرد.`;

                let extractor = createJsonTextFieldExtractor("text");
                const tLlmOpen = Date.now();
                let sawFirstToken = false;
                let sawFirstChunk = false;
                // Partial text already forwarded (and likely spoken) by an
                // attempt that later died — kept so the final speech text
                // matches what the class actually heard.
                let salvagedFromFailedAttempts = "";
                try {
                  const result = await callGroqStreamWithFallback(
                    {
                      messages: [
                        { role: "system", content: plan.systemPrompt },
                        { role: "user", content: userPrompt },
                      ],
                      temperature: 0.65,
                      max_completion_tokens: 250,
                      response_format: { type: "json_object" },
                    },
                    (delta) => {
                      if (!sawFirstToken) {
                        sawFirstToken = true;
                        L.llmFirstTokenMs = Date.now() - tLlmOpen;
                      }
                      const fresh = extractor.push(delta);
                      if (fresh) {
                        chunker.push(fresh);
                        if (!sawFirstChunk) {
                          sawFirstChunk = true;
                          L.firstSentenceMs = Date.now() - tLlmOpen;
                        }
                      }
                    },
                    {
                      signal: abortSignal,
                      // Mid-stream provider failure ⇒ chain walks to the next
                      // model and this pipeline restarts CLEAN (the partial
                      // attempt's unspoken buffer is discarded; any audio
                      // already played stays as a natural interjection).
                      onAttemptReset: () => {
                        salvagedFromFailedAttempts = extractor.text.trim() || salvagedFromFailedAttempts;
                        extractor = createJsonTextFieldExtractor("text");
                        chunker = createSentenceChunker((chunkText) => {
                          pendingTts.push(
                            synthesizeAndSendChunk(chunkText, candidate, personaVoice, dialectForVoice).then((ok) => {
                              if (ok) anyAudioSent = true;
                            })
                          );
                        });
                      },
                    }
                  );
                  L.model = result.model;
                  if (result.attempts && result.attempts.length > 0) L.llmWalk = result.attempts;
                  if (result.restarts) L.llmRestarts = result.restarts;
                  chunker.flush();
                  await Promise.all(pendingTts);

                  let extracted = extractor.text.trim();
                  if (!extracted) {
                    // Malformed stream (not JSON) — parse the raw completion.
                    try {
                      const raw = result.text.match(/\{[\s\S]*\}/);
                      const parsed = JSON.parse(raw ? raw[0] : result.text);
                      if (typeof parsed.text === "string") extracted = parsed.text.trim();
                    } catch {}
                  }
                  fullRawText = extracted || null;
                } catch (llmErr) {
                  if (abortSignal.aborted) {
                    // barge-in: stop generating; keep whatever text/audio
                    // already went out.
                    chunker.flush();
                    try {
                      await Promise.all(pendingTts);
                    } catch {}
                    fullRawText = extractor.text.trim() || null;
                  } else {
                    console.warn("Streaming LLM failed, engaging deterministic fallback:", llmErr);
                    L.llmError = groqErrorSignature(llmErr); // dev-mode latency block
                    chunker.flush();
                    try {
                      await Promise.all(pendingTts);
                    } catch {}
                    // SALVAGE: if tokens already streamed out of a failed
                    // attempt (mid-stream provider failure), keep whatever
                    // complete text the extractor decoded — the student's
                    // answer beats a canned fallback line.
                    const salvaged = extractor.text.trim() || salvagedFromFailedAttempts;
                    fullRawText = salvaged.length >= 3 ? salvaged : null;
                  }
                }

                // Deterministic fallback when the stream produced nothing.
                if (!fullRawText && !anyAudioSent && !abortSignal.aborted) {
                  const reactions = await generateStudentReactions(planParams).catch(() => null);
                  const r = reactions?.find((x) => x.personaId === candidate.personaId && x.text);
                  if (r?.text) {
                    fullRawText = r.text;
                    ttsFirstChunkStart = Date.now();
                    const fallbackPending: Promise<unknown>[] = [];
                    const fallbackChunker = createSentenceChunker((chunkText) => {
                      fallbackPending.push(
                        synthesizeAndSendChunk(chunkText, candidate, personaVoice, dialectForVoice).then((ok) => {
                          if (ok) anyAudioSent = true;
                        })
                      );
                    });
                    fallbackChunker.push(r.text);
                    fallbackChunker.flush();
                    await Promise.all(fallbackPending);
                  }
                }
              }

              const sanitized = fullRawText
                ? sanitizeStudentResponse(fullRawText, candidate.name, plan.title, sanitizeCtx(candidate))
                : null;
              const finalText = (sanitized && sanitized.trim()) || (fullRawText ?? "").trim() || null;

              if (finalText && (anyAudioSent || !abortSignal.aborted)) {
                speakerTexts.push({
                  personaId: candidate.personaId,
                  name: candidate.name,
                  text: finalText,
                  action:
                    plan.decision.updatedStudents.find((s) => s.personaId === candidate.personaId)?.physicalAction ??
                    "attentive",
                  desc:
                    plan.decision.updatedStudents.find((s) => s.personaId === candidate.personaId)?.actionDescriptionAr ??
                    `${candidate.name}: منتبه`,
                  delta:
                    plan.decision.updatedStudents.find((s) => s.personaId === candidate.personaId)?.attentionDelta ?? 5,
                  emotion: candidate.spokenEmotion,
                });
                send({ type: "speech", personaId: candidate.personaId, name: candidate.name, fullText: finalText });
              } else if (!anyAudioSent && !finalText && !abortSignal.aborted) {
                // NO SILENT TURN: every teacher utterance gets a response,
                // a retry state, or an explicit error.
                send({ type: "warn", error: "تعذّر توليد رد الطالب في هذه الجولة. يُرجى المحاولة مرة أخرى." });
              }
            }
          }
        }

        if (!persistencePromise) persistencePromise = persistTurn();
        await persistencePromise;

        // Our own writes just landed — refresh the session's DB wave so
        // the NEXT turn reads fresh events from the instance cache.
        refreshWave(sessionId, auth.row);

        L.totalMs = Date.now() - t0;
        L.chunks = audioChunkIndex;
        const questionTypeFinal = await classifyPromise;
        send({ type: "done", questionType: questionTypeFinal, latency: L, classroomSilence });

        // Hard per-stage instrumentation — always logged server-side.
        console.log(
          `[TurnStream:${sessionId.slice(0, 8)}] ttfa=${L.ttfaServerMs ?? "-"}ms auth=${L.authMs}ms db=${L.dbMs}ms ` +
            `wave=${L.waveCached ? "cache" : "fresh"} stt=${L.sttMs ?? "-"}ms ` +
            `route=${L.routingMs}ms llm1st=${L.llmFirstTokenMs ?? "-"}ms sent1=${L.firstSentenceMs ?? "-"}ms ` +
            `llmErr=${L.llmError ?? "-"} llmWalk=${L.llmWalk ? JSON.stringify(L.llmWalk) : "-"} ` +
            `tts0=${L.ttsFirstMs ?? "-"}ms chunks=${L.chunks ?? 0} total=${L.totalMs}ms model=${L.model ?? "fast/fallback"} ` +
            `target=${explicitTarget ? explicitTarget.name : routing.targetName ?? "-"}`
        );
      } catch (err) {
        console.error("Turn stream pipeline failed:", err);
        send({ type: "error", error: "حدث خطأ مؤقت أثناء معالجة الرد. يُرجى المحاولة مرة أخرى." });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
