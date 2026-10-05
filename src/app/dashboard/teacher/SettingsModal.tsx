"use client";

import { useEffect } from "react";
import { SettingsForm } from "@/app/settings/SettingsForm";
import { useTranslation } from "@/lib/i18n/context";

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

export function SettingsModal({
  isOpen,
  onClose,
  profile,
}: {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
}) {
  const { t, lang } = useTranslation();
  const isRtl = lang === "ar";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#071B3A]/60 backdrop-blur-sm transition-opacity duration-200"
      onClick={onClose}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Settings Modal Container */}
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#071B3A] rounded-3xl border border-[#071B3A]/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-readex animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Sticky Header */}
        <div className="bg-[#071B3A] text-white px-6 sm:px-8 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#12B8C4]/20 border border-[#12B8C4]/30 text-[#12B8C4] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                {isRtl ? "الإعدادات" : "Settings"}
              </h2>
              <p className="text-xs text-white/60">
                {isRtl ? "إدارة الملف الشخصي وتفضيلات الحساب" : "Manage your profile and account preferences"}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto overscroll-contain">
          <SettingsForm profile={profile} />
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 sm:px-8 py-4 bg-white dark:bg-[#071B3A] border-t border-[#071B3A]/5 dark:border-white/10 flex justify-end items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-[#071B3A]/60 dark:text-white/60 hover:text-[#071B3A] dark:hover:text-white hover:bg-[#F6F0E4] dark:hover:bg-white/5 transition cursor-pointer"
          >
            {isRtl ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-[#071B3A] dark:bg-[#143566] text-white font-bold text-xs hover:bg-[#0B2246] dark:hover:bg-[#1c447e] transition shadow cursor-pointer border border-white/10"
          >
            {isRtl ? "تم" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
