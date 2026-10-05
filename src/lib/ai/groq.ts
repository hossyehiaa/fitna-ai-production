// =====================================================================
// Groq LLM provider — student reactions with a resilient model chain.
// Server-only. GROQ_API_KEY stays in env (never client, never logs).
//
// Model selection (verified against this key's /models lineup):
//   1. GROQ_CHAT_MODEL env override (ops control)
//   2. openai/gpt-oss-120b      — primary: strongest dialect fidelity + JSON
//   3. qwen/qwen3.8-27b         — secondary multilingual
//   4. allam-2-7b               — Arabic-native last resort
// A 404 "model not available" walks down the chain; any other failure
// (auth, network, timeout) fails fast into the deterministic fallback.
// =====================================================================

import Groq from 'groq-sdk'
import type { AIProvider, Reaction, TurnContext } from './provider'
import type { AgentConfig } from '@/lib/agents/registry'
import { buildAgentSystemPrompt, fenceUserContent, DEVELOPER_RULES, conversationHistoryBlock } from './provider'
import { parseDialect } from '@/lib/dialect/config'

/** Primary model label surfaced in health/logs (public info, not a secret). */
export const GROQ_CHAT_MODEL_LABEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b'

const CHAT_MODEL_CHAIN: string[] = [
  ...(process.env.GROQ_CHAT_MODEL ? [process.env.GROQ_CHAT_MODEL] : []),
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'allam-2-7b',
]

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

/** Is this error a "model unavailable for this key" 404? */
function isModelUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status
  const msg = err instanceof Error ? err.message : ''
  return status === 404 || /does not exist or you do not have access/i.test(msg)
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
اللهجة إلزامية في صياغة كل رد: استخدم ألفاظ اللهجة المحددة للطالب في نطقك اليومي الطبيعي، وتجنب تماماً ألفاظ اللهجة الأخرى المذكورة في قائمة المحظورات.
أخرج مصفوفة JSON فقط، كل عنصر: {"name": "اسم الطالب بالعربية", "text": "رد الطالب بلهجته المحكية (جملة أو جملتان، 3-12 كلمة)", "attention": رقم 15-100, "emotion": "attentive|hand_raised|distracted|enthusiastic|confused"}.
رّد من 2 إلى 3 طلاب فقط في هذا الدور.
${DEVELOPER_RULES}`

  // Per-agent persona reinforcement: the swarm prompt plus each persona.
  const personaBlock = agents
    .map((a) => buildAgentSystemPrompt(a, dialect))
    .join('\n\n---\n\n')

  let raw: string | undefined
  for (const model of CHAT_MODEL_CHAIN) {
    let completion: Awaited<ReturnType<Groq['chat']['completions']['create']>>
    try {
      completion = await groq.chat.completions.create({
        model,
        temperature: 0.7,
        max_tokens: 900,
        // gpt-oss family accepts reasoning_effort; low keeps turns snappy.
        // Other models reject unknown params silently via extra_body — the
        // Groq SDK passes this through as a per-request option safely.
        ...(model.startsWith('openai/gpt-oss')
          ? { reasoning_effort: 'low' as const }
          : {}),
        messages: [
          { role: 'system', content: `${personaBlock}\n\n${systemPrompt}` },
          { role: 'user', content: fenceUserContent(teacherText) },
        ],
      })
    } catch (err) {
      if (isModelUnavailable(err)) continue // walk down the model chain
      throw err // auth/network/timeout — fail fast to deterministic fallback
    }
    raw = completion.choices?.[0]?.message?.content || undefined
    if (raw) break // got usable content — stop walking the chain
  }
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
