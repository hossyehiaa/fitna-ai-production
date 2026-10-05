/**
 * Egyptian Arabic Speech Normalizer for TTS Synthesis ONLY.
 * 
 * IMPORTANT:
 * - This transformation is applied ONLY right before sending text to the TTS engine.
 * - It does NOT mutate the original text stored in transcripts, database, or reports.
 * - Its sole purpose is guiding neural TTS engines (like msedge-tts) to pronounce
 *   Egyptian dialect words naturally without reverting to formal Modern Standard Arabic (MSA).
 */

const NUMBERS_MAP: Record<string, string> = {
  "0": "صفر",
  "1": "واحد",
  "2": "اتنين",
  "3": "تلاتة",
  "4": "أربعة",
  "5": "خمسة",
  "6": "ستة",
  "7": "سبعة",
  "8": "تمانية",
  "9": "تسعة",
  "10": "عشرة",
};

/**
 * Phonetic enhancements for common Egyptian colloquial words
 * to prevent the neural engine from applying MSA i'rab/fatha rules.
 */
const EGYPTIAN_PHONETICS: Array<[RegExp, string]> = [
  // Prevent 'مش' being pronounced with fatha ('mash')
  [/\bمش\b/g, "مِش"],
  // Prevent 'كده' or 'كدا' being pronounced awkwardly
  [/\bكده\b/g, "كِده"],
  [/\bكدا\b/g, "كِده"],
  // Ensure 'دلوقتي' has clear colloquial phonetics
  [/\bدلوقتي\b/g, "دِلوقتي"],
  // 'علشان' / 'عشان'
  [/\bعشان\b/g, "عَشَان"],
  [/\bعلشان\b/g, "عَلَشَان"],
  // 'ليه'
  [/\bليه\b/g, "لِيه"],
  // 'إيه' / 'ايه'
  [/\bايه\b/g, "إيه"],
  // 'أهلاً' / 'اهلا'
  [/\bاهلا\b/g, "أهلاً"],
  // 'إحنا' / 'احنا'
  [/\bاحنا\b/g, "إحنا"],
  // 'النهارده' / 'النهاردة'
  [/\bالنهاردة\b/g, "النهارده"],
];

/**
 * Clean and prepare Egyptian text for TTS.
 */
export function normalizeEgyptianSpeech(rawText: string): string {
  if (!rawText) return "";

  let text = rawText.trim();

  // 1. Remove parenthetical emotions or AI stage directions (e.g., "(بابتسامة)", "[متردد]", "(يضحك)")
  text = text.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, "");

  // 2. Remove markdown artifacts (asterisks, hashtags, backticks)
  text = text.replace(/[*#`_~]/g, "");

  // 3. Convert standalone numbers to Egyptian words (0..10) so TTS doesn't read them in MSA (e.g. 'ثلاثة')
  text = text.replace(/\b([0-9]|10)\b/g, (match) => NUMBERS_MAP[match] ?? match);

  // 4. Natural conversational punctuation:
  // Add a soft comma after common Egyptian vocatives and conversation starters if followed by space
  text = text.replace(/\b(يا أستاذ|يا استاذ|يا مستر|يا ميس|طب|بص|طيب|معلش)\s+/g, "$1، ");

  // 5. Apply Egyptian phonetic enhancements
  for (const [pattern, replacement] of EGYPTIAN_PHONETICS) {
    text = text.replace(pattern, replacement);
  }

  // 6. Clean up duplicate punctuation and excessive whitespace
  text = text.replace(/،+/g, "،");
  text = text.replace(/([،\.\?!])\s*([،\.\?!])/g, "$1");
  text = text.replace(/\s+/g, " ").trim();

  // 7. Ensure standard Arabic question mark if the sentence looks like a question
  if (
    /^(هو|هل|إيه|ليه|فين|ازاي|إزاي|مين|ممكن)/.test(text) &&
    !/[؟\?]$/.test(text)
  ) {
    text += "؟";
  }

  return text;
}
