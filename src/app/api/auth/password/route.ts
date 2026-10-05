import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { createSession, getCurrentUser, revokeAllSessions } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { changePasswordSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'

export const runtime = 'nodejs'

/** Change password (authenticated). Revokes all sessions, then re-signs-in this device. */
export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  const parsed = await safeJson(req, changePasswordSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { currentPassword, newPassword } = parsed.data

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' },
      { status: 400 }
    )
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    await audit('login_failed', { userId: user.id, metadata: { reason: 'bad_current_password' } })
    return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 403 })
  }

  const passwordHash = await hashPassword(newPassword)
  await db.user.update({ where: { id: user.id }, data: { passwordHash } })

  // Security: invalidate every existing session after a password change.
  await revokeAllSessions(user.id)
  await createSession(user.id)
  await audit('password_change', { userId: user.id })

  return NextResponse.json({ ok: true })
}
