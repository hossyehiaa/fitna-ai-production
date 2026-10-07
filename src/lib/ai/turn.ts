import { openrouterChat, CLASSIFIER_MODEL, CLASSIFIER_FALLBACKS, ROLEPLAY_MODEL, ROLEPLAY_FALLBACKS } from "@/lib/llm/openrouter";
import { parseEmotion, type Emotion } from "@/lib/llm/emotion";
import { buildClassroomSwarmSystemPrompt, buildQuestionClassifierPrompt, buildCandidateStudentPrompt } from "@/lib/ai/personas";
import type { Database } from "@/lib/supabase/types";
import { StudentBrainState, StudentPhysicalAction, initializeStudentBrain, getActionDescription } from "@/lib/simulation/classroomState";
import { analyzeTeacherIntent, decideClassroomReaction, DecisionResult } from "@/lib/simulation/decisionEngine";
import { parseDialect, teacherTitleForDialect, normalizeMsaToSaudi, type Dialect } from "@/lib/ai/dialects";
import { saudiReply, repairSaudiDialect, hasEgyptianMarkers } from "@/lib/ai/saudi-replies";

type Persona = Database["public"]["Tables"]["student_personas"]["Row"];

export type QuestionType = "open" | "closed" | "statement";

export type StudentTurnResult = {
  personaId: string;
  name: string;
  responded: boolean;
  text: string | null;
  newState: "attentive" | "hand_raised" | "distracted";
  attentionDelta: number; // -20..+20, applied and clamped by the caller
  physicalAction?: StudentPhysicalAction;
  actionDescriptionAr?: string;
  emotion?: string;
};

/**
 * Real LLM call #1: classify the teacher's utterance (spec §4d).
 */
export async function classifyTeacherUtterance(text: string): Promise<QuestionType> {
  const clean = text.replace(/[إأآا]/g, "ا");
  // Social greetings, sound checks, praise, farewells, or classroom orders are NOT pedagogical inquiry questions
  const isGreetingOrFarewell =
    /عاملين\s*(ايه|إيه|اي)|ازيكم|ازيكو|صباح\s*الخير|مساء\s*الخير|سلام\s*عليكم|السلام\s*عليكم|اهلا|اهلاً|مع\s*السلامة|باي|اشوفكم|أشوفكم|خلصنا|كفاية\s*كده/i.test(
      text
    );
  const isAudioCheck =
    /سامعيني|سامعين|صوتي\s*(واضح|واصل)|حد\s*سامع/i.test(clean);

  const hasQuestionInquiry =
    /[؟?]|\b(what|why|how|which)\b/i.test(clean) ||
    /(?:ازاي|إزاي|ليه|لماذا|كام|كم|ما\s*هو|ما\s*هي|ماذا|مين\s*(?:يقول|يعرف|يجاوب|اكبر|أكبر|اصغر|أصغر)|نكتب|تفتكروا|يساوي)/i.test(
      clean
    );

  const isManagementOrPraise =
    /شاطر|شاطرة|ممتاز|برافو|كويس\s*قوي|احسنت|أحسنت|شكرا|افتحوا|اسمعوا|اقعدوا|سكوت|هدوء/i.test(
      clean
    );

  if (!hasQuestionInquiry) {
    return "statement";
  }

  // Socratic / Deep Reasoning Triggers: "ليه"، "ماذا لو"، "إيه دليلك"، "كيف تفسر"
  const isReasoningOrSocratic =
    /(?:ليه|لماذا|ماذا\s*لو|ايه\s*السبب|إيه\s*السبب|ايه\s*دليلك|إيه\s*دليلك|ازاي\s*تثبت|إزاي\s*تثبت|كيف\s*تفسر|ايه\s*رايكم|إيه\s*رأيكم|تتفقوا|هل\s*تتفق)/i.test(clean);

  // Factual / Recall / Definition Triggers (Closed questions):
  // "يعني إيه كسر"، "نكتب النص إزاي"، "أقدر أكتبه إزاي"، "مين الأكبر"، "ما هي مراحل"، "يساوي كام"
  const isFactualOrClosed =
    /(?:يعني\s*(?:ايه|إيه)|مين\s*يقول\s*(?:لي\s*)?يعني|ما\s*(?:هو|هي|معنى|المقصود|تعريف)|(?:نكتب|اكتب|نعمل|نحسب|نعبر)[هها]*\s*(?:ازاي|إزاي)|(?:ازاي|إزاي)\s*(?:نكتب|اكتب|نعمل|نحسب|نعبر)|(?:مين|انهي|أنهي|ايهم|أيهم)\s*(?:ال)?(?:اكبر|أكبر|اصغر|أصغر)|(?:ال)?(?:اكبر|أكبر|اصغر|أصغر)\s*ولا|يساوي\s*كام|كام\s*(?:مرحلة|عدد|نوع)|صح\s*ولا\s*غلط|نعم\s*ام\s*لا|نعم\s*أم\s*لا)/i.test(clean);

  if (isFactualOrClosed && !isReasoningOrSocratic) {
    return "closed";
  }

  if (isReasoningOrSocratic) {
    return "open";
  }

  // Strip leading praise before passing to prompt so LLM focuses on pedagogical inquiry
  const textWithoutPraise = text
    .replace(/^(?:ممتاز|برافو|أحسنت|احسنت|شاطر|شاطرة|كويس\s*قوي|عظيم)[\s!،,.-]*/i, "")
    .trim();

  try {
    // Master prompt §7 — Claude Haiku 4.5 via OpenRouter (chain-walk
    // protected; the regex heuristics above/below stay as the
    // zero-latency error fallback). The app's "statement" bucket absorbs
    // §7's "rhetorical" class (a question that expects no knowledge answer).
    const completion = await openrouterChat({
      model: CLASSIFIER_MODEL,
      fallbacks: CLASSIFIER_FALLBACKS,
      messages: [{ role: "user", content: buildQuestionClassifierPrompt(textWithoutPraise || text) }],
      maxTokens: 12,
      temperature: 0,
    });
    const raw = (completion.text ?? "").trim().toLowerCase();
    if (raw.includes("open")) return "open";
    if (raw.includes("closed")) return "closed";
    if (raw.includes("rhetorical") || raw.includes("statement")) return "statement";
  } catch (err) {
    console.warn("Classify question with OpenRouter (claude-haiku-4.5) error:", err);
  }
  if (/[؟?]/.test(text) || /\b(what|why|how|which)\b/i.test(text)) {
    return isReasoningOrSocratic ? "open" : "closed";
  }
  return "statement";
}

export function extractTeacherTitleAndGender(
  teacherUtterance: string,
  recentHistory: string = "",
  voiceGender?: "male" | "female" | null,
  lockedTeacherTitle?: string | null,
  teacherFullName?: string
): { title: string; isFemale: boolean } {
  const combined = `${recentHistory}\n${teacherUtterance}`;

  // 1. Explicit correction / self-identification in text (Highest precedence)
  const isFemaleSelfId =
    /(?:أنا|انا)\s*(?:مش|غير)\s*(?:مستر|استاذ|أستاذ)|(?:أنا|انا)\s*(?:ميس|مس|معلمة|استاذة|أستاذة)|(?:ميس|مس)\s*[a-zA-Z\u0600-\u06FF]+/i.test(teacherUtterance) ||
    /(?:أنا|انا)\s*(?:مش|غير)\s*(?:مستر|استاذ|أستاذ)|(?:أنا|انا)\s*(?:ميس|مس|معلمة|استاذة|أستاذة)|(?:ميس|مس)\s*(?:مريم|فاطمة|سارة|نور|منى|هدى|رنا|ياسمين)/i.test(combined);

  const isMaleSelfId =
    /(?:أنا|انا)\s*(?:مش|غير)\s*(?:ميس|مس|ابلة|أبلة)|(?:أنا|انا)\s*(?:مستر|استاذ|أستاذ|معلم)/i.test(teacherUtterance) ||
    /(?:مستر|استاذ)\s*(?:أحمد|احمد|محمد|محمود|علي|عمرو|خالد|يوسف|طارق)/i.test(combined);

  if (isFemaleSelfId) {
    return { title: "يا ميس", isFemale: true };
  }
  if (isMaleSelfId) {
    return { title: "يا مستر", isFemale: false };
  }

  // 2. Session-wide locked title chosen in Session Setup (Primary Source of Truth)
  if (lockedTeacherTitle) {
    return { title: lockedTeacherTitle, isFemale: lockedTeacherTitle.includes("ميس") };
  }

  // 3. Fallback: Profile full name & feminine grammar markers (only if no title was chosen in Session Setup)
  const isFemaleName = /(?:مريم|سارة|فاطمة|نور|منى|هدى|رنا|ياسمين|اية|آية|اماني|أماني|ايمان|إيمان|سلمى|ندى|ريم|شهد|حنين|ملك|ملاك|هاجر|إسراء|اسراء|دعاء|سمر|وفاء|زينب|عائشة|خديجة|maryam|mariam|sara|sarah|fatima|nour)/i.test(
    teacherFullName || ""
  );
  const isFemaleGrammar = /(?:عايزة|عاوزة|شايفة|سامعة|معلمتكم|مدرستكم|أبلتكم|انا\s*ميس|أنا\s*ميس|أنا\s*معلمة|انا\s*معلمة)/i.test(
    teacherUtterance
  );

  if (isFemaleName || isFemaleGrammar) {
    return { title: "يا ميس", isFemale: true };
  }

  // 4. Explicit mention of titles in transcript
  const hasMaleTitle = /(?<=^|[\s.,?!،؛:])(مستر|استاذ|أستاذ)(?=[\s.,?!،؛:]|$)/i.test(combined);
  const hasFemaleTitle = /(?<=^|[\s.,?!،؛:])(ميس|مس|ابلة|أبلة)(?=[\s.,?!،؛:]|$)/i.test(combined);

  if (hasFemaleTitle && !hasMaleTitle) {
    return { title: "يا ميس", isFemale: true };
  }
  if (hasMaleTitle && !hasFemaleTitle) {
    return { title: "يا مستر", isFemale: false };
  }

  // 5. Voice Pitch & Tone Analysis (Diagnosed from teacher's voice pitch)
  if (voiceGender === "female") {
    return { title: "يا ميس", isFemale: true };
  }
  if (voiceGender === "male") {
    return { title: "يا مستر", isFemale: false };
  }

  // 6. Default if totally indeterminate
  return { title: "يا مستر", isFemale: false };
}

export interface QuestionContext {
  isWhyQuestion: boolean;
  isComparison: boolean;
  fractions: string[];
  hasUnlikeDenominators: boolean;
  targetConceptAspect?: string | null;
}

function parseDenominator(f: string): number | null {
  const parts = f.split(/[/على]/).map((p) => p.trim());
  if (parts.length < 2) return null;
  const denStr = parts[1];
  const num = parseInt(denStr, 10);
  if (!isNaN(num)) return num;
  const arabicWords: Record<string, number> = {
    واحد: 1, اتنين: 2, اثنين: 2, تلاتة: 3, ثلاثة: 3, اربعة: 4, أربعة: 4,
    خمسة: 5, ستة: 6, سبعة: 7, تمانية: 8, ثمانية: 8, تسعة: 9, عشرة: 10,
  };
  return arabicWords[denStr] ?? null;
}

export function extractQuestionContext(teacherUtterance: string): QuestionContext {
  const clean = (teacherUtterance || "").trim();
  const isWhyQuestion = /(?:ليه|إزاي|ازاي|علشان\s*إيه|عشان\s*إيه|السبب|فسر|وضح\s*ليه|اشرح\s*ليه)/i.test(clean);
  const isComparison = /(?:مين\s*أكبر|مين\s*اكبر|أكبر\s*ولا|اكبر\s*ولا|مين\s*أصغر|مين\s*اصغر|أصغر\s*ولا|اصغر\s*ولا|مقارنة|أكبر\s*من|اكبر\s*من|الفرق\s*بين|إيه\s*الفرق|ايه\s*الفرق)/i.test(clean);

  let targetConceptAspect: string | null = null;
  if (/(?:شكل|أشكال|شكله|شكلها)/i.test(clean)) {
    targetConceptAspect = "المقارنة أو الإجابة من حيث (الشكل): المادة السائلة (المية) تأخذ شكل الإناء، بينما الغاز (الهواء) ليس له شكل محدد وينتشر في المكان والبالونة.";
  } else if (/(?:حجم|حجمه|حجمها)/i.test(clean)) {
    targetConceptAspect = "المقارنة أو الإجابة من حيث (الحجم): المادة السائلة حجمها ثابت لا يتغير، بينما الغاز حجمه غير ثابت.";
  } else if (/(?:بسط|مقام|فوق|تحت)/i.test(clean)) {
    targetConceptAspect = "تحديد البسط (الرقم العلوي) والمقام (الرقم السفلي)";
  } else if (/(?:تبخر|تكاثف|تكثف|هطول|سحاب|مطر)/i.test(clean)) {
    targetConceptAspect = "مراحل دورة الماء (التبخر بالحرارة، ثم التكاثف لتكوين السحب، ثم الهطول كمطر)";
  }

  const fractionRegex = /(?:[0-9٠-٩]+\s*(?:\/|على)\s*[0-9٠-٩]+|(?:واحد|اتنين|تلاتة|ثلاثة|أربعة|اربعة|خمسة|ستة|سبعة|تمانية|ثمانية|تسعة|عشرة)\s*على\s*(?:واحد|اتنين|تلاتة|ثلاثة|أربعة|اربعة|خمسة|ستة|سبعة|تمانية|ثمانية|تسعة|عشرة|[0-9٠-٩]+))/gi;
  const fractions: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fractionRegex.exec(clean)) !== null) {
    fractions.push(m[0].trim());
  }

  const denominators = fractions.map(parseDenominator).filter((d): d is number => d !== null);
  const hasUnlikeDenominators = denominators.length >= 2 && new Set(denominators).size > 1;

  return {
    isWhyQuestion,
    isComparison,
    fractions,
    hasUnlikeDenominators,
    targetConceptAspect,
  };
}

export function sanitizeStudentResponse(
  rawText: string,
  studentName: string,
  teacherTitle: string,
  context?: {
    isDistracted?: boolean;
    unknownStudentName?: string | null;
    isWhyQuestion?: boolean;
    isTeacherApology?: boolean;
    isGreeting?: boolean;
    teacherUtterance?: string;
    currentFractions?: string[];
    hasUnlikeDenominators?: boolean;
    isCommonDenominatorTaught?: boolean;
    activeMisconception?: any;
    dialect?: string;
  }
): string {
  const dialect = parseDialect(context?.dialect);
  if (dialect === "saudi") {
    return sanitizeSaudiStudentResponse(rawText, studentName, teacherTitle, context);
  }
  let titleFormatted = (teacherTitle || "").trim();
  titleFormatted = titleFormatted.replace(/(?:يا\s*)?(?:ميس|مس)\s+(?:ميس|مس)\b/gi, "يا ميس");
  titleFormatted = titleFormatted.replace(/(?:يا\s*)?(?:مستر|استاذ|أستاذ)\s+(?:مستر|استاذ|أستاذ)\b/gi, "يا مستر");
  const cleanTitle = titleFormatted.startsWith("يا ") ? titleFormatted : `يا ${titleFormatted}`;

  // If student was distracted when called, they must be confused and ask to repeat:
  if (context?.isDistracted) {
    return `ها؟ معلش ${cleanTitle} مكنتش مركز.. ممكن تعيد السؤال؟`;
  }

  let text = (rawText || "").trim();

  // 1. Remove surrounding quotes and brackets
  text = text.replace(/^["'«“]+|["'»”]+$/g, "").trim();

  // 2. Remove AI roleplay prefixes ("بصفتي طالب", "رد نور:", etc.)
  text = text
    .replace(/^(?:بصفتي\s*طالب[ةه]?|وفقاً\s*لدوري|أنا\s*كطالب[ةه]?|رد\s*\w+:\s*|الطالب\s*\w+:\s*)/i, "")
    .trim();

  // 3. Strip unsolicited service offers and assistant tropes
  text = text
    .replace(/(?:لو\s*(?:تحب|عايز|حضرتك\s*حابب)\s*[^.!؟\n]+(?:مستعد[ةه]|أشرح|أعمل|نعمل)[^.!؟\n]*)/gi, "")
    .replace(/(?:أنا\s*(?:مستعد[ةه]|جاهز[ةه]\s*لـ?|حابة\s*أضيف|حابب\s*أضيف)[^.!؟\n]*)/gi, "")
    .replace(/(?:مثال\s*جديد\s*:\s*[^.!؟\n]*)/gi, "")
    .replace(/(?:أقدر\s*أساعدك\s*[^.!؟\n]*)/gi, "")
    .trim();

  // 3a. Customer Service / Call Center / Butler Hallucination Filter ("في خدمة المدام", "تحت أمر حضرتك")
  text = text
    .replace(/(?:أتفضلي|اتفضلي|أهلاً|اهلا)?\s*(?:في\s*خدم[ةه]\s*(?:المدام|حضرتك|سيادتك|الجميع|الزبائن)|تحت\s*أمر[كك]|تحت\s*أمر\s*حضرتك|أي\s*خدم[ةه]|أنا\s*في\s*الخدم[ةه])[^.!؟\n]*/gi, "")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:يا\s*)?(?:فندم|هانم|مدام)(?=[\s.,?!،؛:؟]|$)/gi, cleanTitle)
    .replace(/[,،؛]\s*([.!?؟])/g, "$1")
    .replace(/[.,!،؛:؟\s]+$/, "")
    .trim();

  // If text became empty, truncated vocative, or was an apology response, give natural child reassurance
  if (
    !text ||
    /^(?:اتفضلي|أتفضلي|اتفضل|تفضل|معلش|أنا\s*فاهم[ةه]?|فاهم[ةه]?)\s*(?:يا\s*(?:ميس|مستر)\s*)?[.!؟،,\s]*$/i.test(text)
  ) {
    if (context?.isTeacherApology || /معلش|اتلخبطت|لخبطت|سوري|أقصد|اقصد/i.test(rawText)) {
      text = `ولا يهمك ${cleanTitle} عادي!`;
    }
  }

  // 3b. Remove leaked prompt guidance, thought leakage, and stage directions
  text = text
    .replace(/^(?:التأكيد\s*للمعلم[^.:!؟\n]*|الاستعداد\s*للإجابة[^.:!؟\n]*|الرد\s*على[^.:!؟\n]*|هكمل\s*بحماس[^.:!؟\n]*|أنا\s*مستعد\s*للإجابة[^.:!؟\n]*)/gi, "")
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .trim();

  // 3c. Fix "مش هجاوب" bug when student is called
  if (/(?:مش\s*(?:هجاوب|حجاوب|هرد|حرد)|مش\s*هقول)/i.test(text)) {
    text = text.replace(/(?:مش\s*(?:هجاوب|حجاوب|هرد|حرد)|مش\s*هقول)/gi, "أنا هجاوب").trim();
    if (text === "أنا هجاوب" || text === "أنا هجاوب يا مستر" || text === "أنا هجاوب يا ميس") {
      text = `أنا هجاوب ${cleanTitle}!`;
    }
  }

  // 3d. Fix double vocative ("يا يا مستر" / "يا يا ميس")
  text = text.replace(/(?:يا\s+){2,}(مستر|ميس|استاذ|أستاذ)/gi, "يا $1").trim();

  // 3e. Intercept AI recovery / garbled phrases ("سببلي تاني", "متشوش")
  if (/(?:سببلي|متشوش|مشوش|سبب\s*لي)/i.test(text)) {
    const isFemale = studentName === "سارة" || studentName === "نور";
    text = `مش فاهم${isFemale ? "ة" : ""} قصدك ${cleanTitle}، ممكن تعيد السؤال؟`;
  }

  // 3f. Strip repetitive robotic praise / gratitude ("شكراً يا ميس أنا فرحانة جداً")
  text = text
    .replace(/(?:شكر[ااً]\s*يا\s*(?:ميس|مستر)[^.!؟\n]*أنا\s*فرحان[ةه]?[^.!؟\n]*)/gi, "")
    .replace(/(?:شكر[ااً]\s*يا\s*(?:ميس|مستر)\s*[!.]*)/gi, "")
    .trim();

  // 3g. Modern Standard Arabic (MSA / فصحى) Normalization into Spontaneous Egyptian Child Dialect
  text = text
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?حسناً?(?=[\s.,?!،؛:؟]|$)/gi, "تمام")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?بالتأكيد(?=[\s.,?!،؛:؟]|$)/gi, "أكيد")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?أجل(?=[\s.,?!،؛:؟]|$)/gi, "أيوه")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?هيا\s*بنا(?=[\s.,?!،؛:؟]|$)/gi, "يلا")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?(?:لست\s*أدري|لا\s*أدري)(?=[\s.,?!،؛:؟]|$)/gi, studentName === "سارة" || studentName === "نور" ? "مش عارفة" : "مش عارف")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?ماذا\s+تقصد[ي]?(?=[\s.,?!،؛:؟]|$)/gi, "قصدك إيه")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?لماذا(?=[\s.,?!،؛:؟]|$)/gi, "ليه")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?بالفعل(?=[\s.,?!،؛:؟]|$)/gi, "فعلاً")
    .replace(/(?<=^|[\s.,?!،؛:؟])(?:و)?نعم\s*(?:يا\s*)?(?:معلمي|أستاذي|معلمتي|أستاذتي)(?=[\s.,?!،؛:؟]|$)/gi, `أيوه ${cleanTitle}`)
    .trim();

  // 4. Stale Fraction Echo Interception:
  if (context?.currentFractions && context.currentFractions.length >= 2) {
    const hasCurrent = context.currentFractions.some((f) => {
      const parts = f.split(/[/على]/).map((p) => p.trim());
      return parts.length >= 2 && text.includes(parts[parts.length - 1]);
    });
    const hasOld = /(?:[24]\s*[/على]\s*5|خمسين|أربعة\s*أخماس|اربعة\s*اخماس)/.test(text);
    if (!hasCurrent && hasOld) {
      if (context.isWhyQuestion) {
        text = `عشان المقامات متساوية وزي بعض ${cleanTitle}، فبنبص على البسط، والـ ${context.currentFractions[1] || "4 على 6"} أكبر.`;
      } else {
        text = `الـ ${context.currentFractions[1] || "4 على 6"} أكبر ${cleanTitle}.`;
      }
    }
  }

  // 5. Why question reasoning check (fractions only):
  if (context?.isWhyQuestion && context?.currentFractions && context.currentFractions.length >= 2) {
    if (
      /(?:عشان|لأن|لان)\s*([0-9٠-٩]+(?:\s*[/على]\s*[0-9٠-٩]+)?)\s*(?:أكبر|اكبر)\s*من\s*\1/i.test(text) ||
      /(?:عشان|لأن|لان)\s*الأربعة\s*فوق\s*والواحد\s*تحت/i.test(text)
    ) {
      text = `عشان المقامات متساوية ${cleanTitle}، فبنبص على البسط اللي فوق والرقم الأكبر بيبقى هو الكسر الأكبر.`;
    }
  }

  // 5b. Knowledge Boundary Enforcement for Unlike Denominators:
  // If denominators differ and teacher hasn't taught common denominators yet, block terms like "المقام المشترك"
  if (context?.hasUnlikeDenominators && !context?.isCommonDenominatorTaught) {
    if (/(?:مقام\s*مشترك|المقام\s*المشترك|توحيد\s*المقامات|المضاعف\s*المشترك)/i.test(text)) {
      const isFemale = studentName === "سارة" || studentName === "نور";
      text = `مش عارف${isFemale ? "ة" : ""} ${cleanTitle} عشان المقامات مختلفة ومش زي بعض.. إزاي نقارنهم؟`;
    }
  }

  // 5d. Natural Child Farewell / Dismissal (Remove artificial chatbot enthusiasm):
  if (/(?:متشوق[ةه]?\s*للحصة|أتطلع\s*لـ?|أراك[ي]?\s*غداً\s*بشوق|متحمس[ةه]?\s*جداً\s*للحصة|أراك[ي]?\s*في\s*الحصة|إلى\s*اللقاء\s*في\s*حصة)/i.test(text)) {
    text = `مع السلامة ${cleanTitle}!`;
  }

  // 5e. Water Cycle Scientific Accuracy:
  if (/(?:السحاب\s*بيقع|السحاب\s*يقع|يقع\s*كالسحاب|يقع\s*كالمطر)/i.test(text)) {
    text = `البخار بيطلع فوق ويبرد ويعمل سحاب، ولما يتقل ينزل مطر ${cleanTitle}.`;
  }

  // 5f. Teacher Title Consistency
  if (cleanTitle.includes("ميس")) {
    text = text.replace(/مستر\s+مريم/gi, "ميس مريم");
    text = text.replace(/يا\s+مستر\s+مريم/gi, "يا ميس مريم");
    text = text.replace(/(?<=^|[\s.,?!،؛:])(?:يا\s*)?(?:مستر|استاذ|أستاذ)(?:\s+[^\s.,?!،؛:]+)?(?=[\s.,?!،؛:]|$)/gi, cleanTitle);
    if (!text.includes(cleanTitle) && !text.includes("ميس مريم")) {
      text = text.replace(/(?<=^|[\s.,?!،؛:])(?:يا\s*)?(?:ميس|مس|ابلة|أبلة)(?=[\s.,?!،؛:]|$)/gi, cleanTitle);
    }
  } else if (cleanTitle.includes("مستر")) {
    text = text.replace(/(?<=^|[\s.,?!،؛:])(?:يا\s*)?(?:ميس|مس|ابلة|أبلة)(?:\s+[^\s.,?!،؛:]+)?(?=[\s.,?!،؛:]|$)/gi, cleanTitle);
    if (!text.includes(cleanTitle)) {
      text = text.replace(/(?<=^|[\s.,?!،؛:])(?:يا\s*)?(?:مستر|استاذ|أستاذ)(?=[\s.,?!،؛:]|$)/gi, cleanTitle);
    }
  }

  // 5f-2. Deduplicate vocative "يا يا" -> "يا"
  text = text.replace(/(?:\bيا\s*){2,}/g, "يا ");

  // 5g. Intercept accidental lesson hallucinations during greetings or social check-ins
  const teacherSpeech = context?.teacherUtterance || "";
  const isGreetingInteraction =
    Boolean(context?.isGreeting) ||
    /(?:صباح\s*الخير|مساء\s*الخير|سلام\s*عليكم|السلام\s*عليكم|سلامو\s*عليكم|عاملين\s*(?:ايه|إيه|اي)|ازيكم|ازيكو)/i.test(
      teacherSpeech
    );

  if (isGreetingInteraction) {
    if (/(?:تغير\s*مناخي|مناخ|درجات\s*حرارة|بيئة|كوكب|كسر|مقام|بسط|تبخر|تكاثف|مادة|صلب|سائل|غاز)/i.test(text)) {
      if (/صباح\s*الخير/i.test(teacherSpeech)) {
        text = `صباح النور ${cleanTitle}! الحمد لله كويسين.`;
      } else if (/مساء\s*الخير/i.test(teacherSpeech)) {
        text = `مساء النور ${cleanTitle}!`;
      } else if (/سلام/i.test(teacherSpeech)) {
        text = `وعليكم السلام ${cleanTitle}! الحمد لله كويسين.`;
      } else {
        text = `الحمد لله ${cleanTitle} كويسين ومتحمسين للحصة!`;
      }
    }
  }

  // 6. Length constraint: Children in 4th/5th grade do NOT write 30-word academic speeches!
  // If text is longer than 18 words, take the first 1-2 short sentences.
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 18) {
    const sentences = text.split(/([.!?؟\n]+)/).filter(Boolean);
    let reconstructed = "";
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = (sentences[i] || "") + (sentences[i + 1] || "");
      if ((reconstructed + sentence).split(/\s+/).filter(Boolean).length <= 16) {
        reconstructed += sentence;
      } else {
        if (!reconstructed) reconstructed = sentence;
        break;
      }
    }
    text = reconstructed.trim();
  }

  return text || `أيوه ${cleanTitle} معاك.`;
}

/**
 * Saudi sanitize — mirrors the Egyptian sanitizer's role (strip AI tropes,
 * enforce the teacher vocative, cap length) using Saudi dialect rules.
 */
function sanitizeSaudiStudentResponse(
  rawText: string,
  studentName: string,
  teacherTitle: string,
  context?: { isDistracted?: boolean; isGreeting?: boolean; teacherUtterance?: string; isTeacherApology?: boolean }
): string {
  const title = teacherTitleForDialect(teacherTitle, "saudi");
  const cleanTitle = title.startsWith("يا ") ? title : `يا ${title}`;

  if (context?.isDistracted) {
    return `ها؟ عذراً ${cleanTitle} ما كنت مركّز.. تعيد السؤال؟`;
  }

  let text = (rawText || "").trim();

  // 1. Remove surrounding quotes / brackets / stage directions
  text = text.replace(/^["'«“]+|["'»”]+$/g, "").trim();
  text = text.replace(/\[.*?\]|\(.*?\)/g, "").trim();

  // 2. Remove AI roleplay prefixes and assistant tropes
  text = text
    .replace(/^(?:بصفتي\s*طالب[ةه]?|وفقاً\s*لدوري|أنا\s*كطالب[ةه]?|رد\s*\w+:\s*|الطالب\s*\w+:\s*)/i, "")
    .replace(/(?:لو\s*(?:تحب|تبغى)[^.!؟\n]*)/gi, "")
    .replace(/(?:أنا\s*(?:مستعد[ةه]?|جاهز[ةه]?)[^.!؟\n]*)/gi, "")
    .replace(/(?:أقدر\s*أساعدك[^.!؟\n]*)/gi, "")
    .replace(/[,،؛]\s*([.!?؟])/g, "$1")
    .replace(/[.,!،؛:؟\s]+$/, "")
    .trim();

  if (!text) {
    if (context?.isTeacherApology) return `ولا يهمك ${cleanTitle} عادي!`;
    return `أيوه ${cleanTitle} معك.`;
  }

  // 3. Saudi MSA normalization
  text = normalizeMsaToSaudi(text);

  // 4. Teacher title consistency
  text = text
    .replace(/يا\s+(?:مستر|ميس|مس|أبلة|ابلة)/gi, cleanTitle)
    .replace(/(?:^|\s)(?:مستر|ميس)(?=\s|$)/gi, "")
    .replace(/(?:\bيا\s*){2,}/g, "يا ");
  if (!text.includes(cleanTitle) && /^(?:أيوه|تمام|ماشي|أهلا)/i.test(text)) {
    text = `${text} ${cleanTitle}`;
  }

  // 5. Egyptian-marker repair + safety net
  text = repairSaudiDialect(text, cleanTitle);
  if (hasEgyptianMarkers(text)) {
    const repaired = repairSaudiDialect(text, cleanTitle);
    text = hasEgyptianMarkers(repaired) ? "" : repaired;
    if (!text) return saudiReply("direct_question", { personaName: studentName, title: cleanTitle });
  }

  // 6. Length constraint — children don't give speeches
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 18) {
    const sentences = text.split(/([.!?؟\n]+)/).filter(Boolean);
    let reconstructed = "";
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = (sentences[i] || "") + (sentences[i + 1] || "");
      if ((reconstructed + sentence).split(/\s+/).filter(Boolean).length <= 16) {
        reconstructed += sentence;
      } else {
        if (!reconstructed) reconstructed = sentence;
        break;
      }
    }
    text = reconstructed.trim();
  }

  return text || `أيوه ${cleanTitle} معك.`;
}

export type TurnPlanParams = {
  personas: Persona[];
  currentAttention: Record<string, number>;
  timesSpoken?: Record<string, number>;
  lastSpeakingPersonaId?: string | null;
  recentSpeakerPersonaIds?: string[];
  lastPhysicalActions?: Record<string, StudentPhysicalAction>;
  lastSpeakingStudentName?: string | null;
  greetingCompleted?: boolean;
  lastTeacherUtterance?: string | null;
  lessonContext: string | null;
  teacherUtterance: string;
  questionType: QuestionType;
  recentHistory: string;
  fullLessonHistory?: string;
  teacherExplanations?: string[];
  studentContributions?: Record<string, string[]>;
  studentsWithHandRaised?: string[];
  turnIndex?: number;
  voiceGender?: "male" | "female" | null;
  lockedTeacherTitle?: string | null;
  resolvedUnknownNames?: string[];
  teacherFullName?: string;
  dialect?: string;
  /** Actual classroom participant names — drives name-based routing. */
  participantNames?: string[];
};

/**
 * Shared turn plan: converts DB personas to brain states, runs the intent
 * analyzer + classroom decision engine, resolves the teacher title and all
 * question-context flags. Used by BOTH the legacy non-streaming path
 * (generateStudentReactions) and the low-latency streaming turn route so
 * the two pipelines make IDENTICAL classroom decisions.
 */
export type TurnPlan = {
  dialect: Dialect;
  saudiClassmates: string[];
  studentBrains: StudentBrainState[];
  intentAnalysis: ReturnType<typeof analyzeTeacherIntent>;
  decision: DecisionResult;
  title: string;
  cleanTitle: string;
  isRedirectOrCalling: boolean;
  currentQuestionText: string;
  qContext: QuestionContext;
  isCommonDenominatorTaught: boolean;
  isGreeting: boolean;
  isRollCall: boolean;
  isEnglish: boolean;
  isCorrectiveFeedback: boolean;
  systemPrompt: string;
  isSilent: boolean;
  silentReactions: StudentTurnResult[] | null;
};

export function buildTurnPlan(params: TurnPlanParams): TurnPlan {
  const {
    personas,
    currentAttention,
    timesSpoken = {},
    lastPhysicalActions = {},
    lastSpeakingStudentName = null,
    greetingCompleted = false,
    lastTeacherUtterance = null,
    lessonContext,
    teacherUtterance,
    recentHistory,
    fullLessonHistory = "",
    studentsWithHandRaised = [],
    turnIndex = 1,
    voiceGender = null,
    lockedTeacherTitle = null,
    resolvedUnknownNames = [],
    teacherFullName,
    dialect: dialectInput,
    participantNames = [],
    lastSpeakingPersonaId = null,
    recentSpeakerPersonaIds = [],
    teacherExplanations = [],
    studentContributions = {},
  } = params;

  const dialect = parseDialect(dialectInput);
  const saudiClassmates = personas.map((p) => p.name);

  // 1. Convert DB personas to rich StudentBrainState
  const studentBrains: StudentBrainState[] = personas.map((p) => {
    const baseAtt = currentAttention[p.id] ?? p.base_attention ?? 70;
    const spoken = timesSpoken[p.id] ?? 0;
    const brain = initializeStudentBrain(p.id, p.name, p.age, baseAtt, spoken, lessonContext);
    if (lastPhysicalActions[p.id]) {
      brain.physicalAction = lastPhysicalActions[p.id];
      brain.actionDescriptionAr = getActionDescription(brain.physicalAction, p.name);
    }
    return brain;
  });

  // 2. Run Context-Aware Intent Analysis & Classroom Decision Engine
  const intentAnalysis = analyzeTeacherIntent(teacherUtterance, {
    greetingCompleted,
    lastTeacherUtterance,
    recentHistory,
    lastSpeakingStudentName,
    studentsWithHandRaised,
    resolvedUnknownNames,
    lockedTeacherTitle,
    participantNames,
  });
  const decision = decideClassroomReaction(
    studentBrains,
    intentAnalysis,
    turnIndex,
    lastSpeakingPersonaId,
    recentSpeakerPersonaIds
  );

  // 3. SILENCE IS A VALID ACTION:
  // If no student has motivation/permission to speak (e.g. during teacher
  // explanation, silence command, or silent listening): no LLM is needed.
  if (decision.candidateSpeakers.length === 0) {
    const silentReactions: StudentTurnResult[] = personas.map((p) => {
      const updated = decision.updatedStudents.find((s) => s.personaId === p.id);
      const action = updated?.physicalAction ?? "attentive";
      const desc = updated?.actionDescriptionAr ?? getActionDescription(action, p.name);
      const delta = updated?.attentionDelta ?? 0;
      const newState = action === "hand_raised" ? "hand_raised" : action === "fidgeting" || action === "looking_away" ? "distracted" : "attentive";

      return {
        personaId: p.id,
        name: p.name,
        responded: false,
        text: null,
        newState,
        attentionDelta: delta,
        physicalAction: action,
        actionDescriptionAr: desc,
      };
    });
    return {
      dialect, saudiClassmates, studentBrains, intentAnalysis, decision,
      title: "", cleanTitle: "", isRedirectOrCalling: false, currentQuestionText: teacherUtterance,
      qContext: extractQuestionContext(teacherUtterance), isCommonDenominatorTaught: false,
      isGreeting: false, isRollCall: false, isEnglish: false, isCorrectiveFeedback: false,
      systemPrompt: "", isSilent: true, silentReactions,
    };
  }

  // 4. Resolve teacher title + question context for the speaking pipeline
  const teacherInfo = extractTeacherTitleAndGender(teacherUtterance, recentHistory, voiceGender, lockedTeacherTitle, teacherFullName);
  const title = dialect === "saudi" ? teacherTitleForDialect(teacherInfo.title, "saudi") : teacherInfo.title;
  const cleanTitle = title.startsWith("يا ") ? title : `يا ${title}`;

  const isRedirectOrCalling =
    /(?:عايز[ةه]?|عاوز[ةه]?|محتاج[ةه]?|دور|فين|لا\s*عايز|يا\s*\w+\s*(?:جاوب|قول)|اتفضل|اتفضلي|تفضل|تفضلي)/i.test(teacherUtterance) ||
    intentAnalysis.intent === "permission_to_speak";

  const currentQuestionText =
    isRedirectOrCalling && lastTeacherUtterance
      ? `${lastTeacherUtterance} (${teacherUtterance})`
      : teacherUtterance;

  const qContext = extractQuestionContext(currentQuestionText);

  const allTeacherHistory = `${fullLessonHistory} ${teacherUtterance}`;
  const isCommonDenominatorTaught =
    /(?:مقام\s*مشترك|المقام\s*المشترك|توحيد\s*المقامات|نوحد\s*المقامات|المضاعف\s*المشترك|طرفين\s*في\s*وسطين|ضرب\s*المقص)/i.test(
      allTeacherHistory
    );

  const isGreeting = intentAnalysis.intent === "greeting";
  const isRollCall = intentAnalysis.intent === "roll_call";

  const isEnglish =
    !isGreeting &&
    !isRollCall &&
    /english|grammar|past\s*simple|verb|vocab|انجليزي|انجلش|جرامر|لغة\s*انجليزية|someone|give\s*me|example|tense|did|was|were|played|ate|drank|went/i.test(
      `${teacherUtterance} ${recentHistory}`
    );

  const isCorrectiveFeedback =
    /(?:مش\s*(?:صح|مضبوط|صحيح|كده)|مش\s*قوي|غلط|راجع\s*نفسك|فكر\s*تاني|ركز\s*شوية|ليه\s*قلت\s*كده|متأكد)/i.test(
      teacherUtterance
    );

  const systemPrompt = buildClassroomSwarmSystemPrompt(isGreeting ? null : lessonContext, dialect, saudiClassmates);

  return {
    dialect, saudiClassmates, studentBrains, intentAnalysis, decision,
    title, cleanTitle, isRedirectOrCalling, currentQuestionText, qContext,
    isCommonDenominatorTaught, isGreeting, isRollCall, isEnglish, isCorrectiveFeedback,
    systemPrompt, isSilent: false, silentReactions: null,
  };
}

/**
 * Deterministic instant replies for classroom conversational rituals
 * (greetings, blessings, attention checks, farewells). Shared by the
 * legacy and streaming pipelines — these NEVER call the LLM, so the
 * first audible response to "السلام عليكم" leaves the server in
 * milliseconds.
 */
export function ritualFastReply(
  intentAnalysis: ReturnType<typeof analyzeTeacherIntent>,
  teacherUtterance: string,
  dialect: Dialect,
  cleanTitle: string
): string | null {
  if (intentAnalysis.intent === "greeting") {
    if (dialect === "saudi") {
      if (/صباح\s*الخير/i.test(teacherUtterance)) {
        return `صباح الخير ${cleanTitle}! الحمد لله تمام.`;
      }
      if (/مساء\s*الخير/i.test(teacherUtterance)) {
        return `مساء الخير ${cleanTitle}!`;
      }
      if (/سلام/i.test(teacherUtterance)) {
        return `وعليكم السلام ${cleanTitle}! الحمد لله تمام.`;
      }
      if (/كيف\s*(?:حالكم|حالك|القلوب)|عاملين|اخباركم/i.test(teacherUtterance)) {
        return `الحمد لله ${cleanTitle} تمام، وأنت كيفك؟`;
      }
      if (/سامعيني|صوتي\s*واضح/i.test(teacherUtterance)) {
        return `أيوه ${cleanTitle} سامعينك واضح!`;
      }
      return `هلا ${cleanTitle}! الحمد لله تمام.`;
    }
    if (/صباح\s*الخير/i.test(teacherUtterance)) {
      return `صباح النور ${cleanTitle}! الحمد لله كويسين.`;
    }
    if (/مساء\s*الخير/i.test(teacherUtterance)) {
      return `مساء النور ${cleanTitle}!`;
    }
    if (/سلام/i.test(teacherUtterance)) {
      return `وعليكم السلام ${cleanTitle}! الحمد لله كويسين.`;
    }
    if (/عاملين\s*(?:ايه|إيه|اي)|ازيكم|ازيكو/i.test(teacherUtterance)) {
      return `الحمد لله ${cleanTitle} تمام، حضرتك عامل${cleanTitle.includes("ميس") ? "ة" : ""} إيه؟`;
    }
    if (/سامعيني|صوتي\s*واضح/i.test(teacherUtterance)) {
      return `أيوه ${cleanTitle} سامعين حضرتك كويس!`;
    }
    return `أهلاً ${cleanTitle}! الحمد لله كويسين.`;
  }

  if (intentAnalysis.intent === "religious_blessing") {
    return "عليه أفضل الصلاة والسلام.";
  }

  if (intentAnalysis.intent === "teacher_identity") {
    return `آسفين ${cleanTitle} خلاص حفظنا!`;
  }

  if (intentAnalysis.intent === "attention_check") {
    return dialect === "saudi"
      ? `معك ${cleanTitle} ومركّزين!`
      : `معاك${cleanTitle.includes("ميس") ? "ِ" : ""} ${cleanTitle} ومركزين!`;
  }

  if (intentAnalysis.intent === "session_farewell") {
    return dialect === "saudi"
      ? `مع السلامة ${cleanTitle}! شكراً لك.`
      : `مع السلامة ${cleanTitle}! شكراً لحضرتك.`;
  }

  return null;
}

export async function generateStudentReactions(params: {
  personas: Persona[];
  currentAttention: Record<string, number>;
  timesSpoken?: Record<string, number>;
  lastSpeakingPersonaId?: string | null;
  recentSpeakerPersonaIds?: string[];
  lastPhysicalActions?: Record<string, StudentPhysicalAction>;
  lastSpeakingStudentName?: string | null;
  greetingCompleted?: boolean;
  lastTeacherUtterance?: string | null;
  lessonContext: string | null;
  teacherUtterance: string;
  questionType: QuestionType;
  recentHistory: string;
  fullLessonHistory?: string;
  teacherExplanations?: string[];
  studentContributions?: Record<string, string[]>;
  studentsWithHandRaised?: string[];
  turnIndex?: number;
  voiceGender?: "male" | "female" | null;
  lockedTeacherTitle?: string | null;
  resolvedUnknownNames?: string[];
  teacherFullName?: string;
  dialect?: string;
  /** Actual classroom participant names — drives name-based routing. */
  participantNames?: string[];
  /** Master prompt §9 — living-classroom event line injected into this turn's LLM calls. */
  liveEventPrompt?: string | null;
}): Promise<StudentTurnResult[]> {
  const {
    personas,
    lessonContext,
    teacherUtterance,
    recentHistory,
    teacherExplanations = [],
    studentContributions = {},
    fullLessonHistory = "",
  } = params;

  const plan = buildTurnPlan(params);
  if (plan.isSilent) return plan.silentReactions!;

  const { dialect, saudiClassmates, studentBrains, intentAnalysis, decision, title, cleanTitle, currentQuestionText, qContext, isCommonDenominatorTaught, isGreeting, isCorrectiveFeedback, systemPrompt } = plan;

  // Single-Speaker Pipeline (Spec: Turn manager selects 0 or 1 speaker; only active candidate calls LLM, other 3 students silent in code)

  async function generateSpeechForCandidate(candidate: (typeof decision.candidateSpeakers)[0]): Promise<{ text: string; emotion: Emotion } | null> {
    // 1. Direct, instant, natural responses for classroom conversational rituals (Zero hallucination):
    const fast = ritualFastReply(intentAnalysis, teacherUtterance, dialect, cleanTitle);
    if (fast) return { text: fast, emotion: "neutral" as Emotion };

    const studentBrain = studentBrains.find((s) => s.personaId === candidate.personaId);
    const persona = personas.find((p) => p.id === candidate.personaId);

    const studentPrompt = buildCandidateStudentPrompt({
      studentName: candidate.name,
      age: studentBrain?.age ?? persona?.age ?? 10,
      understanding: studentBrain?.understanding ?? 75,
      confidence: studentBrain?.confidence ?? 70,
      emotion: candidate.spokenEmotion || "confident",
      reasonToSpeak: candidate.reasonToSpeak,
      lessonContext: isGreeting ? null : lessonContext,
      teacherUtterance,
      recentHistory: recentHistory.slice(-3500),
      currentQuestionText,
      targetConceptAspect: qContext.targetConceptAspect,
      teacherTitle: cleanTitle,
      isTargetStudent: true,
      activeMisconception: candidate.activeMisconception,
      teacherExplanations,
      studentContributions,
      fullLessonHistory,
      dialect,
      classmates: saudiClassmates,
    });

    const userPrompt =
      `${studentPrompt}\n\nرد بصيغة JSON فقط بهذا الشكل تماماً:\n{\n  "text": "كلام الطالب المنطوق هنا فقط — ابدأ قيمة text بوسم المشاعر [emotion: ...] ثم الكلام بعده"\n}` +
      (params.liveEventPrompt
        ? `\n${params.liveEventPrompt}\nتفاعل مع هذا الحدث داخل شخصيتك بشكل طبيعي (لو يخصك أو تلاحظه في الفصل) دون أن تترك الإجابة عن كلام المعلم.`
        : "");

    try {
      // Master prompt §4 — Claude Sonnet 4.5 via OpenRouter, Gemini 2.5
      // pro/flash as fallback chain; the emotion tag (§3) is parsed and
      // stripped here so neither the UI nor TTS ever sees/spells it.
      const completion = await openrouterChat({
        model: ROLEPLAY_MODEL,
        fallbacks: ROLEPLAY_FALLBACKS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        maxTokens: 150, // §4: short replies = realism + speed
      });

      const raw = completion.text ?? "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      if (typeof parsed.text === "string" && parsed.text.trim().length > 0) {
        const { emotion, clean } = parseEmotion(parsed.text.trim());
        if (clean.length > 0) return { text: clean, emotion };
      }
    } catch (err) {
      console.error(`Failed to generate speech for candidate student ${candidate.name}:`, err);
    }
    return null;
  }

  // Generate speech ONLY for candidate speaker(s) (never for silenced students)
  const candidateMap = new Map(decision.candidateSpeakers.map((c) => [c.personaId, c]));
  const spokenResults = new Map<string, { text: string; emotion: Emotion } | null>();

  if (decision.candidateSpeakers.length === 1) {
    const single = decision.candidateSpeakers[0];
    const spoken = await generateSpeechForCandidate(single);
    spokenResults.set(single.personaId, spoken);
  } else if (decision.candidateSpeakers.length > 1) {
    const entries = await Promise.all(
      decision.candidateSpeakers.map(async (c) => {
        const spoken = await generateSpeechForCandidate(c);
        return [c.personaId, spoken] as const;
      })
    );
    for (const [id, spoken] of entries) {
      spokenResults.set(id, spoken);
    }
  }

  return personas.map((p) => {
    const candidate = candidateMap.get(p.id);
    const updated = decision.updatedStudents.find((s) => s.personaId === p.id);
    const action = updated?.physicalAction ?? "attentive";
    const desc = updated?.actionDescriptionAr ?? getActionDescription(action, p.name);

    // Strictly enforce: if NOT in candidate speakers, MUST remain silent in code!
    if (!candidate || !candidate.shouldSpeak) {
      const newState =
        action === "hand_raised"
          ? "hand_raised"
          : action === "fidgeting" || action === "looking_away"
          ? "distracted"
          : "attentive";
      return {
        personaId: p.id,
        name: p.name,
        responded: false,
        text: null,
        newState,
        attentionDelta: updated?.attentionDelta ?? 0,
        physicalAction: action,
        actionDescriptionAr: desc,
      };
    }

    const spoken = spokenResults.get(p.id) || null;
    const rawText = spoken?.text ?? null;

    const isNumeratorDenominatorQuestion = /(?:فوق|تحت|بسط|مقام|اسمه\s*(?:ايه|إيه))/i.test(
      currentQuestionText
    );
    const isClimateLesson = /(?:مناخ|مناخي|طقس|جو|حرارة|احتباس|دفيئة|climate|greenhouse|غلاف\s*جوي)/i.test(
      `${currentQuestionText} ${lessonContext || ""}`
    );
    const isMatterStateQuestion =
      !isClimateLesson &&
      /(?:حالات\s*المادة|صلب\s*وسائل|البالون|البالونة|الهواء\s*مادة|المية\s*مادة)/i.test(
        currentQuestionText
      );

    const hasActiveMisconception = candidate.activeMisconception && !candidate.activeMisconception.isResolved;
    const hasResolvedMisconception = candidate.activeMisconception && candidate.activeMisconception.isResolved;

    // Saudi deterministic fallback — compact dialect-correct reply bank.
    const saudiDefaultFallback = (() => {
      if (intentAnalysis.intent === "session_farewell") return saudiReply("farewell", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.intent === "clarification_request") return saudiReply("clarification", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.intent === "teacher_apology") return saudiReply("teacher_apology", { personaName: p.name, title: cleanTitle });
      if (candidate.isDistracted) return saudiReply("distracted", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.intent === "attention_check") return saudiReply("attention_check", { personaName: p.name, title: cleanTitle });
      if (isGreeting) return saudiReply("greeting_generic", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.intent === "roll_call") return saudiReply("roll_call", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.intent === "open_discussion") return saudiReply("open_discussion", { personaName: p.name, title: cleanTitle });
      if (isCorrectiveFeedback) return saudiReply("corrective_feedback", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.intent === "permission_to_speak") return saudiReply("permission_to_speak", { personaName: p.name, title: cleanTitle });
      if (intentAnalysis.referencedStudentName) {
        return saudiReply("agree_with_peer", {
          personaName: p.name,
          title: cleanTitle,
          referencedStudentName: intentAnalysis.referencedStudentName,
        });
      }
      if (qContext.isWhyQuestion) return saudiReply("why_question", { personaName: p.name, title: cleanTitle });
      if (qContext.isComparison) return saudiReply("comparison", { personaName: p.name, title: cleanTitle });
      return saudiReply("direct_question", { personaName: p.name, title: cleanTitle });
    })();

    const defaultFallback = dialect === "saudi"
      ? saudiDefaultFallback
      : intentAnalysis.intent === "session_farewell"
        ? (p.name === "سارة" || p.name === "نور" ? `مع السلامة ${cleanTitle}!` : `باي ${cleanTitle} مع السلامة!`)
        : intentAnalysis.intent === "clarification_request"
        ? (p.name === "عمر"
            ? `قصدي بركة المية في الحوش ${cleanTitle} لما الشمس طلعت نشفتها، فهل ده برضه تبخر؟`
            : `قصدي ${cleanTitle} أوضح سؤالي عن النقطة دي في الدرس.`)
        : intentAnalysis.intent === "teacher_apology"
        ? (p.name === "سارة" || p.name === "نور"
            ? `ولا يهمك ${cleanTitle} عادي!`
            : `ولا يهمك ${cleanTitle} حصل خير!`)
        : candidate.isDistracted
        ? `ها؟ معلش ${cleanTitle} مكنتش مركز.. ممكن تعيد السؤال؟`
        : hasActiveMisconception && candidate.activeMisconception?.conceptKey === "air_cannot_be_contained"
        ? `المية بتاخد شكل الإناء ${cleanTitle}، بس الهواء مبيتحطش في حاجة خالص.`
        : hasResolvedMisconception && candidate.activeMisconception?.conceptKey === "air_cannot_be_contained"
        ? `الهواء مادة غازية ملوش شكل ثابت وبيملا البالونة ${cleanTitle}.`
        : hasActiveMisconception && candidate.activeMisconception?.conceptKey === "air_is_liquid_because_takes_shape"
        ? `الهواء سائل ${cleanTitle} عشان بياخد شكل البالونة زي المية؟`
        : hasResolvedMisconception && candidate.activeMisconception?.conceptKey === "air_is_liquid_because_takes_shape"
        ? `الهواء مادة غازية ${cleanTitle} وبيملا البالونة كلها.`
        : hasActiveMisconception && candidate.activeMisconception?.conceptKey === "water_cycle_skip_condensation"
        ? `المية بتسخن وتبقى بخار، وبعدين تمطر على طول ${cleanTitle}.`
        : hasResolvedMisconception && candidate.activeMisconception?.conceptKey === "water_cycle_skip_condensation"
        ? `المية بتتبخر وتعمل سحاب وبعدين تمطر ${cleanTitle}.`
        : qContext.hasUnlikeDenominators && !isCommonDenominatorTaught && qContext.fractions.length >= 2
        ? `مش عارف${p.name === "سارة" || p.name === "نور" ? "ة" : ""} ${cleanTitle} عشان المقامات مختلفة ومش زي بعض.. إزاي نقارنهم؟`
        : hasActiveMisconception && qContext.isComparison && qContext.fractions.length >= 2
        ? `الـ 2 على 6 أكبر ${cleanTitle}.`
        : hasResolvedMisconception && qContext.isComparison && qContext.fractions.length >= 2
        ? `الـ 5 على 6 أكبر ${cleanTitle} عشان بسطها أكبر والمقامات متساوية.`
        : intentAnalysis.intent === "attention_check"
        ? `أنا هجاوب ${cleanTitle}! سامعينك ومتابعين.`
        : isMatterStateQuestion
        ? (/(?:شكل).*(?:مية|ماء).*(?:هواء|هوا)|(?:فرق).*(?:مية|ماء).*(?:هواء|هوا)/i.test(currentQuestionText)
            ? `المية بتاخد شكل الإناء ${cleanTitle}، بس الهواء ملوش شكل ثابت وبيملا المكان.`
            : /(?:كتاب|صلب)/i.test(currentQuestionText)
            ? `الكتاب مادة صلبة ${cleanTitle} عشان شكله وحجمه ثابتين.`
            : /(?:مية|ماء|سائل)/i.test(currentQuestionText)
            ? `المية مادة سائلة ${cleanTitle} عشان بتاخد شكل الإناء.`
            : `الهواء مادة غازية ${cleanTitle} وبيملا المكان.`)
        : /(?:مناخ|مناخي|طقس|جو|حرارة|climate)/i.test(`${currentQuestionText} ${lessonContext || ""}`)
        ? (/(?:سمع|عارف|رأي|مفهوم|يعني|حد)/i.test(currentQuestionText)
            ? (p.name === "سارة"
                ? `أنا سمعت عنه ${cleanTitle}، إن درجات الحرارة بتزيد والطقس بيتغير!`
                : p.name === "عمر"
                ? `عارف ${cleanTitle}، الجو بيبقى حر أوي والجليد بيدوب!`
                : p.name === "ياسين"
                ? `أنا سمعت إن التلوث ودخان المصانع بيغير درجات الحرارة ${cleanTitle}.`
                : `هو يعني درجات الحرارة في كوكب الأرض بتعلى ${cleanTitle}؟`)
            : (p.name === "عمر"
                ? `عارف ${cleanTitle}، الجو بيبقى حر أوي والجليد في القطبين بيدوب!`
                : p.name === "سارة"
                ? `التغير المناخي بيأثر على درجات الحرارة والطقس في كوكبنا ${cleanTitle}.`
                : p.name === "ياسين"
                ? `أنا سمعت إن دخان المصانع والعربيات هو اللي بيسخن الجو ${cleanTitle}.`
                : `بيخلي الفصول والجو يتغيروا ومش عارفين نحافظ على البيئة ${cleanTitle}.`))
        : isNumeratorDenominatorQuestion
        ? `اللي فوق البسط واللي تحت المقام ${cleanTitle}.`
        : qContext.isWhyQuestion && qContext.fractions.length >= 2
        ? `عشان المقامات متساوية ${cleanTitle}، فبنبص على البسط والـ 4 أكبر من الـ 1.`
        : qContext.isWhyQuestion
        ? (p.name === "سارة"
            ? `عشان ده السبب الأساسي في تغير الظاهرة دي ${cleanTitle}.`
            : p.name === "عمر"
            ? `علشان في عوامل تانية بتأثر عليها ${cleanTitle}!`
            : `علشان دي النتيجة المباشرة ${cleanTitle}.`)
        : qContext.isComparison && qContext.fractions.length >= 2
        ? `الـ ${qContext.fractions[1]} أكبر ${cleanTitle}.`
        : intentAnalysis.intent === "permission_to_speak"
        ? (qContext.fractions.length >= 2
            ? `الـ ${qContext.fractions[1]} أكبر ${cleanTitle}.`
            : isNumeratorDenominatorQuestion
            ? `اللي فوق البسط واللي تحت المقام ${cleanTitle}.`
            : /(?:مناخ|مناخي|طقس|جو|حرارة|climate)/i.test(`${currentQuestionText} ${lessonContext || ""}`)
            ? (p.name === "سارة"
                ? `التغير المناخي بيأثر على درجات الحرارة والبيئة ${cleanTitle}.`
                : p.name === "عمر"
                ? `يعني الجو ودرجات الحرارة بتتغير في كل العالم ${cleanTitle}!`
                : `التغير المناخي بيسبب ظواهر جوية مختلفة ${cleanTitle}.`)
            : /(?:حالات\s*المادة|صلب\s*وسائل|البالون|البالونة|الهواء\s*مادة|المية\s*مادة|سائل|صلبة|غاز)/i.test(`${currentQuestionText} ${lessonContext || ""}`)
            ? (p.name === "سارة"
                ? `المية سائلة بتاخد شكل الإناء، بس الهواء غاز ${cleanTitle}.`
                : p.name === "عمر"
                ? `الهواء مادة غازية عشان بيملا المكان كله ${cleanTitle}!`
                : `المادة الصلبة شكلها وحجمها ثابتين ${cleanTitle}.`)
            : p.name === "سارة"
            ? `المفروض دي صيغة سؤال وبنطلب بيها معلومة ${cleanTitle}.`
            : p.name === "عمر"
            ? `يعني بنسأل عن حاجة ومستنيين إجابتها ${cleanTitle}!`
            : p.name === "ياسين"
            ? `ده سؤال واستفهام عشان نعرف إجابة ${cleanTitle}.`
            : `أنا شايفة إنه استفسار وسؤال ${cleanTitle}.`)
        : intentAnalysis.referencedStudentName
        ? (p.name === "سارة" || p.name === "نور"
            ? `أنا متفقة مع كلام ${intentAnalysis.referencedStudentName} ${cleanTitle}!`
            : `أنا متفق مع كلام ${intentAnalysis.referencedStudentName} ${cleanTitle}!`)
        : isGreeting
        ? `وعليكم السلام ${cleanTitle}!`
        : intentAnalysis.intent === "open_discussion"
        ? p.name === "عمر"
          ? `${cleanTitle} أنا ممكن أحكي عن ماتش الكورة؟`
          : p.name === "سارة"
          ? `${cleanTitle} ينفع أحكي موقف حصل معايا النهاردة؟`
          : p.name === "ياسين"
          ? `${cleanTitle} أنا عندي حاجة مضحكة حصلت امبارح!`
          : `${cleanTitle} رسمت رسمة جديدة وعايزة أوريها لحضرتك.`
        : isCorrectiveFeedback
        ? `مش صح ${cleanTitle}؟ طب إزاي؟`
        : /(?:حالات\s*المادة|صلب\s*وسائل|البالون|البالونة|الهواء\s*مادة|المية\s*مادة|سائل|صلبة|غاز)/i.test(`${currentQuestionText} ${lessonContext || ""}`)
        ? (p.name === "سارة"
            ? `المية بتاخد شكل الإناء ${cleanTitle}، بس الهواء ملوش شكل ثابت وبيملا المكان.`
            : p.name === "عمر"
            ? `الهواء مادة غازية ${cleanTitle} وبيملا المكان.`
            : `المادة الصلبة شكلها وحجمها ثابت ${cleanTitle}.`)
        : /(?:فوق|تحت|بسط|مقام)/i.test(`${currentQuestionText} ${lessonContext || ""}`)
        ? `اللي فوق البسط واللي تحت المقام ${cleanTitle}.`
        : p.name === "عمر"
        ? `يعني بنسأل عن حاجة ومستنيين إجابتها ${cleanTitle}!`
        : p.name === "سارة"
        ? `المفروض بنطلب معلومة مش عارفينها ${cleanTitle}.`
        : p.name === "ياسين"
        ? `ده سؤال واستفهام عشان نعرف إجابة ${cleanTitle}.`
        : `أنا شايفة إنه استفسار وسؤال ${cleanTitle}.`;

    const sanitized = rawText
      ? sanitizeStudentResponse(rawText, p.name, title, {
          isDistracted: candidate.isDistracted,
          unknownStudentName: intentAnalysis.unknownStudentName,
          isWhyQuestion: qContext.isWhyQuestion,
          isTeacherApology: intentAnalysis.intent === "teacher_apology",
          currentFractions: qContext.fractions,
          hasUnlikeDenominators: qContext.hasUnlikeDenominators,
          isCommonDenominatorTaught,
          activeMisconception: candidate.activeMisconception,
          isGreeting,
          teacherUtterance,
          dialect,
        })
      : null;
    const finalText = sanitized || defaultFallback;

    return {
      personaId: p.id,
      name: p.name,
      responded: true,
      text: finalText,
      newState: "attentive",
      attentionDelta: updated?.attentionDelta ?? 5,
      physicalAction: action,
      actionDescriptionAr: desc,
      // §3: the LLM's parsed emotion tag (English allowed set), falling
      // back to the plan's spokenEmotion when the deterministic ritual
      // path (no tag) served the reply.
      emotion: spoken?.emotion ?? candidate.spokenEmotion,
    };
  });
}

export function generateFallbackReactions(params: {
  personas: Persona[];
  teacherUtterance: string;
  recentHistory?: string;
  turnIndex?: number;
  lastPhysicalActions?: Record<string, StudentPhysicalAction>;
  greetingCompleted?: boolean;
  lastTeacherUtterance?: string | null;
  lastSpeakingStudentName?: string | null;
  lastSpeakingPersonaId?: string | null;
  recentSpeakerPersonaIds?: string[];
  timesSpoken?: Record<string, number>;
  studentsWithHandRaised?: string[];
  voiceGender?: "male" | "female" | null;
  lockedTeacherTitle?: string | null;
  resolvedUnknownNames?: string[];
  lessonContext?: string | null;
  fullLessonHistory?: string;
  teacherFullName?: string;
  dialect?: string;
  /** Actual classroom participant names — drives name-based routing. */
  participantNames?: string[];
}): StudentTurnResult[] {
  const {
    personas,
    teacherUtterance,
    turnIndex = 1,
    lastPhysicalActions = {},
    greetingCompleted = false,
    lastTeacherUtterance = null,
    lastSpeakingStudentName = null,
    lastSpeakingPersonaId = null,
    recentSpeakerPersonaIds = [],
    timesSpoken = {},
    recentHistory = "",
    studentsWithHandRaised = [],
    voiceGender = null,
    lockedTeacherTitle = null,
    resolvedUnknownNames = [],
    lessonContext = null,
    fullLessonHistory = "",
    teacherFullName,
    dialect: dialectInput,
    participantNames = [],
  } = params;

  const dialect = parseDialect(dialectInput);

  const studentBrains: StudentBrainState[] = personas.map((p) => {
    const spoken = timesSpoken[p.id] ?? 0;
    const brain = initializeStudentBrain(p.id, p.name, p.age, p.base_attention ?? 70, spoken, lessonContext);
    if (lastPhysicalActions[p.id]) {
      brain.physicalAction = lastPhysicalActions[p.id];
      brain.actionDescriptionAr = getActionDescription(brain.physicalAction, p.name);
    }
    return brain;
  });

  const intentAnalysis = analyzeTeacherIntent(teacherUtterance, {
    greetingCompleted,
    lastTeacherUtterance,
    recentHistory,
    lastSpeakingStudentName,
    studentsWithHandRaised,
    resolvedUnknownNames,
    lockedTeacherTitle,
    participantNames,
  });

  const decision = decideClassroomReaction(
    studentBrains,
    intentAnalysis,
    turnIndex,
    lastSpeakingPersonaId,
    recentSpeakerPersonaIds
  );
  const teacherInfo = extractTeacherTitleAndGender(teacherUtterance, recentHistory, voiceGender, lockedTeacherTitle, teacherFullName);
  const title = dialect === "saudi" ? teacherTitleForDialect(teacherInfo.title, "saudi") : teacherInfo.title;
  const cleanTitle = title.startsWith("يا ") ? title : `يا ${title}`;

  const candidateSpeakerMap = new Map(decision.candidateSpeakers.map((c) => [c.name, c]));
  const allTeacherHistory = `${fullLessonHistory} ${recentHistory} ${teacherUtterance}`;
  const isCommonDenominatorTaught =
    /(?:مقام\s*مشترك|المقام\s*المشترك|توحيد\s*المقامات|نوحد\s*المقامات|المضاعف\s*المشترك|طرفين\s*في\s*وسطين|ضرب\s*المقص)/i.test(
      allTeacherHistory
    );

  return personas.map((p) => {
    const candidate = candidateSpeakerMap.get(p.name);
    const updated = decision.updatedStudents.find((s) => s.personaId === p.id);
    const action = updated?.physicalAction ?? "attentive";
    const desc = updated?.actionDescriptionAr ?? getActionDescription(action, p.name);

    if (!candidate || !candidate.shouldSpeak) {
      const newState = action === "hand_raised" ? "hand_raised" : action === "fidgeting" || action === "looking_away" ? "distracted" : "attentive";
      return {
        personaId: p.id,
        name: p.name,
        responded: false,
        text: null,
        newState,
        attentionDelta: updated?.attentionDelta ?? 0,
        physicalAction: action,
        actionDescriptionAr: desc,
      };
    }

    const qContext = extractQuestionContext(teacherUtterance);
    const isWhyQuestion = qContext.isWhyQuestion;
    const isCorrective =
      /(?:مش\s*(?:صح|مضبوط|صحيح|كده)|مش\s*قوي|غلط|راجع\s*نفسك|فكر\s*تاني|ركز\s*شوية|ليه\s*قلت\s*كده|متأكد)/i.test(
        teacherUtterance
      );

    const cleanTitle = title.startsWith("يا ") ? title : `يا ${title}`;
    const hasActiveMisconception = candidate.activeMisconception && !candidate.activeMisconception.isResolved;
    const hasResolvedMisconception = candidate.activeMisconception && candidate.activeMisconception.isResolved;

    const fallbackText = dialect === "saudi"
      ? (() => {
          if (intentAnalysis.intent === "teacher_apology") return saudiReply("teacher_apology", { personaName: p.name, title: cleanTitle });
          if (candidate.isDistracted) return saudiReply("distracted", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "greeting") return saudiReply("greeting_salam", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "religious_blessing") return saudiReply("religious_blessing", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "teacher_identity") return saudiReply("teacher_identity", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "attention_check") return saudiReply("attention_check", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "roll_call") return saudiReply("roll_call", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "open_discussion") return saudiReply("open_discussion", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.intent === "permission_to_speak") return saudiReply("permission_to_speak", { personaName: p.name, title: cleanTitle });
          if (intentAnalysis.referencedStudentName) {
            return saudiReply("agree_with_peer", {
              personaName: p.name,
              title: cleanTitle,
              referencedStudentName: intentAnalysis.referencedStudentName,
            });
          }
          if (intentAnalysis.intent === "direct_question") {
            return isCorrective
              ? saudiReply("corrective_feedback", { personaName: p.name, title: cleanTitle })
              : qContext.isWhyQuestion
              ? saudiReply("why_question", { personaName: p.name, title: cleanTitle })
              : qContext.isComparison && qContext.fractions.length >= 2
              ? saudiReply("comparison", { personaName: p.name, title: cleanTitle })
              : saudiReply("direct_question", { personaName: p.name, title: cleanTitle });
          }
          return saudiReply("direct_question", { personaName: p.name, title: cleanTitle });
        })()
      : intentAnalysis.intent === "teacher_apology"
        ? (p.name === "سارة" || p.name === "نور"
            ? `ولا يهمك ${cleanTitle} عادي!`
            : `ولا يهمك ${cleanTitle} حصل خير!`)
        : candidate.isDistracted
        ? `ها؟ معلش ${cleanTitle} مكنتش مركز.. ممكن تعيد السؤال؟`
        : hasActiveMisconception && candidate.activeMisconception?.conceptKey === "air_cannot_be_contained"
        ? `المية بتاخد شكل الإناء ${cleanTitle}، بس الهواء مبيتحطش في حاجة خالص.`
        : hasResolvedMisconception && candidate.activeMisconception?.conceptKey === "air_cannot_be_contained"
        ? `الهواء مادة غازية ملوش شكل ثابت وبيملا البالونة ${cleanTitle}.`
        : hasActiveMisconception && candidate.activeMisconception?.conceptKey === "air_is_liquid_because_takes_shape"
        ? `الهواء سائل ${cleanTitle} عشان بياخد شكل البالونة زي المية؟`
        : hasResolvedMisconception && candidate.activeMisconception?.conceptKey === "air_is_liquid_because_takes_shape"
        ? `الهواء مادة غازية ${cleanTitle} وبيملا البالونة كلها.`
        : hasActiveMisconception && candidate.activeMisconception?.conceptKey === "water_cycle_skip_condensation"
        ? `المية بتسخن وتبقى بخار، وبعدين تمطر على طول ${cleanTitle}.`
        : hasResolvedMisconception && candidate.activeMisconception?.conceptKey === "water_cycle_skip_condensation"
        ? `المية بتتبخر وتعمل سحاب وبعدين تمطر ${cleanTitle}.`
        : qContext.hasUnlikeDenominators && !isCommonDenominatorTaught && qContext.fractions.length >= 2
        ? `مش عارف${p.name === "سارة" || p.name === "نور" ? "ة" : ""} ${cleanTitle} عشان المقامات مختلفة ومش زي بعض.. إزاي نقارنهم؟`
        : hasActiveMisconception && qContext.isComparison && qContext.fractions.length >= 2
        ? `الـ 2 على 6 أكبر ${cleanTitle}.`
        : hasResolvedMisconception && qContext.isComparison && qContext.fractions.length >= 2
        ? `الـ 5 على 6 أكبر ${cleanTitle} عشان بسطها أكبر والمقامات متساوية.`
        : intentAnalysis.intent === "greeting"
        ? `وعليكم السلام ${cleanTitle}!`
        : intentAnalysis.intent === "religious_blessing"
        ? "عليه الصلاة والسلام."
        : intentAnalysis.intent === "teacher_identity"
        ? `أهلاً بحضرتك ${cleanTitle}، خلاص حفظنا!`
        : intentAnalysis.intent === "attention_check"
        ? `أيوة ${cleanTitle}، سامعينك ومتابعين!`
        : /(?:مناخ|مناخي|طقس|جو|حرارة|climate)/i.test(`${teacherUtterance} ${lessonContext || ""}`)
        ? (p.name === "سارة"
            ? `أنا سمعت عنه ${cleanTitle}، إن درجات الحرارة بتزيد والطقس بيتغير!`
            : p.name === "عمر"
            ? `عارف ${cleanTitle}، الجو بيبقى حر أوي والجليد بيدوب!`
            : p.name === "ياسين"
            ? `أنا سمعت إن التلوث ودخان المصانع بيغير درجات الحرارة ${cleanTitle}.`
            : `هو يعني درجات الحرارة في كوكب الأرض بتعلى ${cleanTitle}؟`)
        : isWhyQuestion && qContext.fractions.length >= 2
        ? `عشان المقامات متساوية ${cleanTitle}، فبنبص على البسط والـ 4 أكبر من الـ 1.`
        : isWhyQuestion
        ? (p.name === "سارة"
            ? `عشان ده السبب الأساسي في الموضوع ده ${cleanTitle}.`
            : `علشان دي النتيجة المباشرة ${cleanTitle}.`)
        : qContext.isComparison && qContext.fractions.length >= 2
        ? `الـ ${qContext.fractions[1]} أكبر ${cleanTitle}.`
        : intentAnalysis.referencedStudentName
        ? (p.name === "سارة" || p.name === "نور"
            ? `أنا متفقة مع كلام ${intentAnalysis.referencedStudentName} ${cleanTitle}!`
            : `أنا متفق مع كلام ${intentAnalysis.referencedStudentName} ${cleanTitle}!`)
        : intentAnalysis.intent === "permission_to_speak"
        ? (/(?:مناخ|مناخي|طقس|جو|حرارة|climate)/i.test(`${teacherUtterance} ${lessonContext || ""}`)
            ? (p.name === "سارة"
                ? `التغير المناخي بيأثر على درجات الحرارة والبيئة ${cleanTitle}.`
                : `التغير المناخي بيغير درجات الحرارة والطقس في العالم ${cleanTitle}!`)
            : /(?:حالات\s*المادة|صلب\s*وسائل|البالون|البالونة|الهواء\s*مادة|المية\s*مادة|سائل|صلبة|غاز)/i.test(`${teacherUtterance} ${lessonContext || ""}`)
            ? (p.name === "سارة"
                ? `المية سائلة بتاخد شكل الإناء، بس الهواء غاز ${cleanTitle}.`
                : p.name === "عمر"
                ? `الهواء مادة غازية عشان بيملا المكان كله ${cleanTitle}!`
                : `المادة الصلبة شكلها وحجمها ثابتين ${cleanTitle}.`)
            : p.name === "سارة"
            ? `المفروض دي صيغة سؤال وبنطلب بيها معلومة ${cleanTitle}.`
            : p.name === "عمر"
            ? `يعني بنسأل عن حاجة ومستنيين إجابتها ${cleanTitle}!`
            : p.name === "ياسين"
            ? `ده سؤال واستفهام عشان نعرف إجابة ${cleanTitle}.`
            : `أنا شايفة إنه استفسار وسؤال ${cleanTitle}.`)
        : intentAnalysis.intent === "direct_question"
        ? isCorrective
          ? `مش صح ${cleanTitle}؟ طب إزاي؟`
          : (!/(?:مناخ|مناخي|طقس|جو|حرارة|احتباس|دفيئة|climate|greenhouse|غلاف\s*جوي)/i.test(`${teacherUtterance} ${lessonContext || ""}`) && /(?:حالات\s*المادة|صلب\s*وسائل|البالون|البالونة|الهواء\s*مادة|المية\s*مادة)/i.test(teacherUtterance))
          ? (/(?:شكل).*(?:مية|ماء).*(?:هواء|هوا)|(?:فرق).*(?:مية|ماء).*(?:هواء|هوا)/i.test(teacherUtterance)
              ? `المية بتاخد شكل الإناء ${cleanTitle}، بس الهواء ملوش شكل ثابت وبيملا المكان.`
              : /(?:كتاب|صلب)/i.test(teacherUtterance)
              ? `الكتاب مادة صلبة ${cleanTitle} عشان شكله وحجمه ثابتين.`
              : /(?:مية|ماء|سائل)/i.test(teacherUtterance)
              ? `المية مادة سائلة ${cleanTitle} عشان بتاخد شكل الإناء.`
              : `الهواء مادة غازية ${cleanTitle} وبيملا المكان.`)
          : /(?:فوق|تحت|بسط|مقام)/i.test(teacherUtterance)
          ? `اللي فوق البسط واللي تحت المقام ${cleanTitle}.`
          : p.name === "عمر"
          ? `يعني بنسأل عن حاجة ومستنيين إجابتها ${cleanTitle}!`
          : p.name === "سارة"
          ? `المفروض بنطلب معلومة مش عارفينها ${cleanTitle}.`
          : p.name === "ياسين"
          ? `ده سؤال واستفهام عشان نعرف إجابة ${cleanTitle}.`
          : `أنا شايفة إنه استفسار وسؤال ${cleanTitle}.`
        : intentAnalysis.intent === "roll_call"
        ? `أنا ${p.name}، عندي ${p.age} سنين وبحب ${p.name === "عمر" ? "الكورة" : p.name === "سارة" ? "الرسم" : p.name === "ياسين" ? "الألعاب" : "المذاكرة"} ${cleanTitle}!`
        : intentAnalysis.intent === "open_discussion"
        ? p.name === "عمر" ? `${cleanTitle} عايز أحكي عن ماتش الكورة!` : `${cleanTitle} ممكن أحكي حاجة حصلتلي؟`
        : `معاك ${cleanTitle}.`;

    return {
      personaId: p.id,
      name: p.name,
      responded: true,
      text: fallbackText,
      newState: "attentive" as const,
      attentionDelta: updated?.attentionDelta ?? 5,
      physicalAction: action,
      actionDescriptionAr: desc,
    };
  });
}
