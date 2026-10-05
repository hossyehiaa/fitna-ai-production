// =====================================================================
// Route guards — server-side authorization helpers.
//
// Rule: NEVER trust role/dialect values supplied by the client.
// Everything is resolved from the authenticated session -> DB profile.
// =====================================================================

import { NextResponse } from 'next/server'
import { getCurrentUser, type SessionUser } from './session'
import { parseDialect, type Dialect } from '@/lib/dialect/config'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function unauthorized() {
  return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
}

/** Require any authenticated user. Returns the user or a 401 response. */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  return user
}

export function isUser(u: SessionUser | NextResponse): u is SessionUser {
  return !(u instanceof NextResponse)
}

/** Require an authenticated user with a specific role. */
export async function requireRole(
  role: 'teacher' | 'institution'
): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (user.role !== role) {
    return NextResponse.json(
      { error: 'لا تملك صلاحية الوصول إلى هذه الخدمة' },
      { status: 403 }
    )
  }
  return user
}

/**
 * Resolve the authoritative dialect for the CURRENT user.
 * The client may NEVER dictate the dialect for real conversations —
 * it always comes from the stored profile.
 */
export function userDialect(user: SessionUser): Dialect {
  return parseDialect(user.profile?.dialect, 'saudi')
}

/**
 * Generic wrapper for API route handlers: catches errors, sanitizes them
 * (no stack traces, no internal details, no provider errors leak to users),
 * and returns a uniform JSON error shape.
 */
export function apiHandler<Ctx>(
  handler: (req: Request, ctx: Ctx, user: SessionUser) => Promise<Response>
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const maybeUser = await requireUser()
      if (!isUser(maybeUser)) return maybeUser
      return await handler(req, ctx, maybeUser)
    } catch (err) {
      const category = err instanceof ApiError ? 'api_error' : 'internal_error'
      console.error(
        JSON.stringify({
          level: 'error',
          category,
          endpoint: new URL(req.url).pathname,
          message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
        })
      )
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      return NextResponse.json(
        { error: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.' },
        { status: 500 }
      )
    }
  }
}
