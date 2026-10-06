import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { groq, preloadGroqModels, discoveredModelIds, groqErrorSignature } from '@/lib/ai/groq'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =====================================================================
// Health check — deployment verification endpoint.
// Reports service availability FLAGS ONLY (no secrets, no config values).
//
// ?probe=1 — LIVE provider probes (public info only): the Groq model
// lineup visible to this key plus a one-token chat call per candidate
// model. Built to diagnose "LLM falls back to deterministic replies"
// outages (decommissioned models / revoked access) straight from the
// production URL, without dashboard access.
// =====================================================================

// Candidate chat models probed individually (fast-fail on dead ids).
const PROBE_CANDIDATES = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-235b-a22b-tput-8k',
  'qwen/qwen3.8-27b',
  'qwen/qwen3-32b',
  'deepseek-r1-distill-llama-70b',
  'llama-3.3-70b-versatile',
  'allam-2-7b',
  'llama-3.1-8b-instant',
]

export async function GET(request: Request) {
  let dbOk = false
  try {
    await db.$queryRawUnsafe('SELECT 1')
    dbOk = true
  } catch {
    dbOk = false
  }

  const payload: Record<string, unknown> = {
    status: dbOk ? 'ok' : 'degraded',
    service: 'fitna-ai',
    db: dbOk ? 'up' : 'down',
    // Provider flags (public information — never the keys themselves).
    // Format kept backwards-compatible with the e2e contract ("groq-...").
    ai: process.env.GROQ_API_KEY
      ? `groq-${(process.env.GROQ_CHAT_MODEL || 'gpt-oss-120b').split('/').pop()}`
      : 'deterministic-fallback',
    tts: process.env.FISH_AUDIO_API_KEY
      ? `fish-audio:${process.env.FISH_AUDIO_MODEL || 's2.1-pro-free'}+msedge`
      : 'msedge',
    stt: process.env.GROQ_API_KEY ? 'groq-whisper-large-v3-turbo' : 'unavailable',
    auth: 'custom-scrypt-session',
    timestamp: new Date().toISOString(),
  }

  if (new URL(request.url).searchParams.get('probe') === '1') {
    const probe: Record<string, unknown> = {}

    // 1) Model lineup visible to this key (drives chain resolution).
    try {
      const list = await groq.models.list()
      const ids = ((list as unknown as { data?: Array<{ id?: string }> }).data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string')
      probe.modelsCount = ids.length
      probe.models = ids
    } catch (err) {
      probe.modelsError = groqErrorSignature(err)
    }

    // 2) One-token chat call per candidate — the exact failure each model
    //    would hit on the real turn path (status + short message).
    const chatProbes: Record<string, unknown> = {}
    await Promise.all(
      PROBE_CANDIDATES.map(async (m) => {
        try {
          const c = (await groq.chat.completions.create({
            model: m,
            messages: [{ role: 'user', content: 'قل: تمام' }],
            max_completion_tokens: 8,
            ...(m.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {}),
          })) as { choices?: Array<{ message?: { content?: string } }> }
          chatProbes[m] = {
            ok: true,
            sample: (c.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').slice(0, 40),
          }
        } catch (err) {
          chatProbes[m] = { ok: false, err: groqErrorSignature(err) }
        }
      })
    )
    probe.chatProbes = chatProbes

    // 3) What the resilient chain actually resolved to right now.
    await preloadGroqModels()
    probe.discoveredCache = discoveredModelIds()

    payload.probe = probe
  }

  return NextResponse.json(payload, { status: dbOk ? 200 : 503 })
}
