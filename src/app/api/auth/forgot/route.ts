import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { forgotPasswordSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'

export const runtime = 'nodejs'

const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes

function hashToken(raw: string): string {
  return createHash('sha256')
    .update(`${raw}:${process.env.AUTH_SECRET || 'dev'}`)
    .digest('hex')
}

async function sendResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Fitna AI <onboarding@resend.dev>',
        to: [email],
        subject: 'إعادة تعيين كلمة المرور — منصة فِطنة',
        html: `<div dir="rtl" style="font-family:sans-serif;line-height:1.8">
          <h2>إعادة تعيين كلمة المرور</h2>
          <p>تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في منصة فِطنة.</p>
          <p>الرابط صالح لمدة 30 دقيقة، ويمكن استخدامه مرة واحدة فقط:</p>
          <p><a href="${resetUrl}">اضغط هنا لإعادة تعيين كلمة المرور</a></p>
          <p>إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.</p>
        </div>`,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const identity = await rateLimitIdentity()
  if (!rateLimit(RATE_LIMITS.passwordForgot, identity)) {
    return NextResponse.json(
      { error: 'عدد كبير من الطلبات. يرجى الانتظار قبل المحاولة مجدداً.' },
      { status: 429 }
    )
  }

  const parsed = await safeJson(req, forgotPasswordSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { email } = parsed.data

  const user = await db.user.findUnique({ where: { email }, select: { id: true } })

  // ALWAYS the same generic response — prevents account enumeration.
  const generic = NextResponse.json({
    ok: true,
    message: 'إذا كان البريد الإلكتروني مسجلاً لدينا فستصلك رسالة تحتوي رابط إعادة التعيين.',
  })

  if (!user) {
    await audit('password_reset_requested', { metadata: { known: false } })
    return generic
  }

  const raw = randomBytes(32).toString('base64url')
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  })

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const resetUrl = `${base}/reset-password?token=${raw}`

  const emailed = await sendResetEmail(email, resetUrl)
  await audit('password_reset_requested', { userId: user.id, metadata: { emailed } })

  if (!emailed) {
    // No email provider configured: surface the link only in SERVER logs for
    // the operator, and (non-production only) to the client for local testing.
    console.log(JSON.stringify({ level: 'info', category: 'reset_link_no_email_provider' }))
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({
        ok: true,
        message: 'لم يتم تكوين مزود البريد (RESEND_API_KEY) — رابط التطوير:',
        devResetUrl: resetUrl,
      })
    }
  }

  return generic
}
