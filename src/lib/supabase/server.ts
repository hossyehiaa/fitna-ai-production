// =====================================================================
// Supabase-compatible SERVER client — production replacement.
//
// Same public surface as the original src/lib/supabase/server.ts:
//   * createClient()          — user-scoped client (RLS policies enforced)
//   * createAdminClient()     — admin client (bypasses policies; server-only)
//
// Under the hood it runs on Neon Postgres via Prisma + the custom auth
// (scrypt + opaque DB sessions). No Supabase URL/keys are used anywhere —
// the hardcoded-key security hole of the original is gone by construction.
// =====================================================================

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  createSession,
  destroySession,
  getCurrentUser,
  revokeAllSessions,
  type AuthUserRow,
} from '@/lib/auth/session'
import { randomBytes, createHash, createHmac } from 'node:crypto'
import {
  createQueryBuilder,
  ctxFromUser,
  toShimUser,
  type PostgrestError,
  type ShimUser,
} from './shim'

// ---------------------------------------------------------------------
// Auth API (supabase-js shaped, backed by the custom auth system)
// ---------------------------------------------------------------------

type AuthSession = { access_token: string; token_type: string; expires_in: number }
type AuthData<T> = { data: T; error: PostgrestError | null }

function authError(message: string): { data: { user: null; session: null }, error: { message: string } } {
  return { data: { user: null, session: null }, error: { message } }
}

async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT * FROM "users" WHERE "email" = $1::text LIMIT 1`,
    email.trim().toLowerCase()
  )) as Record<string, unknown>[]
  return (rows[0] as unknown as AuthUserRow) ?? null
}

async function getUserRowById(id: string): Promise<AuthUserRow | null> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT * FROM "users" WHERE "id" = $1::uuid LIMIT 1`,
    id
  )) as Record<string, unknown>[]
  return (rows[0] as unknown as AuthUserRow) ?? null
}

function makeAuthSession(): AuthSession {
  return {
    access_token: randomBytes(24).toString('base64url'),
    token_type: 'bearer',
    expires_in: 7 * 24 * 60 * 60,
  }
}

// Simple in-memory rate limiter for auth attempts (per process).
const authAttempts = new Map<string, { count: number; resetAt: number }>()
function authRateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = authAttempts.get(key)
  if (!entry || entry.resetAt < now) {
    authAttempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count += 1
  if (entry.count > limit) return false
  return true
}

function clientKey(): string {
  return 'local' // per-process fallback; real keying happens per identifier below
}

function makeAuthApi() {
  return {
    async getUser(): Promise<AuthData<{ user: ShimUser | null }>> {
      const user = await getCurrentUser()
      return { data: { user: user ? toShimUser(user) : null }, error: null }
    },

    async signInWithPassword(credentials: {
      email: string
      password: string
    }): Promise<AuthData<{ user: ShimUser | null; session: AuthSession | null }>> {
      const email = (credentials?.email || '').trim().toLowerCase()
      const password = credentials?.password || ''
      if (!authRateLimit(`login:${email}`) || !authRateLimit(`login:${clientKey()}`, 30)) {
        return authError('Too many login attempts. Please wait a minute and try again.')
      }

      const user = await findUserByEmail(email)
      if (!user || !user.password_hash) {
        // Same generic message Supabase returned — the login action greps it.
        return authError('Invalid login credentials')
      }
      const ok = await verifyPassword(password, user.password_hash)
      if (!ok) return authError('Invalid login credentials')

      await createSession({ id: user.id, role: user.role })
      return { data: { user: toShimUser(user), session: makeAuthSession() }, error: null }
    },

    async signUp(input: {
      email: string
      password: string
      options?: { data?: Record<string, unknown>; emailRedirectTo?: string }
    }): Promise<AuthData<{ user: ShimUser | null; session: AuthSession | null }>> {
      const email = (input?.email || '').trim().toLowerCase()
      const password = input?.password || ''
      const fullName = String(input?.options?.data?.full_name ?? '').trim()
      const role = String(input?.options?.data?.role ?? 'teacher')

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authError('Invalid email')
      if (password.length < 6) return authError('Password should be at least 6 characters')
      if (role !== 'teacher' && role !== 'institution_admin') return authError('Invalid role')

      if (!authRateLimit(`signup:${email}`, 5, 300_000)) {
        return authError('Too many sign-up attempts. Please try again later.')
      }

      const existing = await findUserByEmail(email)
      if (existing) {
        // Message grepped by the original signUpAction.
        return authError('User already registered')
      }

      const passwordHash = await hashPassword(password)
      const rows = (await db.$queryRawUnsafe(
        `INSERT INTO "users" ("email", "full_name", "role", "password_hash", "preferred_language", "preferred_theme", "training_goals")
         VALUES ($1::text, $2::text, $3::text, $4::text, 'ar', 'light', '{}'::text[])
         RETURNING *`,
        email,
        fullName || null,
        role,
        passwordHash
      )) as Record<string, unknown>[]
      const created = rows[0] as unknown as AuthUserRow

      // No email confirmation step in production (no SMTP provider) —
      // the account is immediately usable, so a session is granted now.
      await createSession({ id: created.id, role: created.role })
      return { data: { user: toShimUser(created), session: makeAuthSession() }, error: null }
    },

    async signOut(): Promise<{ error: PostgrestError | null }> {
      await destroySession()
      return { error: null }
    },

    async resetPasswordForEmail(
      email: string,
      _options?: { redirectTo?: string }
    ): Promise<{ data: Record<string, never>; error: PostgrestError | null }> {
      const normalized = (email || '').trim().toLowerCase()
      if (!authRateLimit(`reset:${normalized}`, 5, 300_000)) {
        return { data: {}, error: { message: 'Too many reset requests. Please try again later.' } }
      }
      const user = await findUserByEmail(normalized)
      if (user) {
        const raw = randomBytes(32).toString('base64url')
        const tokenHash = createHash('sha256')
          .update(createHmac('sha256', process.env.AUTH_SECRET || 'dev').update(raw).digest())
          .digest('hex')
        await db.$queryRawUnsafe(
          `INSERT INTO "password_reset_tokens" ("user_id", "token_hash", "expires_at")
           VALUES ($1::uuid, $2::text, now() + interval '1 hour')`,
          user.id,
          tokenHash
        )
        // No SMTP provider is configured in production. The reset link is
        // logged server-side so the operator can hand it to the user until
        // a mailer is wired. The token itself is single-use and expires in 1h.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
        console.log(
          `[auth] password reset requested for ${normalized}: ${appUrl}/auth/confirm?token_hash=${raw}&type=recovery&next=/reset-password`
        )
      }
      // Always succeed — never reveal whether the email exists.
      return { data: {}, error: null }
    },

    async updateUser(attrs: { email?: string; password?: string }): Promise<{ data: { user: ShimUser | null }; error: PostgrestError | null }> {
      const current = await getCurrentUser()
      if (!current) {
        return { data: { user: null }, error: { message: 'No session found' } }
      }

      if (attrs?.email) {
        const email = attrs.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { data: { user: null }, error: { message: 'Invalid email' } }
        }
        const existing = await findUserByEmail(email)
        if (existing && existing.id !== current.id) {
          return { data: { user: null }, error: { message: 'User already registered' } }
        }
        await db.$queryRawUnsafe(
          `UPDATE "users" SET "email" = $1::text WHERE "id" = $2::uuid`,
          email,
          current.id
        )
      }

      if (attrs?.password) {
        if (attrs.password.length < 6) {
          return { data: { user: null }, error: { message: 'Password should be at least 6 characters' } }
        }
        const passwordHash = await hashPassword(attrs.password)
        await db.$queryRawUnsafe(
          `UPDATE "users" SET "password_hash" = $1::text WHERE "id" = $2::uuid`,
          passwordHash,
          current.id
        )
        await revokeAllSessions(current.id).catch(() => {})
        await createSession({ id: current.id, role: current.role })
      }

      const fresh = await getUserRowById(current.id)
      return { data: { user: fresh ? toShimUser(fresh) : null }, error: null }
    },

    async verifyOtp(params: {
      type: string
      token_hash: string
    }): Promise<{ data: { user: ShimUser | null; session: AuthSession | null }; error: PostgrestError | null }> {
      const raw = params?.token_hash
      if (!raw || !/^[\w-]{20,200}$/.test(raw)) {
        return authError('Invalid or expired token')
      }
      const tokenHash = createHash('sha256')
        .update(createHmac('sha256', process.env.AUTH_SECRET || 'dev').update(raw).digest())
        .digest('hex')
      const rows = (await db.$queryRawUnsafe(
        `SELECT t."user_id", t."used_at", t."expires_at", u."role"
         FROM "password_reset_tokens" t JOIN "users" u ON u."id" = t."user_id"
         WHERE t."token_hash" = $1::text LIMIT 1`,
        tokenHash
      )) as Record<string, unknown>[]
      const tokenRow = rows[0]
      if (!tokenRow) return authError('Invalid or expired token')
      if (tokenRow.used_at || new Date(String(tokenRow.expires_at)).getTime() < Date.now()) {
        return authError('Invalid or expired token')
      }
      await db.$queryRawUnsafe(
        `UPDATE "password_reset_tokens" SET "used_at" = now() WHERE "token_hash" = $1::text`,
        tokenHash
      )
      const user = await getUserRowById(String(tokenRow.user_id))
      if (!user) return authError('Invalid or expired token')
      await createSession({ id: user.id, role: user.role })
      return { data: { user: toShimUser(user), session: makeAuthSession() }, error: null }
    },
  }
}

// ---------------------------------------------------------------------
// Client construction
// ---------------------------------------------------------------------

export type ServerShimClient = {
  auth: ReturnType<typeof makeAuthApi>
  from: (table: string) => ReturnType<typeof createQueryBuilder>
}

/** User-scoped client (RLS policies enforced against the session user). */
export async function createClient(
  _options?: { bypassDemo?: boolean; user?: AuthUserRow | null }
): Promise<ServerShimClient> {
  // LATENCY: callers that ALREADY resolved the authenticated user (e.g. a
  // token cache hit on the streaming turn route) pass it here — skipping
  // this function's second getCurrentUser() DB round trip. Without it,
  // every createClient() re-queries the auth session on Neon, which sat
  // directly on the time-to-first-audio path.
  const user = _options && _options.user !== undefined ? _options.user : await getCurrentUser()
  const ctx = ctxFromUser(user)
  return {
    auth: makeAuthApi(),
    from: (table: string) => createQueryBuilder(table, ctx),
  }
}

/**
 * Admin client — bypasses row policies entirely, exactly like the original
 * service_role client. ONLY import in server-only code that has already
 * verified the caller's identity/role itself. Never bundle for the browser.
 */
export function createAdminClient(): ServerShimClient {
  return {
    auth: makeAuthApi(),
    from: (table: string) => createQueryBuilder(table, null),
  }
}
