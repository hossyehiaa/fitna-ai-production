import { NextResponse, type NextRequest } from "next/server";

// =====================================================================
// Route guard — production replacement for the Supabase-based proxy.
//
// Identical routing behavior to the original src/proxy.ts (same public/
// teacher/admin prefix lists, same redirect targets) with two changes:
//   1. Authentication is checked via the signed session context cookie
//      (HMAC-SHA256, Web Crypto — edge-compatible, no DB round-trip).
//      Pages still perform the full DB-verified getUser() on render.
//   2. Standard security headers (CSP, HSTS, frame protection) are set,
//      matching the production hardening requirements.
// =====================================================================

const TEACHER_ONLY_PREFIXES = ["/dashboard/teacher", "/session", "/history", "/growth"];
const ADMIN_ONLY_PREFIXES = ["/dashboard/institution"];
// /about + /manual are public marketing/help pages (linked from the login
// page — a first-time visitor must be able to read the guide before login).
const PUBLIC_PREFIXES = ["/login", "/reset-password", "/auth", "/report/share", "/about", "/manual", "/_next", "/api", "/manus-storage"];

const AUTH_CTX_COOKIE = "fitna_auth_ctx";

async function verifyAuthCtx(value: string | undefined): Promise<{ uid: string; role: string } | null> {
  if (!value) return null
  const dot = value.lastIndexOf(".")
  if (dot <= 0) return null
  const ctx = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) return null
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )
    const sigBytes = Buffer.from(sig, "base64url")
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, Buffer.from(ctx, "utf8"))
    if (!ok) return null
    const parsed = JSON.parse(Buffer.from(ctx, "base64url").toString("utf8"))
    if (typeof parsed?.uid === "string" && typeof parsed?.role === "string") {
      return { uid: parsed.uid, role: parsed.role }
    }
    return null
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    let response = NextResponse.next({ request });

    // 1. Fast path for public routes — no auth check at all
    const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === "/";
    if (isPublic) {
      applySecurityHeaders(response);
      return response;
    }

    // 2. Verify the signed session context cookie (edge-safe, no network).
    const auth = await verifyAuthCtx(request.cookies.get(AUTH_CTX_COOKIE)?.value);
    const user = auth ? { id: auth.uid, role: auth.role } : null;

    if (request.cookies.has("fitna_demo")) {
      response.cookies.delete("fitna_demo");
    }

    // 1. If visitor is logged in with a real account: they are an authentic user
    if (user) {
      const role = user.role || null;

      const wantsTeacherArea = TEACHER_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
      const wantsAdminArea = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));

      if (wantsTeacherArea && role && role !== "teacher") {
        const url = request.nextUrl.clone();
        if (role === "institution_admin" || role === "super_admin") {
          url.pathname = "/dashboard/institution";
          const redirect = NextResponse.redirect(url);
          applySecurityHeaders(redirect);
          return redirect;
        }
        url.pathname = "/unauthorized";
        const redirect = NextResponse.redirect(url);
        applySecurityHeaders(redirect);
        return redirect;
      }

      if (wantsAdminArea && role !== "institution_admin" && role !== "super_admin") {
        const url = request.nextUrl.clone();
        if (role === "teacher") {
          url.pathname = "/dashboard/teacher";
          const redirect = NextResponse.redirect(url);
          applySecurityHeaders(redirect);
          return redirect;
        }
        url.pathname = "/unauthorized";
        const redirect = NextResponse.redirect(url);
        applySecurityHeaders(redirect);
        return redirect;
      }

      applySecurityHeaders(response);
      return response;
    }

    // 2. Visitor is NOT logged in: redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectRes = NextResponse.redirect(url);
    if (request.cookies.has("fitna_demo")) {
      redirectRes.cookies.delete("fitna_demo");
    }
    applySecurityHeaders(redirectRes);
    return redirectRes;
  } catch (err) {
    console.error("Proxy middleware error:", err);
    const fallback = NextResponse.next({ request });
    applySecurityHeaders(fallback);
    return fallback;
  }
}

function applySecurityHeaders(response: NextResponse): void {
  const csp = [
    "default-src 'self'",
    // Next.js injects inline bootstrap scripts + the app uses inline styles.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")

  response.headers.set("Content-Security-Policy", csp)
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  )
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|bin)$).*)",
  ],
};
