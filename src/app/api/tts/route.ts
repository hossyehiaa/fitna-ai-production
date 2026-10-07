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
import { resolveCharacter } from "@/lib/characters/registry";
import { synthesizeElevenLabs, synthesizeGeminiTts, elevenLabsConfigured, geminiTtsConfigured } from "@/lib/tts/providers";

export const runtime = "nodejs";

/** Per-character voice identity resolved from the DB persona profile. */
export interface PersonaVoice {
  fishVoiceId?: string | null;
  edgeVoice?: string | null;
  gender?: string | null;
}

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
  dialect: Dialect = "egyptian",
  personaVoice?: PersonaVoice
): StudentVoiceProfile {
  if (voiceOverride) {
    return { voice: voiceOverride, pitch: "+0Hz", rate: "+0%" };
  }

  // 1. Character identity voice (DB persona profile): the character's
  // own Edge neural voice, matched to gender + nationality. Highest priority.
  if (personaVoice?.edgeVoice) {
    return { voice: personaVoice.edgeVoice, pitch: "+0Hz", rate: "+0%" };
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
// TTS waterfall order — env-configurable via TTS_ORDER.
//
// Example: TTS_ORDER=gemini,elevenlabs,fish makes Gemini TTS the primary
// speaking voice (most natural multilingual prosody + style instructions),
// ElevenLabs v3 second, Fish third. Unknown/omitted tiers are appended in
// the default order; msedge stays the always-last keyless fallback;
// TTS_PROVIDER=msedge still forces the keyless tier only.
// ---------------------------------------------------------------------
export type TtsTier = "fish" | "elevenlabs" | "gemini";

export function resolveTtsOrder(): TtsTier[] {
  const raw = (process.env.TTS_ORDER || "fish,elevenlabs,gemini")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is TtsTier => s === "fish" || s === "elevenlabs" || s === "gemini");
  const order: TtsTier[] = [];
  for (const t of raw) if (!order.includes(t)) order.push(t);
  for (const t of ["fish", "elevenlabs", "gemini"] as TtsTier[]) {
    if (!order.includes(t)) order.push(t);
  }
  return order;
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
  apiKey: string,
  latencyMode: "normal" | "balanced" = "normal",
  mp3Bitrate = 128
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
        mp3_bitrate: mp3Bitrate,
        normalize: true,
        latency: latencyMode,
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
  dialect: Dialect = "egyptian",
  personaVoice?: PersonaVoice,
  latencyMode: "normal" | "balanced" = "normal",
  mp3Bitrate = 128
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) return null;

  // Character voice: DB persona.voice_id first (the character's OWN
  // reference timbre — gender + nationality matched); registry/legacy
  // name-based mapping only as fallback.
  const referenceId =
    personaVoice?.fishVoiceId ?? fishVoiceFor(dialect, personaName ?? "", isFemaleName(personaName));
  return callFishAudio(referenceId, text, apiKey, latencyMode, mp3Bitrate);
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

/** Streaming/synthesis tuning for latency-critical first-audio chunks. */
export type SynthesisOpts = {
  /** Fish Audio latency mode — "balanced" trades a little prosody polish for faster synthesis. */
  fishLatencyMode?: "normal" | "balanced";
  /** MP3 bitrate (kbps) — the latency-critical first chunk uses 64: speech
   *  is transparent at 64kbps MP3 and the smaller payload enqueues + ships
   *  measurably sooner on the time-to-first-audio path. */
  fishMp3Bitrate?: number;
  /** Master prompt §3+§5 — the parsed [emotion: ...] tag, threaded into
   *  ElevenLabs v3 audio tags and the Gemini TTS style instruction. */
  emotion?: string;
};

/**
 * STREAMING Fish synthesis for the latency-critical FIRST audio chunk.
 *
 * Fish's `stream: true` returns raw MP3 bytes as they are synthesized:
 * measured time-to-FIRST-bytes ≈ 430-480ms vs 700-2400ms for the full
 * buffer. We forward a frame-aligned PREFIX (~1s of speech) the moment it
 * arrives — the client starts playback while Fish is still synthesizing
 * the rest, which is then sent as a follow-up gapless chunk.
 *
 * Falls back to the classic full-buffer path (Fish balanced → Edge) when
 * streaming is unavailable, so sessions never break.
 */
export async function synthesizeStudentSpeechStreaming(
  text: string,
  personaName: string | undefined,
  dialect: string | undefined,
  personaVoice: PersonaVoice | undefined,
  onEarlyAudio: (prefix: Buffer, contentType: string) => void,
  opts?: SynthesisOpts
): Promise<{ earlySent: boolean; buffer: Buffer | null; contentType: string }> {
  const dialectValue = parseDialect(dialect);
  const profile = resolveVoiceProfile(personaName, undefined, dialectValue, personaVoice);
  const normalizedText = prepareTextForTts(text.trim(), dialectValue);
  if (!normalizedText) return { earlySent: false, buffer: null, contentType: "audio/mpeg" };

  const bitrate = opts?.fishMp3Bitrate ?? 64;
  const latencyMode = opts?.fishLatencyMode ?? "balanced";
  const tierOrder = resolveTtsOrder();
  const cacheKey = `v9:${tierOrder.join(">")}:${personaVoice?.fishVoiceId ?? "legacy"}:${dialectValue}::${profile.voice}::${profile.pitch}::${profile.rate}::${latencyMode}:${bitrate}:${opts?.emotion ?? "neutral"}::${normalizedText}`;

  // Repeat phrases (greetings, common interjections) — instant full cache.
  if (audioCache.has(cacheKey)) {
    const cached = audioCache.get(cacheKey)!;
    return { earlySent: false, buffer: cached.buffer, contentType: cached.contentType };
  }

  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const referenceId =
    personaVoice?.fishVoiceId ?? fishVoiceFor(dialectValue, personaName ?? "", isFemaleName(personaName));

  // The byte-streaming early-audio prefix is a FISH-specific optimization —
  // it only makes sense when Fish is the FIRST tier in TTS_ORDER. When the
  // order starts with another provider (e.g. TTS_ORDER=gemini,...), skip
  // straight to the classic ordered waterfall so the configured primary
  // voice actually speaks the first chunk too.
  if (apiKey && referenceId && tierOrder[0] === "fish") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FISH_TIMEOUT_MS);
      const res = await fetch(FISH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: fishModel(),
        },
        body: JSON.stringify({
          text: normalizedText.slice(0, MAX_TEXT_CHARS),
          reference_id: referenceId,
          format: "mp3",
          mp3_bitrate: bitrate,
          normalize: true,
          latency: latencyMode,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const parts: Buffer[] = [];
        let earlySent = false;
        let earlyPrefix: Buffer | null = null;
        const EARLY_BYTES = 7_500; // ≈0.9s of 64kbps MP3 — enough to start
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length) parts.push(Buffer.from(value));
          const total = parts.reduce((n, p) => n + p.length, 0);
          if (!earlySent && total >= EARLY_BYTES) {
            const merged = Buffer.concat(parts);
            const cut = lastMp3FrameBoundary(merged, total);
            if (cut > 4000) {
              earlySent = true;
              earlyPrefix = merged.subarray(0, cut);
              onEarlyAudio(earlyPrefix, "audio/mpeg");
              parts.length = 0;
              parts.push(merged.subarray(cut));
            }
          }
        }
        clearTimeout(timer);
        const rest = Buffer.concat(parts);
        if (rest.length > 0 || earlyPrefix) {
          // Cache prefix+rest CONCATENATED under the normal key so a repeat
          // turn gets the whole clip from memory.
          const full = earlyPrefix ? Buffer.concat([earlyPrefix, rest]) : rest;
          audioCache.set(cacheKey, { buffer: full, contentType: "audio/mpeg" });
          trimAudioCache();
          // When the early prefix already went out, the follow-up event
          // carries only the REMAINDER (the client schedules both
          // gaplessly); otherwise this is a normal full-buffer event.
          return { earlySent, buffer: earlySent ? (rest.length > 0 ? rest : null) : full, contentType: "audio/mpeg" };
        }
        // Streaming produced nothing usable — classic fallback below.
      } else {
        clearTimeout(timer);
        console.warn(`Fish streaming returned ${res.status}: ${String(await res.text().catch(() => "")).slice(0, 120)}`);
      }
    } catch (err) {
      console.warn("Fish streaming error:", err);
    }
  }

  // Classic full-buffer path (Fish balanced → Edge) — no early audio.
  const classic = await synthesizeStudentSpeech(text, personaName, undefined, dialect, personaVoice, {
    fishLatencyMode: latencyMode,
    fishMp3Bitrate: bitrate,
  });
  return { earlySent: false, buffer: classic?.buffer ?? null, contentType: classic?.contentType ?? "audio/mpeg" };
}

/**
 * Cut position of the last COMPLETE MP3 frame boundary within the first
 * `limit` bytes (frame sync = 11 set bits, 0xFF 0xE0 mask). Cutting on a
 * frame boundary keeps both halves independently decodable by
 * decodeAudioData in every browser.
 */
function lastMp3FrameBoundary(buf: Buffer, limit: number): number {
  const FRAME_MAX = 210 + 1; // 64kbps@44.1kHz Layer III ≈ 208-209 bytes
  const end = Math.min(buf.length, limit) - FRAME_MAX;
  for (let i = end; i >= 0; i--) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

function trimAudioCache() {
  if (audioCache.size >= 100) {
    const firstKey = audioCache.keys().next().value as string | undefined;
    if (firstKey) audioCache.delete(firstKey);
  }
}

export async function synthesizeStudentSpeech(
  text: string,
  personaName?: string,
  voiceOverride?: string,
  dialect?: string,
  personaVoice?: PersonaVoice,
  opts?: SynthesisOpts
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!text || !text.trim()) return null;

  const dialectValue = parseDialect(dialect);
  const profile = resolveVoiceProfile(personaName, voiceOverride, dialectValue, personaVoice);
  const normalizedText = prepareTextForTts(text.trim(), dialectValue);
  if (!normalizedText) return null;

  const tierOrder = resolveTtsOrder();
  const cacheKey = `v9:${tierOrder.join(">")}:${personaVoice?.fishVoiceId ?? "legacy"}:${dialectValue}::${profile.voice}::${profile.pitch}::${profile.rate}::${opts?.fishLatencyMode ?? "normal"}:${opts?.fishMp3Bitrate ?? 128}:${opts?.emotion ?? "neutral"}::${normalizedText}`;

  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  let resultAudio: { buffer: Buffer; contentType: string } | null = null;

  // MASTER PROMPT §5 — EMOTION-AWARE TTS WATERFALL (order = TTS_ORDER env):
  //   default: Fish Audio S2 → ElevenLabs eleven_v3 → Gemini TTS → msedge-tts
  //   TTS_ORDER=gemini,elevenlabs,fish → Gemini first (natural prosody),
  //   ElevenLabs second (emotional realism), Fish third (dialect clones).
  // Every layer degrades silently to the next on missing key / error /
  // timeout; TTS_PROVIDER=msedge forces the keyless tier only.
  const edgeOnly = process.env.TTS_PROVIDER === "msedge";

  if (!edgeOnly && !voiceOverride) {
    for (const tier of tierOrder) {
      if (resultAudio) break;
      try {
        if (tier === "fish") {
          // Premium neural voices with per-student reference timbres.
          if (process.env.FISH_AUDIO_API_KEY) {
            resultAudio = await synthesizeFishAudio(
              normalizedText,
              personaName,
              dialectValue,
              personaVoice,
              opts?.fishLatencyMode ?? "normal",
              opts?.fishMp3Bitrate ?? 128
            );
          }
        } else if (tier === "elevenlabs") {
          // eleven_v3 — emotional realism (stability 0.35, similarity 0.8;
          // v3 audio tags carry the parsed emotion).
          if (elevenLabsConfigured()) {
            resultAudio = await synthesizeElevenLabs(normalizedText, opts?.emotion, personaVoice?.gender ?? null);
          }
        } else if (tier === "gemini") {
          // Gemini TTS — "Say the following Arabic line in a {emotion}
          // tone:" style instruction, PCM wrapped into WAV.
          if (geminiTtsConfigured()) {
            resultAudio = await synthesizeGeminiTts(normalizedText, opts?.emotion, personaVoice?.gender ?? null);
          }
        }
      } catch (e) {
        console.warn(`TTS tier "${tier}" synthesis error:`, e);
        resultAudio = null;
      }
    }
  }

  // FINAL FALLBACK: Microsoft Edge Neural TTS — dialect-aware voices
  // (ar-EG Shakir/Salma or ar-SA Hamed/Zariyah). Fast, reliable, keyless.
  // Sessions never break when every paid provider is down.
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

// ---------------------------------------------------------------------
// Character voice resolution: DB persona profile (authoritative) with the
// static registry as fallback. The nationality of the character controls
// its voice — Egyptian characters get Egyptian voices, Saudi characters
// get Saudi voices, gender always matched.
// ---------------------------------------------------------------------
async function resolvePersonaVoice(
  personaId?: string,
  avatarKey?: string,
  personaName?: string,
  dialect?: string
): Promise<PersonaVoice | undefined> {
  // 1. DB persona profile (authoritative — persisted character identity)
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const db = await createClient();
    let query = db.from("student_personas").select("voice_id, edge_voice, gender, dialect, avatar_key");
    query = personaId
      ? query.eq("id", personaId)
      : query.eq("avatar_key", avatarKey ?? "__none__");
    const { data } = await query.limit(1);
    const row = (data as Array<{ voice_id?: string | null; edge_voice?: string | null; gender?: string; dialect?: string }> | null)?.[0];
    if (row) {
      return { fishVoiceId: row.voice_id ?? null, edgeVoice: row.edge_voice ?? null, gender: row.gender ?? null };
    }
  } catch {
    // fall through to registry
  }

  // 2. Static registry fallback (avatarKey or name → identity)
  const character = resolveCharacter(avatarKey, personaName);
  if (character) {
    // Registry knows identity; fish reference + edge voice per nationality
    // and gender come from the dialect map defaults.
    const edgeVoice =
      character.nationality === "SA"
        ? character.gender === "female"
          ? EDGE_VOICES.saudi.female
          : EDGE_VOICES.saudi.male
        : character.gender === "female"
        ? EDGE_VOICES.egyptian.female
        : EDGE_VOICES.egyptian.male;
    const fishVoiceId = fishVoiceFor(
      character.nationality === "SA" ? "saudi" : "egyptian",
      character.key,
      character.gender === "female"
    );
    return { fishVoiceId, edgeVoice, gender: character.gender };
  }
  return undefined;
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

    const { text, personaName, voiceOverride, dialect, personaId, avatarKey, emotion } = (await request.json()) as {
      text?: string;
      personaName?: string;
      voiceOverride?: string;
      dialect?: string;
      personaId?: string;
      avatarKey?: string;
      emotion?: string;
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "No text provided for audio synthesis" }, { status: 400 });
    }

    // Character voice identity: resolve from the DB persona profile when a
    // personaId is supplied (live-room fast path pre-synthesis does this
    // internally); for direct client calls resolve via the registry using
    // the character's avatar key / name. The voice ALWAYS belongs to the
    // character — the client never picks voices.
    let personaVoice: PersonaVoice | undefined;
    if (personaId || avatarKey || personaName) {
      personaVoice = await resolvePersonaVoice(personaId, avatarKey, personaName, dialect);
    }

    const resultAudio = await synthesizeStudentSpeech(text, personaName, voiceOverride, dialect, personaVoice, {
      emotion,
    });

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
