// =====================================================================
// Fish Audio TTS provider — premium neural speech synthesis.
//
// Server-only: FISH_AUDIO_API_KEY is read from the environment and NEVER
// appears in responses, logs, or client bundles. All failures are mapped to
// typed TTSError codes; the provider chain in tts.ts degrades to the Edge
// neural voices so a Fish outage (or an account with no API credit) can
// never break a live session.
//
// Voice strategy: gender-matched young Arabic voices from the public Fish
// Audio library (production-tested, high task counts). Dialect realism is
// carried primarily by the dialect-specific TEXT the AI generates; the
// reference voice supplies a natural child-like timbre. Saudi and Egyptian
// profiles use different voice sets so the two modes are audibly distinct.
// =====================================================================

import { TTSError, type SynthesisRequest, type SynthesisResult, type SpeechSynthesizer } from './provider'
import { parseDialect, type Dialect } from '@/lib/dialect/config'

const FISH_ENDPOINT = 'https://api.fish.audio/v1/tts'
const FISH_TIMEOUT_MS = 15_000
const MAX_TEXT_CHARS = 1000

/** Fish Audio model id (speech-1.5 default; override with FISH_AUDIO_MODEL). */
function fishModel(): string {
  return process.env.FISH_AUDIO_MODEL || 'speech-1.5'
}

// ---------------------------------------------------------------------
// Reference voices — young, gender-matched, conversational Arabic.
// Selected from the public library (sorted by real-world usage).
// ---------------------------------------------------------------------
const FEMALE_SOFT = '7eee0787bf1a476fb0864270853e344a' // Yee — soft, gentle girl
const FEMALE_TALK = '14f1000b77d547eeb5f03b474dd29e0f' // Asmaa — conversational, friendly girl
const FEMALE_EXPRESSIVE = '9ec512a9af314dada198e083caf3cd3a' // expressive girl voice
const MALE_EDU = '1d51fdd65ff14342aec4dffa0ef58386' // young educational energetic boy
const MALE_YOUNG = '7b301c14ee0b447cb8705b7e247067e1' // young boy
const MALE_ENERGY = '9d56bafefc434c5cbf6bb2a9dc02e680' // energetic enthusiastic young male

const FISH_VOICES: Record<Dialect, Record<string, string>> = {
  // Saudi classroom: Sara=Asmaa, Nour=Yee, Omar=educational boy, Yassin=young boy
  saudi: {
    sara: FEMALE_TALK,
    nour: FEMALE_SOFT,
    omar: MALE_EDU,
    yassin: MALE_YOUNG,
  },
  // Egyptian classroom: livelier set, still gender-matched
  egyptian: {
    sara: FEMALE_EXPRESSIVE,
    nour: FEMALE_SOFT,
    omar: MALE_ENERGY,
    yassin: MALE_YOUNG,
  },
}

/** Resolve the Fish reference voice for a dialect + agent (default = Sara's). */
export function fishVoiceFor(dialect: Dialect, agentKey?: string): string {
  const set = FISH_VOICES[parseDialect(dialect)]
  return set[agentKey || ''] || set.sara
}

export function isFishConfigured(): boolean {
  return Boolean(process.env.FISH_AUDIO_API_KEY)
}

async function synthesizeFish(req: SynthesisRequest): Promise<SynthesisResult> {
  const apiKey = process.env.FISH_AUDIO_API_KEY
  if (!apiKey) throw new TTSError('provider_unavailable')

  const text = req.text?.trim()
  if (!text) throw new TTSError('bad_input')

  const dialect = parseDialect(req.dialect)
  // voiceOverride (per-user setting) takes precedence over the persona map.
  const referenceId = req.voiceOverride || fishVoiceFor(dialect, req.agentKey)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FISH_TIMEOUT_MS)
  try {
    const res = await fetch(FISH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model: fishModel(),
      },
      body: JSON.stringify({
        text: text.slice(0, MAX_TEXT_CHARS),
        reference_id: referenceId,
        format: 'mp3',
        mp3_bitrate: 128,
        normalize: true,
        latency: 'normal',
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      // 402 = account out of API credit; 401/403 = auth trouble; 5xx = outage.
      // All map to typed codes — provider details never reach the user.
      throw new TTSError(res.status === 402 ? 'insufficient_credit' : 'provider_unavailable')
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) throw new TTSError('empty_audio')
    return {
      audio: buf,
      contentType: 'audio/mpeg',
      voiceUsed: `fish:${referenceId.slice(0, 8)}`,
    }
  } catch (err) {
    if (err instanceof TTSError) throw err
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new TTSError('tts_timeout')
    }
    throw new TTSError('provider_unavailable')
  } finally {
    clearTimeout(timer)
  }
}

export const fishAudioSynthesizer: SpeechSynthesizer = {
  name: 'fish-audio',
  synthesize: synthesizeFish,
}
