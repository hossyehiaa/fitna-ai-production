// =====================================================================
// CSRF protection — origin verification for all state-changing requests.
//
// Strategy (defense in depth):
//   1. SameSite=Lax auth cookie (set in session.ts) blocks most CSRF.
//   2. Origin/Referer check: the Origin header must match the app's own
//      origin (NEXT_PUBLIC_APP_URL or the request host).
//   3. Custom header requirement: X-Requested-With — cross-origin requests
//      from simple forms cannot attach custom headers without CORS approval.
// =====================================================================

import { NextResponse } from 'next/server'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizeOrigin(origin: string): string {
  try {
    const u = new URL(origin)
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

/**
 * Verify the request originates from this application.
 * Call at the top of every POST/PATCH/DELETE handler.
 *
 * Three independent signals must ALL pass:
 *   1. Origin header (when present) must equal the app origin
 *   2. Referer header (when present) must equal the app origin
 *   3. The X-Requested-With custom header must be present — cross-site
 *      pages cannot attach custom headers without a successful CORS
 *      preflight, which this app never grants to foreign origins.
 */
export function verifyOrigin(req: Request): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null

  let requestOrigin = ''
  try {
    const url = new URL(req.url)
    requestOrigin = `${url.protocol}//${url.host}`
  } catch {
    return csrfRejected()
  }

  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || '')
  const originHeader = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const xhrHeader = req.headers.get('x-requested-with')

  const isSameOrigin =
    !originHeader ||
    normalizeOrigin(originHeader) === requestOrigin ||
    (configured !== '' && normalizeOrigin(originHeader) === configured)

  const refererOk =
    !referer ||
    normalizeOrigin(referer) === requestOrigin ||
    (configured !== '' && normalizeOrigin(referer) === configured)

  const hasCustomHeader = xhrHeader === 'XMLHttpRequest'

  if (!isSameOrigin || !refererOk || !hasCustomHeader) {
    return csrfRejected()
  }
  return null
}

function csrfRejected(): NextResponse {
  return NextResponse.json(
    { error: 'تم رفض الطلب لأسباب أمنية. يرجى تحديث الصفحة والمحاولة مرة أخرى.' },
    { status: 403 }
  )
}
