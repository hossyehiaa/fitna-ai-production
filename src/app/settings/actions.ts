"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { ActionState } from "@/app/(auth)/login/actions";

/**
 * Real profile update (spec FR-04: teacher profile). Writes straight
 * to `public.users` — protected by the `users_update_self` RLS policy,
 * so this can only ever touch the caller's own row regardless of what
 * the form claims.
 */
export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fullName = String(formData.get("full_name") || "").trim();
  const teachingExperience = String(formData.get("teaching_experience") || "") || null;
  const teachingLevel = String(formData.get("teaching_level") || "") || null;
  const subject = String(formData.get("subject") || "").trim() || null;

  if (!fullName) return { error: "الاسم مطلوب" };
  if (fullName.length > 100) return { error: "الاسم طويل جدًا" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "غير مصرّح" };

  const { error } = await supabase
    .from("users")
    .update({
      full_name: fullName,
      teaching_experience: teachingExperience,
      teaching_level: teachingLevel,
      subject,
    })
    .eq("id", user.id);

  if (error) {
    console.error("Profile update failed:", error);
    return { error: "حدث خطأ أثناء حفظ البيانات" };
  }

  return { error: null };
}

/** Real email change via Supabase Auth — triggers Supabase's own
 * confirmation-email flow (sends a verification link to the new
 * address; the email only actually changes once that's clicked). */
export async function updateEmailAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "البريد الإلكتروني غير صالح" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: error.message };

  return { error: null };
}

/** Real password change — requires an active session (already logged
 * in), consistent with how Supabase's updateUser works. */
export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (password.length < 6) return { error: "كلمة المرور لازم تكون 6 أحرف على الأقل" };
  if (password !== confirmPassword) return { error: "كلمتا المرور مش متطابقتين" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { error: null };
}

/**
 * Real preference persistence (spec §6.2: language/theme must persist
 * per-account and apply immediately everywhere). Writes to
 * `public.users` (so it survives across devices once logged in there
 * too) AND sets a `theme` cookie so the root layout — a Server
 * Component that reads the cookie on every request — applies it on
 * the very next page load with no flash of the old theme.
 */
export async function updatePreferencesAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const theme = String(formData.get("theme") || "light");
  const language = String(formData.get("language") || "ar");

  if (theme !== "light" && theme !== "dark") return { error: "قيمة غير صالحة" };
  if (language !== "ar" && language !== "en") return { error: "قيمة غير صالحة" };

  const cookieStore = await cookies();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "غير مصرّح" };

  const { error } = await supabase
    .from("users")
    .update({ preferred_theme: theme, preferred_language: language })
    .eq("id", user.id);

  if (error) {
    console.error("Preference update failed:", error);
    return { error: "حدث خطأ أثناء حفظ التفضيلات" };
  }

  cookieStore.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  cookieStore.set("language", language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  return { error: null };
}
