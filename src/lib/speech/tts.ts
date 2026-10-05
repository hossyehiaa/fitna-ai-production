// =====================================================================
// TTS engine — Microsoft Edge neural voices via msedge-tts.
//
// Why: free (no API key), reliable, server-side SDK, and it natively ships
// BOTH ar-SA (Saudi) and ar-EG (Egyptian) neural voices — exactly matching
// the two dialect profiles. Failures degrade gracefully: the route returns
// a clean Arabic error and the UI falls back to text-only display.
// =====================================================================

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { SynthesisRequest, SynthesisResult, SpeechSynthesizer } from './provider'
import { resolveVoiceProfile } from './provider'
import { parseDialect } from '@/lib/dialect/config'

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

/** Secondary safety net: any provider failure surfaces as a typed error. */
export class TTSError extends Error {
  constructor(public code: 'provider_unavailable' | 'tts_timeout' | 'empty_audio' | 'bad_input') {
    super(code)
  }
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

/** The active synthesizer (single registration point for future providers). */
export function getSynthesizer(): SpeechSynthesizer {
  // Future: switch on process.env.TTS_PROVIDER to select ElevenLabs etc.
  return edgeSynthesizer
}
