import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { userDialect } from '@/lib/auth/guard'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { audit } from '@/lib/security/audit'
import { transcribe, detectAudioFilename, STTUnavailableError } from '@/lib/speech/stt'

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 20 * 1024 * 1024

/**
 * POST /api/stt — dialect-aware speech-to-text (multipart: audio blob).
 * The dialect ALWAYS comes from the authenticated profile (server-side),
 * never from the request body.
 */
export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول لاستخدام الخدمة الصوتية' }, { status: 401 })
  }

  const identity = await rateLimitIdentity(user.id)
  if (!rateLimit(RATE_LIMITS.stt, identity)) {
    return NextResponse.json(
      { error: 'تم تجاوز الحد المسموح من طلبات التعرف على الكلام. انتظر قليلاً.' },
      { status: 429 }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'صيغة الطلب غير صالحة' }, { status: 400 })
  }

  const audio = form.get('audio')
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'لا يوجد تسجيل صوتي في الطلب' }, { status: 400 })
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'حجم التسجيل غير مناسب' }, { status: 400 })
  }
  const lessonContextRaw = form.get('lessonContext')
  const lessonContext =
    typeof lessonContextRaw === 'string' ? lessonContextRaw.slice(0, 300) : undefined

  const buf = Buffer.from(await audio.arrayBuffer())
  const filename = detectAudioFilename(buf, audio.type)

  try {
    const result = await transcribe(buf, filename, userDialect(user), lessonContext)
    if (!result.text) {
      return NextResponse.json(
        { error: 'لم يتم التعرف على كلام واضح في التسجيل. حاول مرة أخرى أو اكتب النص.' },
        { status: 422 }
      )
    }
    return NextResponse.json({ ok: true, text: result.text.slice(0, 2000), locale: result.locale })
  } catch (err) {
    if (err instanceof STTUnavailableError) {
      // Graceful degradation: the UI shows manual text input instead.
      return NextResponse.json(
        {
          error:
            'خدمة التعرف على الكلام غير مُفعّلة حالياً (يتطلب مفتاح GROQ_API_KEY). يمكنك كتابة كلامك نصياً.',
          code: 'stt_unavailable',
        },
        { status: 503 }
      )
    }
    console.error(JSON.stringify({ level: 'warn', category: 'stt_failed' }))
    return NextResponse.json(
      { error: 'تعذر تحويل الكلام إلى نص. حاول مرة أخرى أو اكتب النص.' },
      { status: 502 }
    )
  }
}
