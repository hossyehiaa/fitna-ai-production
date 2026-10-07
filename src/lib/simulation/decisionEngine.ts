import { StudentBrainState, StudentPhysicalAction, StudentMisconception, getActionDescription } from "./classroomState";

export type TeacherIntent =
  | "direct_question"       // سؤال أو توجيه لطالب محدد ("عمر هيقول لنا"، "يا سارة 3 في 5 بكام؟")
  | "open_inquiry"         // سؤال عام أو مفاهيمي للفصل ("ليه بنستخدم الماضي البسيط؟")
  | "volunteer_question"   // دعوة للتطوع والإجابة ("مين يعرف الإجابة؟")
  | "permission_to_speak"   // إذن بالكلام لطالب رافع إيده أو بطلب التفضل ("اتفضل"، "تفضل"، "قول"، "اتفضل يا عمر")
  | "clarification_request" // طلب المعلم من الطالب توضيح سؤاله أو فكرته ("مش فاهم قصدك"، "وضح سؤالك يا عمر")
  | "session_farewell"      // إنهاء الحصة وتوديع الطلاب ("الحصة خلصت"، "أشوفكم بكرة"، "مع السلامة")
  | "open_discussion"      // فتح نقاش ومشاركة حرة ("النهاردة فري... لو حد حابب يتكلم")
  | "roll_call"             // طلب مشاركة الجميع بالدور ("كل واحد يعرفني بنفسه")
  | "greeting"              // تحية وترحيب وتفقد أولي
  | "casual_conversation"   // كلام ودي بعد انتهاء التحية
  | "instruction_command"   // أمر إداري/تنظيمي ("افتحوا صفحة 20")
  | "explanation"           // شرح أو سرد أو قراءة
  | "praise"                // مدح وتشجيع ("برافو يا سارة"، "ممتاز")
  | "scolding"              // لوم أو أمر بالسكوت ("ركز يا ياسين"، "اسكتوا خالص")
  | "religious_blessing"    // الصلاة على النبي ("صلى الله عليه وسلم")
  | "teacher_identity"      // تصحيح صفة المعلم ("أنا مش مستر أنا ميس مريم")
  | "attention_check"       // تفقد تركيز وتفاعل الطلاب ("أنتم معايا؟"، "ممكن حد يرد عليا؟")
  | "unknown_student_called" // نداء على اسم غير موجود في الفصل ("يا طارق"، "اتفضلي يا طارق")
  | "teacher_apology"       // اعتذار المعلم أو تصحيحه لزلّة لسان أو التباس في الاسم ("معلش اتلخبطت في الاسم"، "أقصد سارة")
  | "repeated_statement";   // تكرار المعلم لنفس جملته السابقة

export interface TeacherAnalysisContext {
  greetingCompleted?: boolean;
  lastTeacherUtterance?: string | null;
  recentHistory?: string;
  lastSpeakingStudentName?: string | null;
  studentsWithHandRaised?: string[];
  lastHandRaiseIntent?: Record<string, string>;
  resolvedUnknownNames?: string[];
  lockedTeacherTitle?: string | null;
  /** Actual classroom participant names (routing uses persistent characters —
   *  Egyptian AND Saudi classes alike; never a hardcoded name list). */
  participantNames?: string[];
}

export interface TeacherAnalysis {
  intent: TeacherIntent;
  calledStudents: string[];      // أي طالب تم توجيه الكلام له أو ذكره بالاسم ("سارة"، "عمر")
  excludedStudents: string[];    // أي طالب طُلب منه التوقف أو السكوت أو طالب تم شكره وطلب المعلم "حد ثاني"
  targetStudentName: string | null;
  unknownStudentName?: string | null; // اسم طالب غير موجود في الفصل
  referencedStudentName?: string | null; // اسم زميل استشهد به المعلم وطلب البناء على كلامه ("زي ما عمر قال")
  conceptTaught: string | null;
  difficultyLevel: "easy" | "medium" | "hard";
  tone: "encouraging" | "neutral" | "strict";
  isCorrective?: boolean;
  /** True when the utterance is a social greeting/check-in («ازيك يا فهد»،
   * «كيفكم يا عيال؟») — such utterances ALWAYS get a warm reply, never
   * silence, never a fabricated answer to a nonexistent question. */
  isGreetingLike?: boolean;
}

export interface DecisionResult {
  candidateSpeakers: Array<{
    personaId: string;
    name: string;
    shouldSpeak: boolean;
    reasonToSpeak: string;
    spokenEmotion: "excited" | "confident" | "hesitant" | "confused" | "playful" | "apologetic";
    isDistracted?: boolean;
    activeMisconception?: StudentMisconception | null;
  }>;
  updatedStudents: Array<StudentBrainState & {
    attentionDelta: number;
    understandingDelta: number;
  }>;
  classroomEvent: {
    occurred: boolean;
    type: "whispering" | "distraction" | "hand_raised" | "applause" | "none";
    descriptionAr: string;
  } | null;
}

export const CLASSROOM_ROSTER = ["عمر", "سارة", "ياسين", "نور"] as const;
export type ClassroomStudent = (typeof CLASSROOM_ROSTER)[number];

export const COLLECTIVE_CLASS_TERMS = [
  "جماعة", "جماعه", "ياجماعة", "ياجماعه", "شباب", "ياشباب", "ولاد", "اولاد", "أولاد", "بنات",
  "شطار", "ابطال", "أبطال", "حلوين", "فصل", "ناس", "الناس", "باقيين", "الباقيين", "باقي", "الباقي",
  "كلكم", "كلنا", "الكل", "الجميع", "جميعا", "جميعاً", "معا", "سوا", "حد", "واحد", "أحد", "احد",
  "طلاب", "طلبة", "تلاميذ", "فريق", "مجموعة", "مجموعه",
  "طلابي", "يا طلابي", "ياطلابي", "طلبتي", "تلاميذي", "حبايبي", "ولادي", "بناتي"
];

function normalizeForComparison(s: string): string {
  return (s || "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[،,\.!؟?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRepeatedUtterance(current: string, previous?: string | null): boolean {
  if (!previous) return false;
  const c1 = normalizeForComparison(current);
  const c2 = normalizeForComparison(previous);
  if (c1.length < 4 || c2.length < 4) return false;
  return c1 === c2;
}

/** Social greetings & check-ins (singular + plural, whole-class or directed).
 * A repeated greeting is a VALID utterance to answer again — teachers repeat
 * greetings precisely when the class felt silent; answering beats silence. */
const GREETING_LIKE_RE =
  /(?<=^|[\s.,?!،؛:])(عامل\s*(?:ايه|إيه|اي)|عاملة\s*(?:ايه|إيه|اي)|عاملين\s*(?:ايه|إيه|اي)|ازيكم|ازيكو|ازيك|ازيكي|كيفك|كيفكم|كيف\s*حالك|كيف\s*حالكم|اخبارك|اخباركو|اخباركم|صباح\s*الخير|مساء\s*الخير|سلام\s*عليكم|السلام\s*عليكم|سلامو\s*عليكم|أهلاً|اهلا|هلا|مرحبا|مرحبتين|سامعيني|صوتي\s*واضح)(?=[\s.,?!،؛:]|$)/i;

function isGreetingLikeUtterance(normalizedClean: string): boolean {
  return GREETING_LIKE_RE.test(normalizedClean) && normalizedClean.split(/\s+/).length <= 15;
}

/**
 * 1. Rule & Semantic Intent Analyzer (Context-Aware, Preventing Repetition & Loops)
 */
function _analyzeTeacherIntentInternal(
  teacherText: string,
  context?: TeacherAnalysisContext
): TeacherAnalysis {
  const clean = (teacherText || "").replace(/[إأآا]/g, "ا").trim();

  const hasQuestionWord = /(?:مين|إيه|ايه|ليه|إزاي|ازاي|كام|كم|فين|منين|هل|قول|قولي|جاوب|جاوبي|حل)/i.test(clean);
  const hasStudentName = /(?:عمر|عمار|سار[ةه]|ياسين|نور)/i.test(clean);
  const greetingLike = isGreetingLikeUtterance(clean);

  // 1. Check Repeated Utterance (Teacher said virtually the same statement again, without naming a student or asking a question)
  // NOTE: a repeated GREETING is exempted — the class greets back again
  // (politely, maybe with a different wording) instead of going silent.
  if (!greetingLike && !hasStudentName && !hasQuestionWord && isRepeatedUtterance(teacherText, context?.lastTeacherUtterance)) {
    return {
      intent: "repeated_statement",
      calledStudents: [],
      excludedStudents: [],
      targetStudentName: null,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "neutral",
    };
  }

  // 2. Strict Silence Command
  if (/اسكتوا\s*خالص|محدش\s*يتكلم|سكوت\s*تام|هدوء\s*تام/i.test(clean)) {
    return {
      intent: "scolding",
      calledStudents: [],
      excludedStudents: ["عمر", "سارة", "ياسين", "نور"],
      targetStudentName: null,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "strict",
    };
  }

  // 3. Excluded Students Detection ("لا يا نور", "كفاية كده يا نور", "مش نور", "اقعدي يا نور", "وغير نور")
  const excludedStudents: string[] = [];
  if (/لا\s*يا\s*نور|كفاية\s*(كده\s*)?يا\s*نور|مش\s*نور|اقعدي\s*يا\s*نور|(?:و?غير|بدل)\s*(?:ك\s*يا\s*)?نور/i.test(clean)) excludedStudents.push("نور");
  if (/لا\s*يا\s*عمر|كفاية\s*(كده\s*)?يا\s*عمر|مش\s*عمر|اقعد\s*يا\s*عمر|(?:و?غير|بدل)\s*(?:ك\s*يا\s*)?عمر/i.test(clean)) excludedStudents.push("عمر");
  if (/لا\s*يا\s*سار[ةه]|كفاية\s*(كده\s*)?يا\s*سار[ةه]|مش\s*سار[ةه]|اقعدي\s*يا\s*سار[ةه]|(?:و?غير|بدل)\s*(?:ك\s*يا\s*)?سار[ةه]/i.test(clean)) excludedStudents.push("سارة");
  if (/لا\s*يا\s*ياسين|كفاية\s*(كده\s*)?يا\s*ياسين|مش\s*ياسين|اقعد\s*يا\s*ياسين|(?:و?غير|بدل)\s*(?:ك\s*يا\s*)?ياسين/i.test(clean)) excludedStudents.push("ياسين");

  // Asking someone else ("حد تاني", "حد غيرك", "غيرك"):
  const isAskingSomeoneElse =
    /حد\s*(?:تاني|ثاني|غير|مختلف|يضيف|يشارك|يشترك|يقدر|فاهم|فهم|يقول)|غير\s*(?:ياسين|عمر|سارة|نور)|حد\s*غيرك|غيرك|سيب\s*فرصة/i.test(clean);

  if (isAskingSomeoneElse) {
    if (/(?:برافو|براو|براهو|شاطر|شكرا|حلو)\s*(?:يا\s*)?ياسين/i.test(clean)) excludedStudents.push("ياسين");
    if (/(?:برافو|براو|براهو|شاطر|شكرا|حلو)\s*(?:يا\s*)?عمر/i.test(clean)) excludedStudents.push("عمر");
    if (/(?:برافو|براو|براهو|شاطر[ةه]|شكرا|حلو)\s*(?:يا\s*)?سار[ةه]/i.test(clean)) excludedStudents.push("سارة");
    if (/(?:برافو|براو|براهو|شاطر[ةه]|شكرا|حلو)\s*(?:يا\s*)?نور/i.test(clean)) excludedStudents.push("نور");

    // "حد غيرك" / "غيرك" refers to the student who just spoke!
    if (/حد\s*غيرك|غيرك/i.test(clean) && context?.lastSpeakingStudentName) {
      if (!excludedStudents.includes(context.lastSpeakingStudentName)) {
        excludedStudents.push(context.lastSpeakingStudentName);
      }
    }
  }

  // Third-person reference in classroom inquiry & collaborative scaffolding:
  // e.g. "حد فهم اللي نور قالته؟", "زي ما عمر قال", "رأيكم في كلام سارة", "مين يكمل على كلام عمر؟"
  let referencedStudentName: string | null = null;
  const peerReferenceRegex =
    /(?:اللي\s*قال(?:ه|ته)|زي\s*ما\s*(?:قال|قالت)|كلام|على\s*كلام|على\s*إجابة|يكمل\s*على|يضيف\s*على|متفق\s*مع|موافق\s*على|رأيكم\s*في)\s*(نور|عمر|سار[ةه]|ياسين)/gi;
  const thirdPersonMatches = Array.from(clean.matchAll(peerReferenceRegex));
  const directlyCalledVocatives = new Set(
    Array.from(clean.matchAll(/(?<=^|[\s.,?!،؛:؟])يا\s*(عمر|سار[ةه]|ياسين|نور)(?=[\s.,?!،؛:؟]|$)/gi)).map(m => m[1].startsWith("سار") ? "سارة" : m[1])
  );

  for (const m of thirdPersonMatches) {
    const raw = m[1];
    const sName = raw.startsWith("سار") ? "سارة" : raw;
    referencedStudentName = sName;
    // NEVER exclude a student if they are directly addressed with "يا فلان" or if the teacher asks their direct opinion!
    if (sName && !excludedStudents.includes(sName) && !directlyCalledVocatives.has(sName)) {
      excludedStudents.push(sName);
    }
  }

  // 3b0. Teacher Slip of the Tongue / Apology ("معلش اتلخبطت في الاسم", "أقصد سارة", "سوري اتلخبطت", "معلش يا سارة غلطت في الاسم")
  const isTeacherApology =
    /(?:معلش|سوري|عفوا[ً]?)\s*(?:يا\s*[\u0621-\u064A]+)?\s*.*?(?:اتلخبطت|لخبطت|غلطت|مكانش\s*قصدي|مكنش\s*قصدي|اقصد|أقصد)|(?:اتلخبطت|لخبطت|غلطت)\s*في\s*(?:الاسم|اسمك)|(?:اقصد|أقصد)\s*(?:يا\s*)?[\u0621-\u064A]+/i.test(clean);

  // Routing name bank: the ACTUAL participants in this classroom (Egyptian
  // four, Saudi four, or any future set) — provided by the caller from the
  // persisted persona records. Falls back to the original Egyptian four
  // only for legacy callers that pass no participants.
  const candidateNames =
    context?.participantNames && context.participantNames.length > 0
      ? context.participantNames
      : ["عمر", "سارة", "ياسين", "نور"];

  if (isTeacherApology) {
    const matchedStudent = candidateNames.find((n) =>
      new RegExp(`(?:يا\\s*)?${n === "سارة" ? "سار[ةه]" : n}`, "i").test(clean)
    ) || context?.lastSpeakingStudentName || null;

    return {
      intent: "teacher_apology",
      calledStudents: matchedStudent ? [matchedStudent] : [],
      excludedStudents: matchedStudent ? candidateNames.filter((n) => n !== matchedStudent) : [],
      targetStudentName: matchedStudent,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // 3b. Redirection & Exclusive Turn Enforcement ("أنا قلت ياسين اللي يجاوب", "لا عايزة ياسين يجاوب", "عايزة ياسين يقول لي", "ياسين اللي يجاوب", "بكلم ياسين", "سيب ياسين")
  // Teacher is reprimanding an out-of-turn answer and strictly directing the floor to the intended student.
  const redirectMatch =
    clean.match(/(?:أنا\s*)?(?:قلت|بقول|بسأل|بكلم|طلبت\s*من|سيب|سيبوا|خلي|خلوا|عايز[ةه]?|عاوز[ةه]?|محتاج[ةه]?|دور)\s*(?:يا\s*)?(عمر|سار[ةه]|ياسين|نور)/i) ||
    clean.match(/(عمر|سار[ةه]|ياسين|نور)\s*(?:اللي\s*(?:يجاوب|تجاوب|يتكلم|تتكلم|يقول|تقول)|هو\s*اللي|هي\s*اللي|بس(?!\s*(?:اتلخبطت|لخبطت|غلطت)))(?=[\s.,?!،؛:]|$)/i);

  if (redirectMatch) {
    const rawTarget = redirectMatch[1];
    const target = rawTarget.startsWith("سار") ? "سارة" : rawTarget;
    const allCandidates = ["عمر", "سارة", "ياسين", "نور"];
    const otherCandidates = allCandidates.filter((n) => n !== target);

    return {
      intent: "direct_question",
      calledStudents: [target],
      excludedStudents: otherCandidates,
      targetStudentName: target,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "strict",
    };
  }

  // 4. Teacher Identity / Title Correction ("أنا مش مستر أنا ميس مريم", "أنا مش ميس أنا مستر أحمد")
  const isTeacherIdentity =
    /(?:أنا|انا)\s*(?:مش|غير)\s*(?:مستر|استاذ|أستاذ)|(?:أنا|انا)\s*(?:ميس|مس|معلمة|استاذة)|اسمي\s*(?:ميس|مس)|مش\s*مستر\s*(?:انا|أنا)?\s*ميس|يا\s*ميس\s*مش\s*مستر|(?:أنا|انا)\s*(?:مش|غير)\s*(?:ميس|مس|ابلة|أبلة)|(?:أنا|انا)\s*(?:مستر|استاذ|أستاذ|معلم)|اسمي\s*(?:مستر|استاذ)|مش\s*ميس\s*(?:انا|أنا)?\s*مستر|يا\s*مستر\s*مش\s*ميس/i.test(clean);

  if (isTeacherIdentity) {
    return {
      intent: "teacher_identity",
      calledStudents: [],
      excludedStudents: [],
      targetStudentName: null,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // 4b. Attention / Presence / Liveness Check ("انتم معايا؟", "ممكن حد يرد عليا", "سامعيني؟", "ردوا عليا", "الباقيين فين؟")
  // Guard: If teacher asks a substantive question, that takes precedence over casual check-ins like "نركز مع بعض"
  const hasPedagogicalQuestion =
    /(?:عايز[ةه]?\s*أ?سأل|سؤال|يعني\s*إيه|يعني\s*ايه|بعمل\s*إيه|بعمل\s*ايه|إيه\s*رأيكم|ايه\s*رايكم|ليه|إزاي|ازاي|إيه|ايه|متى|أين|كيف|كم|هل)\b/i.test(clean) ||
    clean.includes("؟") || clean.includes("?");

  const isAttentionCheck =
    !hasPedagogicalQuestion &&
    /انتم\s*معايا|انتو\s*معايا|معايا(?:\s*يا\s*(?:شباب|ولاد|أولاد|جماعة|شطار))?|مركزين|سامعيني|صوتي\s*واضح|حد\s*يرد|ردوا\s*عليا|ممكن\s*حد\s*يرد|فينكم|انتو\s*فين|الباقيين\s*فين|الباقي\s*فين|فين\s*الباقيين|فين\s*الباقي|الكل\s*فين|شايفين|سامعين|مش\s*سامع|حد\s*يجاوب|محدش\s*بيجاوب|ما\s*حدش\s*يجاوب|حد\s*يجاوبني|ليه\s*محدش\s*(?:بيجاوب|جاوب|بيرد)|ليه\s*ما\s*حدش\s*(?:بيجاوب|جاوب|بيرد)/i.test(clean);

  if (isAttentionCheck) {
    return {
      intent: "attention_check",
      calledStudents: [],
      excludedStudents: [],
      targetStudentName: null,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // 4c. Called Students Detection (Must be directly addressed, not third-person reference)
  const calledStudents: string[] = [];
  for (const name of candidateNames) {
    if (excludedStudents.includes(name)) continue;

    const namePattern = name === "عمر" ? "(?:عمر|عمار)" : name === "سارة" ? "سار[ةه]" : name;

    // 1. Directive after name: "ياسين قولي", "ياسين قول لي", "ياسين يقول لي", "عمر جاوب", "سارة اتفضلي", "نور سامعاني"
    const isDirectiveAfter = new RegExp(
      `(?<=^|[\\s.,?!،؛:؟])${namePattern}\\s*(?:قول|قولي|قول\\s*لي|قولي\\s*لي|يقول|تقول|يقول\\s*لي|تقول\\s*لي|يشرح|تشرح|جاوب|جاوبي|اتفضل|اتفضلي|إيه\\s*رأيك|ايه\\s*رايك|معانا|سامعني|سمعني|سمعنا|سامعاني|انت|انتي|شايف|شايفة|ركز|ركزي)(?=[\\s.,?!،؛:؟]|$)`,
      "i"
    ).test(clean);

    // 2. Directive or inquiry before name: "إيه رأيك يا ياسين", "عايزة ياسين", "عاوز عمر", "قول يا عمر", "قولي يا نور", "اتفضل يا ياسين", "سؤال لسارة", "نسمع ياسين"
    const isDirectiveBefore = new RegExp(
      `(?<=^|[\\s.,?!،؛:؟])(?:قول|قولي|جاوب|جاوبي|اتفضل|اتفضلي|معانا|شايف|شايفة|ركز|ركزي|اسمع|نسمع|عاوز\\s*أ?سمع|عايز\\s*أ?سمع|عايز[ةه]?|عاوز[ةه]?|محتاج[ةه]?|حابب|حابة|نسأل|سؤال\\s*(?:لـ?|موجه\\s*لـ?)|دور|نبدأ\\s*بـ?|(?:إيه|ايه)?\\s*رأيك|رأيك\\s*(?:إيه|ايه)?|إيه\\s*رأي|ايه\\s*راي)\\s*(?:يا\\s*)?${namePattern}(?=[\\s.,?!،؛:؟]|$)`,
      "i"
    ).test(clean);

    // 3. Direct vocative: "يا ياسين"
    const isVocative = new RegExp(
      `(?<=^|[\\s.,?!،؛:؟])يا\\s*${namePattern}(?=[\\s.,?!،؛:؟]|$)`,
      "i"
    ).test(clean);

    // 4. Standalone name or sentence starter: "^[اسم]" or "[اسم]، ..."
    const isStarterOrAlone = new RegExp(
      `^\\s*${namePattern}(?=[\\s.,?!،؛:؟]|$)`,
      "i"
    ).test(clean);

    // 5. Name at end of utterance: "... ياسين"
    const isEnding = new RegExp(
      `(?<=^|[\\s.,?!،؛:؟])${namePattern}\\s*[.,?!،؛:؟]*$`,
      "i"
    ).test(clean);

    // 6. Name immediately after punctuation: "...؟ ياسين" or "...، يا سارة"
    const isAfterPunctuation = new RegExp(
      `(?<=[؟?.,!،؛:])\\s*(?:يا\\s*)?${namePattern}(?=[\\s.,?!،؛:؟]|$)`,
      "i"
    ).test(clean);

    // 7. Name followed by future action: "عمر هيقول لنا", "سارة تدينا مثال"
    const isAction = new RegExp(
      `(?<=^|[\\s.,?!،؛:؟])${namePattern}\\s*(?:هيقول|هتقول|هيشرح|هتشرح|يقول|تقول|يدينا|تدينا|يحل|تحل|يجاوب|تجاوب)(?=[\\s.,?!،؛:؟]|$)`,
      "i"
    ).test(clean);

    if (
      isDirectiveAfter ||
      isDirectiveBefore ||
      isVocative ||
      isStarterOrAlone ||
      isEnding ||
      isAfterPunctuation ||
      isAction
    ) {
      calledStudents.push(name);
    }
  }

  // If a single student was called, all other candidate students are strictly excluded!
  if (calledStudents.length === 1) {
    const singleTarget = calledStudents[0];
    for (const name of candidateNames) {
      if (name !== singleTarget && !excludedStudents.includes(name)) {
        excludedStudents.push(name);
      }
    }
  }

  // 4b2. Re-prompting to Answer the Question ("جاوب على السؤال", "جاوب السؤال", "حل المسألة", "قول الإجابة")
  // If teacher tells someone to answer the pending question and no explicit new student name was given:
  const isAnswerQuestionCommand =
    /(?:^|[\s.,?!،؛:])(?:جاوب|جاوبي|جاوبوا|قول|قولي|قولوا|حل|حلي|حلوا)\s*(?:على\s*)?(?:السؤال|المسأل[ةه]|المساله|المسأله|الإجاب[ةه]|الاجاب[ةه])(?:[\s.,?!،؛:]|$)/i.test(clean);

  if (isAnswerQuestionCommand && calledStudents.length === 0) {
    const target =
      context?.lastSpeakingStudentName ||
      (context?.studentsWithHandRaised && context.studentsWithHandRaised.length > 0
        ? context.studentsWithHandRaised[0]
        : null);
    if (target) {
      return {
        intent: "direct_question",
        calledStudents: [target],
        excludedStudents: candidateNames.filter((n) => n !== target),
        targetStudentName: target,
        conceptTaught: null,
        difficultyLevel: "easy",
        tone: "encouraging",
      };
    } else {
      return {
        intent: "open_inquiry",
        calledStudents: [],
        excludedStudents: [],
        targetStudentName: null,
        conceptTaught: null,
        difficultyLevel: "medium",
        tone: "neutral",
      };
    }
  }


  // 4b2. Permission to Speak / Floor Granting ("اتفضل"، "اتفضلي"، "تفضل"، "سامعك"، "نعم اتفضل"، "اتفضل يا عمر")
  // Only triggers for actual short floor-granting cues, NOT full questions ending in "قولي"
  const isShortFloorGrant = clean.split(/\s+/).length <= 8;
  const isGrantingPermission =
    isShortFloorGrant &&
    (/(?:^|[\s.,?!،؛:])(?:اتفضل|اتفضلي|تفضل|تفضلي|سامعك|سامعاك|اسمعك|كلي\s*آذان|تفضلوا|اتفضلوا|نعم\s*اتفضل)(?:[\s.,?!،؛:]|$)/i.test(clean) ||
     /^(?:قول|قولي|تفضل|اتفضل)\s*(?:يا\s*)?(?:عمر|سارة|نور|ياسين)?$/i.test(clean) ||
     /^(?:نعم|ايوه|أيوة)\s*(?:يا\s*)?(?:عمر|سارة|نور|ياسين)?$/i.test(clean));

  if (isGrantingPermission) {
    let target = calledStudents.length > 0 ? calledStudents[0] : null;
    if (!target && context?.studentsWithHandRaised && context.studentsWithHandRaised.length > 0) {
      target = context.studentsWithHandRaised[0];
    }
    return {
      intent: "permission_to_speak",
      calledStudents: target ? [target] : [],
      excludedStudents: target ? candidateNames.filter((n) => n !== target) : excludedStudents,
      targetStudentName: target,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  const targetStudentName = calledStudents.length === 1 ? calledStudents[0] : null;

  // 4b4. Session Farewell / Dismissal ("يلا الحصة خلصت", "أشوفكم الحصة الجاية", "مع السلامة يا أولاد", "كفاية كده النهاردة")
  const isFarewell =
    /(?:الحصة\s*خلصت|كفاية\s*كده\s*النهاردة|أشوفكم\s*(?:بكرة|الحصة\s*الجاية|المرة\s*الجاية)|اشوفكم\s*(?:بكرة|الحصة\s*الجاية|المرة\s*الجاية)|مع\s*السلامة|باي\s*يا|باي\s*باي|سلام\s*يا\s*(?:ولاد|شباب|شطار)|كده\s*خلصنا\s*(?:درس\s*)?النهاردة|خلصنا\s*خلاص)/i.test(clean);

  if (isFarewell) {
    return {
      intent: "session_farewell",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // 4b5. Clarification Request from Teacher ("مش فاهم قصدك", "مش فاهمة سؤالك يا عمر", "وضح سؤالك", "قصدك إيه؟", "إيه علاقة ده بالدرس؟")
  const isClarification =
    /(?:مش\s*فاهم[ةه]?\s*(?:قصدك|سؤالك|كلامك|تقصد|تقصدي)|وضح\s*(?:اكتر|أكتر|سؤالك|قصدك|كلامك|ايه\s*قصدك)|وضحي\s*(?:اكتر|أكتر|سؤالك|قصدك|كلامك)|تقصد\s*(?:ايه|إيه)|تقصدي\s*(?:ايه|إيه)|قصدك\s*(?:ايه|إيه)|ايه\s*علاقة\s*ده)/i.test(clean);

  if (isClarification) {
    const target =
      calledStudents[0] ||
      context?.lastSpeakingStudentName ||
      targetStudentName ||
      null;

    return {
      intent: "clarification_request",
      calledStudents: target ? [target] : calledStudents,
      excludedStudents: target ? candidateNames.filter((n) => n !== target) : excludedStudents,
      targetStudentName: target,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "neutral",
    };
  }

  // 4b6. DIRECTED GREETING OVERRIDE («ازيك يا فهد» / «كيفك يا ريم؟» /
  // «صباح الخير يا سلطان») — a greeting that names a student is STILL a
  // greeting: the called student greets back warmly. This MUST run BEFORE
  // the generic direct-call branch below, or every directed greeting gets
  // processed with question machinery and answered with a fabricated
  // «أعتقد الجواب كذا...» (the exact production bug report).
  if (greetingLike) {
    return {
      intent: context?.greetingCompleted ? "casual_conversation" : "greeting",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // Direct Call to Specific Student (Teacher named someone specifically!)
  if (calledStudents.length > 0) {
    return {
      intent: "direct_question",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "neutral",
    };
  }

  // 5. Roll Call / Whole-Class Participation (Only if actively requested now)
  const isRollCall =
    (/(?:عايز|عاوز|حابب|ياريت|ممكن)\s*(?:كل\s*واحد|كلكم)\s*(?:يعرفني|يعرفنا|يقول)/i.test(clean) ||
     /كل\s*واحد\s*(?:يعرفني|يعرفنا|يقول\s*اسمه|بالدور)/i.test(clean) ||
     /عرفوني\s*بنفسكم|عرفونا\s*بنفسكم/i.test(clean)) &&
    !/شكرا\s*(انكم|إنكم|انكو)?\s*عرفتوني/i.test(clean);

  if (isRollCall) {
    return {
      intent: "roll_call",
      calledStudents,
      excludedStudents,
      targetStudentName: null,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "neutral",
    };
  }

  // 6. Open Discussion / Personal Sharing ("النهاردة فري... لو حد حابب يتكلم في أي حاجة")
  const isOpenDiscussion =
    /النهارد[ةه]\s*فري|نقاش\s*مفتوح|درس\s*مفتوح|حص[ةه]\s*مفتوح[ةه]|مواضيع\s*عام[ةه]|اي\s*حاج[ةه]|أي\s*حاج[ةه]|اي\s*مواضيع|أي\s*مواضيع|التكلم\s*في|يحكيها|احكوا|عنده\s*مشكل[ةه]|حكايات|قص[ةه]|يومكم|يومه|فضفض|عايزين\s*تتكلموا|حابين\s*تتكلموا|لو\s*حد\s*حابب\s*(يتكلم|يحكي)|حد\s*عايز\s*(يتكلم|يحكي)|احكي|احكوا\s*لي/i.test(clean);

  if (isOpenDiscussion) {
    return {
      intent: "open_discussion",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "encouraging",
    };
  }

  // 7. Volunteer Question ("مين يعرف الإجابة؟" / "حد عنده اي اضافة؟" / "حد حابب يشارك؟" / "مين يكمل على كلام عمر؟")
  const isVolunteerQuestion =
    /مين\s*(يعرف|يقول|يجاوب|يكمل|شاطر|يقدر|مستعد|حابب|عايز|عاوز|يشارك|يشترك|فاهم|فهم|فيهم)|حد\s*(يعرف|يقدر|يقول|يجاوب|يكمل|يشارك|يشترك|حابب|عايز|عاوز|فاهم|فهم|فيهم|عارف|عنده|مش\s*فاهم|يرد|يضيف)|(?:غير|بدل)\s*(?:ياسين|عمر|سارة|نور).*?(?:يشارك|يشترك|يتكلم|يقول|حابب)|يشارك\s*(تاني|ثاني)|اضاف[ةه]|اي\s*اضاف[ةه]|اي\s*سؤال|حاج[ةه]\s*تاني[ةه]|حد\s*عنده\s*(?:اي\s*)?(?:اضاف[ةه]|سؤال|فكر[ةه]|تعليق|راي|رأي|كلام)|حد\s*حابب\s*(?:يضيف|يسال|يسأل|يشارك|يقول)|ممكن\s*حد\s*(?:يرد|يجاوب|يشارك|يقول)|who\s*knows|who\s*can|anyone\s*knows/i.test(clean);

  if (isVolunteerQuestion) {
    return {
      intent: "volunteer_question",
      calledStudents,
      excludedStudents,
      targetStudentName,
      referencedStudentName: referencedStudentName || null,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "neutral",
    };
  }

  // 8. Greetings, Social Check-ins & Audio Checks (Pure greetings & audio tests)
  // NOTE: covers BOTH whole-class greetings («ازيكم يا عيال») and DIRECTED
  // greetings («ازيك يا فهد» / «كيفك يا ريم؟») — a directed greeting is still
  // a greeting, never a question to answer. Singular forms (ازيك/كيفك/اخبارك/
  // عامل ايه) are as common as the plural ones in real classrooms.
  const isPureGreeting = greetingLike;

  if (isPureGreeting) {
    if (context?.greetingCompleted) {
      return {
        intent: "casual_conversation",
        calledStudents,
        excludedStudents,
        targetStudentName,
        conceptTaught: null,
        difficultyLevel: "easy",
        tone: "encouraging",
      };
    }
    return {
      intent: "greeting",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // 9. Religious Blessing / Invocation ("صلى الله عليه وسلم" / "عليه الصلاة والسلام")
  const isReligiousBlessing =
    /(?<=^|[\s.,?!،؛:])(صلى\s*الله\s*عليه\s*وسلم|عليه\s*الصلاة\s*والسلام|سيدنا\s*محمد|نبينا\s*محمد|رسول\s*الله)(?=[\s.,?!،؛:]|$)/i.test(clean);

  if (isReligiousBlessing) {
    return {
      intent: "religious_blessing",
      calledStudents,
      excludedStudents,
      targetStudentName: null,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "neutral",
    };
  }

  // 10. Open Inquiry (Pedagogical question to the class)
  const isOpenInquiry =
    /[؟?]|\b(what|why|how|where|which)\b/i.test(clean) ||
    /(?<=^|[\s.,?!،؛:])(ليه|ازاي|إزاي|فين|منين|كام|كم|ايه|إيه|مين|انهي|أنهي|ايهم|أيهم|ماذا\s*لو|ماذا|ماهو|ما\s*هو|ما\s*هي|تفتكروا|شايفين|مثال|يديني|اكبر|أكبر|اصغر|أصغر|يساوي|بيساوي|تساوي|بتساوي)(?=[\s.,?!،؛:]|$)/i.test(clean) ||
    /(?:مين\s*(?:أكبر|اكبر|أصغر|اصغر|فيهم|شاطر|يقول|يعرف|يجاوب|يحل))/i.test(clean) ||
    /(?:اسمه\s*(?:ايه|إيه)|يعني\s*(?:ايه|إيه)|ده\s*(?:ايه|إيه)|شاطر\s*يقول)/i.test(clean);

  if (isOpenInquiry) {
    return {
      intent: "open_inquiry",
      calledStudents,
      excludedStudents,
      targetStudentName,
      referencedStudentName: referencedStudentName || null,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "neutral",
    };
  }

  // 10. Instruction Command ("افتحوا صفحة 20")
  if (/افتحوا|بصوا|اكتبوا|طلعوا|صفحة|الكتاب|الكشكول|اقرأ|اقرؤوا/i.test(clean)) {
    return {
      intent: "instruction_command",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "neutral",
    };
  }

  // 11. Praise & Thanks (only if not asking someone else)
  if (/شاطر|شاطر[ةه]|ممتاز|برافو|كويس\s*قوي|احسنت|أحسنت|عظيم|حلو\s*جدا|شكرا|شكراً|thank\s*you|thanks|good\s*job|well\s*done/i.test(clean) && !isAskingSomeoneElse) {
    return {
      intent: "praise",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "easy",
      tone: "encouraging",
    };
  }

  // 12. Scolding (Word-boundary sensitive to avoid matching "البسيط")
  if (/(?:^|\s)(غلط|مش\s*صح|ركز|ركزوا|بس|اسكت|اسكتوا|اقعد|اقعدوا|متقاطعش|انتبه|انتبهوا)(?:\s|[،,\.!؟?]|$)/i.test(clean)) {
    return {
      intent: "scolding",
      calledStudents,
      excludedStudents,
      targetStudentName,
      conceptTaught: null,
      difficultyLevel: "medium",
      tone: "strict",
    };
  }

  // 13. General Explanation / Classroom Lecture (Default for statements/explanations)
  return {
    intent: "explanation",
    calledStudents,
    excludedStudents,
    targetStudentName,
    conceptTaught: null,
    difficultyLevel: "medium",
    tone: "neutral",
  };
}

/** Intents whose teacher utterance is NOT a question — the student should
 * react naturally (greet back, acknowledge, comply) and must NEVER invent
 * an answer. Consumed by the persona prompt builders. */
export const NON_QUESTION_INTENTS: ReadonlySet<string> = new Set([
  "greeting",
  "casual_conversation",
  "attention_check",
  "religious_blessing",
  "session_farewell",
  "roll_call",
  "teacher_identity",
  "teacher_apology",
  "praise",
  "scolding",
  "instruction_command",
  "repeated_statement",
]);

export function analyzeTeacherIntent(
  teacherText: string,
  context?: TeacherAnalysisContext
): TeacherAnalysis {
  const result = _analyzeTeacherIntentInternal(teacherText, context);
  const clean = (teacherText || "").replace(/[إأآا]/g, "ا").trim();
  result.isCorrective = /(?:مش\s*(?:صح|مضبوط|صحيح|كده)|مش\s*قوي|غلط|راجع|فكر\s*تاني|ركز|ليه\s*قلت|لا\s*يا|متأكد|المقامات\s*متساوية|البسط\s*الأكبر|الـ?\s*5\s*أكبر)/i.test(clean);
  // Social greeting/check-in marker — consulted by the decision engine and
  // the deterministic reply bank so greetings NEVER trigger silence or a
  // fabricated answer-to-nothing.
  result.isGreetingLike = isGreetingLikeUtterance(clean);
  return result;
}

/**
 * 2. The Core Behavioral Orchestration Engine:
 * Separates behavioral decisions from language generation.
 * Enforces: Silence is a valid action. No round-robin. 0 to 1 speakers normally.
 */
export function decideClassroomReaction(
  students: StudentBrainState[],
  analysis: TeacherAnalysis,
  turnIndex: number,
  lastSpeakingPersonaId: string | null = null,
  recentSpeakerPersonaIds: string[] = []
): DecisionResult {
  const updatedStudents: DecisionResult["updatedStudents"] = [];
  const candidateSpeakers: DecisionResult["candidateSpeakers"] = [];

  function isRecent(s: StudentBrainState): boolean {
    return s.personaId === lastSpeakingPersonaId || recentSpeakerPersonaIds.includes(s.personaId);
  }

  function evaluateMisconception(s: StudentBrainState): StudentMisconception | null {
    if (!s.activeMisconception) return null;
    const misc = s.activeMisconception;
    if (misc.isResolved) return misc;

    const isTeacherCorrection =
      Boolean(analysis.isCorrective) ||
      analysis.tone === "strict" ||
      analysis.intent === "scolding";

    if (isTeacherCorrection && (analysis.calledStudents.length === 0 || analysis.calledStudents.includes(s.name))) {
      return {
        ...misc,
        isResolved: true,
        turnResolved: turnIndex,
      };
    }
    return misc;
  }


  // 1b. Scolding with all excluded / Strict Silence Command ("اسكتوا خالص")
  if (analysis.intent === "scolding" && analysis.excludedStudents.length >= 4) {
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers: [], updatedStudents, classroomEvent: null };
  }

  // 1c. Session Farewell ("يلا الحصة خلصت مع السلامة يا أولاد") -> Students give natural Egyptian farewells
  if (analysis.intent === "session_farewell") {
    // Pick 1 or 2 polite students to say goodbye (Sara and Omar)
    const speaker1 = students.find((s) => s.name === "سارة") || students[0];
    const speaker2 = students.find((s) => s.name === "عمر") || students[1];
    const speakers = [speaker1, speaker2].filter(Boolean);

    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      const isSpeaker = speakers.some((sp) => sp.personaId === copy.personaId);
      if (isSpeaker) {
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: `المعلم أعلن نهاية الحصة وودع الفصل. يرد ${copy.name} بتحية الوداع الطبيعية بأدب واختصار كطفل مدرسي ('مع السلامة يا ميس!' أو 'شكراً يا مستر!') دون حماس مصطنع.`,
          spokenEmotion: "confident",
        });
      }
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 1d. Clarification Request ("مش فاهم قصدك يا عمر وضح سؤالك")
  if (analysis.intent === "clarification_request") {
    const lastSpeakingStudent = lastSpeakingPersonaId
      ? students.find((s) => s.personaId === lastSpeakingPersonaId)
      : null;

    let target = analysis.targetStudentName
      ? students.find((s) => s.name === analysis.targetStudentName && !analysis.excludedStudents.includes(s.name))
      : null;
    if (!target && lastSpeakingStudent) {
      target = lastSpeakingStudent;
    }
    if (!target) {
      target = students[0];
    }

    for (const student of students) {
      const copy = { ...student };
      const isTarget = target && copy.personaId === target.personaId;
      if (isTarget) {
        copy.physicalAction = "attentive";
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: `المعلم طلب من ${copy.name} توضيح سؤاله أو قصده السابق. يوضح الطالب فكرته السابقة باختصار شديد وعفوية كطفل في المدرسة (مثلاً توضيح سؤاله عن بركة المية في الحوش أو مفهوم الدرس) دون الخروج عن الموضوع.`,
          spokenEmotion: "hesitant",
        });
      } else {
        copy.physicalAction = "attentive";
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 1d. Teacher Apology / Slip of the Tongue ("معلش يا سارة اتلخبطت في الاسم")
  if (analysis.intent === "teacher_apology") {
    const target = (analysis.targetStudentName
      ? students.find((s) => s.name === analysis.targetStudentName)
      : null) || students[0];

    for (const student of students) {
      const copy = { ...student };
      const isTarget = target && copy.personaId === target.personaId;
      if (isTarget) {
        copy.physicalAction = "attentive";
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: `المعلم اعتذر أو أوضح عفوياً أنه أخطأ في الاسم ("اتلخبطت في الاسم"). يرد ${copy.name} بعفوية طفل مهذب وطبيعي تماماً ("ولا يهمك يا ميس عادي!" أو "حصل خير يا مستر!")، وممنوع منعاً باتاً لغة خدمة العملاء أو "في خدمة المدام" أو أي روبوتية.`,
          spokenEmotion: "playful",
        });
      } else {
        copy.physicalAction = "attentive";
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 2. Direct Question to Specific Student ("يا سارة، إيه رأيك؟")
  if (analysis.intent === "direct_question" && analysis.targetStudentName) {
    const target = students.find((s) => s.name === analysis.targetStudentName && !analysis.excludedStudents.includes(s.name));
    for (const student of students) {
      const copy = { ...student };
      const isTarget = target && copy.personaId === target.personaId;
      let attentionDelta = 5;
      let understandingDelta = 0;

      if (isTarget) {
        const wasDistracted = student.physicalAction === "fidgeting" || student.physicalAction === "looking_away";
        copy.physicalAction = "attentive";
        attentionDelta = 15;
        understandingDelta = 5;
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        copy.activeMisconception = evaluateMisconception(copy);
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: wasDistracted
            ? `المعلم نادى على ${copy.name} وهو كان مشتتاً وسرحاناً وغير منتبه! يتفاجأ ويرتبك ويسأل المعلم أن يعيد السؤال`
            : `المعلم وجه السؤال أو الحديث لـ ${copy.name} بالاسم ليجيب باختصار وعفوية كطفل في المدرسة (جملة أو جملتان فقط دون محاضرات).`,
          spokenEmotion: wasDistracted ? "confused" : copy.name === "عمر" ? "excited" : "confident",
          isDistracted: wasDistracted,
          activeMisconception: copy.activeMisconception ?? null,
        });
      } else {
        copy.physicalAction = copy.name === "نور" || copy.name === "سارة" ? "taking_notes" : "attentive";
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta, understandingDelta });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 2b. Permission to Speak ("اتفضل يا عمر" / "اتفضل" / "تفضل" لطالب رافع إيده)
  if (analysis.intent === "permission_to_speak") {
    let target = analysis.targetStudentName
      ? students.find((s) => s.name === analysis.targetStudentName && !analysis.excludedStudents.includes(s.name))
      : null;

    if (!target) {
      target = students.find((s) => s.physicalAction === "hand_raised" && !analysis.excludedStudents.includes(s.name));
    }
    if (!target) {
      target = students.find((s) => !analysis.excludedStudents.includes(s.name)) || students[0];
    }

    for (const student of students) {
      const copy = { ...student };
      const isTarget = target && copy.personaId === target.personaId;
      let attentionDelta = 10;
      let understandingDelta = 5;

      if (isTarget) {
        const wasDistracted = student.physicalAction === "fidgeting" || student.physicalAction === "looking_away";
        copy.physicalAction = "attentive"; // lowers hand now that they are speaking
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        copy.activeMisconception = evaluateMisconception(copy);
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: `المعلم أذن لـ ${copy.name} بالتحدث ('اتفضل'). الطالب يجيب فوراً وبشكل مباشر على سؤال المعلم المطروح باختصار وعفوية كطفل عمره 10 سنوات (جملة أو جملتان فقط دون الاكتفاء بقول 'أنا جاهز' أو 'نعم').`,
          spokenEmotion: copy.name === "عمر" ? "excited" : "confident",
          isDistracted: wasDistracted,
          activeMisconception: copy.activeMisconception ?? null,
        });
      } else {
        copy.physicalAction = copy.name === "نور" || copy.name === "سارة" ? "taking_notes" : "attentive";
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta, understandingDelta });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 3. Roll Call ("كل واحد يعرفني بنفسه") -> All 4 introduce themselves briefly
  if (analysis.intent === "roll_call") {
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.timesSpoken += 1;
      copy.lastTurnSpoke = turnIndex;
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      candidateSpeakers.push({
        personaId: copy.personaId,
        name: copy.name,
        shouldSpeak: true,
        reasonToSpeak: "المعلم طلب مشاركة الجميع بالدور للتعريف بأنفسهم",
        spokenEmotion: copy.name === "عمر" ? "excited" : copy.name === "ياسين" ? "playful" : "confident",
      });
      updatedStudents.push({ ...copy, attentionDelta: 10, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 4. Greeting (First greeting only: exactly 1 student responds naturally to avoid echo)
  if (analysis.intent === "greeting") {
    const eligible = students.filter((s) => !analysis.excludedStudents.includes(s.name));
    // A DIRECTED greeting («ازيك يا فهد») is answered by the addressed
    // student; an open greeting («ازيكم يا عيال») by سارة (or first eligible).
    const greeter =
      eligible.find((s) => analysis.calledStudents.includes(s.name)) ||
      eligible.find((s) => s.name === "سارة") ||
      eligible[0];

    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      const isGreeter = greeter && copy.personaId === greeter.personaId;

      if (isGreeter) {
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "رد التحية والسلام بأدب وعفوية",
          spokenEmotion: "confident",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 10, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 4b. Religious Blessing ("صلى الله عليه وسلم") -> 1 student says "عليه الصلاة والسلام" respectfully
  if (analysis.intent === "religious_blessing") {
    const eligible = students.filter((s) => !analysis.excludedStudents.includes(s.name));
    const speaker = eligible.find((s) => s.name === "سارة") || eligible[0];
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      if (speaker && copy.personaId === speaker.personaId) {
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "الصلاة على النبي بأدب واحترام",
          spokenEmotion: "confident",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 4c. Teacher Identity Correction ("أنا مش مستر أنا ميس مريم") -> 1 student politely apologizes & greets correctly
  if (analysis.intent === "teacher_identity") {
    const eligible = students.filter((s) => !analysis.excludedStudents.includes(s.name));
    const speaker = eligible.find((s) => s.name === "ياسين") || eligible.find((s) => s.name === "سارة") || eligible[0];
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      if (speaker && copy.personaId === speaker.personaId) {
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "الاعتذار للمعلم أو المعلمة بأدب والترحيب باللقب والاسم الصحيح العفوي",
          spokenEmotion: "apologetic",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 10, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 4d. Attention / Liveness Check ("أنتم معايا؟", "ممكن حد يرد عليا؟") -> 1 student immediately confirms with enthusiasm!
  if (analysis.intent === "attention_check") {
    const eligible = students.filter((s) => !analysis.excludedStudents.includes(s.name));
    const firstResponder = eligible.find((s) => s.name === "عمر") || eligible.find((s) => s.name === "سارة") || eligible[0];
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      if (firstResponder && copy.personaId === firstResponder.personaId) {
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "تأكيد الحضور والانتباه والاستماع والتفاعل الفوري مع المعلم",
          spokenEmotion: "excited",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 10, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 5. Casual Conversation (Greeting already finished) -> Students listen attentively, 0 speakers
  // EXCEPTION: a social check-in / re-greeting («ازيك يا فهد» after the
  // opening «السلام عليكم») is NOT small talk to ignore — the addressed
  // student (or one warm student) replies. Silence here was the root cause
  // of "the class feels deaf" on follow-up greetings.
  if (analysis.intent === "casual_conversation" && analysis.isGreetingLike) {
    const socialTarget =
      students.find(
        (s) => analysis.calledStudents.includes(s.name) && !analysis.excludedStudents.includes(s.name)
      ) ||
      students.find((s) => !isRecent(s) && !analysis.excludedStudents.includes(s.name)) ||
      students.find((s) => !analysis.excludedStudents.includes(s.name));
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      const isSpeaker = socialTarget && copy.personaId === socialTarget.personaId;
      if (isSpeaker) {
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "رد ودّي على اهتمام المعلم بحاله",
          spokenEmotion: "confident",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  if (analysis.intent === "casual_conversation") {
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers: [], updatedStudents, classroomEvent: null };
  }

  // 6. Open Discussion ("النهاردة فري... لو حد حابب يتكلم") -> AT MOST 1 SPEAKER!
  if (analysis.intent === "open_discussion") {
    const nonRecent = students.filter((s) => !isRecent(s) && !analysis.excludedStudents.includes(s.name));
    const pool = nonRecent.length > 0 ? nonRecent : students.filter((s) => !analysis.excludedStudents.includes(s.name));

    const weights: Record<string, number> = {
      "سارة": 40,
      "عمر": 35,
      "ياسين": 20,
      "نور": 5,
    };
    const totalWeight = pool.reduce((sum, s) => sum + (weights[s.name] || 20), 0);
    let rand = Math.random() * totalWeight;
    let chosen = pool[0];
    for (const s of pool) {
      rand -= weights[s.name] || 20;
      if (rand <= 0) {
        chosen = s;
        break;
      }
    }

    for (const student of students) {
      const copy = { ...student };
      const isChosen = chosen && copy.personaId === chosen.personaId;
      let attentionDelta = 5;
      let understandingDelta = 0;

      if (isChosen) {
        copy.physicalAction = "attentive";
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        attentionDelta = 10;
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "مشاركة فكرة أو قصة في النقاش المفتوح",
          spokenEmotion: copy.name === "عمر" ? "excited" : copy.name === "ياسين" ? "playful" : "confident",
        });
      } else {
        if (copy.name === "سارة") copy.physicalAction = "hand_raised";
        else if (copy.name === "نور") copy.physicalAction = "taking_notes";
        else copy.physicalAction = "attentive";
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta, understandingDelta });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 7. Volunteer Question ("مين يعرف الإجابة؟" / "حد حابب يشارك؟") -> AT MOST 1 SPEAKER!
  if (analysis.intent === "volunteer_question") {
    // 1. Prioritize student whose hand is ALREADY raised from the previous turn!
    const handRaisedCandidate = students.find(
      (s) =>
        s.physicalAction === "hand_raised" &&
        !analysis.excludedStudents.includes(s.name) &&
        !isRecent(s)
    );

    // 2. Otherwise pick from eligible volunteers (not excluded, not recent)
    const eligiblePool = students.filter(
      (s) => !analysis.excludedStudents.includes(s.name) && !isRecent(s)
    );

    const chosen =
      handRaisedCandidate ||
      eligiblePool.find((s) => s.name === "سارة") ||
      eligiblePool.find((s) => s.name === "عمر") ||
      eligiblePool[0];

    for (const student of students) {
      const copy = { ...student };
      const isChosen = chosen && copy.personaId === chosen.personaId;
      let attentionDelta = 5;
      let understandingDelta = 0;

      if (isChosen) {
        copy.physicalAction = "attentive";
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        attentionDelta = 10;
        understandingDelta = 5;
        copy.activeMisconception = evaluateMisconception(copy);
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: analysis.referencedStudentName
            ? `المعلم طلب البناء أو التعليق على ما قاله زميله (${analysis.referencedStudentName}). ${copy.name} يتفاعل ويؤيد أو يضيف على فكرة زميله بالعامية المصرية.`
            : "التطوع والمشاركة بحماس في إجابة أو نقاش المعلم",
          spokenEmotion: copy.name === "عمر" ? "excited" : "confident",
          activeMisconception: copy.activeMisconception ?? null,
        });
      } else {
        if (copy.name === "سارة" && !analysis.excludedStudents.includes("سارة") && !isRecent(copy)) {
          copy.physicalAction = "hand_raised";
        } else if (copy.name === "نور") {
          copy.physicalAction = "taking_notes";
        } else {
          copy.physicalAction = "attentive";
        }
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta, understandingDelta });
    }
    return {
      candidateSpeakers,
      updatedStudents,
      classroomEvent: null,
    };
  }

  // 8. Open Inquiry (Pedagogical question to class) -> AT MOST 1 SPEAKER
  if (analysis.intent === "open_inquiry") {
    // 1. Strict priority to student who ALREADY has hand raised from the previous turn!
    // Enforces State Machine: RAISED_HAND -> WAITING -> SELECTED -> SPEAKING
    const handRaisedCandidate = students.find(
      (s) => s.physicalAction === "hand_raised" && !analysis.excludedStudents.includes(s.name)
    );

    const nonRecent = students.filter((s) => !isRecent(s) && !analysis.excludedStudents.includes(s.name));
    const pool = nonRecent.length > 0 ? nonRecent : students.filter((s) => !analysis.excludedStudents.includes(s.name));
    const chosen = handRaisedCandidate || pool[0];

    for (const student of students) {
      const copy = { ...student };
      const isChosen = chosen && copy.personaId === chosen.personaId;
      let attentionDelta = 5;
      let understandingDelta = 5;

      if (isChosen) {
        copy.physicalAction = "attentive"; // lowers hand now that they are speaking
        copy.timesSpoken += 1;
        copy.lastTurnSpoke = turnIndex;
        attentionDelta = 10;
        copy.activeMisconception = evaluateMisconception(copy);
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: analysis.referencedStudentName
            ? `المعلم طلب البناء أو التعليق على ما قاله زميله (${analysis.referencedStudentName}). ${copy.name} يتفاعل ويؤيد أو يضيف على فكرة زميله بالعامية المصرية.`
            : handRaisedCandidate
            ? `${copy.name} كان رافع إيده ومستني دوره ويشرح الآن إجابته للمعلم`
            : "التفكير والمشاركة في إجابة سؤال المعلم",
          spokenEmotion: copy.name === "عمر" ? "excited" : "confident",
          activeMisconception: copy.activeMisconception ?? null,
        });
      } else {
        copy.physicalAction = copy.name === "نور" || copy.name === "سارة" ? "taking_notes" : "attentive";
      }
      copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
      updatedStudents.push({ ...copy, attentionDelta, understandingDelta });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 9. Repeated Statement (Teacher repeated themselves) -> 0 speakers, students look puzzled
  if (analysis.intent === "repeated_statement") {
    for (const student of students) {
      const copy = { ...student, physicalAction: "confused_head" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("confused_head", copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 0, understandingDelta: 0 });
    }
    return { candidateSpeakers: [], updatedStudents, classroomEvent: null };
  }

  // 10. Instruction Command ("افتحوا صفحة 20") -> Silent compliance / taking notes, 0 speakers
  if (analysis.intent === "instruction_command") {
    for (const student of students) {
      const copy = { ...student, physicalAction: "taking_notes" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("taking_notes", copy.name);
      updatedStudents.push({ ...copy, attentionDelta: 5, understandingDelta: 0 });
    }
    return { candidateSpeakers: [], updatedStudents, classroomEvent: null };
  }

  // 11. Praise ("برافو يا سارة") -> Targeted student says brief thanks, or 0 speakers if general
  if (analysis.intent === "praise") {
    const target = analysis.targetStudentName ? students.find((s) => s.name === analysis.targetStudentName) : null;
    // NO SILENT TURNS: general praise ("أحسنتم جميعاً") gets a brief
    // acknowledgement from the CURRENT speaker (or the most attentive
    // student) — the teacher always sees that the class reacted.
    const ackTarget =
      target ||
      students.find((s) => s.personaId === lastSpeakingPersonaId) ||
      [...students].sort((a, b) => b.attention - a.attention)[0] ||
      null;
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      if (ackTarget && copy.personaId === ackTarget.personaId) {
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: target
            ? "شكر المعلم على التشجيع والمدح"
            : "شكر المعلم نيابةً عن الفصل على تشجيع الجميع (رد قصير ومهذب)",
          spokenEmotion: "excited",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 10, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 12. Scolding ("ركز يا ياسين") -> Targeted student apologizes, or 0 speakers if general
  if (analysis.intent === "scolding") {
    const target = analysis.targetStudentName ? students.find((s) => s.name === analysis.targetStudentName) : null;
    for (const student of students) {
      const copy = { ...student, physicalAction: "attentive" as StudentPhysicalAction };
      copy.actionDescriptionAr = getActionDescription("attentive", copy.name);
      if (target && copy.personaId === target.personaId) {
        candidateSpeakers.push({
          personaId: copy.personaId,
          name: copy.name,
          shouldSpeak: true,
          reasonToSpeak: "الاعتذار للمعلم والالتزام بالتركيز",
          spokenEmotion: "apologetic",
        });
      }
      updatedStudents.push({ ...copy, attentionDelta: 10, understandingDelta: 0 });
    }
    return { candidateSpeakers, updatedStudents, classroomEvent: null };
  }

  // 13. Explanation / Lecture -> SILENCE IS GOLDEN: 0 speakers!
  // Students listen attentively, take notes, and sometimes raise hand if curious or have a question!
  const shouldSomeoneRaiseHand = turnIndex >= 2 && Math.random() < 0.45;
  const handRaiserName = shouldSomeoneRaiseHand ? (Math.random() < 0.5 ? "سارة" : "عمر") : null;

  for (const student of students) {
    const copy = { ...student };
    if (handRaiserName && copy.name === handRaiserName && !analysis.excludedStudents.includes(copy.name)) {
      copy.physicalAction = "hand_raised";
    } else if (copy.name === "سارة" || copy.name === "نور") {
      copy.physicalAction = "taking_notes";
    } else if (copy.name === "ياسين" && turnIndex > 4 && Math.random() < 0.20) {
      copy.physicalAction = "fidgeting";
    } else {
      copy.physicalAction = "attentive";
    }
    copy.actionDescriptionAr = getActionDescription(copy.physicalAction, copy.name);
    const attentionDelta = copy.physicalAction === "fidgeting" ? -5 : 5;
    const understandingDelta = 5;
    updatedStudents.push({ ...copy, attentionDelta, understandingDelta });
  }

  return {
    candidateSpeakers: [], // Silence during explanation: NO robotic chatbot acknowledgements!
    updatedStudents,
    classroomEvent: null,
  };
}
