import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SettingsForm } from "./SettingsForm";
import { getDictionary, type Language } from "@/lib/i18n";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const t = getDictionary(lang);

  const db = createAdminClient();
  const { data: profile } = await db
    .from("users")
    .select(
      "full_name, email, teaching_experience, teaching_level, subject, preferred_theme, preferred_language, role"
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#071B3A]">
      <AppHeader title={t.settings.pageTitle} />
      <div className="max-w-2xl mx-auto p-6 md:p-8">
        <SettingsForm profile={profile} />
      </div>
    </div>
  );
}
