import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, revokeAllSessions } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { verifyOrigin } from '@/lib/security/csrf'
import { updateProfileSchema, speechSettingsSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'
import { getSpeechConfig, parseDialect } from '@/lib/dialect/config'

export const runtime = 'nodejs'

/** PATCH: update profile (name, dialect, institution) + speech settings. */
export async function PATCH(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  const parsed = await safeJson(req, updateProfileSchema.and(speechSettingsSchema))
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const d = parsed.data

  const newDialect = d.dialect ? parseDialect(d.dialect) : null
  const dialectChanged = newDialect && newDialect !== user.profile?.dialect

  await db.profile.update({
    where: { userId: user.id },
    data: {
      fullName: d.fullName ?? undefined,
      dialect: newDialect ?? undefined,
      institutionName:
        user.role === 'institution'
          ? d.institutionName !== undefined
            ? d.institutionName || null
            : undefined
          : undefined,
    },
  })

  // Keep speech settings in sync with the dialect (locale + defaults).
  if (newDialect) {
    const cfg = getSpeechConfig(newDialect)
    await db.speechSettings.upsert({
      where: { userId: user.id },
      update: {
        locale: cfg.locale,
        ttsVoice: d.ttsVoice !== undefined ? d.ttsVoice || null : undefined,
        ttsRate: d.ttsRate ?? undefined,
        ttsPitch: d.ttsPitch ?? undefined,
        speakingRate: d.speakingRate ?? undefined,
        expressiveness: d.expressiveness ?? undefined,
      },
      create: {
        userId: user.id,
        locale: cfg.locale,
        ttsVoice: d.ttsVoice || null,
        ttsRate: d.ttsRate || '+0%',
        ttsPitch: d.ttsPitch || '+0Hz',
        speakingRate: d.speakingRate ?? 1.0,
        expressiveness: d.expressiveness || 'balanced',
      },
    })
  }

  if (dialectChanged) {
    await audit('dialect_changed', { userId: user.id, metadata: { to: newDialect } })
  }
  await audit('profile_updated', { userId: user.id })

  return NextResponse.json({ ok: true })
}

/** DELETE: permanently delete the account (requires password confirmation). */
export async function DELETE(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  let password = ''
  try {
    const body = (await req.json()) as { password?: unknown }
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'صيغة الطلب غير صالحة' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'كلمة المرور مطلوبة لتأكيد حذف الحساب' }, { status: 400 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 403 })
  }

  await audit('account_deleted', { userId: user.id, metadata: { email_domain: user.email.split('@')[1] } })

  // Cascades: profile, sessions, speech settings, badges, auth sessions.
  await db.user.delete({ where: { id: user.id } })
  await revokeAllSessions(user.id).catch(() => {})

  return NextResponse.json({ ok: true, redirectTo: '/login' })
}
