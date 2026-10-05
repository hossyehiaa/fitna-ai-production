import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyTeacherUtterance, generateStudentReactions, generateFallbackReactions } from "@/lib/ai/turn";
import type { StudentPhysicalAction } from "@/lib/simulation/classroomState";
import { normalizeSpeechTranscription } from "@/lib/audio/speechNormalizer";
import { synthesizeStudentSpeech, type PersonaVoice } from "@/app/api/tts/route";
import { parseDialect } from "@/lib/ai/dialects";
import { resolveTargetCharacter, explicitTargetFromUtterance } from "@/lib/ai/speakerRouting";

export const runtime = "nodejs";

/**
 * One turn of the live simulation: teacher spoke (already transcribed
 * by /api/stt on the client side), we classify it, generate each
 * student's real reaction, persist everything to session_events +
 * session_students, and return the fresh state for the UI to render
 * and speak aloud via /api/tts.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handleTurn(request, params);
  } catch (err) {
    // Any unhandled error here (a Supabase write failing, a bug in the
    // route logic itself — the two real Groq calls above are already
    // individually fault-isolated so THEY shouldn't reach this catch)
    // used to crash the route with an empty response body, which the
    // client couldn't parse. Always return real JSON.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Turn processing failed:", err);
    return NextResponse.json(
      {
        error: "حدث خطأ مؤقت أثناء معالجة الرد. يُرجى المحاولة مرة أخرى.",
        // Included to make local debugging possible without digging
        // through server logs. Remove this field before any real
        // deployment with outside users — it can leak internal detail.
        ...(process.env.NODE_ENV !== "production" ? { debug: detail } : {}),
      },
      { status: 500 }
    );
  }
}

async function handleTurn(request: NextRequest, params: Promise<{ id: string }>) {
  const t0 = Date.now();
  const { id: sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const { data: session } = await supabase
    .from("sessions")
    .select("id, teacher_id, status, lesson_context, started_at, dialect")
    .eq("id", sessionId)
    .single();

  if (!session || session.teacher_id !== user.id) {
    return NextResponse.json({ error: "لا تملك صلاحية الوصول إلى هذه الجلسة" }, { status: 403 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json({ error: "انتهت هذه الجلسة بالفعل" }, { status: 400 });
  }

  const { data: teacherProfile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const teacherFullName = teacherProfile?.full_name || user.user_metadata?.full_name || user.email || "";

  const body = await request.json();
  const { teacherText: inputTeacherText, elapsedMs, speechDurationMs, audioBase64, voiceGender } = body as {
    teacherText: string;
    elapsedMs: number;
    speechDurationMs: number;
    audioBase64?: string;
    voiceGender?: "male" | "female" | null;
  };

  // Classroom dialect drives persona prompts + student voice selection.
  const sessionDialect = parseDialect((session as { dialect?: string } | null)?.dialect);

  if (!inputTeacherText?.trim()) {
    return NextResponse.json({ error: "لم يتم التقاط أي كلام" }, { status: 400 });
  }

  const teacherText = normalizeSpeechTranscription(inputTeacherText.trim());

  // Load current per-student state.
  const { data: sessionStudents } = await supabase
    .from("session_students")
    .select("id, persona_id, final_attention, times_spoken")
    .eq("session_id", sessionId);

  const personaIds = (sessionStudents ?? []).map((s) => s.persona_id);
  const { data: personas } = personaIds.length
    ? await supabase
        .from("student_personas")
        .select("*")
        .in("id", personaIds)
    : { data: [] };

  const currentAttention: Record<string, number> = {};
  for (const s of sessionStudents ?? []) {
    const persona = personas?.find((p) => p.id === s.persona_id);
    currentAttention[s.persona_id] = s.final_attention ?? persona?.base_attention ?? 70;
  }

  const timesSpoken: Record<string, number> = {};
  for (const s of sessionStudents ?? []) {
    timesSpoken[s.persona_id] = s.times_spoken ?? 0;
  }

  // Load ALL session events so the students have complete conversational memory of the entire lesson
  const { data: allEvents } = await supabase
    .from("session_events")
    .select("actor, content, event_type, metadata, occurred_at_ms")
    .eq("session_id", sessionId)
    .order("occurred_at_ms", { ascending: true });

  const personaNameById = new Map((personas ?? []).map((p) => [p.id, p.name]));
  const chronologicalEvents = allEvents ?? [];
  const descendingEvents = [...chronologicalEvents].reverse();

  // 1. Full cumulative dialogue history (Everything said by teacher and students from the beginning)
  const fullLessonHistory = chronologicalEvents
    .filter((e) => e.event_type === "teacher_utterance" || e.event_type === "student_response")
    .map((e) => `${e.actor === "teacher" ? "المعلم" : personaNameById.get(e.actor) ?? e.actor}: ${e.content}`)
    .join("\n");

  // Keep a compact recent window as well
  const recentHistory = chronologicalEvents
    .slice(-25)
    .filter((e) => e.event_type === "teacher_utterance" || e.event_type === "student_response")
    .map((e) => `${e.actor === "teacher" ? "المعلم" : personaNameById.get(e.actor) ?? e.actor}: ${e.content}`)
    .join("\n");

  // 2. Structured memory of teacher's explanations, rules, facts, and lessons taught so far
  const teacherExplanations = chronologicalEvents
    .filter((e) => e.event_type === "teacher_utterance")
    .map((e) => e.content.trim())
    .filter((txt) => txt.length > 5);

  // 3. Structured memory of what each student contributed / answered previously
  const studentContributions: Record<string, string[]> = {};
  for (const p of personas ?? []) {
    studentContributions[p.name] = chronologicalEvents
      .filter((e) => e.event_type === "student_response" && e.actor === p.id)
      .map((e) => e.content.trim());
  }

  // 4. Track which students currently have their hands raised
  const studentsWithHandRaised: string[] = [];
  const lastPhysicalActions: Record<string, StudentPhysicalAction> = {};
  for (const e of descendingEvents) {
    if (e.event_type === "state_change" && e.actor && !lastPhysicalActions[e.actor]) {
      const meta = e.metadata as { physical_action?: StudentPhysicalAction } | null;
      if (meta?.physical_action) {
        lastPhysicalActions[e.actor] = meta.physical_action;
        if (meta.physical_action === "hand_raised") {
          const sName = personaNameById.get(e.actor);
          if (sName && !studentsWithHandRaised.includes(sName)) {
            studentsWithHandRaised.push(sName);
          }
        }
      }
    }
  }

  const greetingCompleted = descendingEvents.some(
    (e) =>
      e.event_type === "student_response" &&
      /وعليكم\s*السلام|صباح\s*الخير|مساء\s*الخير|أهلاً\s*يا\s*ميس|اهلا\s*يا\s*ميس|أهلاً\s*يا\s*مستر|اهلا\s*يا\s*مستر/i.test(
        e.content
      )
  );

  const lastTeacherEvent = descendingEvents.find((e) => e.event_type === "teacher_utterance");
  const lastTeacherUtterance = lastTeacherEvent ? lastTeacherEvent.content : null;

  // Server-side idempotency guard: ignore duplicate teacher turns within 4000ms
  if (lastTeacherEvent) {
    const cleanLast = (lastTeacherEvent.content || "").replace(/[\s\p{P}]+/gu, "").toLowerCase();
    const cleanCurrent = teacherText.replace(/[\s\p{P}]+/gu, "").toLowerCase();
    const lastOccurredMs = lastTeacherEvent.occurred_at_ms ?? 0;
    if (cleanLast && cleanCurrent && cleanLast === cleanCurrent && Math.abs(elapsedMs - lastOccurredMs) < 4000) {
      console.warn("[Turn] Server dropped duplicate teacher turn for session", sessionId, ":", teacherText);
      return NextResponse.json({
        questionType: "statement",
        students: [],
        deduplicated: true,
      });
    }
  }

  const lastStudentEvent = descendingEvents.find((e) => e.event_type === "student_response");
  const lastSpeakingPersonaId = lastStudentEvent ? lastStudentEvent.actor : null;
  const lastSpeakingStudentName = lastStudentEvent ? personaNameById.get(lastStudentEvent.actor) ?? null : null;

  const recentSpeakerPersonaIds = descendingEvents
    .filter((e) => e.event_type === "student_response")
    .map((e) => e.actor)
    .slice(0, 3);

  const turnIndex = descendingEvents.filter((e) => e.event_type === "teacher_utterance").length + 1;

  // Real LLM calls — no canned responses. Each is fault-isolated: if
  // Groq has a transient error (rate limit, timeout, a bad response)
  // on one call, the turn still completes with a safe fallback instead
  // of failing entirely.
  // Determine voiceGender from session events if not passed in current request
  let effectiveVoiceGender = voiceGender;
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

  // 1. Primary Source of Truth: Session-wide locked teacher title from Session Setup settings
  let lockedTeacherTitle: string | null = null;
  for (const e of chronologicalEvents) {
    if (e.event_type === "session_config" && e.metadata) {
      const meta = e.metadata as {
        teacher_title?: string;
        full_teacher_title?: string;
      };
      if (meta.full_teacher_title) {
        lockedTeacherTitle = meta.full_teacher_title;
        break;
      } else if (meta.teacher_title) {
        lockedTeacherTitle = meta.teacher_title;
        break;
      }
    }
  }

  // If not found in session_config, check past events metadata
  if (!lockedTeacherTitle) {
    for (const e of descendingEvents) {
      const meta = e.metadata as {
        teacher_title?: string;
        full_teacher_title?: string;
      } | null;
      if (meta?.full_teacher_title) {
        lockedTeacherTitle = meta.full_teacher_title;
        break;
      } else if (meta?.teacher_title) {
        lockedTeacherTitle = meta.teacher_title;
        break;
      }
    }
  }

  // 2. Only allow explicit verbal self-identification/correction during speech to override:
  const isFemaleSelf =
    /(?:أنا|انا)\s*(?:مش|غير)\s*(?:مستر|استاذ|أستاذ)|(?:أنا|انا)\s*(?:ميس|مس|معلمة|استاذة|أستاذة)/i.test(
      teacherText
    );
  const isMaleSelf =
    /(?:أنا|انا)\s*(?:مش|غير)\s*(?:ميس|مس|ابلة|أبلة)|(?:أنا|انا)\s*(?:مستر|استاذ|أستاذ|معلم)/i.test(
      teacherText
    );

  if (isFemaleSelf) {
    lockedTeacherTitle = "يا ميس";
  } else if (isMaleSelf) {
    lockedTeacherTitle = "يا مستر";
  } else if (!lockedTeacherTitle) {
    // Only if NEVER configured in session settings, infer fallback from voice or profile:
    if (effectiveVoiceGender === "female") {
      lockedTeacherTitle = "يا ميس";
    } else if (effectiveVoiceGender === "male") {
      lockedTeacherTitle = "يا مستر";
    } else {
      const isFemaleName = /(?:مريم|سارة|فاطمة|نور|منى|هدى|رنا|ياسمين|اية|آية|اماني|أماني|ايمان|إيمان|سلمى|ندى|ريم|شهد|حنين|ملك|ملاك|هاجر|إسراء|اسراء|دعاء|سمر|وفاء|زينب|عائشة|خديجة|maryam|mariam|sara|sarah|fatima|nour)/i.test(
        teacherFullName || ""
      );
      lockedTeacherTitle = isFemaleName ? "يا ميس" : "يا مستر";
    }
  }

  // Collect previously resolved unknown student names
  const resolvedUnknownNames: string[] = [];
  for (const e of chronologicalEvents) {
    if (e.event_type === "student_response") {
      const m = e.content.match(/مين\s+([^\s.,?!،؛:]+)\s+يا\s+(?:ميس|مستر)/);
      if (m && m[1]) {
        resolvedUnknownNames.push(m[1].trim());
      }
    }
  }

  // ---------------------------------------------------------------------
  // SPEAKER ROUTING: resolve the intended recipient from the transcript
  // using the PERSISTENT character identities (persona ids + names).
  // Explicit vocative ("يا سلطان") → ONLY that character responds.
  // ---------------------------------------------------------------------
  const routingParticipants = (personas ?? []).map((p) => ({
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

  // 1. Concurrent LLM Execution: Classify teacher question and generate student reaction in parallel!
  const questionTypePromise = classifyTeacherUtterance(teacherText).catch((err) => {
    console.error("classifyTeacherUtterance failed, defaulting to 'statement':", err);
    return "statement" as const;
  });

  const studentReactionsPromise = (personas && personas.length > 0)
    ? generateStudentReactions({
        personas,
        currentAttention,
        timesSpoken,
        lastSpeakingPersonaId,
        recentSpeakerPersonaIds,
        lastPhysicalActions,
        lastSpeakingStudentName,
        greetingCompleted,
        lastTeacherUtterance,
        turnIndex,
        lessonContext: session.lesson_context,
        teacherUtterance: teacherText,
        questionType: "statement",
        recentHistory,
        fullLessonHistory,
        teacherExplanations,
        studentContributions,
        studentsWithHandRaised,
        voiceGender: effectiveVoiceGender,
        lockedTeacherTitle,
        resolvedUnknownNames,
        teacherFullName,
        dialect: sessionDialect,
        participantNames,
      }).catch((err) => {
        console.error("generateStudentReactions failed, using safe fallback:", err);
        return generateFallbackReactions({
          personas,
          participantNames,
          teacherUtterance: teacherText,
          recentHistory,
          turnIndex,
          lastPhysicalActions,
          lastSpeakingStudentName,
          lastSpeakingPersonaId,
          recentSpeakerPersonaIds,
          timesSpoken,
          greetingCompleted,
          lastTeacherUtterance,
          studentsWithHandRaised,
          voiceGender: effectiveVoiceGender,
          lockedTeacherTitle,
          resolvedUnknownNames,
          lessonContext: session.lesson_context,
          fullLessonHistory,
          teacherFullName,
          dialect: sessionDialect,
        });
      })
    : Promise.resolve([]);

  const llmStartedAt = Date.now();
  const [questionType, reactions] = await Promise.all([questionTypePromise, studentReactionsPromise]);
  const llmDoneAt = Date.now();

  // 2. Pre-synthesize TTS audio concurrently on the server for the speaking
  // student — with the character's OWN voice identity from its persisted
  // profile (voice_id = Fish reference, edge_voice = fallback neural voice).
  const speakingStudent = reactions.find((r) => r.responded && r.text);
  const speakingPersona = speakingStudent
    ? personas?.find((p) => p.id === speakingStudent.personaId)
    : undefined;
  const personaVoice: PersonaVoice | undefined = speakingPersona
    ? {
        fishVoiceId: (speakingPersona as { voice_id?: string | null }).voice_id ?? null,
        edgeVoice: (speakingPersona as { edge_voice?: string | null }).edge_voice ?? null,
        gender: (speakingPersona as { gender?: string }).gender ?? null,
      }
    : undefined;
  const ttsPromise = speakingStudent && speakingStudent.text
    ? synthesizeStudentSpeech(
        speakingStudent.text,
        speakingStudent.name,
        undefined,
        speakingPersona?.dialect ?? sessionDialect,
        personaVoice
      ).catch((err) => {
        console.warn("Pre-synthesis TTS error:", err);
        return null;
      })
    : Promise.resolve(null);

  // Derive final title used by students
  const activeStudentTitle =
    lockedTeacherTitle ||
    (reactions.find((r) => r.text && r.text.includes("يا ميس"))
      ? "يا ميس"
      : reactions.find((r) => r.text && r.text.includes("يا مستر"))
      ? "يا مستر"
      : "يا مستر");

  // 3. Batch DB persistence: Single batch insert for events, parallel updates for students
  // Calculate monotonic timestamps so playback and reports follow the exact live timeline
  const serverElapsedMs = session.started_at
    ? Math.max(0, Date.now() - new Date(session.started_at).getTime())
    : 0;

  const lastEventElapsedMs = chronologicalEvents.length > 0
    ? Math.max(...chronologicalEvents.map((e) => e.occurred_at_ms || 0))
    : 0;

  const effectiveTeacherMs = Math.max(
    elapsedMs || 0,
    serverElapsedMs,
    lastEventElapsedMs > 0 ? lastEventElapsedMs + 1000 : 0
  );

  const teacherSpeechDurationMs = speechDurationMs ? Math.round(speechDurationMs * 1000) : 2500;
  const effectiveStudentMs = effectiveTeacherMs + Math.max(1200, teacherSpeechDurationMs);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsToInsert: any[] = [
    {
      session_id: sessionId,
      event_type: "teacher_utterance",
      actor: "teacher",
      content: teacherText,
      audio_url: audioBase64 || null,
      metadata: {
        question_type: questionType,
        voice_gender: effectiveVoiceGender,
        teacher_title: activeStudentTitle,
        full_teacher_title: lockedTeacherTitle || activeStudentTitle,
        duration_ms: teacherSpeechDurationMs,
      },
      occurred_at_ms: effectiveTeacherMs,
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePromises: Promise<any>[] = [];

  const updatedStudents: {
    personaId: string;
    name: string;
    text: string | null;
    state: string;
    attention: number;
    physicalAction?: string;
    actionDescriptionAr?: string;
    emotion?: string;
    audioBase64?: string | null;
  }[] = [];

  for (const reaction of reactions) {
    const newAttention = clamp(
      (currentAttention[reaction.personaId] ?? 70) + reaction.attentionDelta,
      0,
      100
    );

    const row = sessionStudents?.find((s) => s.persona_id === reaction.personaId);
    if (row) {
      updatePromises.push(
        Promise.resolve(
          supabase
            .from("session_students")
            .update({
              final_attention: newAttention,
              times_spoken: reaction.responded ? row.times_spoken + 1 : row.times_spoken,
            })
            .eq("id", row.id)
        )
      );
    }

    if (reaction.responded && reaction.text) {
      eventsToInsert.push({
        session_id: sessionId,
        event_type: "student_response",
        actor: reaction.personaId,
        content: reaction.text,
        occurred_at_ms: effectiveStudentMs,
      });
    }

    eventsToInsert.push({
      session_id: sessionId,
      event_type: "state_change",
      actor: reaction.personaId,
      content: `${reaction.name}: ${reaction.actionDescriptionAr || stateLabel(reaction.newState)}`,
      metadata: { state: reaction.newState, physical_action: reaction.physicalAction },
      occurred_at_ms: effectiveStudentMs + 50,
    });

    updatedStudents.push({
      personaId: reaction.personaId,
      name: reaction.name,
      text: reaction.text,
      state: reaction.newState,
      attention: newAttention,
      physicalAction: reaction.physicalAction,
      actionDescriptionAr: reaction.actionDescriptionAr,
      emotion: reaction.emotion,
      audioBase64: null,
    });
  }

  // Run database persistence and TTS synthesis simultaneously!
  const dbPromise = Promise.all([
    supabase.from("session_events").insert(eventsToInsert),
    Promise.all(updatePromises),
  ]);

  const [, ttsAudio] = await Promise.all([dbPromise, ttsPromise]);
  const ttsDoneAt = Date.now();

  // Embed pre-synthesized audio directly so client plays audio with 0ms round-trip delay!
  if (speakingStudent && ttsAudio) {
    const studentEntry = updatedStudents.find((s) => s.personaId === speakingStudent.personaId);
    if (studentEntry) {
      studentEntry.audioBase64 = `data:${ttsAudio.contentType};base64,${ttsAudio.buffer.toString("base64")}`;
    }
  }

  // SPEAKER ROUTING ENFORCEMENT: when the teacher explicitly addressed one
  // character ("يا سلطان"), ONLY that character may carry a spoken reply.
  // Other students keep their state updates but never speak over the target.
  if (explicitTarget) {
    for (const st of updatedStudents) {
      if (st.personaId !== explicitTarget.personaId && st.text) {
        st.text = null;
      }
    }
  }

  // Per-stage latency (developer/debug mode only — never shown to users).
  const tEnd = Date.now();
  const latency = {
    routingMs: t0 === tEnd ? 0 : undefined, // resolved before LLM; see debug log
    llmMs: llmDoneAt - llmStartedAt,
    ttsMs: ttsDoneAt - llmDoneAt,
    totalMs: tEnd - t0,
  };
  if (process.env.DEBUG_LATENCY === "1" || process.env.NODE_ENV !== "production") {
    console.debug(
      `[Turn:${sessionId.slice(0, 8)}] routing=${routing.reason} target=${routing.targetName ?? "-"} ` +
        `explicit=${explicitTarget ? explicitTarget.name : "no"} llm=${latency.llmMs}ms tts=${latency.ttsMs}ms total=${latency.totalMs}ms`
    );
  }

  return NextResponse.json({
    questionType,
    students: updatedStudents,
    routing: {
      reason: routing.reason,
      targetPersonaId: explicitTarget ? explicitTarget.personaId : routing.targetPersonaId,
      targetCharacterKey: explicitTarget ? explicitTarget.characterKey : routing.targetCharacterKey,
      targetName: explicitTarget ? explicitTarget.name : routing.targetName,
      explicitlyAddressed: Boolean(explicitTarget),
    },
    ...(process.env.DEBUG_LATENCY === "1" ? { latency } : {}),
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stateLabel(state: string) {
  if (state === "hand_raised") return "رفع يده";
  if (state === "distracted") return "تشتّت";
  return "منتبه";
}
