/**
 * CHARACTER IDENTITY REGISTRY — single deterministic source of truth.
 *
 * Every virtual student has a stable identity: character key, name, gender,
 * nationality, dialect, avatar assets, and theme. The same character keeps
 * the SAME avatar everywhere (setup preview, live classroom, history,
 * reports) — resolution is by character key, never by session or index.
 *
 * The database (student_personas) stores the same fields and is the
 * runtime authority; this registry is the static fallback + the shared
 * client-side resolver so SSR and client render identically.
 */

export type CharacterKey =
  | "omar"
  | "sara"
  | "yassin"
  | "nour"
  | "sultan"
  | "fahad"
  | "reem"
  | "jouri";

export type Gender = "male" | "female";
export type Nationality = "EG" | "SA";

export interface CharacterTheme {
  pillBg: string;
  pillBorder: string;
  glow: string;
  ringColor: string;
  accentColor: string;
  tagColor: string;
}

export interface CharacterIdentity {
  key: CharacterKey;
  characterId: string; // stable persisted ID (matches student_personas.character_key)
  name: string;
  gender: Gender;
  nationality: Nationality;
  dialect: "egyptian" | "saudi";
  ageRange: string;
  personality: string;
  speakingStyle: string;
  /** Sprite assets root: /students/{key}/ */
  spriteDir: string;
  theme: CharacterTheme;
}

export const CHARACTERS: Record<CharacterKey, CharacterIdentity> = {
  omar: {
    key: "omar",
    characterId: "omar_001",
    name: "عمر",
    gender: "male",
    nationality: "EG",
    dialect: "egyptian",
    ageRange: "9-11",
    personality: "فضولي وحيوي",
    speakingStyle: "جمل قصيرة سريعة بنبرة متحمسة",
    spriteDir: "/students/omar",
    theme: {
      pillBg: "bg-teal-500",
      pillBorder: "border-teal-400/40",
      glow: "rgba(20, 184, 166, 0.4)",
      ringColor: "ring-teal-400",
      accentColor: "#14B8A6",
      tagColor: "text-teal-300",
    },
  },
  sara: {
    key: "sara",
    characterId: "sara_001",
    name: "سارة",
    gender: "female",
    nationality: "EG",
    dialect: "egyptian",
    ageRange: "10-12",
    personality: "متفوقة ودقيقة ومنظمة",
    speakingStyle: "إجابات واضحة ومؤدبة بصيغة المؤنث",
    spriteDir: "/students/sara",
    theme: {
      pillBg: "bg-rose-500",
      pillBorder: "border-rose-400/40",
      glow: "rgba(244, 63, 94, 0.4)",
      ringColor: "ring-rose-400",
      accentColor: "#FB7185",
      tagColor: "text-rose-300",
    },
  },
  yassin: {
    key: "yassin",
    characterId: "yassin_001",
    name: "ياسين",
    gender: "male",
    nationality: "EG",
    dialect: "egyptian",
    ageRange: "8-10",
    personality: "مرح وعفوي",
    speakingStyle: "ردود تلقائية قصيرة بنبرة لاهية",
    spriteDir: "/students/yassin",
    theme: {
      pillBg: "bg-blue-600",
      pillBorder: "border-blue-400/40",
      glow: "rgba(37, 99, 235, 0.4)",
      ringColor: "ring-blue-400",
      accentColor: "#3B82F6",
      tagColor: "text-blue-300",
    },
  },
  nour: {
    key: "nour",
    characterId: "nour_001",
    name: "نور",
    gender: "female",
    nationality: "EG",
    dialect: "egyptian",
    ageRange: "9-11",
    personality: "هادئة وخجولة ومدروسة",
    speakingStyle: "صوت خفيض وردود متأنية بصيغة المؤنث",
    spriteDir: "/students/nour",
    theme: {
      pillBg: "bg-purple-600",
      pillBorder: "border-purple-400/40",
      glow: "rgba(168, 85, 247, 0.4)",
      ringColor: "ring-purple-400",
      accentColor: "#A855F7",
      tagColor: "text-purple-300",
    },
  },
  sultan: {
    key: "sultan",
    characterId: "sultan_001",
    name: "سلطان",
    gender: "male",
    nationality: "SA",
    dialect: "saudi",
    ageRange: "9-11",
    personality: "واثق ومتعاون ومحب للمنافسة الشريفة",
    speakingStyle: "جمل واثقة بنبرة سعودية فتية",
    spriteDir: "/students/sultan",
    theme: {
      pillBg: "bg-amber-600",
      pillBorder: "border-amber-400/40",
      glow: "rgba(245, 158, 11, 0.4)",
      ringColor: "ring-amber-400",
      accentColor: "#F59E0B",
      tagColor: "text-amber-300",
    },
  },
  fahad: {
    key: "fahad",
    characterId: "fahad_001",
    name: "فهد",
    gender: "male",
    nationality: "SA",
    dialect: "saudi",
    ageRange: "9-11",
    personality: "نشيط ومتحمس",
    speakingStyle: "جمل سريعة متحمسة بنبرة سعودية",
    spriteDir: "/students/fahad",
    theme: {
      pillBg: "bg-emerald-600",
      pillBorder: "border-emerald-400/40",
      glow: "rgba(5, 150, 105, 0.4)",
      ringColor: "ring-emerald-400",
      accentColor: "#10B981",
      tagColor: "text-emerald-300",
    },
  },
  reem: {
    key: "reem",
    characterId: "reem_001",
    name: "ريم",
    gender: "female",
    nationality: "SA",
    dialect: "saudi",
    ageRange: "10-12",
    personality: "متفوقة ورزينة ومحببة لدى زميلاتها",
    speakingStyle: "إجابات مرتبة بصوت أنثوي سعودي واضح",
    spriteDir: "/students/reem",
    theme: {
      pillBg: "bg-fuchsia-600",
      pillBorder: "border-fuchsia-400/40",
      glow: "rgba(192, 38, 211, 0.4)",
      ringColor: "ring-fuchsia-400",
      accentColor: "#D946EF",
      tagColor: "text-fuchsia-300",
    },
  },
  jouri: {
    key: "jouri",
    characterId: "jouri_001",
    name: "جوري",
    gender: "female",
    nationality: "SA",
    dialect: "saudi",
    ageRange: "8-10",
    personality: "خجولة وهادئة وتحتاج تشجيعاً",
    speakingStyle: "ردود قصيرة مترددة بصوت أنثوي سعودي خافت",
    spriteDir: "/students/jouri",
    theme: {
      pillBg: "bg-sky-600",
      pillBorder: "border-sky-400/40",
      glow: "rgba(2, 132, 199, 0.4)",
      ringColor: "ring-sky-400",
      accentColor: "#0EA5E9",
      tagColor: "text-sky-300",
    },
  },
};

/** All Arabic + latin name variants that resolve to each character key. */
const NAME_TO_KEY: Array<[RegExp, CharacterKey]> = [
  [/سلطان|sultan/i, "sultan"],
  [/فهد|fahad/i, "fahad"],
  [/ريم|reem|r[iy]m\b/i, "reem"],
  [/جوري|jouri|jori/i, "jouri"],
  [/عمر|omar/i, "omar"],
  [/سارة|ساره|sara|sarah/i, "sara"],
  [/ياسين|yassin|yasin|yaseen/i, "yassin"],
  [/نور|nour|noor/i, "nour"],
];

/**
 * Deterministic name → character resolution. Used by UI components when a
 * persona row carries only a name; the DB avatar_key takes precedence
 * whenever available.
 */
export function characterKeyByName(name: string | null | undefined): CharacterKey | null {
  if (!name) return null;
  for (const [re, key] of NAME_TO_KEY) {
    if (re.test(name.trim())) return key;
  }
  return null;
}

/**
 * Resolve a character identity by EITHER avatarKey (preferred, from DB) or
 * name. Falls back to null — callers decide their own neutral default.
 * Never returns a wrong-gender fallback implicitly.
 */
export function resolveCharacter(
  avatarKey: string | null | undefined,
  name: string | null | undefined
): CharacterIdentity | null {
  if (avatarKey && avatarKey in CHARACTERS) {
    return CHARACTERS[avatarKey as CharacterKey];
  }
  const byName = characterKeyByName(name);
  return byName ? CHARACTERS[byName] : null;
}

/** MSA label for a character's nationality (UI display only). */
export function nationalityLabel(n: Nationality): string {
  return n === "SA" ? "سعودي" : "مصري";
}
