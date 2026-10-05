"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export type ActionState = { error: string | null; info?: string | null; redirectTo?: string | null };

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Real sign-in against Supabase Auth. */
export async function signInAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!validateEmail(email)) return { error: "البريد الإلكتروني غير صالح" };
    if (password.length < 6) return { error: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل" };

    const cookieStore = await cookies();
    cookieStore.delete("fitna_demo");

    const supabase = await createClient();
    await supabase.auth.signOut();
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
      }
      if (error.message.includes("Email not confirmed")) {
        return { error: "يرجى تأكيد بريدك الإلكتروني أولاً عبر الرابط المرسل إلى بريدك." };
      }
      return { error: error.message };
    }

    // Safely retrieve user
    let user = authData?.user;
    if (!user) {
      const userRes = await supabase.auth.getUser();
      user = userRes.data?.user;
    }

    if (!user) {
      return { error: "تعذر التحقق من بيانات الدخول، يرجى المحاولة مرة أخرى." };
    }

    // Safe profile lookup
    let role = user.user_metadata?.role || "teacher";
    try {
      const db = createAdminClient();
      const { data: profile } = await db
        .from("users")
        .select("role, preferred_theme")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role) {
        role = profile.role;
      }

      if (profile?.preferred_theme) {
        cookieStore.set("theme", profile.preferred_theme, { path: "/", maxAge: 60 * 60 * 24 * 365 });
      }
    } catch {
      // Default to teacher if user profile query has any issue
    }

    const targetDashboard = role === "institution_admin" ? "/dashboard/institution" : "/dashboard/teacher";
    return { error: null, redirectTo: targetDashboard };
  } catch (err: any) {
    console.error("signInAction error:", err);
    return { error: err?.message || "حدث خطأ غير متوقع أثناء تسجيل الدخول" };
  }
}

/** Real sign-up against Supabase Auth. */
export async function signUpAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("full_name") || "").trim();
    const role = String(formData.get("role") || "teacher");
    // Account identity: explicit type + nationality selection (stored,
    // never inferred from locale/IP/device).
    const accountTypeRaw = String(formData.get("account_type") || "teacher");
    const countryRaw = String(formData.get("country") || "EG");
    const accountType = ["individual", "organization", "teacher"].includes(accountTypeRaw)
      ? accountTypeRaw
      : "teacher";
    const country = countryRaw === "SA" ? "SA" : "EG";

    if (!validateEmail(email)) return { error: "البريد الإلكتروني غير صالح" };
    if (password.length < 6) return { error: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل" };
    if (!fullName) return { error: "يُرجى كتابة اسمك" };
    if (role !== "teacher" && role !== "institution_admin") {
      return { error: "يُرجى اختيار نوع الحساب" };
    }

    const supabase = await createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fitna-ai.vercel.app";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: `${appUrl}/auth/confirm?next=${role === "institution_admin" ? "/dashboard/institution" : "/dashboard/teacher"}`,
      },
    });

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("User already registered")) {
        return { error: "هذا البريد مسجل بالفعل، يرجى تسجيل الدخول" };
      }
      return { error: error.message };
    }

    // Safety fallback: ensure profile exists in public.users
    try {
      if (data?.user?.id) {
        const adminClient = createAdminClient();
        await adminClient.from("users").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
          account_type: accountType,
          country,
        }, { onConflict: "id" });
      }
    } catch {
      // Non-fatal if schema trigger already created it
    }

    // If session was granted immediately (email confirmation disabled in Supabase)
    if (data?.session) {
      const targetDashboard = role === "institution_admin" ? "/dashboard/institution" : "/dashboard/teacher";
      return { error: null, redirectTo: targetDashboard };
    } else {
      // Email confirmation is required by Supabase project settings
      return {
        error: null,
        info: "تم إنشاء الحساب بنجاح! تم إرسال رابط تأكيد إلى بريدك الإلكتروني، يرجى تفقد صندوق الوارد أو البريد غير الهام (Spam) لتفعيل الحساب ثم تسجيل الدخول.",
      };
    }
  } catch (err: any) {
    console.error("signUpAction error:", err);
    return { error: err?.message || "حدث خطأ غير متوقع أثناء إنشاء الحساب" };
  }
}

/** Sends a real password-reset email via Supabase Auth */
export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const email = String(formData.get("email") || "").trim();
    if (!validateEmail(email)) return { error: "البريد الإلكتروني غير صالح" };

    const supabase = await createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fitna-ai.vercel.app";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?type=recovery&next=/reset-password`,
    });

    if (error) return { error: error.message };
    return { error: null, info: "تم إرسال رابط استعادة كلمة المرور إلى بريدك." };
  } catch (err: any) {
    return { error: err?.message || "حدث خطأ غير متوقع" };
  }
}

export async function signOutAction() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("fitna_demo");
    const all = cookieStore.getAll();
    for (const c of all) {
      if (c.name.startsWith("sb-") || c.name === "fitna_demo") {
        cookieStore.delete(c.name);
      }
    }
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {}
  redirect("/login");
}

/** Explicitly sign in as the dedicated Demo Teacher account (POST only, never prefetched) */
export async function loginAsDemoAction() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("fitna_demo");
    const all = cookieStore.getAll();
    for (const c of all) {
      if (c.name.startsWith("sb-") || c.name === "fitna_demo") {
        cookieStore.delete(c.name);
      }
    }
    const supabase = await createClient();
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email: "demo@fitna.ai",
      password: "DemoPassword2026!",
    });
    if (error) {
      console.error("Demo login error:", error);
      redirect("/login?error=" + encodeURIComponent("تعذر الدخول للحساب التجريبي حالياً"));
    }
  } catch (err: any) {
    if (err?.digest?.includes("NEXT_REDIRECT") || err?.message?.includes("NEXT_REDIRECT")) throw err;
    console.error("Demo action error:", err);
  }
  redirect("/dashboard/teacher");
}
