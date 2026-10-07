import { StudentBrainState, getActionDescription } from "./classroomState";

export interface AutonomousClassroomEvent {
  id: string;
  type: "student_whisper" | "dropped_item" | "side_talk" | "spontaneous_question" | "lost_attention" | "none";
  primaryPersonaId: string | null;
  primaryStudentName: string | null;
  secondaryStudentName?: string | null;
  descriptionAr: string;
  spokenPrompt?: string | null;
  requiresTeacherIntervention: boolean;
}

/**
 * Evaluates whether a background spontaneous classroom event occurs.
 * This simulates real classroom dynamics:
 * - If teacher speaks for too long without asking questions (high consecutiveStatements).
 * - If a playful student's attention drops below 40%.
 * - If two students start whispering or someone drops a pencil.
 */
export function checkSpontaneousClassroomEvent(params: {
  students: StudentBrainState[];
  consecutiveTeacherStatements: number;
  secondsSinceLastInteraction: number;
  turnIndex: number;
}): AutonomousClassroomEvent {
  const { students, consecutiveTeacherStatements, secondsSinceLastInteraction } = params;

  // 1. Long monologue by teacher (> 4 consecutive explanation statements without questions)
  if (consecutiveTeacherStatements >= 4) {
    const yassin = students.find((s) => s.name === "ياسين");
    const omar = students.find((s) => s.name === "عمر");

    if (yassin && yassin.attention < 60) {
      yassin.physicalAction = "whispering";
      yassin.actionDescriptionAr = getActionDescription("whispering", yassin.name);

      return {
        id: `evt_${Date.now()}`,
        type: "student_whisper",
        primaryPersonaId: yassin.personaId,
        primaryStudentName: "ياسين",
        secondaryStudentName: omar ? "عمر" : undefined,
        descriptionAr: "ياسين بدأ يهمس لعمر ويسأله عن ماتش الكورة عشان الشرح طول",
        spokenPrompt: null,
        requiresTeacherIntervention: true,
      };
    }
  }

  // 2. High distraction probability for Yassin if attention drops
  const distractedYassin = students.find((s) => s.name === "ياسين" && s.attention < 35);
  if (distractedYassin && Math.random() < 0.45) {
    distractedYassin.physicalAction = "fidgeting";
    distractedYassin.actionDescriptionAr = getActionDescription("fidgeting", "ياسين");

    return {
      id: `evt_${Date.now()}`,
      type: "dropped_item",
      primaryPersonaId: distractedYassin.personaId,
      primaryStudentName: "ياسين",
      descriptionAr: "ياسين وقع المقلمة بتاعته على الأرض بالغلط وهو بيلعب بيها",
      spokenPrompt: null,
      requiresTeacherIntervention: true,
    };
  }

  // 3. Curiosity question from Sara if teacher pauses for a long time
  if (secondsSinceLastInteraction > 15) {
    const sara = students.find((s) => s.name === "سارة");
    if (sara && sara.attention > 70 && sara.understanding > 65) {
      sara.physicalAction = "hand_raised";
      sara.actionDescriptionAr = getActionDescription("hand_raised", "سارة");

      return {
        id: `evt_${Date.now()}`,
        type: "spontaneous_question",
        primaryPersonaId: sara.personaId,
        primaryStudentName: "سارة",
        descriptionAr: "سارة رفعت إيدها بدافع الفضول تسأل سؤال في سياق الدرس",
        spokenPrompt: "يا ميس، هو إحنا ممكن نطبق المثال ده في حاجة تانية؟",
        requiresTeacherIntervention: true,
      };
    }
  }

  return {
    id: `evt_${Date.now()}`,
    type: "none",
    primaryPersonaId: null,
    primaryStudentName: null,
    descriptionAr: "الفصل هادئ ومستقر",
    spokenPrompt: null,
    requiresTeacherIntervention: false,
  };
}

// =====================================================================
// LIVING CLASSROOM — random background events (master prompt §9).
//
// Every 30-60 seconds one event is picked at random and injected into
// the NEXT LLM call as a system-level line, e.g.:
//   "[EVENT: side_talk] عمر وسارة بدأوا يتكلموا مع بعض بصوت واطي."
// The student personas must react to it in character. The scheduler is
// per-serverless-instance in-memory (best-effort realism, zero DB cost)
// and randomized inside the 30-60s window so the cadence never feels
// mechanical.
// =====================================================================

export const CLASSROOM_EVENTS = [
  "hand_raised",
  "side_talk",
  "off_topic_question",
  "phone_distraction",
  "confused_silence",
] as const;

export type ClassroomEventType = (typeof CLASSROOM_EVENTS)[number];

export interface LiveClassroomEvent {
  type: ClassroomEventType;
  /** Human-readable narration (Arabic) — logged + persisted as metadata. */
  descriptionAr: string;
  /** The exact line injected into the LLM call. */
  promptLine: string;
}

/** Per-session last-fire timestamp (ms) on this instance. */
const sessionLastLiveEvent = new Map<string, number>();

function pickTwoDistinct(names: string[]): [string, string] | null {
  if (names.length === 0) return null;
  if (names.length === 1) return [names[0], names[0]];
  const first = names[Math.floor(Math.random() * names.length)];
  let second = first;
  while (second === first) {
    second = names[Math.floor(Math.random() * names.length)];
  }
  return [first, second];
}

/**
 * Master prompt §9 scheduler: returns a random event when ≥30-60s (random
 * threshold) have passed since the last one for this session, and null
 * otherwise. Callers inject `promptLine` into the next LLM call.
 */
export function maybeGenerateClassroomEvent(params: {
  sessionId: string;
  participantNames: string[];
  turnIndex: number;
  nowMs?: number;
}): LiveClassroomEvent | null {
  const { sessionId, participantNames, turnIndex } = params;
  const now = params.nowMs ?? Date.now();

  // Let the lesson get going before the classroom starts "living".
  if (turnIndex < 2) return null;

  const last = sessionLastLiveEvent.get(sessionId) ?? 0;
  const sinceLast = now - last;
  const thresholdMs = 30_000 + Math.floor(Math.random() * 30_000); // 30-60s
  if (sinceLast < thresholdMs) return null;

  const pair = pickTwoDistinct(participantNames);
  if (!pair) return null;
  const [a, b] = pair;

  const type = CLASSROOM_EVENTS[Math.floor(Math.random() * CLASSROOM_EVENTS.length)];
  let descriptionAr: string;
  switch (type) {
    case "hand_raised":
      descriptionAr = `${a} رفع إيده بقوة وعايز يسأل أو يشارك إجابة`;
      break;
    case "side_talk":
      descriptionAr = `${a} و${b} بدأوا يتكلموا مع بعض بصوت واطي`;
      break;
    case "off_topic_question":
      descriptionAr = `${a} سرح في النص وسأل سؤال خارج عن موضوع الدرس`;
      break;
    case "phone_distraction":
      descriptionAr = `${a} مشغول بتليفونه مخبّي تحت المكتب ومش مركز في الشرح`;
      break;
    case "confused_silence":
      descriptionAr = `${a} باين عليه إنه اتلخبط وسكت تماماً مش عارف يجاوب`;
      break;
  }

  sessionLastLiveEvent.set(sessionId, now);
  return {
    type,
    descriptionAr,
    promptLine: `[EVENT: ${type}] ${descriptionAr}.`,
  };
}
