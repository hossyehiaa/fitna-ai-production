"use client";

import { useTranslation } from "@/lib/i18n/context";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLanguage } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => setLanguage(lang === "ar" ? "en" : "ar")}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 flex items-center gap-1.5 ${
        className || "border-[#12B8C4]/40 text-[#12B8C4] hover:bg-[#12B8C4]/10 hover:border-[#12B8C4]"
      }`}
      title={lang === "ar" ? "Switch to English" : "التحويل إلى العربية"}
    >
      <Globe className="w-3.5 h-3.5 opacity-80" />
      <span>{lang === "ar" ? "English" : "العربية"}</span>
    </button>
  );
}
