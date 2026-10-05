"use client";

import { useActionState } from "react";
import { updatePasswordAction } from "./actions";
import type { ActionState } from "@/app/(auth)/login/actions";
import { Logo } from "@/components/Logo";
import { useTranslation } from "@/lib/i18n/context";

const initialState: ActionState = { error: null };

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);
  const { t, lang } = useTranslation();
  const isEn = lang === "en";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] dark:bg-[#071B3A] p-6">
      <div className="w-full max-w-md bg-white dark:bg-white/5 rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex justify-center">
          <Logo variant="dark" height={36} className="dark:hidden" />
          <Logo variant="light" height={36} className="hidden dark:block" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-[#071B3A] dark:text-white">
            {isEn ? "Choose a New Password" : "اختار كلمة مرور جديدة"}
          </h1>
          <p className="text-xs text-[#071B3A]/60 dark:text-white/60">
            {isEn ? "Enter your new credentials for Fitna AI." : "اكتب كلمة مرور جديدة لحسابك في Fitna AI."}
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-4"
        >
          <div>
            <label htmlFor="password" className="text-xs font-semibold text-[#071B3A] dark:text-white mb-1 block">
              {t.settings.newPasswordLabel}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-[#071B3A]/15 dark:border-white/20 dark:bg-white/5 dark:text-white px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor="confirm_password" className="text-xs font-semibold text-[#071B3A] dark:text-white mb-1 block">
              {t.settings.confirmPasswordLabel}
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-[#071B3A]/15 dark:border-white/20 dark:bg-white/5 dark:text-white px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {state.error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-[#071B3A] font-bold py-2.5 text-xs shadow-sm transition"
          >
            {pending ? t.common.saving : isEn ? "Save Password" : "احفظ كلمة المرور"}
          </button>
        </form>
      </div>
    </div>
  );
}
