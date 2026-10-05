"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";
import type { Dictionary, Language, Direction } from "./types";

type I18nContextType = {
  lang: Language;
  dir: Direction;
  t: Dictionary;
  setLanguage: (lang: Language) => void;
};

const I18nContext = createContext<I18nContextType>({
  lang: "ar",
  dir: "rtl",
  t: ar,
  setLanguage: () => {},
});

export function I18nProvider({
  initialLang = "ar",
  children,
}: {
  initialLang?: Language;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState<Language>(initialLang);

  useEffect(() => {
    setLangState(initialLang);
  }, [initialLang]);

  function setLanguage(newLang: Language) {
    setLangState(newLang);
    document.cookie = `language=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = newLang;
    document.documentElement.dir = newLang === "en" ? "ltr" : "rtl";
    router.refresh();
  }

  const dir: Direction = lang === "en" ? "ltr" : "rtl";
  const t = lang === "en" ? en : ar;

  return (
    <I18nContext.Provider value={{ lang, dir, t, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
