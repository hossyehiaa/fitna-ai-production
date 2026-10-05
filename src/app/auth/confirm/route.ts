import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Handles the link Supabase Auth emails send (password reset, and any
 * future email-confirmation flow). This is the missing piece that was
 * causing the reported 404: `requestPasswordResetAction` pointed
 * `redirectTo` at `/reset-password` directly, but Supabase's email
 * link needs a server-side verification step first — you can't just
 * land a browser on an arbitrary page and expect it to already have a
 * valid session.
 *
 * Flow:
 *  1. Person clicks the email link, which hits THIS route with
 *     `token_hash` + `type=recovery` query params.
 *  2. `verifyOtp` validates the token against Supabase and, on
 *     success, sets real session cookies via the server client
 *     (see src/lib/supabase/server.ts — its cookie `setAll` writes to
 *     the response here).
 *  3. We redirect to `next` (defaults to /reset-password) — the
 *     person now has a real authenticated session and
 *     /reset-password can safely call `updateUser({ password })`.
 *
 * [NOTE] SETUP REQUIRED: Supabase's *default* "Reset Password" email
 * template points at Supabase's own hosted verify endpoint and returns
 * tokens in a URL hash fragment, which this cookie-based server flow
 * does not consume. In the Supabase Dashboard → Authentication →
 * Email Templates → "Reset Password", replace the link with:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 *
 * Also add your app's URL to Authentication → URL Configuration →
 * Redirect URLs, or `resetPasswordForEmail`'s redirectTo will be
 * rejected.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const defaultNext = type === "recovery" ? "/reset-password" : "/dashboard/teacher";
  const next = searchParams.get("next") ?? defaultNext;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);
      response.cookies.delete("fitna_demo");
      return response;
    }
    console.error("verifyOtp failed:", error.message);
  }

  const failMsg = type === "recovery" 
    ? "رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية"
    : "رابط تأكيد الحساب غير صالح أو منتهي الصلاحية";

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(failMsg)}`
  );
}
