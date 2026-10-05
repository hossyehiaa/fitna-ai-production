// =====================================================================
// Middleware — global security headers + route gating.
//
// Two layers of protection:
//   1. Security headers on every response (CSP, frame protection, etc.)
//   2. Cookie-presence gate: protected pages bounce anonymous visitors to
//      /login instantly. Full session VALIDATION still happens server-side
//      in every page/route via requireUser() — the cookie check is only a
//      UX shortcut, never the security boundary itself.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'fitna_session'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/session',
  '/settings',
  '/history',
  '/report',
  '/onboarding',
]

const AUTH_PAGES = ['/login', '/signup', '/forgot-password']

function applySecurityHeaders(res: NextResponse): NextResponse {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-DNS-Prefetch-Control', 'off')
  res.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)')
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  return res
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hasSessionCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value)

  let res: NextResponse

  if (!hasSessionCookie && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    res = NextResponse.redirect(url)
  } else if (hasSessionCookie && AUTH_PAGES.includes(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    res = NextResponse.redirect(url)
  } else {
    res = NextResponse.next()
  }

  return applySecurityHeaders(res)
}

export const config = {
  matcher: [
    // All pages except static assets and Next internals.
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:png|jpg|jpeg|svg|ico|webp|mp3|glb|woff2?)$).*)',
  ],
}
