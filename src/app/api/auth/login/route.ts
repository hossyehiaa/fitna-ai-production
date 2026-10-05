import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { loginSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'
import { ensureAgentsSeeded } from '@/lib/agents/seed'

export const runtime = 'nodejs'

const GENERIC_ERROR = 'البريد الإلكتروني أو كلمة المرور غير صحيحة'

export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const identity = await rateLimitIdentity()
  if (!rateLimit(RATE_LIMITS.login, identity)) {
    await audit('rate_limited', { metadata: { route: 'login' } })
    return NextResponse.json(
      { error: 'عدد كبير من محاولات تسجيل الدخول. يرجى الانتظار بضع دقائق.' },
      { status: 429 }
    )
  }

  const parsed = await safeJson(req, loginSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email, password } = parsed.data

  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } })
  if (!user) {
    await audit('login_failed', { metadata: { reason: 'unknown_email' } })
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    await audit('login_failed', { userId: user.id, metadata: { reason: 'bad_password' } })
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
  }

  await ensureAgentsSeeded()
  await createSession(user.id)
  await audit('login', { userId: user.id })

  return NextResponse.json({ ok: true, redirectTo: '/dashboard' })
}
