// =====================================================================
// Dialect architecture — Saudi / Egyptian speech behavior profiles.
//
// DESIGN RULE (unchanged from the original product spec):
//   The WEBSITE UI keeps its own language/i18n behavior (ar/en via the
//   original LanguageSwitcher). A dialect ONLY changes the AI's
//   conversational behavior: student persona prompts, STT bias, and TTS
//   voices. It never changes any UI string.
//
// Egyptian behavior is carried by the original personas.ts prompts;
// this module supplies the Saudi banks and the per-dialect pieces the
// production pipeline threads through turn/tts/stt.
// =====================================================================

export type Dialect = 'egyptian' | 'saudi'

const DB_DIALECTS: Record<string, Dialect> = {
  egyptian_arabic: 'egyptian',
  egyptian: 'egyptian',
  saudi_arabic: 'saudi',
  saudi: 'saudi',
}

/** Parse a DB/persona dialect value ('saudi_arabic', 'egyptian_arabic', …). */
export function parseDialect(value: unknown, fallback: Dialect = 'egyptian'): Dialect {
  const key = String(value ?? '').trim().toLowerCase()
  return DB_DIALECTS[key] ?? fallback
}

export function dbDialect(dialect: Dialect): string {
  return dialect === 'saudi' ? 'saudi_arabic' : 'egyptian_arabic'
}

// ---------------------------------------------------------------------
// Teacher vocative mapping. The original UI's title picker offers
// «يا مستر» / «يا ميس» (Egyptian school conventions). Saudi classrooms
// address teachers as «يا أستاذ» / «يا أستاذة» — mapped at the AI layer.
// ---------------------------------------------------------------------
export function teacherTitleForDialect(title: string, dialect: Dialect): string {
  const clean = (title || '').trim()
  if (dialect === 'egyptian') return clean || 'يا مستر'
  const isFemale = clean.includes('ميس') || clean.includes('أستاذة') || clean.includes('استاذة')
  return isFemale ? 'يا أستاذة' : 'يا أستاذ'
}

// ---------------------------------------------------------------------
// Saudi instruction block — injected into persona prompts for Saudi
// classrooms (vocabulary bank + forbidden Egyptian markers + examples).
// Mirrors the Egyptian rules block inside buildCandidateStudentPrompt.
// ---------------------------------------------------------------------
export const SAUDI_DIALECT_BLOCK = `
اللهجة: السعودية البيضاء (الوسطى) — إلزامية في كل رد تنطقه:
- مفردات سعودية استخدمها كثيراً: (أبغى أعرف / وش / ليش / كذا / كذاك / الحين / مو متأكد / بس / تمام / يا أستاذ / يا أستاذة / فهمت الدرس / خلني أجاوب / أعتقد / يمكن / يعني / واضح / زين / مب / وين / بسرعة).
- أمثلة ردود صحيحة: «شكلي قربت للجواب بس مو متأكد يا أستاذ»، «أبغى أعرف ليش طلع كذا؟»، «فهمت الدرس تمام الحين».
- محظورات صارمة — ألفاظ مصرية ممنوعة نهائياً: (مش / إزاي / كده / دلوقتي / خالص / علشان / يا مستر / يا ميس / ده / دي / عايز / إيه / أوي / سوا / يخلّي / أهوه).
- ❌ ممنوع الفصحى المتكلفة («حسناً»، «بالتأكيد»، «أريد أن») — اتكلم بالعامية السعودية الطبيعية فقط.
- نادِ المعلم بـ «يا أستاذ» (للمعلم) أو «يا أستاذة» (للمعلمة) فقط.
`

export const SAUDI_SWARM_HEADER = `أنت عقل ومحاكي لفصل دراسي سعودي حقيقي لمرحلة ابتدائية، يدير تفاعل 4 أطفال في مدرسة سعودية (أعمارهم بين 9 و 10 سنوات). الطلاب يتحدثون باللهجة السعودية البيضاء (الوسطية) بشكل طبيعي وعفوي، وينادون المعلم بـ «يا أستاذ» والمعلمة بـ «يا أستاذة».`

// ---------------------------------------------------------------------
// Saudi MSA→dialect normalization (applied instead of the Egyptian one
// when the classroom dialect is Saudi).
// ---------------------------------------------------------------------
export function normalizeMsaToSaudi(text: string): string {
  return text
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?حسناً?(?=[\s.,?!،؛:؟]|$)/gi, 'تمام')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?بالتأكيد(?=[\s.,?!،؛:؟]|$)/gi, 'أكيد')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?أجل(?=[\s.,?!،؛:؟]|$)/gi, 'إيه والله')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?(?:لست\s*أدري|لا\s*أدري)(?=[\s.,?!،؛:؟]|$)/gi, 'ما أدري')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?ماذا\s+تقصد[ي]?(?=[\s.,?!،؛:؟]|$)/gi, 'وش تقصد')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?لماذا(?=[\s.,?!،؛:؟]|$)/gi, 'ليش')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?كيف(?=[\s.,?!،؛:؟]|$)/gi, 'كيف')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?أين(?=[\s.,?!،؛:؟]|$)/gi, 'وين')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?ما\s+هو(?=[\s.,?!،؛:؟]|$)/gi, 'وش هو')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?بالفعل(?=[\s.,?!،؛:؟]|$)/gi, 'فعلاً')
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?نعم(?=[\s.,?!،؛:؟]|$)/gi, 'أيوه')
    .trim()
}

/** Egyptian markers that must never appear in a Saudi student's speech. */
export const EGYPTIAN_MARKERS_RE =
  /(?:\b(?:مش|إزاي|ازاي|كده|كدا|دلوقتي|خالص|علشان|عايز|عاوز|إيه|ايه|أوي|أوى|سوا|يخلّي|مستران|هحاول|هنحاول|دلوقت|أهوه|ده كمان|برافو|يا\s*مستر|يا\s*ميس)\b)|(?:\bده\b|\bدي\b)/

/** Saudi markers that must never appear in an Egyptian student's speech. */
export const SAUDI_MARKERS_RE =
  /(?:\b(?:أبغى|ابغى|وش|ليش|كذا|كذاك|الحين|مو|زين|مب|وين|بسرعة|يا\s*أستاذة|شكلي)\b)/

// ---------------------------------------------------------------------
// TTS voice profiles per dialect (Edge neural voices + Fish Audio
// reference ids for the public voice library).
// ---------------------------------------------------------------------
export type EdgeVoice = { female: string; male: string }

export const EDGE_VOICES: Record<Dialect, EdgeVoice> = {
  egyptian: { female: 'ar-EG-SalmaNeural', male: 'ar-EG-ShakirNeural' },
  saudi: { female: 'ar-SA-ZariyahNeural', male: 'ar-SA-HamedNeural' },
}

// Fish Audio reference voices (public library, gender-matched young
// Arabic voices; production-verified with the s2.1-pro-free model).
export const FISH_VOICES: Record<Dialect, Record<string, string>> = {
  egyptian: {
    // Original repo's Egyptian student voices
    omar: '467b35bab13841858d89523da3e6102c',
    sara: 'c75d63900b55446aaa2d07593cc6bb2d',
    yassin: 'cbe855302eaa45dda57867e1188b0228',
    nour: 'fb77d7877e404c0fb2427e7aec55b247',
  },
  saudi: {
    // Saudi classroom voices keyed by the SAUDI character names
    // (gender-matched young Arabic reference voices):
    ريم: '14f1000b77d547eeb5f03b474dd29e0f', // Asmaa — conversational girl
    reem: '14f1000b77d547eeb5f03b474dd29e0f',
    جوري: '7eee0787bf1a476fb0864270853e344a', // Yee — soft, gentle girl
    jouri: '7eee0787bf1a476fb0864270853e344a',
    سلطان: '1d51fdd65ff14342aec4dffa0ef58386', // young educational boy
    sultan: '1d51fdd65ff14342aec4dffa0ef58386',
    فهد: '7b301c14ee0b447cb8705b7e247067e1', // young boy
    fahad: '7b301c14ee0b447cb8705b7e247067e1',
    // legacy keys (kept so old callers still resolve gender-correctly)
    sara: '14f1000b77d547eeb5f03b474dd29e0f',
    nour: '7eee0787bf1a476fb0864270853e344a',
    omar: '1d51fdd65ff14342aec4dffa0ef58386',
    yassin: '7b301c14ee0b447cb8705b7e247067e1',
  },
}

export function fishVoiceFor(dialect: Dialect, personaName: string, isFemale: boolean): string {
  const set = FISH_VOICES[dialect]
  const key = personaName.trim().toLowerCase()
  return set[key] || (isFemale ? set.sara : set.omar)
}

// ---------------------------------------------------------------------
// STT bias prompts per dialect (Whisper prompt steering).
// ---------------------------------------------------------------------
export function sttBiasPrompt(dialect: Dialect): string {
  if (dialect === 'saudi') {
    return 'بيئة تعليمية سعودية. المتحدث معلم يستخدم اللهجة السعودية البيضاء مع مصطلحات خليجية: يا شباب، وش، ليش، أبغى، الحين، كذا، زين، فاهم، جاوب، انتباه، الواجب، درس، رياضيات، علوم.'
  }
  return 'السلام عليكم ورحمة الله وبركاته، أهلاً بكم يا شطار في حصة اليوم. شرح تفاعلي بالعامية المصرية مع مصطلحات إنجليزية وتعليمية: Past Simple, regular verbs, play, watch, give me an example, grammar, homework, hello, thank you.'
}

// ---------------------------------------------------------------------
// Persona name → gender (original four + Saudi classroom four).
// ---------------------------------------------------------------------
export const FEMALE_NAMES = new Set([
  'سارة', 'نور', 'فاطمة', 'مريم', 'سلمى', 'ريم', 'جوري', 'دانة', 'لمى',
  'sara', 'sarah', 'nour', 'fatima', 'maryam', 'reem', 'jori', 'dana',
])

export function isFemaleName(name: string | null | undefined): boolean {
  return FEMALE_NAMES.has((name ?? '').trim())
}

// Saudi classroom personas (seeded alongside the original Egyptian four).
export const SAUDI_PERSONAS = [
  {
    name: 'ريم',
    age: 10,
    base_attention: 88,
    strengths: ['دقة وسرعة فهم'],
    weaknesses: ['ملل عند سهولة الدرس'],
    personality_prompt:
      'انتي طالبة سعودية اسمك ريم عمرك 10 سنين. متفوقة ومنظمة ومؤدبة (مستوى فهم 88%). إجاباتك سريعة وصحيحة ومرتبة، وتتحدثين باللهجة السعودية البيضاء بعفوية («تمام»، «أبغى أعرف»، «مو متأكدة»، «كذا»). تنادين المعلمة بـ «يا أستاذة» والمعلم بـ «يا أستاذ».',
  },
  {
    name: 'سلطان',
    age: 10,
    base_attention: 75,
    strengths: ['اجتهاد ومنطق'],
    weaknesses: ['التباس مفاهيم أحياناً'],
    personality_prompt:
      'انت طالب سعودي اسمك سلطان عمرك 10 سنين. مجتهد وعملي ومشارك (مستوى فهم 75%). إجاباتك منطقية وواضحة ومهذبة باللهجة السعودية البيضاء («فهمت الدرس»، «أعتقد»، «ليش كذا؟»). تنادي المعلم بـ «يا أستاذ».',
  },
  {
    name: 'فهد',
    age: 10,
    base_attention: 65,
    strengths: ['حماس ومشاركة تلقائية'],
    weaknesses: ['تسرع وتشتت سريع'],
    personality_prompt:
      'انت طالب سعودي اسمك فهد عمرك 10 سنين. نشيط ومتحمس وذكاؤك حركي، تحب الرياضة والحركة (مستوى فهم 65%). أحياناً تتسرع أو تظهر عندك أخطاء مفاهيمية بريئة. تتكلم باللهجة السعودية البيضاء بحماس («أبغى أجاوب يا أستاذ!»، «وش اللعبة؟»، «كذا صح؟»).',
  },
  {
    name: 'جوري',
    age: 9,
    base_attention: 50,
    strengths: ['ملاحظة دقيقة وفضول'],
    weaknesses: ['تردد وخجل'],
    personality_prompt:
      'انتي طالبة سعودية اسمك جوري عمرك 9 سنين. هادية وفضولية (مستوى فهم 50%). تحتاجين تشجيعاً وأمثلة حسية، ومعرضة للالتباس العفوي. تتحدثين باللهجة السعودية البيضاء بصوت هادئ وبشيء من التردد («هو... كذا؟»، «مو متأكدة»، «أبغى أعرف ليش»). تنادين المعلمة بـ «يا أستاذة».',
  },
]
