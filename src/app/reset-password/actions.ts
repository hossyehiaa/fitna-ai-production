"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/(auth)/login/actions";

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (password.length < 6) {
    return { error: "كلمة المرور لازم تكون 6 أحرف على الأقل" };
  }
  if (password !== confirmPassword) {
    return { error: "كلمتا المرور مش متطابقتين" };
  }

  const supabase = await createClient();

  // Requires a valid session — established by /auth/confirm verifying
  // the recovery token just before the browser landed here.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.message.includes("session")) {
      return { error: "الرابط ده منتهي الصلاحية أو مستخدم قبل كده. اطلب رابط استرجاع جديد." };
    }
    return { error: error.message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const target = user?.user_metadata?.role === "institution_admin" ? "/dashboard/institution" : "/dashboard/teacher";

  redirect(target);
}
