import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =====================================================================
// Health check — deployment verification endpoint.
// Reports service availability FLAGS ONLY (no secrets, no config values).
// =====================================================================
export async function GET() {
  let dbOk = false
  try {
    await db.$queryRawUnsafe('SELECT 1')
    dbOk = true
  } catch {
    dbOk = false
  }

  return NextResponse.json(
    {
      status: dbOk ? 'ok' : 'degraded',
      service: 'fitna-ai',
      db: dbOk ? 'up' : 'down',
      // Provider flags (public information — never the keys themselves)
      ai: process.env.GROQ_API_KEY ? 'groq-gpt-oss-120b' : 'deterministic-fallback',
      tts: process.env.FISH_AUDIO_API_KEY
        ? `fish-audio:${process.env.FISH_AUDIO_MODEL || 's2.1-pro-free'}+msedge`
        : 'msedge',
      stt: process.env.GROQ_API_KEY ? 'groq-whisper-large-v3-turbo' : 'unavailable',
      auth: 'custom-scrypt-session',
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 }
  )
}
