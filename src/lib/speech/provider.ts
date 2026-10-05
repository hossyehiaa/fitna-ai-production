// =====================================================================
// Speech provider abstraction.
//
// getSpeechConfig(dialect) resolves voice/locale/provider per dialect.
// The frontend NEVER talks to a TTS/STT provider directly — every call
// goes through the secure backend API (secrets stay server-side).
//
// Current providers:
//   * Fish Audio (premium neural TTS, needs FISH_AUDIO_API_KEY) — primary
//     when the key is configured.
//   * Microsoft Edge neural TTS (free, no API key, ar-SA + ar-EG voices) —
//     built-in fallback and zero-cost default.
// The chain lives in tts.ts: fish-audio -> msedge. Adding another provider
// (ElevenLabs, Google...) = implement SpeechSynthesizer and register it in
// getSynthesizer(). No route changes needed.
// =====================================================================

import { getSpeechConfig, parseDialect, DIALECT_CONFIG, type Dialect } from '@/lib/dialect/config'

export interface SynthesisRequest {
  text: string
  dialect: Dialect
  /** Agent key (sara/omar/...) to pick gender-matched voices with natural offsets */
  agentKey?: string
  voiceOverride?: string
  rate?: string // e.g. "+8%"
  pitch?: string // e.g. "+20Hz"
}

export interface SynthesisResult {
  audio: Buffer // mp3
  contentType: string
  voiceUsed: string
}

export interface SpeechSynthesizer {
  readonly name: string
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>
}

/** Typed synthesis failure — providers throw this; routes map it to a clean
 *  Arabic message. Provider internals (keys, upstream errors) NEVER surface. */
export class TTSError extends Error {
  constructor(
    public code: 'provider_unavailable' | 'insufficient_credit' | 'tts_timeout' | 'empty_audio' | 'bad_input'
  ) {
    super(code)
  }
}

// ---------------------------------------------------------------------
// Voice selection: gender-matched neural voices per dialect with subtle
// pitch/rate offsets so each student persona sounds like a distinct child.
// ---------------------------------------------------------------------

interface VoiceProfile {
  voice: string
  pitch: string
  rate: string
}

const AGENT_VOICE_OFFSETS: Record<string, { gender: 'female' | 'male'; pitch: string; rate: string }> = {
  // Sara (سارة) — diligent, bright schoolgirl
  sara: { gender: 'female', pitch: '+20Hz', rate: '+4%' },
  // Nour (نور) — gentle, soft-spoken girl
  nour: { gender: 'female', pitch: '+24Hz', rate: '-2%' },
  // Omar (عمر) — energetic boy
  omar: { gender: 'male', pitch: '+24Hz', rate: '+8%' },
  // Yassin (ياسين) — younger playful boy
  yassin: { gender: 'male', pitch: '+30Hz', rate: '+12%' },
}

export function resolveVoiceProfile(
  dialect: Dialect,
  agentKey?: string,
  voiceOverride?: string,
  rate?: string,
  pitch?: string
): VoiceProfile {
  const cfg = DIALECT_CONFIG[parseDialect(dialect)]
  if (voiceOverride) {
    return { voice: voiceOverride, pitch: pitch || '+0Hz', rate: rate || '+0%' }
  }
  const agent = agentKey ? AGENT_VOICE_OFFSETS[agentKey] : undefined
  const gender = agent?.gender ?? 'female'
  return {
    voice: gender === 'female' ? cfg.edgeVoices.female : cfg.edgeVoices.male,
    pitch: pitch || agent?.pitch || '+16Hz',
    rate: rate || agent?.rate || '+2%',
  }
}

export { getSpeechConfig }

// The active synthesizer is defined in tts.ts (avoids circular imports at
// module-eval time); this file intentionally exports only the contract +
// voice resolution so both routes and tests can depend on it.
