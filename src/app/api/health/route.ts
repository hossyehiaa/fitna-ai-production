import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/** GET /api/health — production readiness probe. Reveals NO secrets. */
export async function GET() {
  let dbOk = false
  try {
    await db.$queryRaw`SELECT 1`
    dbOk = true
  } catch {
    dbOk = false
  }

  const body = {
    ok: dbOk,
    service: 'fitna-ai-production',
    time: new Date().toISOString(),
    checks: {
      database: dbOk ? 'up' : 'down',
      tts: 'msedge (no key required)',
      stt: process.env.GROQ_API_KEY ? 'groq' : 'not_configured',
      ai: process.env.GROQ_API_KEY ? 'groq' : 'fallback_engine',
    },
  }

  return NextResponse.json(body, { status: dbOk ? 200 : 503 })
}
