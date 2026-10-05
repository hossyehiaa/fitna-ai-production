import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  classifyTeacherUtterance,
  buildTurnPlan,
  ritualFastReply,
  sanitizeStudentResponse,
  generateStudentReactions,
  type TurnPlanParams,
  type QuestionType,
} from "@/lib/ai/turn";
import { callGroqStreamWithFallback, CHAT_MODEL } from "@/lib/ai/groq";
import { buildCandidateStudentPrompt } from "@/lib/ai/personas";
import { normalizeSpeechTranscription } from "@/lib/audio/speechNormalizer";
import { synthesizeStudentSpeech, type PersonaVoice } from "@/app/api/tts/route";
import { parseDialect } from "@/lib/ai/dialects";
import { resolveTargetCharacter, explicitTargetFromUtterance } from "@/lib/ai/speakerRouting";
import { createSentenceChunker, createJsonTextFieldExtractor } from "@/lib/ai/streamChunker";
import type { StudentPhysicalAction } from "@/lib/simulation/classroomState";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

/** Warm outbound TLS pools (Fish + Groq) so the first real call skips handshakes. */
function warmUpstreamConnections() {
  const warm = (url: string) => {
    fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(() => {});
  };
  if (process.env.FISH_AUDIO_API_KEY) warm("https://api.fish.audio/");
  if (process.env.GROQ_API_KEY) warm("https://api.groq.com/");
}

// GET — warmup ping. The live room fires this on mount so the function,
// the Prisma/Neon connection AND the upstream TLS pools are hot before
// the teacher ever finishes a sentence.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  warmUpstreamConnections();
  return NextResponse.json({ ok: true, warmed: true, status: session.status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id: sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  const tAuth = Date.now();

  const body = await request.json().catch(() => ({}));
  const { teacherText: inputTeacherText, elapsedMs, speechDurationMs, voiceGender } = body as {
    teacherText?: string;
    elapsedMs?: number;
    speechDurationMs?: number;
    voiceGender?: "male" | "female" | null;
  };
  const teacherText = normalizeSpeechTranscription((inputTeacherText || "").trim());
  if (!teacherText) {
    return NextResponse.json({ error: "لم يتم التقاط أي كلام" }, { status: 400 });
  }

  // LATENCY: the ownership-gate session row, students, profile and capped
  // events ALL run in ONE parallel wave (was: sequential auth → session →
  // batch = 3 round-trip waves). Classify LLM needs only the transcript,
  // so it rides the same wave.
  const sessionQ = supabase
    .from("sessions")
    .select("id, teacher_id, status, lesson_context, started_at, dialect")
    .eq("id", sessionId)
    .maybeSingle();
  const studentsQ = supabase
    .from("session_students")
    .select("id, persona_id, final_attention, times_spoken")
    .eq("session_id", sessionId);
  const profileQ = supabase.from("users").select("full_name").eq("id", user.id).single();
  const eventsQ = supabase
    .from("session_events")
    .select("actor, content, event_type, metadata, occurred_at_ms")
    .eq("session_id", sessionId)
    .order("occurred_at_ms", { ascending: false })
    .limit(EVENTS_CAP);

  const classifyPromise = classifyTeacherUtterance(teacherText).catch(() => "statement" as QuestionType);

  const [sessionRes, studentsRes, profileRes, eventsRes] = await Promise.all([
    sessionQ,
    studentsQ,
    profileQ,
    eventsQ,
  ]);
  const session = sessionRes.data as { id?: string; teacher_id?: string; status?: string; lesson_context?: string | null; started_at?: string | null; dialect?: string | null } | null;
  if (!session || session.teacher_id !== user.id) {
    return NextResponse.json({ error: "لا تملك صلاحية الوصول إلى هذه الجلسة" }, { status: 403 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json({ error: "انتهت هذه الجلسة بالفعل" }, { status: 400 });
  }

  const sessionStudents = (studentsRes.data ?? []) as {
    id: string;
    persona_id: string;
    final_attention: number | null;
    times_spoken: number | null;
  }[];
  const teacherFullName =
    (profileRes.data as { full_name?: string } | null)?.full_name ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user as any).user_metadata?.full_name ||
    user.email ||
    "";

  // Personas: immutable character identities → module cache.
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
  const tDb = Date.now();
  const dbMs = tDb - tAuth;

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
      L.dbMs = dbMs;

      try {
        // -----------------------------------------------------------
        // Memory structures (mirror of the legacy route, capped input).
        // -----------------------------------------------------------
        const chronologicalEvents = [...((eventsRes.data ?? []) as unknown[])].reverse() as Array<{
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

        const synthesizeAndSendChunk = async (
          text: string,
          candidate: { personaId: string; name: string },
          personaVoice: PersonaVoice | undefined,
          dialectForVoice: string
        ): Promise<boolean> => {
          const audio = await synthesizeStudentSpeech(text, candidate.name, undefined, dialectForVoice, personaVoice, {
            fishLatencyMode: firstAudioEnqueued ? "normal" : "balanced",
          });
          if (!audio || audio.buffer.length === 0) return false;
          send({
            type: "audio",
            personaId: candidate.personaId,
            name: candidate.name,
            index: audioChunkIndex++,
            mime: audio.contentType,
            b64: audio.buffer.toString("base64"),
          });
          if (!firstAudioEnqueued) {
            firstAudioEnqueued = true;
            L.ttsFirstMs = Date.now() - ttsFirstChunkStart;
            L.ttfaServerMs = Date.now() - t0;
          }
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

        if (plan.isSilent) {
          // SILENCE IS A VALID ACTION — cards update, no audio, explicit
          // client-side "students listened" feedback (no silent failure).
          if (!persistencePromise) persistencePromise = persistTurn();
          await persistencePromise;
        } else {
          // Explicit-address enforcement: ONLY the named character speaks.
          let speakers = plan.decision.candidateSpeakers;
          if (explicitTarget) speakers = speakers.filter((c) => c.personaId === explicitTarget.personaId);

          if (speakers.length === 0) {
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

              const chunker = createSentenceChunker((chunkText) => {
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
                  recentHistory: recentHistory.slice(-3500),
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

                const extractor = createJsonTextFieldExtractor("text");
                const tLlmOpen = Date.now();
                let sawFirstToken = false;
                let sawFirstChunk = false;
                try {
                  const result = await callGroqStreamWithFallback(
                    {
                      model: CHAT_MODEL,
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
                    { signal: abortSignal }
                  );
                  L.model = result.model;
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
                    chunker.flush();
                    try {
                      await Promise.all(pendingTts);
                    } catch {}
                    fullRawText = null;
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

        L.totalMs = Date.now() - t0;
        L.chunks = audioChunkIndex;
        const questionTypeFinal = await classifyPromise;
        send({ type: "done", questionType: questionTypeFinal, latency: L });

        // Hard per-stage instrumentation — always logged server-side.
        console.log(
          `[TurnStream:${sessionId.slice(0, 8)}] ttfa=${L.ttfaServerMs ?? "-"}ms auth=${L.authMs}ms db=${L.dbMs}ms ` +
            `route=${L.routingMs}ms llm1st=${L.llmFirstTokenMs ?? "-"}ms sent1=${L.firstSentenceMs ?? "-"}ms ` +
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
