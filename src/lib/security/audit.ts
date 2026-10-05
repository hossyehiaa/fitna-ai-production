// =====================================================================
// Audit logging — security-relevant events only.
//
// NEVER log: passwords, tokens, API keys, database URLs, session cookies,
// authorization headers, or full private conversation content.
// =====================================================================

import { db } from '@/lib/db'
import { clientIpHash } from '@/lib/auth/session'
import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'signup'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'password_change'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'account_deleted'
  | 'profile_updated'
  | 'dialect_changed'
  | 'session_created'
  | 'session_completed'
  | 'rate_limited'
  | 'csrf_rejected'
  | 'unauthorized_access'

/**
 * Record an audit event. Fire-and-forget: audit failures must never break
 * the user flow, but are surfaced to server logs for observability.
 */
export async function audit(
  action: AuditAction,
  options: {
    userId?: string | null
    metadata?: Record<string, unknown>
  } = {}
): Promise<void> {
  try {
    const ipHash = await clientIpHash()
    await db.auditLog.create({
      data: {
        userId: options.userId ?? null,
        action,
        metadata: sanitizeMetadata(options.metadata) as Prisma.InputJsonValue | undefined,
        ipHash,
      },
    })
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'warn', category: 'audit_write_failed', action })
    )
  }
}

/** Strip anything that could carry a secret or private content. */
function sanitizeMetadata(meta: Record<string, unknown> | undefined) {
  if (!meta) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (/secret|token|key|password|authorization|cookie/i.test(k)) continue
    if (typeof v === 'string' && v.length > 120) {
      out[k] = `${v.slice(0, 120)}…`
    } else {
      out[k] = v
    }
  }
  return out
}
