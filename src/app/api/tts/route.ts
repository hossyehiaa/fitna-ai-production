import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { normalizeEgyptianSpeech } from "@/lib/ai/egyptianSpeechNormalizer";
import {
  EDGE_VOICES,
  fishVoiceFor,
  isFemaleName,
  parseDialect,
  type Dialect,
} from "@/lib/ai/dialects";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export type StudentVoiceProfile = {
  voice: string;
  pitch: string;
  rate: string;
};

/**
 * Distinct student acoustic profiles for Egyptian classroom personas
 * (original Fitna AI tuning — unchanged).
 */
const STUDENT_PROFILES: Record<string, StudentVoiceProfile> = {
  // عمر (Omar - 10 yrs): energetic, curious boy, boyish pitch & active tempo
  "عمر": { voice: "ar-EG-ShakirNeural", pitch: "+24Hz", rate: "+8%" },
  "omar": { voice: "ar-EG-ShakirNeural", pitch: "+24Hz", rate: "+8%" },

  // سارة (Sara - 11 yrs): diligent, attentive schoolgirl, clear Cairo Egyptian articulation
  "سارة": { voice: "ar-EG-SalmaNeural", pitch: "+20Hz", rate: "+4%" },
  "sara": { voice: "ar-EG-SalmaNeural", pitch: "+20Hz", rate: "+4%" },
  "sarah": { voice: "ar-EG-SalmaNeural", pitch: "+20Hz", rate: "+4%" },

  // ياسين (Yassin - 9 yrs): playful, spontaneous, younger boy tone, brisk tempo
  "ياسين": { voice: "ar-EG-ShakirNeural", pitch: "+30Hz", rate: "+12%" },
  "yassin": { voice: "ar-EG-ShakirNeural", pitch: "+30Hz", rate: "+12%" },
  "yasin": { voice: "ar-EG-ShakirNeural", pitch: "+30Hz", rate: "+12%" },

  // نور (Nour - 10 yrs): quiet, introverted, soft-spoken girl, gentle & thoughtful pacing
  "نور": { voice: "ar-EG-SalmaNeural", pitch: "+24Hz", rate: "-2%" },
  "nour": { voice: "ar-EG-SalmaNeural", pitch: "+24Hz", rate: "-2%" },
};

/**
 * Saudi classroom profiles (ar-SA neural voices with the same natural
 * child-like pitch/rate offsets per persona personality).
 */
const SAUDI_STUDENT_PROFILES: Record<string, StudentVoiceProfile> = {
  "ريم": { voice: "ar-SA-ZariyahNeural", pitch: "+20Hz", rate: "+4%" },
  "reem": { voice: "ar-SA-ZariyahNeural", pitch: "+20Hz", rate: "+4%" },
  "سلطان": { voice: "ar-SA-HamedNeural", pitch: "+22Hz", rate: "+6%" },
  "sultan": { voice: "ar-SA-HamedNeural", pitch: "+22Hz", rate: "+6%" },
  "فهد": { voice: "ar-SA-HamedNeural", pitch: "+26Hz", rate: "+9%" },
  "fahad": { voice: "ar-SA-HamedNeural", pitch: "+26Hz", rate: "+9%" },
  "جوري": { voice: "ar-SA-ZariyahNeural", pitch: "+24Hz", rate: "-2%" },
  "jori": { voice: "ar-SA-ZariyahNeural", pitch: "+24Hz", rate: "-2%" },
};

const DEFAULT_EGYPTIAN_FEMALE: StudentVoiceProfile = {
  voice: "ar-EG-SalmaNeural",
  pitch: "+16Hz",
  rate: "+2%",
};

const DEFAULT_EGYPTIAN_MALE: StudentVoiceProfile = {
  voice: "ar-EG-ShakirNeural",
  pitch: "+20Hz",
  rate: "+6%",
};

const DEFAULT_SAUDI_FEMALE: StudentVoiceProfile = {
  voice: EDGE_VOICES.saudi.female,
  pitch: "+16Hz",
  rate: "+2%",
};

const DEFAULT_SAUDI_MALE: StudentVoiceProfile = {
  voice: EDGE_VOICES.saudi.male,
  pitch: "+20Hz",
  rate: "+6%",
};

function resolveVoiceProfile(
  personaName?: string,
  voiceOverride?: string,
  dialect: Dialect = "egyptian"
): StudentVoiceProfile {
  if (voiceOverride) {
    return { voice: voiceOverride, pitch: "+0Hz", rate: "+0%" };
  }

  const normalizedName = (personaName ?? "").trim().toLowerCase();
  if (dialect === "saudi") {
    if (SAUDI_STUDENT_PROFILES[normalizedName]) {
      return SAUDI_STUDENT_PROFILES[normalizedName];
    }
    return isFemaleName(personaName) ? DEFAULT_SAUDI_FEMALE : DEFAULT_SAUDI_MALE;
  }

  if (STUDENT_PROFILES[normalizedName]) {
    return STUDENT_PROFILES[normalizedName];
  }
  return isFemaleName(personaName) ? DEFAULT_EGYPTIAN_FEMALE : DEFAULT_EGYPTIAN_MALE;
}

// ---------------------------------------------------------------------
// Fish Audio — PRIMARY production TTS.
//
// The account uses the FREE flagship model `s2.1-pro-free`, selected via
// the `model` REQUEST HEADER (verified live: HTTP 200 + real MP3 with
// per-student reference voices). Without the header the server defaults
// to the paid s2.1-pro and returns 402 — that was the original bug.
// ---------------------------------------------------------------------
const FISH_ENDPOINT = "https://api.fish.audio/v1/tts";
const FISH_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 1000;

function fishModel(): string {
  return process.env.FISH_AUDIO_MODEL || "s2.1-pro-free";
}

async function callFishAudio(
  referenceId: string,
  text: string,
  apiKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FISH_TIMEOUT_MS);
  try {
    const res = await fetch(FISH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // FREE model selection — required header, omitted => paid s2.1-pro => 402.
        model: fishModel(),
      },
      body: JSON.stringify({
        text: text.slice(0, MAX_TEXT_CHARS),
        reference_id: referenceId,
        format: "mp3",
        mp3_bitrate: 128,
        normalize: true,
        latency: "normal",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // 402 = API credit (paid models); 401/403 = auth; 5xx = outage —
      // all degrade silently to Edge TTS so the session never breaks.
      console.warn(
        `Fish Audio (model=${fishModel()}) returned ${res.status}: ${String(errText).slice(0, 160)}`
      );
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return null;
    return { buffer, contentType: "audio/mpeg" };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      console.warn("Fish Audio TTS timed out — falling back to Edge TTS");
    } else {
      console.warn("Fish Audio request exception:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeFishAudio(
  text: string,
  personaName?: string,
  dialect: Dialect = "egyptian"
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) return null;

  const referenceId = fishVoiceFor(dialect, personaName ?? "", isFemaleName(personaName));
  return callFishAudio(referenceId, text, apiKey);
}

// ---------------------------------------------------------------------
// TTS text preparation per dialect.
// ---------------------------------------------------------------------
function prepareTextForTts(rawText: string, dialect: Dialect): string {
  const text = (rawText || "").trim();
  if (!text) return "";
  if (dialect === "egyptian") {
    // Original normalizer: Egyptian phonetic hints so neural engines do not
    // revert to MSA pronunciation.
    return normalizeEgyptianSpeech(text);
  }
  // Saudi: light cleanup only — strip stage directions, collapse spaces.
  return text
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// In-memory cache to avoid re-synthesizing the exact same normalized text and voice parameters
type CachedAudio = {
  buffer: Buffer;
  contentType: string;
};
const audioCache = new Map<string, CachedAudio>();

export async function synthesizeStudentSpeech(
  text: string,
  personaName?: string,
  voiceOverride?: string,
  dialect?: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!text || !text.trim()) return null;

  const dialectValue = parseDialect(dialect);
  const profile = resolveVoiceProfile(personaName, voiceOverride, dialectValue);
  const normalizedText = prepareTextForTts(text.trim(), dialectValue);
  if (!normalizedText) return null;

  const cacheKey = `v5:fish-${fishModel()}:${dialectValue}::${profile.voice}::${profile.pitch}::${profile.rate}:::${normalizedText}`;

  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  let resultAudio: { buffer: Buffer; contentType: string } | null = null;

  // 1. Priority 1: Fish Audio (free s2.1-pro-free model) — premium neural
  //    voices with per-student reference timbres. Falls back on any
  //    failure (402 credit, timeout, outage).
  if (!voiceOverride && process.env.FISH_AUDIO_API_KEY) {
    try {
      resultAudio = await synthesizeFishAudio(normalizedText, personaName, dialectValue);
    } catch (e) {
      console.warn("Fish Audio synthesis error:", e);
    }
  }

  // 2. Priority 2 (fallback): Microsoft Edge Neural TTS — dialect-aware
  //    voices (ar-EG Shakir/Salma or ar-SA Hamed/Zariyah). Fast, reliable,
  //    keyless. Sessions never break when Fish Audio is unavailable.
  if (!resultAudio) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(profile.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(normalizedText, {
        pitch: profile.pitch,
        rate: profile.rate,
      });

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk as Buffer);
      }
      resultAudio = { buffer: Buffer.concat(chunks), contentType: "audio/mpeg" };
    } catch (err) {
      console.warn("EdgeTTS synthesis error:", err);
    }
  }

  if (resultAudio) {
    if (audioCache.size >= 100) {
      const firstKey = audioCache.keys().next().value;
      if (firstKey) audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, resultAudio);
  }

  return resultAudio;
}

export async function POST(request: NextRequest) {
  try {
    // Auth: the original route accepted anonymous callers; production
    // requires an authenticated teacher (the live room calls this with
    // the session cookie, so behavior is unchanged for real users).
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const { text, personaName, voiceOverride, dialect } = (await request.json()) as {
      text?: string;
      personaName?: string;
      voiceOverride?: string;
      dialect?: string;
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "No text provided for audio synthesis" }, { status: 400 });
    }

    const resultAudio = await synthesizeStudentSpeech(text, personaName, voiceOverride, dialect);

    if (!resultAudio) {
      return NextResponse.json({ error: "Failed to synthesize audio" }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(resultAudio.buffer), {
      headers: {
        "Content-Type": resultAudio.contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("TTS generation failed:", err);
    return NextResponse.json({ error: "Failed to synthesize audio" }, { status: 500 });
  }
}
