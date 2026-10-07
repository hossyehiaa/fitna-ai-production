// =====================================================================
// TTS providers #2 and #3 of the master-prompt waterfall (§5):
//   1. Fish Audio S2            — dialect-cloned voices (product core — api/tts/route.ts)
//   2. ElevenLabs eleven_v3     — best emotional realism        ← this file
//   3. Gemini TTS               — style-instruction synthesis    ← this file
//   4. msedge-tts               — keyless fallback               (api/tts/route.ts)
//
// Both providers here are OPTIONAL: each returns null instantly when its
// API key is absent, when the request fails, or when it times out — the
// orchestrator in api/tts/route.ts simply walks to the next provider, so
// the session NEVER breaks and the waterfall degrades gracefully in
// exactly the order above.
//
// Emotion awareness (§3+§5): the parsed [emotion: ...] tag is threaded in
//   * ElevenLabs: v3 interprets bracketed AUDIO TAGS natively — we map the
//     allowed emotion set onto v3's documented tags (unknown/unmapped ⇒ no
//     tag, never an invented one that could be spoken aloud).
//   * Gemini: the text is prefixed with an English style instruction
//     ("Say the following Arabic line in a {emotion} tone:") exactly as
//     specified by the master prompt.
// =====================================================================

export type TtsAudioResult = { buffer: Buffer; contentType: string } | null;

const ELEVEN_TIMEOUT_MS = 15_000;
const GEMINI_TTS_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 1000;

// ---------------------------------------------------------------------
// ElevenLabs — eleven_v3 (emotional realism layer).
// ---------------------------------------------------------------------

/**
 * eleven_v3 documented audio tags we map the emotion set onto. Only tags
 * from this table are ever emitted — anything unmapped gets NO tag rather
 * than a guess that v3 might read aloud literally.
 */
const ELEVEN_EMOTION_TAGS: Record<string, string> = {
  excited: "[excited]",
  bored: "[bored]",
  curious: "[curious]",
  confused: "[confused]",
  annoyed: "[frustrated]",
  distracted: "[whispers]",
  neutral: "", // no tag — the voice_settings expressiveness carries it
};

const ELEVEN_VOICES = {
  female: process.env.ELEVENLABS_VOICE_FEMALE || "21m00Tcm4TlvDq8ikWAM", // Rachel
  male: process.env.ELEVENLABS_VOICE_MALE || "pNInz6obpgDQGcFmaJgB", // Adam
};

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function synthesizeElevenLabs(
  text: string,
  emotion: string | undefined,
  gender: string | null | undefined,
  voiceOverride?: string
): Promise<TtsAudioResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const voiceId = voiceOverride || (gender === "female" ? ELEVEN_VOICES.female : ELEVEN_VOICES.male);
  const emotionTag = emotion ? ELEVEN_EMOTION_TAGS[emotion] ?? "" : "";
  const payload = emotionTag ? `${emotionTag} ${text.slice(0, MAX_TEXT_CHARS)}` : text.slice(0, MAX_TEXT_CHARS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELEVEN_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          model_id: "eleven_v3",
          text: payload,
          // Master prompt §5: stability 0.35 = more expressive,
          // similarity_boost 0.8.
          voice_settings: { stability: 0.35, similarity_boost: 0.8 },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`ElevenLabs (eleven_v3, voice=${voiceId}) returned ${res.status}: ${String(errText).slice(0, 160)}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return null;
    return { buffer, contentType: "audio/mpeg" };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      console.warn("ElevenLabs TTS timed out — falling to next provider");
    } else {
      console.warn("ElevenLabs request exception:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// Gemini TTS — style-instruction layer (§5).
// ---------------------------------------------------------------------

const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_TTS_VOICES = {
  female: process.env.GEMINI_TTS_VOICE_FEMALE || "Leda",
  male: process.env.GEMINI_TTS_VOICE_MALE || "Puck",
};

export function geminiTtsConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Wrap raw signed 16-bit LE PCM in a canonical 44-byte WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = 24_000, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeGeminiTts(
  text: string,
  emotion: string | undefined,
  gender: string | null | undefined,
  voiceOverride?: string
): Promise<TtsAudioResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const voiceName = voiceOverride || (gender === "female" ? GEMINI_TTS_VOICES.female : GEMINI_TTS_VOICES.male);
  const tone = emotion && emotion !== "neutral" ? emotion : "neutral";
  // Master prompt §5: English style instruction prefix, then the Arabic line.
  const spokenText = `Say the following Arabic line in a ${tone} tone: ${text.slice(0, MAX_TEXT_CHARS)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TTS_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: spokenText }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`Gemini TTS (model=${GEMINI_TTS_MODEL}, voice=${voiceName}) returned ${res.status}: ${String(errText).slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    };
    const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      console.warn("Gemini TTS returned no inline audio data");
      return null;
    }
    const pcm = Buffer.from(inline.data, "base64");
    if (pcm.length === 0) return null;
    // Gemini returns raw signed 16-bit PCM (audio/L16;codec=pcm;rate=24000
    // by default) — wrap it in a WAV container so every browser decodes it.
    const rateMatch = /rate=(\d+)/.exec(inline.mimeType ?? "");
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24_000;
    return { buffer: pcmToWav(pcm, sampleRate), contentType: "audio/wav" };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      console.warn("Gemini TTS timed out — falling to next provider");
    } else {
      console.warn("Gemini TTS request exception:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
