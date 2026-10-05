// =====================================================================
// Deterministic fallback engine — classroom reactions WITHOUT any LLM key.
//
// This keeps the product fully functional (and testable) when
// GROQ_API_KEY is absent, and doubles as the circuit breaker when the
// provider fails mid-session. Reactions are dialect-aware: Saudi users get
// Saudi-flavored responses, Egyptian users get Egyptian-flavored ones.
// =====================================================================

import type { AIProvider, Reaction, TurnContext } from './provider'
import type { AgentConfig } from '@/lib/agents/registry'
import { parseDialect } from '@/lib/dialect/config'

type Intent =
  | 'open_question' // سؤال مفتوح يتطلب تفكيراً
  | 'closed_question' // سؤال مباشر محدد الإجابة
  | 'praise' // تشجيع
  | 'redirect' // توبيخ أو توجيه سلوكي
  | 'explain' // شرح / إلقاء معلومات

const OPEN_Q = /(لماذا|ليه|ليش|إزاي|ازاي|كيف|وش رأيك|ما رأيك|اعتقد|تتوقع|إيه|ايه|وش|ماذا|فكر)/
const CLOSED_Q = /(هل|ما هو|ماهو|من|متى|كم|أين|وين|فيه|عدد)/
const PRAISE = /(أحسنت|احسنت|ممتاز|رائع|شاطر|شطورة|عاش|برافو|تصفيق|مذهل|عمل رائع)/
const REDIRECT = /(انتبه|هدّي|اهدأ|اصمت|اسكت|بلاش|كفى|بعد إذنك|التزم|النظام|هدوء)/

function classifyIntent(text: string): Intent {
  if (REDIRECT.test(text)) return 'redirect'
  if (PRAISE.test(text)) return 'praise'
  if (OPEN_Q.test(text)) return 'open_question'
  if (text.includes('؟') || text.includes('?') || CLOSED_Q.test(text)) return 'closed_question'
  return 'explain'
}

// ---------------------------------------------------------------------
// Dialect response banks (natural child speech, 3-12 words per rule)
// ---------------------------------------------------------------------

interface Bank {
  knows: string[]
  partial: string[]
  confused: string[]
  handRaised: string[]
  distracted: string[]
  praiseJoy: string[]
  redirectSorry: string[]
}

const BANKS: Record<'saudi' | 'egyptian', Bank> = {
  saudi: {
    knows: [
      'أعرفها يا أستاذ! الجواب واضح',
      'أنا أعرف الجواب، أعطيته كذا',
      'سهلة! أقدر أجاوبها بسرعة',
      'فهمت الدرس تمام، الجواب عندي',
    ],
    partial: [
      'شكلي قربت للجواب بس مو متأكد',
      'أعرف نص الجواب بس يا أستاذ',
      'تقريباً وصلت، بس نقص شي بسيط',
      'فهمته شوي، ممكن توضح لي أكثر؟',
    ],
    confused: [
      'ما فهمت يا أستاذ، ممكن تعيد؟',
      'تلخبطت شوي… ممكن توضح أكثر؟',
      'ما عرفت الجواب هالمرة',
      'ليه صار كذا؟ ما وضح لي',
    ],
    handRaised: [
      'أنا يا أستاذ! خلني أجاوب',
      'خلني أشارك أستاذي، أعرفها',
      'أستاذ سؤال! عندي استفسار',
    ],
    distracted: [
      '…أوه! انتبهت الآن، وش قلت يا أستاذ؟',
      'معذرة أستاذي كنت سرحان شوي',
      'وش كان السؤال؟ ما مسكته',
    ],
    praiseJoy: [
      'ييي! فرحان بفساسي الحين',
      'شكراً أستاذي، بزيد اجتهادي',
      'هذا من تعليمك لنا أستاذي',
    ],
    redirectSorry: [
      'معذرة أستاذي، بتركز الحين',
      'آسف… بس جدولت انتباهي',
      'خلاص أستاذي، بديت أركز',
    ],
  },
  egyptian: {
    knows: [
      'أنا عارفها يا مستر! الإجابة واضحة',
      'عارف الإجابة يا ميس، سهلة',
      'هقولها حالاً يا أستاذ، فهمتها',
      'متعبة ولا حاجة، عارفها كويس',
    ],
    partial: [
      'قربت أجيبها بس مش متأكد',
      'عارف نص الإجابة بس يا مستر',
      'تقريباً وصلت، ناقص حاجة صغيرة',
      'فهمتها شوية، ممكن توضح أكتر؟',
    ],
    confused: [
      'مش فاهم يا مستر، ممكن تعيدها؟',
      'اتلخبطت شوية… ممكن توضحلي؟',
      'مش عارف الإجابة المرة دي',
      'ليه كده؟ مش واضحة لي',
    ],
    handRaised: [
      'أنا يا مستر! سيبني أجاوب',
      'خليني أشارك يا ميس، عارفها',
      'مستر سؤال! عندي استفسار',
    ],
    distracted: [
      '…آه! رجعت سمعي، قلت إيه يا مستر؟',
      'معذرة يا مستر كنت سايح شوية',
      'كان السؤال إيه؟ ماسكتهوش',
    ],
    praiseJoy: [
      'يا سلام! مبسوط أوي دلوقتي',
      'شكراً يا مستر، هزود اجتهادي',
      'ده من تعليمك لنا يا مستر',
    ],
    redirectSorry: [
      'معذرة يا مستر، هركز دلوقتي',
      'آسف… هظبط نفسي تاني',
      'خلاص يا مستر، بدأت أركز',
    ],
  },
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** Decide which students react this turn (rotating participation for inclusivity). */
function selectReactors(agents: AgentConfig[], turnNumber: number, intent: Intent): AgentConfig[] {
  const rotate = turnNumber % agents.length
  const ordered = [...agents.slice(rotate), ...agents.slice(0, rotate)]
  if (intent === 'redirect') return [ordered[0]]
  if (intent === 'praise' || intent === 'explain') return ordered.slice(0, 2)
  return ordered.slice(0, 3) // questions reach more students
}

export const fallbackProvider: AIProvider = {
  name: 'fallback',
  async generateReactions(agents, teacherText, ctx): Promise<Reaction[]> {
    const dialect = parseDialect(ctx.dialect)
    const bank = BANKS[dialect]
    const intent = classifyIntent(teacherText)
    const turnNumber = ctx.history.filter((h) => h.actor === 'teacher').length
    const seed = hashString(teacherText + turnNumber)
    const reactors = selectReactors(agents, turnNumber, intent)

    const stylePenalty =
      ctx.classroomStyle === 'disruptive' ? 18 : ctx.classroomStyle === 'disengaged' ? 25 : 0

    return reactors.map((agent, i) => {
      // Comprehension gate: weak students struggle with open questions.
      const canAnswer = agent.comprehension >= 60 || intent !== 'open_question'
      const roll = (seed + i * 7) % 100

      let text: string
      let emotion: Reaction['emotion']
      let attention = Math.max(
        15,
        Math.min(100, agent.baseAttention - stylePenalty + (intent === 'praise' ? 8 : 0))
      )

      if (intent === 'redirect') {
        text = pick(bank.redirectSorry, seed + i)
        emotion = 'attentive'
        attention = Math.min(100, attention + 12)
      } else if (intent === 'praise') {
        text = pick(bank.praiseJoy, seed + i)
        emotion = 'enthusiastic'
      } else if (roll < agent.comprehension) {
        // Answers correctly
        text = pick(bank.knows, seed + i)
        emotion = intent === 'open_question' ? 'enthusiastic' : 'attentive'
        if (roll < 30) {
          // High-achievers raise hands proactively on open questions
          text = pick(bank.handRaised, seed + i)
          emotion = 'hand_raised'
        }
      } else if (roll < agent.comprehension + 25) {
        text = pick(bank.partial, seed + i)
        emotion = 'confused'
      } else {
        text = pick(bank.confused, seed + i)
        emotion = 'confused'
        attention = Math.max(15, attention - 8)
      }

      // Distracted students occasionally zone out instead of answering
      if (agent.comprehension < 60 && roll > 92 && intent !== 'redirect') {
        text = pick(bank.distracted, seed + i)
        emotion = 'distracted'
      }

      return {
        agentKey: agent.key,
        agentName: agent.name,
        text,
        attention,
        emotion,
      }
    })
  },
}
