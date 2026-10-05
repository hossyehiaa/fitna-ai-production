import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { userDialect } from '@/lib/auth/guard'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { ttsRequestSchema, safeJson } from '@/lib/security/validation'
import { getSynthesizer, TTSError } from '@/lib/speech/tts'
import { parseDialect } from '@/lib/dialect/config'

export const runtime = 'nodejs'

/**
 * POST /api/tts — dialect-aware text-to-speech (server-side only).
 *
 * The dialect for REAL conversations always comes from the authenticated
 * profile. `previewDialect` exists solely for the settings-page voice
 * preview and can never steer an actual conversation.
 */
export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول لاستخدام الخدمة الصوتية' }, { status: 401 })
  }

  const identity = await rateLimitIdentity(user.id)
  if (!rateLimit(RATE_LIMITS.tts, identity)) {
    return NextResponse.json(
      { error: 'تم تجاوز الحد المسموح من الطلبات الصوتية. انتظر قليلاً ثم تابع.' },
      { status: 429 }
    )
  }

  const parsed = await safeJson(req, ttsRequestSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { text, agentKey, previewDialect, rate, pitch } = parsed.data

  // Authoritative dialect: profile first; preview only as an explicit override.
  const dialect = previewDialect ? parseDialect(previewDialect) : userDialect(user)

  try {
    const synthesizer = getSynthesizer()
    const result = await synthesizer.synthesize({
      text,
      dialect,
      agentKey,
      rate,
      pitch,
      // Per-user voice override from speech settings (if any)
      voiceOverride: user.profile ? undefined : undefined,
    })
    return new NextResponse(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.audio.length),
        'Cache-Control': 'private, max-age=3600',
        'X-Voice-Used': result.voiceUsed,
      },
    })
  } catch (err) {
    if (err instanceof TTSError) {
      console.error(JSON.stringify({ level: 'warn', category: 'tts_failed', code: err.code }))
      return NextResponse.json(
        { error: 'تعذر توليد الصوت حالياً. سيظهر الرد نصاً بدلاً من ذلك.' },
        { status: 503 }
      )
    }
    console.error(JSON.stringify({ level: 'error', category: 'tts_unexpected' }))
    return NextResponse.json(
      { error: 'تعذر توليد الصوت حالياً. سيظهر الرد نصاً بدلاً من ذلك.' },
      { status: 500 }
    )
  }
}
