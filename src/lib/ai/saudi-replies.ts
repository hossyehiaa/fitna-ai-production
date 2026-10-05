// =====================================================================
// Saudi deterministic reply bank — the fallback engine for Saudi
// classrooms (used when Groq is unavailable, mirroring the role the
// Egyptian fallback texts play in the original turn.ts).
//
// All replies are Saudi "white" dialect (اللهجة السعودية البيضاء) with
// the teacher addressed as «يا أستاذ» / «يا أستاذة». No Egyptian
// markers, no MSA stiffness — short spontaneous child speech.
// =====================================================================

import { EGYPTIAN_MARKERS_RE } from './dialects'

export type SaudiReplyKind =
  | 'greeting_morning'
  | 'greeting_evening'
  | 'greeting_salam'
  | 'greeting_how'
  | 'greeting_generic'
  | 'greeting_audio_check'
  | 'farewell'
  | 'attention_check'
  | 'teacher_identity'
  | 'religious_blessing'
  | 'teacher_apology'
  | 'distracted'
  | 'clarification'
  | 'permission_to_speak'
  | 'direct_question'
  | 'why_question'
  | 'comparison'
  | 'agree_with_peer'
  | 'corrective_feedback'
  | 'roll_call'
  | 'open_discussion'
  | 'unknown'

const FEMALE_PERSONAS = new Set(['ريم', 'جوري'])

function fem(name: string, femaleForm: string, maleForm: string): string {
  return FEMALE_PERSONAS.has(name) ? femaleForm : maleForm
}

/** Persona-flavored filler interests (mirrors the Egyptian bank's flavor). */
function interest(name: string): string {
  switch (name) {
    case 'فهد':
      return 'الكورة'
    case 'ريم':
      return 'الرسم'
    case 'سلطان':
      return 'الألعاب'
    case 'جوري':
      return 'القراءة'
    default:
      return 'الألعاب'
  }
}

export function saudiReply(
  kind: SaudiReplyKind,
  opts: { personaName: string; title: string; referencedStudentName?: string | null }
): string {
  const { personaName, title } = opts
  const cleanTitle = title.startsWith('يا ') ? title : `يا ${title}`

  switch (kind) {
    case 'greeting_morning':
      return `صباح الخير يا أستاذ${cleanTitle.includes('أستاذة') ? 'ة' : ''}! الحمد لله تمام.`
    case 'greeting_evening':
      return `مساء الخير ${cleanTitle}!`
    case 'greeting_salam':
      return `وعليكم السلام ${cleanTitle}! الحمد لله تمام.`
    case 'greeting_how':
      return `الحمد لله ${cleanTitle} تمام، وأنت كيفك؟`
    case 'greeting_generic':
      return `هلا ${cleanTitle}! الحمد لله تمام.`
    case 'greeting_audio_check':
      return `أيوه ${cleanTitle} سامعينك واضح!`
    case 'farewell':
      return `مع السلامة ${cleanTitle}! شكراً لك.`
    case 'attention_check':
      return `معك ${cleanTitle} ومركّزين!`
    case 'teacher_identity':
      return `آسفين ${cleanTitle} خلاص حفظنا!`
    case 'religious_blessing':
      return 'عليه أفضل الصلاة والسلام.'
    case 'teacher_apology':
      return `ولا يهمك ${cleanTitle} عادي!`
    case 'distracted':
      return `ها؟ عذراً ${cleanTitle} ما كنت مركّز.. تعيد السؤال؟`
    case 'clarification':
      return `قصدي ${cleanTitle} أوضح سؤالي شوي.`
    case 'permission_to_speak':
      return `أبغى أجاوب ${cleanTitle}!`
    case 'direct_question':
      return fem(
        personaName,
        `أعتقد الجواب كذا ${cleanTitle}، بس مو متأكدة.`,
        `أعتقد الجواب كذا ${cleanTitle}، بس مو متأكد.`
      )
    case 'why_question':
      return fem(
        personaName,
        `عشان السبب الأساسي في الموضوع هذا ${cleanTitle}.`,
        `عشان هذا هو السبب الرئيسي ${cleanTitle}.`
      )
    case 'comparison':
      return `الثاني أكبر ${cleanTitle}.`
    case 'agree_with_peer':
      return fem(
        personaName,
        `أنا متفقة مع كلام ${opts.referencedStudentName || 'زميلي'} ${cleanTitle}!`,
        `أنا متفق مع كلام ${opts.referencedStudentName || 'زميلي'} ${cleanTitle}!`
      )
    case 'corrective_feedback':
      return `مو صح ${cleanTitle}؟ طيب ليش؟`
    case 'roll_call':
      return `أنا ${personaName}، عمري عشر سنين وأحب ${interest(personaName)} ${cleanTitle}!`
    case 'open_discussion':
      return fem(
        personaName,
        `${cleanTitle} أبغى أحكي لكم عن رسمة رسمتها!`,
        `${cleanTitle} أبغى أحكي لكم عن ماتش الكورة!`
      )
    case 'unknown':
    default:
      return fem(personaName, `معك ${cleanTitle}.`, `معك ${cleanTitle}.`)
  }
}

/**
 * Repair Egyptian-marker leakage in a Saudi student's speech (the LLM
 * occasionally slips despite the forbidden-words list). Replaces the
 * most common Egyptian tokens with their Saudi counterparts.
 */
export function repairSaudiDialect(text: string, title: string): string {
  let t = text
  const cleanTitle = title.startsWith('يا ') ? title : `يا ${title}`

  t = t
    .replace(/\bمش\s+(عارف|عرف|فاهم|فاهمة|متأكد|متأكدة|هجاوب|حجاوب|هقول|عايز|عاوزة|قادر|عاجبني)\b/g, 'مو $1')
    .replace(/\bمش\b/g, 'مو')
    .replace(/\bإزاي\b|\bازاي\b/g, 'كيف')
    .replace(/\bكده\b|\bكدا\b/g, 'كذا')
    .replace(/\bدلوقتي\b|\bدلوقت\b/g, 'الحين')
    .replace(/\bخالص\b/g, 'أبداً')
    .replace(/\bعلشان\b/g, 'عشان')
    .replace(/\bعايز\b|\bعاوز\b/g, 'أبغى')
    .replace(/\bعايزة\b|\bعاوزة\b/g, 'أبغى')
    .replace(/\bإيه\b|\bايه\b/g, 'وش')
    .replace(/\bأوي\b|\bأوى\b/g, 'مرّة')
    .replace(/\bسوا\b/g, 'مع بعض')
    .replace(/\bيخلّي\b|\bيخلي\b/g, 'يخلي')
    .replace(/\bأهوه\b|\bأهو\b/g, 'هاذا')
    .replace(/\bيا\s*مستر\b/g, cleanTitle)
    .replace(/\bيا\s*ميس\b/g, cleanTitle)
    .replace(/\bمستر\b/g, 'أستاذ')
    .replace(/\bميس\b/g, 'أستاذة')

  return t
}

/** Does the text still carry Egyptian markers after repair? */
export function hasEgyptianMarkers(text: string): boolean {
  return EGYPTIAN_MARKERS_RE.test(text)
}

/** Final safety net: a clean Saudi reply when repair is impossible. */
export function saudiSafetyReply(personaName: string, title: string): string {
  const cleanTitle = title.startsWith('يا ') ? title : `يا ${title}`
  return fem(personaName, `تمام ${cleanTitle}، فهمتك.`, `تمام ${cleanTitle}، فهمتك.`)
}
