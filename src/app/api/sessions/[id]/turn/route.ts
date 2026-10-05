import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { turnSchema, safeJson } from '@/lib/security/validation'
import { runTurn } from '@/lib/ai/turn'

export const runtime = 'nodejs'

/**
 * POST /api/sessions/[id]/turn — one simulation turn.
 *
 * IDOR: ownership is verified against the authenticated user BEFORE any
 * processing. The dialect is resolved from the session row (captured at
 * creation from the profile), so the client cannot steer it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  const identity = await rateLimitIdentity(user.id)
  if (!rateLimit(RATE_LIMITS.turn, identity)) {
    return NextResponse.json(
      { error: 'وتيرة الطلبات مرتفعة جداً. امنح الطلاب لحظة للرد ثم تابع.' },
      { status: 429 }
    )
  }

  const { id: sessionId } = await params
  if (!sessionId || sessionId.length > 60) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  // Ownership check first (IDOR protection).
  const session = await db.simSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true, status: true },
  })
  if (!session) {
    return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 })
  }
  if (session.status !== 'in_progress') {
    return NextResponse.json({ error: 'انتهت هذه الجلسة بالفعل' }, { status: 400 })
  }

  const parsed = await safeJson(req, turnSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { teacherText, elapsedMs, speechDurationMs } = parsed.data

  try {
    const result = await runTurn(sessionId, teacherText, elapsedMs)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const code = err instanceof Error && err.message === 'session_not_found' ? 'not_found' : 'internal'
    console.error(
      JSON.stringify({
        level: 'error',
        category: 'turn_failed',
        code,
        endpoint: '/api/sessions/turn',
      })
    )
    return NextResponse.json(
      { error: 'حدث خطأ أثناء معالجة الكلام. يرجى المحاولة مرة أخرى.' },
      { status: code === 'not_found' ? 404 : 500 }
    )
  }
}
