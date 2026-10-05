import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { signupSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'
import { ensureAgentsSeeded } from '@/lib/agents/seed'
import { getSpeechConfig, parseDialect } from '@/lib/dialect/config'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // CSRF: origin verification for state-changing requests
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  // Rate limit: 5 signups per 10 min per IP
  const identity = await rateLimitIdentity()
  if (!rateLimit(RATE_LIMITS.signup, identity)) {
    await audit('rate_limited', { metadata: { route: 'signup' } })
    return NextResponse.json(
      { error: 'عدد كبير من محاولات إنشاء الحساب. يرجى المحاولة بعد قليل.' },
      { status: 429 }
    )
  }

  const parsed = await safeJson(req, signupSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email, password, fullName, userType, dialect, institutionName } = parsed.data

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    // Generic message — no account enumeration
    return NextResponse.json(
      { error: 'لا يمكن استخدام هذا البريد الإلكتروني. ربما لديك حساب بالفعل.' },
      { status: 409 }
    )
  }

  const passwordHash = await hashPassword(password)

  // Role is set SERVER-SIDE only from validated input — never from raw client claims.
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      role: userType, // validated by zod to be teacher|institution
      profile: {
        create: {
          fullName,
          userType,
          dialect: parseDialect(dialect),
          institutionName: userType === 'institution' ? institutionName || null : null,
          onboardingComplete: true,
        },
      },
      speechSettings: {
        create: {
          locale: getSpeechConfig(parseDialect(dialect)).locale,
        },
      },
    },
  })

  await ensureAgentsSeeded()
  await createSession(user.id)
  await audit('signup', { userId: user.id, metadata: { userType, dialect } })

  return NextResponse.json({ ok: true, redirectTo: '/dashboard' }, { status: 201 })
}
