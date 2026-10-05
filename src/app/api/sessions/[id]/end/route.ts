import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { endSessionSchema, safeJson } from '@/lib/security/validation'
import { audit } from '@/lib/security/audit'
import { generateReport, computeMetrics } from '@/lib/ai/turn'

export const runtime = 'nodejs'

/** POST /api/sessions/[id]/end — finish the session, compute metrics, generate report + badges. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  const { id: sessionId } = await params
  if (!sessionId || sessionId.length > 60) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const parsed = await safeJson(req, endSessionSchema)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { reason } = parsed.data

  // IDOR: ownership enforced in the query.
  const session = await db.simSession.findFirst({
    where: { id: sessionId, userId: user.id },
    select: { id: true, status: true },
  })
  if (!session) {
    return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 })
  }
  if (session.status !== 'in_progress') {
    // Idempotent: ending an ended session returns its existing report.
    const existing = await db.report.findUnique({ where: { sessionId } })
    return NextResponse.json({ ok: true, reportId: existing?.id ?? null, alreadyEnded: true })
  }

  const metrics = await computeMetrics(sessionId)
  const reportData = reason === 'completed' ? await generateReport(sessionId) : null

  await db.simSession.update({
    where: { id: sessionId },
    data: {
      status: reason,
      endedAt: new Date(),
      teacherTalkRatio: metrics.teacherTalkRatio,
      socraticRate: metrics.socraticRate,
      inclusivityIndex: metrics.inclusivityIndex,
      ...(reportData
        ? {
            overallScore: reportData.overallScore,
            classroomPattern: reportData.classroomPattern,
          }
        : {}),
    },
  })

  // Upsert the report separately (clean, avoids nested-write pitfalls).
  if (reportData) {
    await db.report.upsert({
      where: { sessionId },
      create: {
        sessionId,
        summaryAr: reportData.summaryAr,
        sessionSignalAr: reportData.sessionSignalAr,
        strengths: reportData.strengths,
        weaknesses: reportData.weaknesses,
        recommendations: reportData.recommendations,
        frameworkScores: {
          engagement: Math.min(100, Math.round(metrics.inclusivityIndex)),
          socratic: Math.min(100, Math.round(metrics.socraticRate * 1.2)),
          control: Math.max(0, Math.round(100 - Math.abs(metrics.teacherTalkRatio - 40) * 1.5)),
          inclusivity: metrics.inclusivityIndex,
        },
      },
      update: {
        summaryAr: reportData.summaryAr,
        sessionSignalAr: reportData.sessionSignalAr,
        strengths: reportData.strengths,
        weaknesses: reportData.weaknesses,
        recommendations: reportData.recommendations,
      },
    })
  }

  const reportRow = await db.report.findUnique({ where: { sessionId }, select: { id: true } })

  // Badge engine (deterministic DB-level criteria).
  const completedCount = await db.simSession.count({
    where: { userId: user.id, status: 'completed' },
  })
  const badgesToAward: string[] = []
  if (completedCount >= 1) badgesToAward.push('pioneer_teacher')
  if (completedCount >= 5) badgesToAward.push('streak_master')
  if (reportData && reportData.overallScore >= 85) badgesToAward.push('classroom_captain')
  if (metrics.socraticRate >= 50 && metrics.totalTurns >= 5) badgesToAward.push('socrates_incarnate')
  if (metrics.inclusivityIndex >= 85 && metrics.totalTurns >= 5) badgesToAward.push('inclusive_educator')
  if (metrics.teacherTalkRatio >= 30 && metrics.teacherTalkRatio <= 45 && metrics.totalTurns >= 5) {
    badgesToAward.push('master_listener')
  }
  for (const key of badgesToAward) {
    await db.badge.upsert({
      where: { userId_badgeKey: { userId: user.id, badgeKey: key } },
      update: {},
      create: { userId: user.id, badgeKey: key, sessionId },
    })
  }

  await audit('session_completed', {
    userId: user.id,
    metadata: {
      sessionId,
      reason,
      score: reportData?.overallScore ?? null,
      badges: badgesToAward,
    },
  })

  return NextResponse.json({
    ok: true,
    reportId: reportRow?.id ?? null,
    badges: badgesToAward,
    score: reportData?.overallScore ?? null,
  })
}
