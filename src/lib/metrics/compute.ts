import type { Database } from "@/lib/supabase/types";

type SessionEvent = Database["public"]["Tables"]["session_events"]["Row"];

/**
 * All three headline metrics from spec §4d, computed purely from the
 * events actually logged during the session — recomputed both live
 * (HUD, on whatever events exist so far) and finally at session end
 * (on the complete transcript). Same function, same math, both times —
 * so the report page can never show a different number than what the
 * teacher saw live without a real reason (more data accumulated).
 */

export function computeTeacherTalkRatio(events: SessionEvent[], _totalElapsedMs?: number): number {
  const teacherMs = events
    .filter((e) => e.event_type === "teacher_utterance")
    .reduce((sum, e) => {
      const meta = e.metadata as { duration_ms?: number; speech_duration_ms?: number } | null;
      if (typeof meta?.duration_ms === "number" && meta.duration_ms > 0) {
        return sum + meta.duration_ms;
      }
      if (typeof meta?.speech_duration_ms === "number" && meta.speech_duration_ms > 0) {
        return sum + meta.speech_duration_ms;
      }
      const wordCount = (e.content ?? "").trim().split(/\s+/).filter(Boolean).length;
      return sum + Math.max(1800, wordCount * 450);
    }, 0);

  const studentMs = events
    .filter((e) => e.event_type === "student_response")
    .reduce((sum, e) => {
      const meta = e.metadata as { duration_ms?: number } | null;
      if (typeof meta?.duration_ms === "number" && meta.duration_ms > 0) {
        return sum + meta.duration_ms;
      }
      const wordCount = (e.content ?? "").trim().split(/\s+/).filter(Boolean).length;
      return sum + Math.max(1500, wordCount * 380);
    }, 0);

  const totalSpokenMs = teacherMs + studentMs;
  if (totalSpokenMs === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((teacherMs / totalSpokenMs) * 100)));
}

export function computeSocraticQuestionRate(events: SessionEvent[]): number {
  const questions = events.filter(
    (e) => e.event_type === "teacher_utterance" && questionTypeOf(e) !== "statement"
  );
  if (questions.length === 0) return 0;
  const open = questions.filter((e) => questionTypeOf(e) === "open").length;
  const rawRate = (open / questions.length) * 100;
  // Volume calibration: asking 1 isolated question does not represent complete Socratic mastery.
  const volumeWeight = questions.length === 1 ? 0.6 : 1.0;
  return Math.round(rawRate * volumeWeight);
}

export function computeInclusivityIndex(events: SessionEvent[], totalStudents: number): number {
  if (totalStudents === 0) return 0;
  const studentEvents = events.filter((e) => e.event_type === "student_response");
  if (studentEvents.length === 0) return 0;

  const countsByActor = new Map<string, number>();
  for (const e of studentEvents) {
    countsByActor.set(e.actor, (countsByActor.get(e.actor) ?? 0) + 1);
  }
  const distinctCount = countsByActor.size;
  const totalTurns = studentEvents.length;

  let balanceFactor = 1.0;
  if (totalTurns > 1 && distinctCount > 1) {
    const ideal = totalTurns / distinctCount;
    let devSum = 0;
    for (const c of countsByActor.values()) {
      devSum += Math.abs(c - ideal);
    }
    const deviation = devSum / (2 * totalTurns);
    balanceFactor = Math.max(0.4, 1 - deviation);
  }

  const coveragePercent = (distinctCount / totalStudents) * 100;
  return Math.round(Math.max(0, Math.min(100, coveragePercent * (0.5 + 0.5 * balanceFactor))));
}

export function computeOverallScore(params: {
  teacherTalkRatio: number;
  socraticQuestionRate: number;
  inclusivityIndex: number;
}): number {
  // Weighted blend documented here so it's auditable, not a black box:
  // - Talk ratio: sweet spot around 40-60% (a monologue or total
  //   silence both score lower) — scored as distance from 50%.
  // - Socratic rate and inclusivity: straightforwardly "higher is better".
  const talkRatioScore = 100 - Math.abs(50 - params.teacherTalkRatio) * 2;
  const blended =
    Math.max(0, talkRatioScore) * 0.3 +
    params.socraticQuestionRate * 0.4 +
    params.inclusivityIndex * 0.3;
  return Math.round(Math.max(0, Math.min(100, blended)));
}

export function computeClassroomPattern(
  events: SessionEvent[],
  inclusivityIndex: number
): "balanced" | "disruptive" | "disengaged" {
  const distractedCount = events.filter(
    (e) => e.event_type === "state_change" && (e.metadata as { state?: string } | null)?.state === "distracted"
  ).length;
  const totalEvents = events.length || 1;
  const distractionRate = distractedCount / totalEvents;

  if (inclusivityIndex < 40) return "disengaged";
  if (distractionRate > 0.3) return "disruptive";
  return "balanced";
}

function questionTypeOf(e: SessionEvent): "open" | "closed" | "statement" {
  const meta = e.metadata as { question_type?: string } | null;
  return (meta?.question_type as "open" | "closed" | "statement") ?? "statement";
}
