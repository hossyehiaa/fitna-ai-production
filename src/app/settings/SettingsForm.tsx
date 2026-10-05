"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateProfileAction,
  updateEmailAction,
  updatePasswordAction,
  updatePreferencesAction,
} from "./actions";
import type { ActionState } from "@/app/(auth)/login/actions";
import { useTranslation } from "@/lib/i18n/context";

const initialState: ActionState = { error: null };

type Profile = {
  full_name: string | null;
  email: string;
  teaching_experience: string | null;
  teaching_level: string | null;
  subject: string | null;
  preferred_theme: "light" | "dark";
  preferred_language: "ar" | "en";
  role: string;
};

export function SettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { t, lang, setLanguage } = useTranslation();
  const isRtl = lang === "ar";

  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">(profile.preferred_theme || "light");
  const [selectedLang, setSelectedLang] = useState<"ar" | "en">(profile.preferred_language || "ar");

  const [profileState, profileFormAction, profilePending] = useActionState(
    updateProfileAction,
    initialState
  );
  const [emailState, emailFormAction, emailPending] = useActionState(updateEmailAction, initialState);
  const [passwordState, passwordFormAction, passwordPending] = useActionState(
    updatePasswordAction,
    initialState
  );
  const [prefState, prefFormActionRaw, prefPending] = useActionState(
    updatePreferencesAction,
    initialState
  );

  async function prefFormAction(formData: FormData) {
    const langValue = formData.get("language") as "ar" | "en";
    if (langValue) {
      setLanguage(langValue);
    }
    const themeValue = formData.get("theme") as "light" | "dark";
    if (themeValue) {
      document.documentElement.classList.toggle("dark", themeValue === "dark");
    }
    await prefFormActionRaw(formData);
    router.refresh();
  }

  return (
    <div className="space-y-6 font-readex">
      {/* Section 1: Profile Details */}
      <section className="bg-[#F6F0E4]/40 dark:bg-white/[0.03] border border-[#071B3A]/10 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#071B3A]/5 dark:border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
          <h3 className="font-bold text-base text-[#071B3A] dark:text-white">
            {isRtl ? "الملف الشخصي" : "Profile Details"}
          </h3>
        </div>

        <form action={profileFormAction} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
              {isRtl ? "الاسم الكامل" : "Full Name"}
            </label>
            <input
              type="text"
              name="full_name"
              defaultValue={profile.full_name ?? ""}
              required
              className="w-full bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition shadow-sm"
            />
          </div>

          {/* Dual Column: Experience & Stage */}
          {profile.role === "teacher" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
                  {isRtl ? "سنوات الخبرة" : "Years of Experience"}
                </label>
                <div className="relative">
                  <select
                    name="teaching_experience"
                    defaultValue={profile.teaching_experience ?? ""}
                    className="w-full appearance-none bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 pl-9 rtl:pl-9 ltr:pr-9 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition shadow-sm cursor-pointer"
                  >
                    <option value="">{isRtl ? "اختر سنوات الخبرة..." : "Select experience..."}</option>
                    <option value="0-2">{isRtl ? "0-2 سنة" : "0-2 years"}</option>
                    <option value="3-5">{isRtl ? "3-5 سنوات" : "3-5 years"}</option>
                    <option value="6-10">{isRtl ? "6-10 سنوات" : "6-10 years"}</option>
                    <option value="10+">{isRtl ? "أكثر من 10 سنوات" : "10+ years"}</option>
                  </select>
                  <svg
                    className="w-4 h-4 text-[#071B3A]/50 dark:text-white/50 absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
                  {isRtl ? "المرحلة الدراسية" : "Teaching Level"}
                </label>
                <div className="relative">
                  <select
                    name="teaching_level"
                    defaultValue={profile.teaching_level ?? ""}
                    className="w-full appearance-none bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 pl-9 rtl:pl-9 ltr:pr-9 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition shadow-sm cursor-pointer"
                  >
                    <option value="">{isRtl ? "اختر المرحلة..." : "Select level..."}</option>
                    <option value="ابتدائي">{isRtl ? "ابتدائي" : "Primary"}</option>
                    <option value="متوسط">{isRtl ? "متوسط / إعدادي" : "Middle School"}</option>
                    <option value="ثانوي">{isRtl ? "ثانوي" : "Secondary"}</option>
                  </select>
                  <svg
                    className="w-4 h-4 text-[#071B3A]/50 dark:text-white/50 absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Subject */}
          {profile.role === "teacher" && (
            <div>
              <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
                {isRtl ? "المادة" : "Subject"}
              </label>
              <input
                type="text"
                name="subject"
                defaultValue={profile.subject ?? ""}
                placeholder={isRtl ? "مثال: لغة عربية، رياضيات، دراسات اجتماعية" : "e.g. Mathematics, Science"}
                className="w-full bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition shadow-sm"
              />
            </div>
          )}

          {profileState.error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2 border border-red-200 dark:border-red-900">
              {profileState.error}
            </p>
          )}
          {!profileState.error && profilePending === false && profileState !== initialState && (
            <p className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 rounded-xl px-3 py-2 border border-teal-200 dark:border-teal-900">
              {t.common.success}
            </p>
          )}

          <button
            type="submit"
            disabled={profilePending}
            className="w-full py-2.5 rounded-xl bg-[#FFB52E] hover:bg-[#FFB52E]/90 disabled:opacity-60 text-[#071B3A] font-bold text-xs sm:text-sm shadow-sm hover:shadow transition transform active:scale-[0.99] border border-amber-400 cursor-pointer"
          >
            {profilePending ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ تعديلات الملف" : "Save Profile Changes")}
          </button>
        </form>
      </section>

      {/* Section 2: Email Update */}
      <section className="bg-[#F6F0E4]/40 dark:bg-white/[0.03] border border-[#071B3A]/10 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#071B3A]/5 dark:border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
          <h3 className="font-bold text-base text-[#071B3A] dark:text-white">
            {isRtl ? "البريد الإلكتروني" : "Email Address"}
          </h3>
        </div>

        <form action={emailFormAction} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
              {isRtl ? "البريد الحالي أو الجديد" : "Current or New Email"}
            </label>
            <input
              type="email"
              name="email"
              defaultValue={profile.email}
              required
              className="w-full bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition shadow-sm"
            />
          </div>

          {/* Warning/Hint Box */}
          <div className="flex items-start gap-2.5 text-xs text-[#071B3A]/70 dark:text-white/70 bg-[#FFB52E]/10 border border-[#FFB52E]/30 p-3 rounded-xl leading-relaxed">
            <svg className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {isRtl
                ? "سيتم إرسال رابط تأكيد للعنوان الجديد — لن يتم التحديث حتى يتم تأكيد الرابط."
                : "A confirmation link will be sent to the new address — changes will not apply until verified."}
            </span>
          </div>

          {emailState.error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2 border border-red-200 dark:border-red-900">
              {emailState.error}
            </p>
          )}
          {!emailState.error && emailPending === false && emailState !== initialState && (
            <p className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 rounded-xl px-3 py-2 border border-teal-200 dark:border-teal-900">
              {t.common.success}
            </p>
          )}

          <button
            type="submit"
            disabled={emailPending}
            className="w-full py-2.5 rounded-xl bg-[#FFB52E] hover:bg-[#FFB52E]/90 disabled:opacity-60 text-[#071B3A] font-bold text-xs sm:text-sm shadow-sm hover:shadow transition transform active:scale-[0.99] border border-amber-400 cursor-pointer"
          >
            {emailPending ? (isRtl ? "جاري التحديث..." : "Updating...") : (isRtl ? "تحديث البريد الإلكتروني" : "Update Email Address")}
          </button>
        </form>
      </section>

      {/* Section 3: Password Update */}
      <section className="bg-[#F6F0E4]/40 dark:bg-white/[0.03] border border-[#071B3A]/10 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#071B3A]/5 dark:border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
          <h3 className="font-bold text-base text-[#071B3A] dark:text-white">
            {isRtl ? "كلمة المرور والأمان" : "Password & Security"}
          </h3>
        </div>

        <form action={passwordFormAction} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
              {isRtl ? "كلمة المرور الجديدة" : "New Password"}
            </label>
            <input
              type="password"
              name="password"
              placeholder="••••••••••••"
              required
              className="w-full bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D96B58]/60 focus:border-[#D96B58] transition shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70 mb-1.5">
              {isRtl ? "تأكيد كلمة المرور" : "Confirm Password"}
            </label>
            <input
              type="password"
              name="confirm_password"
              placeholder="••••••••••••"
              required
              className="w-full bg-white dark:bg-[#071B3A] border border-[#071B3A]/15 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D96B58]/60 focus:border-[#D96B58] transition shadow-sm"
            />
          </div>

          {passwordState.error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2 border border-red-200 dark:border-red-900">
              {passwordState.error}
            </p>
          )}
          {!passwordState.error && passwordPending === false && passwordState !== initialState && (
            <p className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 rounded-xl px-3 py-2 border border-teal-200 dark:border-teal-900">
              {t.common.success}
            </p>
          )}

          <button
            type="submit"
            disabled={passwordPending}
            className="w-full py-2.5 rounded-xl bg-[#071B3A] hover:bg-[#0B2246] dark:bg-[#143566] dark:hover:bg-[#1c447e] disabled:opacity-60 text-white font-bold text-xs sm:text-sm shadow transition transform active:scale-[0.99] border border-white/10 cursor-pointer"
          >
            {passwordPending ? (isRtl ? "جاري التغيير..." : "Changing...") : (isRtl ? "تغيير كلمة المرور" : "Change Password")}
          </button>
        </form>
      </section>

      {/* Section 4: System Preferences */}
      <section className="bg-[#F6F0E4]/40 dark:bg-white/[0.03] border border-[#071B3A]/10 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#071B3A]/5 dark:border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
          <h3 className="font-bold text-base text-[#071B3A] dark:text-white">
            {isRtl ? "تفضيلات الواجهة والنظام" : "System & UI Preferences"}
          </h3>
        </div>

        <form action={prefFormAction} className="space-y-5">
          {/* Mode Toggle */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70">
              {isRtl ? "نمط المظهر" : "Appearance Theme"}
            </label>
            <input type="hidden" name="theme" value={selectedTheme} />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedTheme("light")}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer ${
                  selectedTheme === "light"
                    ? "border-2 border-[#12B8C4] bg-white dark:bg-white/15 text-[#12B8C4]"
                    : "border border-[#071B3A]/15 dark:border-white/15 bg-white/70 dark:bg-white/5 text-[#071B3A]/60 dark:text-white/60 hover:bg-white dark:hover:bg-white/10"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
                <span>{isRtl ? "فاتح" : "Light"}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTheme("dark")}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer ${
                  selectedTheme === "dark"
                    ? "border-2 border-[#12B8C4] bg-white dark:bg-white/15 text-[#12B8C4]"
                    : "border border-[#071B3A]/15 dark:border-white/15 bg-white/70 dark:bg-white/5 text-[#071B3A]/60 dark:text-white/60 hover:bg-white dark:hover:bg-white/10"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>{isRtl ? "غامق" : "Dark"}</span>
              </button>
            </div>
          </div>

          {/* Language Toggle */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#071B3A]/70 dark:text-white/70">
              {isRtl ? "لغة النظام" : "System Language"}
            </label>
            <input type="hidden" name="language" value={selectedLang} />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedLang("ar")}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer ${
                  selectedLang === "ar"
                    ? "border-2 border-[#12B8C4] bg-white dark:bg-white/15 text-[#12B8C4]"
                    : "border border-[#071B3A]/15 dark:border-white/15 bg-white/70 dark:bg-white/5 text-[#071B3A]/60 dark:text-white/60 hover:bg-white dark:hover:bg-white/10"
                }`}
              >
                <span className="text-[10px] font-mono uppercase bg-[#12B8C4]/15 text-[#12B8C4] px-1.5 py-0.5 rounded font-bold">
                  EG
                </span>
                <span>العربية</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLang("en")}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer ${
                  selectedLang === "en"
                    ? "border-2 border-[#12B8C4] bg-white dark:bg-white/15 text-[#12B8C4]"
                    : "border border-[#071B3A]/15 dark:border-white/15 bg-white/70 dark:bg-white/5 text-[#071B3A]/60 dark:text-white/60 hover:bg-white dark:hover:bg-white/10"
                }`}
              >
                <span className="text-[10px] font-mono uppercase bg-[#071B3A]/5 dark:bg-white/10 text-[#071B3A]/70 dark:text-white/70 px-1.5 py-0.5 rounded font-bold">
                  GB
                </span>
                <span>English</span>
              </button>
            </div>
          </div>

          {prefState.error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2 border border-red-200 dark:border-red-900">
              {prefState.error}
            </p>
          )}

          <button
            type="submit"
            disabled={prefPending}
            className="w-full py-2.5 rounded-xl bg-[#FFB52E] hover:bg-[#FFB52E]/90 disabled:opacity-60 text-[#071B3A] font-bold text-xs sm:text-sm shadow-sm hover:shadow transition transform active:scale-[0.99] border border-amber-400 cursor-pointer"
          >
            {prefPending ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التفضيلات" : "Save Preferences")}
          </button>
        </form>
      </section>
    </div>
  );
}
