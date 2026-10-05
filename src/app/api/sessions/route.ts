import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { userDialect } from '@/lib/auth/guard'
import { verifyOrigin } from '@/lib/security/csrf'
import { rateLimit, RATE_LIMITS, rateLimitIdentity } from '@/lib/security/rateLimit'
import { createSessionSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'

export const runtime = 'nodejs'

const DEFAULT_TOPICS = [
  { titleAr: 'الكُسور الاعتيادية — مقارنة الكسور', titleEn: 'Comparing fractions' },
  { titleAr: 'التلوث البيئي وأثره على كوكب الأرض', titleEn: 'Environmental pollution' },
  { titleAr: 'الجملة الاسمية والجملة الفعلية', titleEn: 'Nominal and verbal sentences' },
  { titleAr: 'حفظ الطاقة وأنواعها', titleEn: 'Energy conservation' },
  { titleAr: 'مهارات التواصل الفعّال في الحوار', titleEn: 'Effective communication' },
]

/** POST /api/sessions — create a live simulation session. */
export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  const identity = await rateLimitIdentity(user.id)
  if (!rateLimit(RATE_LIMITS.sessionCreate, identity)) {
    return NextResponse.json(
      { error: 'أنشأت جلسات كثيرة مؤخراً. أنهِ الجلسات المفتوحة أولاً.' },
      { status: 429 }
    )
  }

  const parsed = await safeJson(req, createSessionSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { topicId, lessonContext, durationMinutes, classroomStyle, trainingObjective } = parsed.data

  // Close any abandoned in-progress sessions (housekeeping).
  await db.simSession.updateMany({
    where: { userId: user.id, status: 'in_progress' },
    data: { status: 'abandoned', endedAt: new Date() },
  })

  // Resolve topic: existing global topic by id, else first default, else ad-hoc.
  let topic = topicId ? await db.lessonTopic.findFirst({ where: { id: topicId } }) : null
  if (!topic) {
    const anyDefault = await db.lessonTopic.findFirst({ where: { isGlobal: true } })
    if (!anyDefault) {
      topic = await db.lessonTopic.create({
        data: { titleAr: DEFAULT_TOPICS[0].titleAr, titleEn: DEFAULT_TOPICS[0].titleEn, isGlobal: true },
      })
    } else {
      topic = anyDefault
    }
  }

  // Dialect is captured from the SERVER-side profile — never from the client.
  const dialect = userDialect(user)

  const session = await db.simSession.create({
    data: {
      userId: user.id,
      dialect,
      topicId: topic.id,
      lessonContext: lessonContext || null,
      durationMinutes,
      classroomStyle,
      trainingObjective,
    },
  })

  await audit('session_created', {
    userId: user.id,
    metadata: { sessionId: session.id, dialect, classroomStyle },
  })

  return NextResponse.json({ ok: true, sessionId: session.id }, { status: 201 })
}

/** GET /api/sessions — list the user's sessions (own data only). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }
  const sessions = await db.simSession.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      dialect: true,
      status: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      overallScore: true,
      topic: { select: { titleAr: true } },
    },
  })
  return NextResponse.json({ ok: true, sessions })
}
