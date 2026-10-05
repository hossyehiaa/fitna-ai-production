import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { revokeAllSessions } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { resetPasswordSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'

export const runtime = 'nodejs'

function hashToken(raw: string): string {
  return createHash('sha256')
    .update(`${raw}:${process.env.AUTH_SECRET || 'dev'}`)
    .digest('hex')
}

export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const identity = await rateLimitIdentity()
  if (!rateLimit(RATE_LIMITS.passwordForgot, identity)) {
    return NextResponse.json({ error: 'عدد كبير من الطلبات. حاول بعد قليل.' }, { status: 429 })
  }

  const parsed = await safeJson(req, resetPasswordSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { token, password } = parsed.data

  const tokenHash = hashToken(token)
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } })

  const invalid = NextResponse.json(
    { error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.' },
    { status: 400 }
  )

  if (!record) return invalid
  if (record.usedAt) return invalid
  if (record.expiresAt.getTime() < Date.now()) return invalid

  const passwordHash = await hashPassword(password)
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Invalidate every existing session after a reset.
    db.authSession.deleteMany({ where: { userId: record.userId } }),
  ])

  await audit('password_reset_completed', { userId: record.userId })
  return NextResponse.json({ ok: true, redirectTo: '/login' })
}
