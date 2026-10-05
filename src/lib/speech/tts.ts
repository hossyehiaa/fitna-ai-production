// =====================================================================
// TTS engine + provider chain.
//
// Chain (getSynthesizer):
//   FISH_AUDIO_API_KEY present  ->  fish-audio  ->  msedge fallback
//   no Fish key / explicit TTS_PROVIDER="msedge"  ->  msedge only
//
// Why this shape: a premium provider outage, an empty API-credit balance,
// or a network blip can never kill a live classroom session — the Edge
// neural voices (free, both ar-SA and ar-EG) always catch the fall.
// Failures are logged as structured, secret-free events for ops.
// =====================================================================

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { SynthesisRequest, SynthesisResult, SpeechSynthesizer } from './provider'
import { TTSError, resolveVoiceProfile } from './provider'
import { fishAudioSynthesizer, isFishConfigured } from './fish-audio'
import { parseDialect } from '@/lib/dialect/config'

export { TTSError }

const EDGE_TIMEOUT_MS = 12_000

function synthesizeEdge(req: SynthesisRequest): Promise<SynthesisResult> {
  const profile = resolveVoiceProfile(
    parseDialect(req.dialect),
    req.agentKey,
    req.voiceOverride,
    req.rate,
    req.pitch
  )
  return Promise.race([
    (async () => {
      const tts = new MsEdgeTTS()
      await tts.setMetadata(profile.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      const { audioStream } = tts.toStream(req.text.slice(0, 1000))
      const chunks: Buffer[] = []
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk))
      }
      const audio = Buffer.concat(chunks)
      if (audio.length === 0) {
        throw new Error('empty_audio')
      }
      return { audio, contentType: 'audio/mpeg', voiceUsed: profile.voice }
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('tts_timeout')), EDGE_TIMEOUT_MS)
    ),
  ])
}

export const edgeSynthesizer: SpeechSynthesizer = {
  name: 'msedge',
  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const text = req.text?.trim()
    if (!text) throw new TTSError('bad_input')
    try {
      return await synthesizeEdge(req)
    } catch (err) {
      const code = err instanceof Error && err.message === 'tts_timeout' ? 'tts_timeout' : 'provider_unavailable'
      throw new TTSError(code as TTSError['code'])
    }
  },
}

/** Wrap primary + fallback: a primary failure degrades instead of throwing. */
function chainedSynthesizer(primary: SpeechSynthesizer, fallback: SpeechSynthesizer): SpeechSynthesizer {
  return {
    name: `${primary.name}+${fallback.name}`,
    async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
      try {
        return await primary.synthesize(req)
      } catch (err) {
        // Structured ops log — no secrets, no user text.
        console.error(
          JSON.stringify({
            level: 'warn',
            category: 'tts_provider_failed',
            provider: primary.name,
            code: err instanceof TTSError ? err.code : 'unknown',
            fallback: fallback.name,
          })
        )
        return fallback.synthesize(req)
      }
    },
  }
}

/**
 * The active synthesizer — single registration point for providers.
 * TTS_PROVIDER="msedge" forces the free Edge voices even when Fish Audio
 * is configured (explicit ops override).
 */
export function getSynthesizer(): SpeechSynthesizer {
  const explicit = (process.env.TTS_PROVIDER || '').trim().toLowerCase()
  if (explicit === 'msedge') return edgeSynthesizer
  if (isFishConfigured()) {
    return chainedSynthesizer(fishAudioSynthesizer, edgeSynthesizer)
  }
  return edgeSynthesizer
}
