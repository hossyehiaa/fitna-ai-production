// =====================================================================
// Groq LLM provider — llama-3.3-70b-versatile for student reactions.
// Server-only. GROQ_API_KEY stays in env (never client, never logs).
// =====================================================================

import Groq from 'groq-sdk'
import type { AIProvider, Reaction, TurnContext } from './provider'
import type { AgentConfig } from '@/lib/agents/registry'
import { buildAgentSystemPrompt, fenceUserContent, DEVELOPER_RULES, conversationHistoryBlock } from './provider'
import { parseDialect } from '@/lib/dialect/config'

const CHAT_MODEL = 'llama-3.3-70b-versatile'

interface ParsedStudentOutput {
  name?: string
  text?: string
  attention?: number
  emotion?: string
}

function client(): Groq | null {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  return new Groq({ apiKey: key, timeout: 20_000, maxRetries: 1 })
}

/**
 * Ask the LLM how each agent reacts to the teacher utterance.
 * Returns null when the key is missing OR the response is unusable —
 * the caller then falls back to the deterministic engine.
 */
async function tryGroq(
  groq: Groq,
  agents: AgentConfig[],
  teacherText: string,
  ctx: TurnContext
): Promise<Reaction[] | null> {
  const dialect = parseDialect(ctx.dialect)
  const agentList = agents
    .map((a) => `${a.key}=${a.name} (فهم ${a.comprehension}%، انتباه ${a.baseAttention}%)`)
    .join('، ')

  const systemPrompt = `أنت محرك محاكاة فصل دراسي افتراضي يجيب عن أربع شخصيات طلاب.
${conversationHistoryBlock(ctx)}
${ctx.lessonContext ? `موضوع الدرس: ${ctx.lessonContext.slice(0, 400)}` : 'لا يوجد موضوع محدد.'}
أسلوب الفصل المطلوب: ${ctx.classroomStyle}.
الطلاب: ${agentList}.

لكل طالب شخصيته الدائمة المحددة أدناه، وسلوك اللهجة محدد بدقة ولا يجوز خلط اللهجات أو الخروج عنها.
أخرج مصفوفة JSON فقط، كل عنصر: {"name": "اسم الطالب بالعربية", "text": "رد الطالب (جملة أو جملتان، 3-12 كلمة)", "attention": رقم 15-100, "emotion": "attentive|hand_raised|distracted|enthusiastic|confused"}.
رّد من 2 إلى 3 طلاب فقط في هذا الدور.
${DEVELOPER_RULES}`

  // Per-agent persona reinforcement: the swarm prompt plus each persona.
  const personaBlock = agents
    .map((a) => buildAgentSystemPrompt(a, dialect))
    .join('\n\n---\n\n')

  const completion = await groq.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: `${personaBlock}\n\n${systemPrompt}` },
      { role: 'user', content: fenceUserContent(teacherText) },
    ],
  })

  const raw = completion.choices?.[0]?.message?.content
  if (!raw) return null

  // Extract the JSON array defensively (models sometimes wrap in fences).
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return null
  let parsed: ParsedStudentOutput[]
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null

  const byName = new Map(agents.map((a) => [a.name, a]))
  const reactions: Reaction[] = []
  for (const item of parsed.slice(0, 4)) {
    const agent = byName.get((item.name || '').trim())
    if (!agent || !item.text || typeof item.text !== 'string') continue
    const emotion =
      item.emotion === 'hand_raised' ||
      item.emotion === 'distracted' ||
      item.emotion === 'enthusiastic' ||
      item.emotion === 'confused'
        ? item.emotion
        : 'attentive'
    reactions.push({
      agentKey: agent.key,
      agentName: agent.name,
      text: item.text.slice(0, 300),
      attention:
        typeof item.attention === 'number'
          ? Math.max(15, Math.min(100, Math.round(item.attention)))
          : agent.baseAttention,
      emotion,
    })
  }
  return reactions.length > 0 ? reactions : null
}

export const groqProvider: AIProvider = {
  name: 'groq',
  async generateReactions(agents, teacherText, ctx): Promise<Reaction[]> {
    const groq = client()
    if (!groq) throw new Error('groq_unavailable')
    try {
      const result = await tryGroq(groq, agents, teacherText, ctx)
      if (result) return result
      throw new Error('groq_bad_output')
    } catch (err) {
      // Structured log — no secrets, no user content.
      console.error(
        JSON.stringify({
          level: 'warn',
          category: 'ai_provider_failed',
          provider: 'groq',
          message: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
        })
      )
      throw err
    }
  },
}
