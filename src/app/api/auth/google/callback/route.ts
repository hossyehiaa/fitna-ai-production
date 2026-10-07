import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Google Sign-In — step 2: OAuth callback.
 *
 * Verifies the CSRF state cookie, exchanges the authorization code for
 * tokens, reads the Google profile (email verified by Google), then
 * find-or-creates the user row and starts the app's own session (same
 * opaque-cookie system the email flow uses).
 *
 * Account linking: a Google identity whose email already exists simply
 * logs into that account (standard consumer-app behavior; the email is
 * verified by Google itself).
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function loginErrorRedirect(request: NextRequest, message: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ configured: false }, { status: 501 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get("fitna_oauth_state")?.value;

  if (!code) return loginErrorRedirect(request, "تم إلغاء تسجيل الدخول بحساب Google.");
  if (!state || !cookieState || state !== cookieState) {
    return loginErrorRedirect(request, "جلسة تسجيل الدخول غير صالحة. يُرجى المحاولة مرة أخرى.");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  // 1. Exchange the authorization code for tokens.
  let accessToken: string;
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokenRes.status, await tokenRes.text().catch(() => ""));
      return loginErrorRedirect(request, "تعذّر استكمال تسجيل الدخول من Google. يُرجى المحاولة مرة أخرى.");
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) return loginErrorRedirect(request, "رد غير متوقع من Google.");
    accessToken = tokenJson.access_token;
  } catch (err) {
    console.error("Google token exchange error:", err);
    return loginErrorRedirect(request, "خطأ في الاتصال بـ Google. يُرجى المحاولة مرة أخرى.");
  }

  // 2. Read the verified Google profile.
  let profile: { email?: string; email_verified?: boolean; name?: string };
  try {
    const infoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) throw new Error(`userinfo ${infoRes.status}`);
    profile = (await infoRes.json()) as typeof profile;
  } catch (err) {
    console.error("Google userinfo error:", err);
    return loginErrorRedirect(request, "تعذّر قراءة بيانات حساب Google.");
  }

  const email = (profile.email || "").trim().toLowerCase();
  if (!email || profile.email_verified === false) {
    return loginErrorRedirect(request, "حساب Google غير مرتبط ببريد إلكتروني مفعّل.");
  }

  // 3. Find-or-create the user row (admin client: the users table is not
  //    writable in user mode by design; this is a trusted server flow).
  const db = createAdminClient();
  const { data: existing } = (await db.from("users").select("id, role").eq("email", email).maybeSingle()) as {
    data: { id?: string; role?: string } | null;
  };

  let userId: string;
  let role: string;
  if (existing?.id) {
    userId = existing.id;
    role = existing.role || "teacher";
  } else {
    const fullName = (profile.name || email.split("@")[0]).slice(0, 120);
    type GoogleUserRow = { id?: string; role?: string };
    const insertRes = (await db
      .from("users")
      .insert({
        email,
        full_name: fullName,
        role: "teacher",
        account_type: "individual",
      })
      .select("id, role")
      .single()) as { data: GoogleUserRow | null; error: { message: string } | null };
    const created = insertRes.data;
    const createError = insertRes.error;
    if (createError || !created?.id) {
      console.error("Google sign-in user insert failed:", createError);
      return loginErrorRedirect(request, "تعذّر إنشاء الحساب. يُرجى المحاولة بحساب بريد إلكتروني.");
    }
    userId = created.id;
    role = created.role || "teacher";
  }

  // 4. Start the app session (same cookie system as the email login).
  await createSession({ id: userId, role });

  const target = role === "institution_admin" ? "/dashboard/institution" : "/dashboard/teacher";
  const res = NextResponse.redirect(`${appUrl}${target}`);
  res.cookies.delete("fitna_oauth_state");
  return res;
}
