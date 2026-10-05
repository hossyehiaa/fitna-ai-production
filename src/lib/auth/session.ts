// =====================================================================
// Session management — opaque tokens + DB-backed sessions.
//
// Security properties:
//   * Raw token exists ONLY inside an HTTP-only, Secure, SameSite=Lax cookie
//     (never readable by client JavaScript).
//   * The DB stores a SHA-256 hash of the token, so a DB leak alone cannot
//     be replayed as a valid session.
//   * Sessions expire (7 days rolling) and can be revoked server-side
//     (logout, password change, account deletion).
//   * AUTH_SECRET (env) pepper-mac tokens so a raw-token leak still cannot
//     be forged without the server secret.
// =====================================================================

import { cookies, headers } from 'next/headers'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import type { User, Profile } from '@prisma/client'

export const SESSION_COOKIE = 'fitna_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const RENEW_AFTER_MS = 1 * 24 * 60 * 60 * 1000 // roll expiry after 1 day of activity

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) {
    // Fail closed in production; allow short secrets only in local dev.
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

function safeEqual(a: string, b: string): boolean {
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

export interface SessionUser extends User {
  profile: Profile | null
}

/** Create a new session for a user and set the auth cookie. */
export async function createSession(userId: string): Promise<void> {
  const raw = randomBytes(32).toString('base64url')
  const h = await headers().catch(() => null)
  const ipHash = await clientIpHash()

  await db.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipHash,
      userAgent: h?.get('user-agent')?.slice(0, 200) ?? null,
    },
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

/**
 * Resolve the authenticated user from the session cookie.
 * Returns null for: missing cookie, unknown/expired session, deleted user.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw || raw.length < 20 || raw.length > 200) return null

  const tokenHash = hashToken(raw)
  const session = await db.authSession.findUnique({
    where: { tokenHash },
    include: { user: { include: { profile: true } } },
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

  return session.user as SessionUser
}

/** Destroy the current session (logout) — revokes server-side + clears cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (raw) {
    await db.authSession.deleteMany({ where: { tokenHash: hashToken(raw) } }).catch(() => {})
  }
  store.delete(SESSION_COOKIE)
}

/** Revoke every session of a user (password change / reset, account deletion). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.authSession.deleteMany({ where: { userId } }).catch(() => {})
}

/** Constant-time comparison helper reused by CSRF checks. */
export { safeEqual }
