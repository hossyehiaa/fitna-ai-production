// =====================================================================
// TEACHER TONE ANALYSIS (master prompt §8) — Gemini 2.5 Pro, audio input,
// DIRECT Gemini API (not via OpenRouter — audio multimodal call).
//
// Analyzes the teacher's voice for: confidence, speed, enthusiasm,
// stress, warmth. Returns null on ANY failure (missing key, bad audio,
// quota, timeout) — the report generator then simply omits the tone
// section, exactly as the master prompt specifies ("إن وُجدت بيانات
// الصوت").
// =====================================================================

export interface TeacherToneAnalysis {
  confidence: number; // 0-100
  speed: number; // 0-100 (slow → fast)
  enthusiasm: number; // 0-100
  stress: number; // 0-100 (low → high)
  warmth: number; // 0-100
  notesAr?: string;
}

const TONE_MODEL = process.env.GEMINI_TONE_MODEL || "gemini-2.5-pro";
const TONE_TIMEOUT_MS = 20_000;

export function toneAnalysisConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Strip ```json fences some models wrap around JSON replies. */
function stripJsonFences(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : raw).trim();
}

function clampPercent(value: unknown): number | undefined {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function analyzeTeacherTone(
  audioBase64: string,
  mimeType: string
): Promise<TeacherToneAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !audioBase64) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TONE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TONE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                // Strip a data-URL prefix if present.
                { inlineData: { mimeType, data: audioBase64.replace(/^data:[^;]+;base64,/, "") } },
                {
                  text: "حلّل نبرة المتحدث في هذا المقطع الصوتي بدقة: الثقة، السرعة، الحماس، التوتر، الدفء. أرجع JSON فقط بهذا الشكل: {\"confidence\": 0-100, \"speed\": 0-100, \"enthusiasm\": 0-100, \"stress\": 0-100, \"warmth\": 0-100, \"notes_ar\": \"جملة أو جملتان بالعربية\"}",
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.2 },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`Gemini tone analysis returned ${res.status}: ${String(errText).slice(0, 140)}`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "";
    if (!raw) return null;
    const parsed = JSON.parse(stripJsonFences(raw)) as Record<string, unknown>;

    const confidence = clampPercent(parsed.confidence);
    const speed = clampPercent(parsed.speed);
    const enthusiasm = clampPercent(parsed.enthusiasm);
    const stress = clampPercent(parsed.stress);
    const warmth = clampPercent(parsed.warmth);
    if (confidence === undefined && speed === undefined && enthusiasm === undefined) return null;

    return {
      confidence: confidence ?? 50,
      speed: speed ?? 50,
      enthusiasm: enthusiasm ?? 50,
      stress: stress ?? 50,
      warmth: warmth ?? 50,
      notesAr: typeof parsed.notes_ar === "string" ? parsed.notes_ar.slice(0, 300) : undefined,
    };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      console.warn("Gemini tone analysis timed out — report will omit the tone section");
    } else {
      console.warn("Gemini tone analysis failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Aggregate tone across up to `maxSamples` teacher audio clips (the newest
 * ones), averaging the five axes. Returns null when no clips or no key.
 */
export async function analyzeTeacherToneAcross(
  clips: { audioBase64: string; mimeType: string }[],
  maxSamples = 2
): Promise<TeacherToneAnalysis | null> {
  if (clips.length === 0 || !toneAnalysisConfigured()) return null;
  const sample = clips.slice(-maxSamples);
  const analyses = await Promise.all(sample.map((c) => analyzeTeacherTone(c.audioBase64, c.mimeType)));
  const valid = analyses.filter((a): a is TeacherToneAnalysis => a !== null);
  if (valid.length === 0) return null;
  const avg = (pick: (a: TeacherToneAnalysis) => number) =>
    Math.round(valid.reduce((sum, a) => sum + pick(a), 0) / valid.length);
  return {
    confidence: avg((a) => a.confidence),
    speed: avg((a) => a.speed),
    enthusiasm: avg((a) => a.enthusiasm),
    stress: avg((a) => a.stress),
    warmth: avg((a) => a.warmth),
    notesAr: valid.map((a) => a.notesAr).filter(Boolean).join(" ")[0] ? valid[0]?.notesAr : undefined,
  };
}
