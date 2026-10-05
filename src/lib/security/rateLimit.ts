// =====================================================================
// Rate limiting — in-memory sliding window keyed by user ID or IP.
//
// On Vercel serverless each instance keeps its own counters (per-instance
// limiting). This stops bursts of abuse; durable/global limits would need
// Upstash Redis — noted in README as a scaling upgrade.
// =====================================================================

import { createHash } from 'node:crypto'

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000 // memory guard

export interface RateLimitRule {
  /** Unique rule name, e.g. "api:login" */
  name: string
  limit: number
  windowMs: number
}

export const RATE_LIMITS = {
  login: { name: 'auth:login', limit: 10, windowMs: 5 * 60 * 1000 },
  signup: { name: 'auth:signup', limit: 5, windowMs: 10 * 60 * 1000 },
  passwordForgot: { name: 'auth:forgot', limit: 5, windowMs: 15 * 60 * 1000 },
  stt: { name: 'api:stt', limit: 60, windowMs: 5 * 60 * 1000 },
  tts: { name: 'api:tts', limit: 120, windowMs: 5 * 60 * 1000 },
  turn: { name: 'api:turn', limit: 90, windowMs: 5 * 60 * 1000 },
  sessionCreate: { name: 'api:session-create', limit: 20, windowMs: 10 * 60 * 1000 },
  generic: { name: 'api:generic', limit: 120, windowMs: 5 * 60 * 1000 },
} satisfies Record<string, RateLimitRule>

function keyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 24)
}

/** Returns true when the request is allowed; false when the limit is exceeded. */
export function rateLimit(rule: RateLimitRule, identity: string): boolean {
  const key = `${rule.name}:${keyHash(identity)}`
  const now = Date.now()
  let bucket = buckets.get(key)

  if (!bucket) {
    if (buckets.size > MAX_BUCKETS) {
      // Reset the whole table under memory pressure — safe & simple.
      buckets.clear()
    }
    bucket = { hits: [] }
    buckets.set(key, bucket)
  }

  bucket.hits = bucket.hits.filter((t) => now - t < rule.windowMs)
  if (bucket.hits.length >= rule.limit) {
    return false
  }
  bucket.hits.push(now)
  return true
}

/** Helper: extract an identity string for rate limiting. */
export async function rateLimitIdentity(userId?: string | null): Promise<string> {
  if (userId) return `u:${userId}`
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'anonymous'
    return `ip:${ip}`
  } catch {
    return 'ip:anonymous'
  }
}
