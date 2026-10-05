// =====================================================================
// Dialect architecture — the single source of truth for speech profiles.
//
// IMPORTANT DESIGN RULE:
//   The WEBSITE UI is ALWAYS Modern Standard Arabic (العربية الفصحى).
//   A dialect only changes the AI's conversational/voice behavior:
//   STT biasing + agent system prompt + TTS voice/locale.
//
// Adding a future dialect = add one entry here. No code duplication.
// =====================================================================

export const DIALECTS = ['saudi', 'egyptian'] as const
export type Dialect = (typeof DIALECTS)[number]

export function isDialect(value: unknown): value is Dialect {
  return typeof value === 'string' && (DIALECTS as readonly string[]).includes(value)
}

/** Parse untrusted input into a dialect, falling back to the default. */
export function parseDialect(value: unknown, fallback: Dialect = 'saudi'): Dialect {
  return isDialect(value) ? value : fallback
}

export interface DialectSpeechConfig {
  /** BCP-47 speech locale used for STT biasing and TTS voices */
  locale: 'ar-SA' | 'ar-EG'
  /** Human-readable Arabic name (MSA) shown in the UI */
  labelAr: string
  /** Dialect hints for STT prompt biasing */
  sttBiasPrompt: string
  /** Microsoft Edge neural voices (free tier, no API key required) */
  edgeVoices: {
    female: string
    male: string
  }
  /**
   * Dialect instruction block injected into every agent system prompt.
   * NOTE: this text is Egyptian/Saudi ARABIC ON PURPOSE — it configures the
   * AI's SPOKEN behavior, not the UI. The UI itself remains MSA everywhere.
   */
  agentInstruction: string
  /** Voice-character guidance appended to agent prompts */
  voiceStyleHint: string
}

export const DIALECT_CONFIG: Record<Dialect, DialectSpeechConfig> = {
  saudi: {
    locale: 'ar-SA',
    labelAr: 'اللهجة السعودية',
    sttBiasPrompt:
      'بيئة تعليمية سعودية. المتحدث يستخدم اللهجة السعودية القريبة من الفصحى مع مصطلحات خليجية.',
    edgeVoices: {
      female: 'ar-SA-ZariyahNeural',
      male: 'ar-SA-HamedNeural',
    },
    agentInstruction: `أنت مساعد ذكي يتحدث بشكل طبيعي باللهجة السعودية.
واجهة الموقع بالعربية الفصحى، لكن ردودك المحادثية المنطوقة يجب أن تستخدم اللهجة السعودية الطبيعية بألفاظها ومصطلحاتها المعروفة.
التزم باللهجة السعودية في كل ردودك ولا تنتقل إلى الفصحى في المحادثة الصوتية إلا عند قراءة نص كتابي حرفياً.
لا تخلط بين اللهجة السعودية واللهجة المصرية أو أي لهجة أخرى إطلاقاً.`,
    voiceStyleHint: 'نطق سعودي فصيح قريب من الفصحى مع لمسة خليجية دافئة.',
  },
  egyptian: {
    locale: 'ar-EG',
    labelAr: 'اللهجة المصرية',
    sttBiasPrompt:
      'بيئة تعليمية مصرية. المتحدث يستخدم اللهجة المصرية العامية (القاهرية) مع مصطلحات إنجليزية تعليمية أحياناً.',
    edgeVoices: {
      female: 'ar-EG-SalmaNeural',
      male: 'ar-EG-ShakirNeural',
    },
    agentInstruction: `أنت مساعد ذكي يتحدث بشكل طبيعي باللهجة المصرية العامية.
واجهة الموقع بالعربية الفصحى، لكن ردودك المحادثية المنطوقة يجب أن تستخدم اللهجة المصرية الطبيعية بألفاظها ومصطلحاتها المعروفة (مثل: إزاي، كده، ليه، خالص، علشان).
التزم باللهجة المصرية في كل ردودك ولا تنتقل إلى الفصحى في المحادثة الصوتية إلا عند قراءة نص كتابي حرفياً.
لا تخلط بين اللهجة المصرية واللهجة السعودية أو أي لهجة أخرى إطلاقاً.`,
    voiceStyleHint: 'نطق مصري قاهري واضح وعفوي.',
  },
}

/** Resolve the full speech configuration for a dialect. */
export function getSpeechConfig(dialect: Dialect) {
  const cfg = DIALECT_CONFIG[parseDialect(dialect)]
  // Mirror the provider chain in speech/tts.ts: fish-audio (primary when the
  // key exists) -> msedge. An explicit TTS_PROVIDER="msedge" forces Edge.
  const ttsProvider =
    process.env.FISH_AUDIO_API_KEY && process.env.TTS_PROVIDER !== 'msedge'
      ? 'fish-audio'
      : process.env.TTS_PROVIDER || 'msedge'
  return {
    dialect,
    language: 'ar' as const,
    locale: cfg.locale,
    ttsProvider,
    sttProvider: process.env.STT_PROVIDER || 'groq',
    voiceIds: cfg.edgeVoices,
    sttBiasPrompt: cfg.sttBiasPrompt,
    agentInstruction: cfg.agentInstruction,
    voiceStyleHint: cfg.voiceStyleHint,
  }
}
