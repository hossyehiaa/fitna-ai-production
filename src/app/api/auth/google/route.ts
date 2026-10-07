import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

/**
 * Google Sign-In — step 1: redirect the browser to Google's OAuth consent.
 *
 * Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars with the
 * redirect URI "<APP_URL>/api/auth/google/callback" registered in the
 * Google Cloud Console (Credentials → OAuth client → Authorized redirect
 * URIs). Without them this route answers 501 {configured:false} and the
 * login page keeps the "coming soon" Google button state.
 */
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = ["openid", "email", "profile"].join(" ");

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Google Sign-In غير مُفعَّل بعد: أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في متغيرات البيئة.",
      },
      { status: 501 }
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  // CSRF state: random token stored in a short-lived httpOnly cookie and
  // verified one-to-one in the callback.
  const state = randomBytes(24).toString("base64url");

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("fitna_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
