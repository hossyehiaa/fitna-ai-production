// =====================================================================
// Turn orchestration — one teacher utterance -> student reactions.
//
// Resilience: Groq (if configured) -> deterministic fallback engine.
// The user's dialect ALWAYS comes from the server-side profile.
// =====================================================================

import { db } from '@/lib/db'
import { AGENTS, getAgent } from '@/lib/agents/registry'
import { groqProvider } from './groq'
import { fallbackProvider } from './fallback'
import type { Reaction, TurnContext, TurnResult } from './provider'
import { parseDialect } from '@/lib/dialect/config'

export async function runTurn(
  sessionId: string,
  teacherText: string,
  elapsedMs: number
): Promise<TurnResult> {
  const session = await db.simSession.findUnique({
    where: { id: sessionId },
    include: { events: { orderBy: { occurredMs: 'desc' }, take: 12 } },
  })
  if (!session) throw new Error('session_not_found')

  // The session's dialect was captured at creation from the user profile —
  // a client cannot influence it per-request.
  const dialect = parseDialect(session.dialect)

  const history = session.events
    .slice()
    .reverse()
    .map((e) => ({ actor: e.actor, content: e.content }))

  const ctx: TurnContext = {
    dialect,
    lessonContext: session.lessonContext,
    history,
    classroomStyle: session.classroomStyle as TurnContext['classroomStyle'],
  }

  // Persist the teacher utterance first (auditable, ordered).
  await db.sessionEvent.create({
    data: {
      sessionId,
      eventType: 'teacher_utterance',
      actor: 'teacher',
      content: teacherText.slice(0, 2000),
      occurredMs: elapsedMs,
    },
  })

  let reactions: Reaction[]
  let provider: 'groq' | 'fallback'
  try {
    reactions = await groqProvider.generateReactions(AGENTS, teacherText, ctx)
    provider = 'groq'
  } catch {
    reactions = await fallbackProvider.generateReactions(AGENTS, teacherText, ctx)
    provider = 'fallback'
  }

  // Persist each reaction.
  await db.sessionEvent.createMany({
    data: reactions.map((r) => ({
      sessionId,
      eventType: 'student_reaction',
      actor: r.agentKey,
      content: r.text,
      occurredMs: elapsedMs + 800,
      metadata: {
        emotion: r.emotion,
        attention: r.attention,
        provider,
        agentName: r.agentName,
      },
    })),
  })

  return { reactions, provider }
}

// ---------------------------------------------------------------------
// Pedagogical telemetry — computed from the persisted event stream.
// ---------------------------------------------------------------------

export interface SessionMetrics {
  teacherTalkRatio: number // % of utterances from the teacher
  socraticRate: number // % of teacher utterances that are open questions
  inclusivityIndex: number // 0-100 equity of attention across agents
  totalTurns: number
  agentTurnCounts: Record<string, number>
}

const OPEN_QUESTION_RE =
  /(لماذا|ليه|ليش|إزاي|ازاي|كيف|ما رأيك|وش رأيك|تتوقع|اعتقد|فكر|اشرح بأسلوبك)/

export async function computeMetrics(sessionId: string): Promise<SessionMetrics> {
  const events = await db.sessionEvent.findMany({
    where: { sessionId, eventType: { in: ['teacher_utterance', 'student_reaction'] } },
    orderBy: { occurredMs: 'asc' },
  })

  const teacherUtterances = events.filter((e) => e.actor === 'teacher')
  const studentReactions = events.filter((e) => e.eventType === 'student_reaction')

  const total = teacherUtterances.length + studentReactions.length
  const teacherTalkRatio = total === 0 ? 0 : (teacherUtterances.length / total) * 100

  const socraticCount = teacherUtterances.filter((e) => OPEN_QUESTION_RE.test(e.content)).length
  const socraticRate =
    teacherUtterances.length === 0 ? 0 : (socraticCount / teacherUtterances.length) * 100

  const agentTurnCounts: Record<string, number> = {}
  for (const r of studentReactions) {
    agentTurnCounts[r.actor] = (agentTurnCounts[r.actor] || 0) + 1
  }
  const counts = AGENTS.map((a) => agentTurnCounts[a.key] || 0)
  const totalStudentTurns = counts.reduce((s, c) => s + c, 0)
  // Perfect equity = all agents equally served. Gini-style equity score.
  let inclusivityIndex = 100
  if (totalStudentTurns > 0) {
    const mean = totalStudentTurns / counts.length
    const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length
    inclusivityIndex = Math.max(0, Math.round(100 - (Math.sqrt(variance) / (mean || 1)) * 100))
  }

  return {
    teacherTalkRatio: Math.round(teacherTalkRatio * 100) / 100,
    socraticRate: Math.round(socraticRate * 100) / 100,
    inclusivityIndex,
    totalTurns: teacherUtterances.length,
    agentTurnCounts,
  }
}

// ---------------------------------------------------------------------
// Report generation (Arabic MSA, deterministic — safe without LLM).
// ---------------------------------------------------------------------

export interface GeneratedReport {
  summaryAr: string
  sessionSignalAr: string
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  overallScore: number
  classroomPattern: string
}

export async function generateReport(sessionId: string): Promise<GeneratedReport> {
  const session = await db.simSession.findUnique({
    where: { id: sessionId },
    include: { events: true, user: { include: { profile: true } } },
  })
  if (!session) throw new Error('session_not_found')

  const m = await computeMetrics(sessionId)
  const dialect = parseDialect(session.dialect)
  const dialectLabel = dialect === 'saudi' ? 'السعودية' : 'المصرية'

  const strengths: string[] = []
  const weaknesses: string[] = []
  const recommendations: string[] = []

  // Teacher talk ratio analysis (target 30-45%)
  if (m.teacherTalkRatio > 60) {
    weaknesses.push('ارتفاع نسبة كلام المعلم عن الحد التربوي الموصى به')
    recommendations.push('قلّل من الإلقاء المباشر وامنح الطلاب مساحة أوسع للتعبير')
  } else if (m.teacherTalkRatio >= 30 && m.teacherTalkRatio <= 45) {
    strengths.push('توازن ممتاز في نسبة كلام المعلم مع مشاركة الطلاب')
  } else if (m.teacherTalkRatio < 20 && m.totalTurns > 3) {
    weaknesses.push('انخفاض واضح في توجيه الحوار من قبل المعلم')
    recommendations.push('ازدد توجيهاً للحوار بتلخيص الأفكار وطرح أسئلة رابطة')
  } else {
    strengths.push('نسبة كلام المعلم ضمن النطاق التربوي المقبول')
  }

  // Socratic questioning
  if (m.socraticRate >= 40) {
    strengths.push('اعتماد واضح على الأسئلة المفتوحة السقراطية')
  } else {
    weaknesses.push('قلة الأسئلة المفتوحة التي تحفّز التفكير الناقد')
    recommendations.push('استخدم أسئلة «لماذا» و«كيف» و«ما رأيك» بنسبة أعلى في حواراتك')
  }

  // Inclusivity
  if (m.inclusivityIndex >= 75) {
    strengths.push('توزيع عادل للانتباه على جميع الطلاب')
  } else {
    weaknesses.push('تركيز الانتباه على بعض الطلاب دون الآخرين')
    recommendations.push('وزّع أسئلتك بشكل متوازن على جميع شخصيات الفصل')
  }

  if (m.totalTurns < 3) {
    weaknesses.push('قصر مدة التفاعل في الجلسة')
    recommendations.push('أطل الجلسة القادمة لتحصل على تشخيص أدق لمستوى مهاراتك')
  }

  const overallScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        (100 - Math.abs(m.teacherTalkRatio - 40) * 0.6) * 0.35 +
          Math.min(m.socraticRate, 80) * 0.35 +
          m.inclusivityIndex * 0.3
      )
    )
  )

  const classroomPattern =
    m.inclusivityIndex >= 75 && m.socraticRate >= 30 ? 'balanced' : m.totalTurns < 4 ? 'disengaged' : 'balanced'

  const minutes = session.durationMinutes
  const summaryAr = `أكملت جلسة محاكاة صوتية بمدة ${minutes} دقيقة بلهجة ${dialectLabel}، تضمنت ${m.totalTurns} تدخلاً منك و${Object.values(m.agentTurnCounts).reduce((s, c) => s + c, 0)} ردّاً من الطلاب. بلغت نسبة كلامك ${m.teacherTalkRatio}% ومعدل الأسئلة السقراطية ${m.socraticRate}% ومؤشر الشمول ${m.inclusivityIndex}%، لتحصل على درجة إجمالية ${overallScore} من 100.`

  const sessionSignalAr =
    overallScore >= 75
      ? 'جلسة قوية تُظهر تمكناً واضحاً من إدارة الحوار الصفي.'
      : overallScore >= 50
        ? 'جلسة جيدة مع فرص واضحة للتحسين في بعض المهارات.'
        : 'جلسة تحتاج تطويراً — اتبع التوصيات أدناه في جلساتك القادمة.'

  if (recommendations.length === 0) {
    recommendations.push('حافظ على هذا الأداء وزد درجة التحدي في الجلسات القادمة')
  }
  if (strengths.length === 0) {
    strengths.push('إتمام الجلسة والتفاعل الصوتي مع جميع شخصيات الفصل')
  }

  return { summaryAr, sessionSignalAr, strengths, weaknesses, recommendations, overallScore, classroomPattern }
}
