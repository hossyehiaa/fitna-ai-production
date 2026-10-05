import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";
import type { Dictionary, Language, Direction } from "./types";

export * from "./types";

export function getDictionary(lang: Language = "ar"): Dictionary {
  return lang === "en" ? en : ar;
}

export function getDirection(lang: Language = "ar"): Direction {
  return lang === "en" ? "ltr" : "rtl";
}
