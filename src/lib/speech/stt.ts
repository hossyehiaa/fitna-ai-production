// =====================================================================
// STT engine — Groq Whisper large-v3 (best-in-class Arabic dialect ASR).
//
// GROQ_API_KEY is required. When absent, the API route refuses gracefully
// with a clean Arabic message and the UI offers manual text input instead
// (graceful degradation — section 23 of the production spec).
// =====================================================================

import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk'
import { getSpeechConfig, parseDialect, type Dialect } from '@/lib/dialect/config'

const WHISPER_MODEL = 'whisper-large-v3'
const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20 MB

export class STTUnavailableError extends Error {
  constructor() {
    super('stt_unavailable')
  }
}

export interface TranscriptionResult {
  text: string
  locale: string
}

/**
 * Transcribe an audio buffer with dialect-aware biasing.
 * `dialect` influences the Whisper prompt so Egyptian/Saudi speech
 * recognition accuracy is maximized for the user's profile.
 */
export async function transcribe(
  audio: Buffer,
  filename: string,
  dialect: Dialect,
  lessonContext?: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new STTUnavailableError()
  if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
    throw new Error('bad_audio_size')
  }

  const cfg = getSpeechConfig(parseDialect(dialect))

  // Build a biasing prompt: dialect environment + optional lesson vocabulary.
  let prompt = cfg.sttBiasPrompt
  const ctx = lessonContext?.trim().slice(0, 150)
  if (ctx) prompt += ` موضوع الدرس: ${ctx}.`

  const client = new Groq({ apiKey, timeout: 20_000, maxRetries: 1 })
  const file = await toFile(audio, filename)
  const completion = await client.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: 'ar',
    prompt,
    temperature: 0,
  })

  const text = (completion.text || '').trim()
  return { text, locale: cfg.locale }
}

/** Detect the audio container from magic bytes (mobile browsers vary). */
export function detectAudioFilename(buf: Buffer, mimeType?: string): string {
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'utterance.mp4'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'RIFF') return 'utterance.wav'
  if (
    buf.length >= 4 &&
    buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3
  ) {
    return 'utterance.webm'
  }
  const mime = mimeType || ''
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'utterance.mp4'
  if (mime.includes('wav')) return 'utterance.wav'
  if (mime.includes('ogg')) return 'utterance.ogg'
  return 'utterance.webm'
}
