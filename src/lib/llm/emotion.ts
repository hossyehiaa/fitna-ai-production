// =====================================================================
// EMOTION TAG SYSTEM (master prompt §3 — core realism feature).
//
// Every student reply MUST start with an emotion tag:
//   [emotion: bored] يا أستاذ ...
// The LLM produces it, the orchestrator parses it, strips it from the
// UI/TTS text, and passes it to the TTS providers (ElevenLabs v3 audio
// tags / Gemini TTS style instructions / Fish latency profiles).
//
// Allowed values (English only — enforced in the prompt, tolerated in
// the parser because multilingual models occasionally emit Arabic):
//   neutral, bored, excited, curious, confused, distracted, annoyed
// =====================================================================

export const ALLOWED_EMOTIONS = [
  "neutral",
  "bored",
  "excited",
  "curious",
  "confused",
  "distracted",
  "annoyed",
] as const;

export type Emotion = (typeof ALLOWED_EMOTIONS)[number];

/** Master-prompt §3 tag format, at the START of the reply. */
export const EMOTION_REGEX = /^\s*\[emotion:\s*([a-zA-Z\u0600-\u06FF_\-]+)\]\s*/;

/**
 * Multilingual tolerance: models sometimes localize the emotion word
 * (observed live: DeepSeek emitted "[emotion: متحمس]"). We map the common
 * Arabic emotion words onto the allowed English set instead of discarding
 * the signal, and default to neutral for anything unrecognized.
 */
const ARABIC_EMOTION_MAP: Record<string, Emotion> = {
  متحمس: "excited",
  متحمسة: "excited",
  حماس: "excited",
  حماسية: "excited",
  سعيد: "excited",
  سعيدة: "excited",
  فرحان: "excited",
  فرحانة: "excited",
  مبسوط: "excited",
  مبسوطة: "excited",
  فضولي: "curious",
  فضولية: "curious",
  فضول: "curious",
  مهتم: "curious",
  مهتمة: "curious",
  مستغرب: "confused",
  مستغربة: "confused",
  مستغرب_او: "confused",
  حيران: "confused",
  حائرة: "confused",
  مرتبك: "confused",
  مرتبكة: "confused",
  مشوش: "confused",
  مشوشة: "confused",
  تائه: "confused",
  تائهة: "confused",
  محتار: "confused",
  محتارة: "confused",
  زهقان: "bored",
  زهقانة: "bored",
  ممل: "bored",
  ملل: "bored",
  مشتت: "distracted",
  مشتتة: "distracted",
  شارد: "distracted",
  شاردة: "distracted",
  سارح: "distracted",
  سارحة: "distracted",
  منزعج: "annoyed",
  منزعجة: "annoyed",
  زعلان: "annoyed",
  زعلانة: "annoyed",
  غاضب: "annoyed",
  غاضبة: "annoyed",
  عصبي: "annoyed",
  عصبية: "annoyed",
  عادي: "neutral",
  طبيعي: "neutral",
  طبيعية: "neutral",
  هادئ: "neutral",
  هادئة: "neutral",
  محايد: "neutral",
};

function normalizeEmotionWord(word: string): Emotion {
  const clean = word.trim().toLowerCase();
  if ((ALLOWED_EMOTIONS as readonly string[]).includes(clean)) return clean as Emotion;
  return ARABIC_EMOTION_MAP[clean] ?? "neutral";
}

/**
 * Parse + strip the leading emotion tag from a completed reply.
 * Absent/invalid tag ⇒ neutral, text returned untouched (trimmed).
 * (Master prompt §3 contract — with the Arabic-word tolerance above.)
 */
export function parseEmotion(raw: string): { emotion: Emotion; clean: string } {
  const match = raw.match(EMOTION_REGEX);
  if (!match) {
    return { emotion: "neutral", clean: raw.trim() };
  }
  return {
    emotion: normalizeEmotionWord(match[1]),
    clean: raw.replace(EMOTION_REGEX, "").trim(),
  };
}

// ---------------------------------------------------------------------
// PROMPT BLOCKS — appended to EVERY persona prompt (system + candidate).
// Verbatim wording from master prompt §3, plus a JSON-path note because
// the production turn routes wrap replies in {"text": "..."}.
// ---------------------------------------------------------------------
export const EMOTION_PROMPT_AR = `ابدأ كل رد بوسام مشاعرك بين قوسين مربعين، مثل:
[emotion: bored] أو [emotion: excited] أو [emotion: confused]
القيم المسموحة بالإنجليزية حصراً: neutral, bored, excited, curious, confused, distracted, annoyed
لو طُلب منك الرد بصيغة JSON، ضع الوسم في بداية قيمة حقل "text" مباشرة ثم أكمل الكلام بعده.
الوسم لا يُنطق أبداً ولا يظهر في كلامك المنطوق — هو إشارة مشاعر للنظام فقط.`;

export const REALISM_RULES_AR = `قواعد الواقعية الصارمة:
- ردودك جملة أو جملتين فقط. ممنوع المحاضرات.
- استخدم حشو طبيعي: أمم، يعني، طب، همم، وش، ليه كذا، يا أستاذ
- ممكن تقاطع المعلم، تكمّل وراه، أو تسرح في النص
- لو الشرح ممل، اسرح واسأل عن شيء مختلف
- تذكّر ما قاله المعلم سابقاً في نفس الجلسة
- ممنوع نهائياً ذكر أنك AI أو نموذج أو مساعد`;

/** Combined block — one append point for every persona builder. */
export const EMOTION_AND_REALISM_BLOCK = `\n\n${EMOTION_PROMPT_AR}\n\n${REALISM_RULES_AR}`;

// ---------------------------------------------------------------------
// STREAMING-SAFE TAG FILTER (master prompt §3 on the low-latency path).
//
// The production stream route forwards LLM deltas → JSON field extractor
// → sentence chunker → TTS while tokens are still arriving. The emotion
// tag sits at the START of the text field, possibly split across several
// deltas — so a plain regex would either leak "[emotion: ...]" into the
// spoken audio or wait for the full reply (latency). This filter buffers
// ONLY until it can decide (≤48 chars), emits the parsed emotion BEFORE
// any text (so the caller can set the TTS voice emotion first), then
// streams the remaining text through untouched.
// ---------------------------------------------------------------------
export function createEmotionTagFilter(
  onText: (textDelta: string) => void,
  onEmotion: (emotion: Emotion) => void
): { push(delta: string): void; flush(): void; emotion(): Emotion } {
  let buf = "";
  let decided = false;
  let emotion: Emotion = "neutral";

  function tryDecide(): void {
    if (decided) return;
    const trimmedStart = buf.replace(/^\s+/, "");
    if (trimmedStart.length === 0) return; // whitespace only so far — wait
    if (!trimmedStart.startsWith("[")) {
      decided = true;
      onText(trimmedStart);
      buf = "";
      return;
    }
    const close = trimmedStart.indexOf("]");
    if (close !== -1) {
      decided = true;
      const inner = trimmedStart.slice(1, close);
      const m = inner.match(/^emotion:\s*(.+)$/i);
      if (m) emotion = normalizeEmotionWord(m[1]);
      onEmotion(emotion);
      const rest = trimmedStart.slice(close + 1).replace(/^\s+/, "");
      buf = "";
      if (rest) onText(rest);
      return;
    }
    if (trimmedStart.length > 48) {
      // A runaway bracket — real speech that happens to start with "[".
      decided = true;
      onEmotion(emotion);
      onText(trimmedStart);
      buf = "";
    }
    // else: incomplete tag — keep buffering (bounded by the 48-char guard).
  }

  return {
    push(delta: string): void {
      if (decided) {
        if (delta) onText(delta);
        return;
      }
      buf += delta;
      tryDecide();
    },
    flush(): void {
      if (decided) return;
      const trimmed = buf.trim();
      decided = true;
      if (trimmed) {
        const { emotion: e, clean } = parseEmotion(trimmed);
        emotion = e;
        onEmotion(e);
        if (clean) onText(clean);
      }
      buf = "";
    },
    emotion(): Emotion {
      return emotion;
    },
  };
}
