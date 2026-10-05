// =====================================================================
// Session management — opaque tokens + DB-backed sessions.
// Replaces Supabase Auth's JWT session cookies.
//
// Security properties:
//   * Raw token exists ONLY inside an HTTP-only, Secure, SameSite=Lax cookie
//     (never readable by client JavaScript).
//   * The DB stores an HMAC-peppered SHA-256 hash of the token, so a DB
//     leak alone cannot be replayed as a valid session.
//   * Sessions expire (7 days rolling) and can be revoked server-side.
//   * A signed context cookie (fitna_auth_ctx) lets the edge proxy verify
//     authenticity + role WITHOUT a DB round-trip; pages still do the full
//     DB-verified getUser() on every request.
// =====================================================================

import { cookies, headers } from 'next/headers'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'fitna_session'
export const AUTH_CTX_COOKIE = 'fitna_auth_ctx'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const RENEW_AFTER_MS = 1 * 24 * 60 * 60 * 1000 // roll expiry after 1 day of activity

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET is not configured')
    }
    return 'insecure-dev-secret-do-not-use-in-production'
  }
  return s
}

function hashToken(raw: string): string {
  const mac = createHmac('sha256', secret()).update(raw).digest()
  return createHash('sha256').update(mac).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Best-effort client IP hash for audit trails (never the raw IP at rest). */
export async function clientIpHash(): Promise<string | null> {
  try {
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      null
    if (!ip) return null
    return createHash('sha256').update(`${ip}:${secret()}`).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

/** The users row as resolved from an authenticated session. */
export type AuthUserRow = {
  id: string
  email: string
  full_name: string | null
  role: string
  institution_id: string | null
  preferred_language: string
  preferred_theme: string
  teaching_experience: string | null
  teaching_level: string | null
  subject: string | null
  training_goals: string[]
  created_at: Date
}

/** Create a new session for a user and set the auth cookies. */
export async function createSession(user: { id: string; role: string }): Promise<void> {
  const raw = randomBytes(32).toString('base64url')
  const h = await headers().catch(() => null)
  const ipHash = await clientIpHash()

  await db.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipHash,
      userAgent: h?.get('user-agent')?.slice(0, 200) ?? null,
    },
  })

  // Signed context cookie for the edge proxy (role gating without DB).
  const ctx = Buffer.from(JSON.stringify({ uid: user.id, role: user.role })).toString('base64url')
  const ctxSig = createHmac('sha256', secret()).update(ctx).digest('base64url')

  const store = await cookies()
  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
  store.set(SESSION_COOKIE, raw, { ...base, maxAge: SESSION_TTL_MS / 1000 })
  store.set(AUTH_CTX_COOKIE, `${ctx}.${ctxSig}`, { ...base, maxAge: SESSION_TTL_MS / 1000 })
}

/** Resolve the authenticated users row from the session cookie (DB-verified). */
export async function getCurrentUser(): Promise<AuthUserRow | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw || raw.length < 20 || raw.length > 200) return null

  const tokenHash = hashToken(raw)
  const session = await db.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.authSession.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  // Rolling renewal: extend once per day of activity.
  if (session.lastSeenAt.getTime() + RENEW_AFTER_MS < Date.now()) {
    await db.authSession
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      .catch(() => {})
  }

  // Map Prisma's camelCase model fields onto the snake_case row shape the
  // original codebase expects (raw SQL paths already return snake_case).
  const u = session.user
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    institution_id: u.institutionId,
    preferred_language: u.preferredLanguage,
    preferred_theme: u.preferredTheme,
    teaching_experience: u.teachingExperience,
    teaching_level: u.teachingLevel,
    subject: u.subject,
    training_goals: u.trainingGoals ?? [],
    created_at: u.createdAt,
  }
}

/** Destroy the current session (logout) — revokes server-side + clears cookies. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (raw) {
    await db.authSession.deleteMany({ where: { tokenHash: hashToken(raw) } }).catch(() => {})
  }
  store.delete(SESSION_COOKIE)
  store.delete(AUTH_CTX_COOKIE)
}

/** Revoke every session of a user (password change / reset). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.authSession.deleteMany({ where: { userId } }).catch(() => {})
}

/**
 * Verify the signed context cookie (edge-proxy compatible, Web Crypto).
 * Returns { uid, role } when authentic, null otherwise. No DB access —
 * full verification still happens in getUser() at page level.
 */
export async function verifyAuthCtxCookie(value: string | undefined): Promise<{ uid: string; role: string } | null> {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const ctx = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const sigBytes = Buffer.from(sig, 'base64url')
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, Buffer.from(ctx, 'utf8'))
    if (!ok) return null
    const parsed = JSON.parse(Buffer.from(ctx, 'base64url').toString('utf8'))
    if (typeof parsed?.uid === 'string' && typeof parsed?.role === 'string') {
      return { uid: parsed.uid, role: parsed.role }
    }
    return null
  } catch {
    return null
  }
}
