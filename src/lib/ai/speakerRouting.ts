/**
 * SPEAKER ROUTING LAYER — context-aware target character resolution.
 *
 * Resolves WHICH student the teacher addressed from the raw transcript +
 * conversation state. Routing uses persistent character IDs (persona ids +
 * character_key), never image positions or frontend indexes.
 *
 * Rules (production contract):
 *  1. Explicit vocative ("يا سلطان", "سلطان، ...") → ONLY that character.
 *  2. Name mentioned in a question directed at someone → that character.
 *  3. No name → the current conversational speaker (last responder), or the
 *     most contextually appropriate participant (hand raised > not yet
 *     spoken > highest attention). Never random switching.
 */

export interface RoutingParticipant {
  personaId: string;
  name: string;
  characterKey?: string | null;
  gender?: string;
  hasHandRaised?: boolean;
  timesSpoken?: number;
  attention?: number;
}

export interface RoutingContext {
  lastSpeakingPersonaId?: string | null;
  /** Persona ids that produced the most recent responses, newest first. */
  recentSpeakerPersonaIds?: string[];
}

export interface RoutingResult {
  /** The persona the teacher explicitly addressed, if any. */
  targetPersonaId: string | null;
  /** The character_key of the explicit target, if any. */
  targetCharacterKey: string | null;
  targetName: string | null;
  /** How the target was resolved — surfaces in API responses + tests. */
  reason: "explicit_name" | "current_speaker" | "hand_raised" | "least_heard" | "attention" | "none";
}

/** Arabic vocative + name patterns. Name is captured per participant. */
function nameMentionPatterns(name: string): RegExp[] {
  const n = name.trim();
  if (!n) return [];
  return [
    // "يا سلطان" — canonical vocative anywhere in the utterance
    new RegExp(`(?:يا|يَا)\\s*${escapeRe(n)}(?:\\s|$|[,،؟?.!؛:])`, "u"),
    // "سلطان،" — name at the start followed by punctuation (direct address)
    new RegExp(`^\\s*${escapeRe(n)}\\s*[,،:؛]\\s*`, "u"),
    // "سلطان هل..." — name at utterance start followed by a question word
    new RegExp(`^\\s*${escapeRe(n)}\\s+(?:هل|ما|مَا|لماذا|لِماذا|كيف|كَيف|متى|أين|أَين|اشرح|اِشرح|قل|قُل|أجب|اِجب)`, "u"),
    // "بالله يا سلطان" / "أريد أن أسألك يا سلطان" covered by rule 1
  ];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the intended recipient of a teacher utterance.
 * Returns targetPersonaId=null when no explicit target exists — callers
 * then keep the natural classroom flow (multi/next speaker).
 */
export function resolveTargetCharacter(
  transcript: string,
  participants: RoutingParticipant[],
  context: RoutingContext = {}
): RoutingResult {
  const text = (transcript || "").trim();
  if (!text || participants.length === 0) {
    return { targetPersonaId: null, targetCharacterKey: null, targetName: null, reason: "none" };
  }

  // --- Rule 1: explicit vocative / direct address by name ---
  // Longest names first so "جوري" doesn't match inside longer names.
  const sorted = [...participants].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    for (const pattern of nameMentionPatterns(p.name)) {
      if (pattern.test(text)) {
        return {
          targetPersonaId: p.personaId,
          targetCharacterKey: p.characterKey ?? null,
          targetName: p.name,
          reason: "explicit_name",
        };
      }
    }
  }

  // --- No explicit target: context-aware continuation ---
  // (explicit "anyone" questions like "هل يمكن لأحد أن يساعدني؟" fall
  // through to the caller's natural selection — we only suggest here)
  const byId = new Map(participants.map((p) => [p.personaId, p]));

  // Rule 2: continue with the current speaker when the teacher is replying
  // to whoever just spoke (short acknowledgement / follow-up).
  const current = context.lastSpeakingPersonaId ? byId.get(context.lastSpeakingPersonaId) : undefined;
  if (current) {
    return {
      targetPersonaId: current.personaId,
      targetCharacterKey: current.characterKey ?? null,
      targetName: current.name,
      reason: "current_speaker",
    };
  }

  // Rule 3: a student with a raised hand is the natural next responder.
  const handRaised = participants.find((p) => p.hasHandRaised);
  if (handRaised) {
    return {
      targetPersonaId: handRaised.personaId,
      targetCharacterKey: handRaised.characterKey ?? null,
      targetName: handRaised.name,
      reason: "hand_raised",
    };
  }

  // Rule 4: the least-heard attentive student keeps the classroom inclusive.
  const leastHeard = [...participants].sort(
    (a, b) => (a.timesSpoken ?? 0) - (b.timesSpoken ?? 0) || (b.attention ?? 0) - (a.attention ?? 0)
  )[0];
  if (leastHeard) {
    return {
      targetPersonaId: leastHeard.personaId,
      targetCharacterKey: leastHeard.characterKey ?? null,
      targetName: leastHeard.name,
      reason: "least_heard",
    };
  }

  return { targetPersonaId: null, targetCharacterKey: null, targetName: null, reason: "none" };
}

/**
 * True when the utterance explicitly names a participant (used to force
 * single-responder turns — ONLY the named character responds).
 */
export function explicitTargetFromUtterance(
  transcript: string,
  participants: RoutingParticipant[]
): RoutingParticipant | null {
  const text = (transcript || "").trim();
  if (!text) return null;
  const sorted = [...participants].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    for (const pattern of nameMentionPatterns(p.name)) {
      if (pattern.test(text)) return p;
    }
  }
  return null;
}
