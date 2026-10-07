import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  openrouterChat,
  pingOpenRouter,
  openrouterErrorSignature,
  ROLEPLAY_MODEL,
  ROLEPLAY_FALLBACKS,
  REPORT_MODEL,
  CLASSIFIER_MODEL,
  resolveChain,
} from '@/lib/llm/openrouter'
import { elevenLabsConfigured, geminiTtsConfigured } from '@/lib/tts/providers'
import { toneAnalysisConfigured } from '@/lib/analysis/tone'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =====================================================================
// Health check — deployment verification endpoint.
// Reports service availability FLAGS ONLY (no secrets, no config values).
//
// ?probe=1 — LIVE provider probes: a one-token OpenRouter call per Dream
// Team model (the exact failure each would hit on the real turn path),
// so "LLM falls back to deterministic replies" outages (geo-blocked
// models / revoked access / bad key) are diagnosable straight from the
// production URL without dashboard access.
// =====================================================================

export async function GET(request: Request) {
  let dbOk = false
  try {
    await db.$queryRawUnsafe('SELECT 1')
    dbOk = true
  } catch {
    dbOk = false
  }

  // TTS waterfall status (master prompt §5 order).
  const ttsTiers: string[] = []
  if (process.env.FISH_AUDIO_API_KEY) ttsTiers.push('fish-audio')
  if (elevenLabsConfigured()) ttsTiers.push('elevenlabs:eleven_v3')
  if (geminiTtsConfigured()) ttsTiers.push('gemini-tts')
  ttsTiers.push('msedge') // keyless — always available

  const payload: Record<string, unknown> = {
    status: dbOk ? 'ok' : 'degraded',
    service: 'fitna-ai',
    db: dbOk ? 'up' : 'down',
    // Provider flags (public information — never the keys themselves).
    ai: process.env.OPENROUTER_API_KEY
      ? `openrouter:${ROLEPLAY_MODEL.split('/').pop()}+${ROLEPLAY_FALLBACKS.length}fallbacks`
      : 'deterministic-fallback',
    llmReport: process.env.OPENROUTER_API_KEY ? `openrouter:${REPORT_MODEL.split('/').pop()}` : 'unavailable',
    llmClassifier: process.env.OPENROUTER_API_KEY ? `openrouter:${CLASSIFIER_MODEL.split('/').pop()}` : 'unavailable',
    stt: process.env.GROQ_API_KEY ? 'groq-whisper-large-v3-turbo' : 'unavailable',
    tts: ttsTiers.join('→'),
    toneAnalysis: toneAnalysisConfigured() ? 'gemini-2.5-pro' : 'not-configured',
    auth: 'custom-scrypt-session',
    timestamp: new Date().toISOString(),
  }

  if (new URL(request.url).searchParams.get('probe') === '1') {
    const probe: Record<string, unknown> = {}

    // 1) Live one-token ping through the classifier chain (fast liveness).
    probe.ping = await pingOpenRouter()

    // 2) Per-model probe of the FULL Dream Team + any env pins — the exact
    //    failure each model would hit on the real turn path.
    const chatProbes: Record<string, unknown> = {}
    const probeModels = resolveChain(ROLEPLAY_MODEL, ROLEPLAY_FALLBACKS)
    for (const model of [...new Set([...probeModels, REPORT_MODEL, CLASSIFIER_MODEL])]) {
      try {
        const r = await openrouterChat({
          model,
          messages: [{ role: 'user', content: 'قل: تمام' }],
          maxTokens: 10,
          temperature: 0,
          timeoutMs: 20_000,
        })
        chatProbes[model] = { ok: true, sample: r.text.replace(/\s+/g, ' ').slice(0, 40), servedBy: r.model }
      } catch (err) {
        chatProbes[model] = { ok: false, err: openrouterErrorSignature(err) }
      }
    }
    probe.chatProbes = chatProbes

    // 3) The exact chain order the turn path will walk right now.
    probe.roleplayChain = probeModels

    payload.probe = probe
  }

  return NextResponse.json(payload, { status: dbOk ? 200 : 503 })
}
