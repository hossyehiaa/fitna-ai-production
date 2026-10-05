export type StudentPhysicalAction =
  | "attentive"         // منتبه ومتابع
  | "hand_raised"       // رافع إيده للمشاركة
  | "fidgeting"         // بيلعب بالقلم أو المسطرة
  | "looking_away"      // باصص في السقف أو الشباك ومشتت
  | "whispering"        // بيهمس أو بيتكلم مع زميله
  | "taking_notes"      // بيكتب ويسجل في الكشكول
  | "confused_head"     // بيهز راسه بحيرة أو مكشر
  | "nodding";          // بيهز راسه بفهم

export interface StudentBehavioralPolicy {
  interruptProbability: number;     // قابلية إنه يقاطع المعلم بحماس أو تسرع
  handRaiseProbability: number;     // ميله لرفع اليد عند طرح الأسئلة
  offTopicProbability: number;      // ميله للكلام الجانبي أو الكروي
  answerWhenUnsure: number;         // ميله للفتوى حتى لو مش متأكد من الإجابة
  shynessFactor: number;            // تردده قبل الكلام
}

export interface StudentMisconception {
  conceptKey: string;             // مثال: "fraction_comparison_numerator_vs_denominator"
  falseBeliefAr: string;           // مثال: "يظن أن 2/6 أكبر من 5/6 لأن الرقم 2 يأتي أولاً أو التباس البسط بالمقام"
  correctionNeeded: string;        // مثال: "تنبيه المعلم إلى تساوي المقامات ومقارنة البسط مباشرة"
  isResolved: boolean;
  turnIntroduced: number;
  turnResolved?: number;
}

export interface StudentBrainState {
  personaId: string;
  name: string;
  age: number;

  // 1. Dynamic Internal Psychological Matrix (0 - 100)
  attention: number;        // مدى تركيزه مع شرح المعلم الآن
  understanding: number;    // مدى استيعابه لموضوع الدرس المطروح
  confidence: number;       // شجاعته وجرأته في المشاركة
  energy: number;           // طاقته البدنية ونشاطه
  frustration: number;      // إحباطه أو ضيقه

  // 2. Behavioral Personality Policy
  policy: StudentBehavioralPolicy;

  // 3. Current Physical State in Class
  physicalAction: StudentPhysicalAction;
  actionDescriptionAr: string; // وصف بصري للحركة: "رافع إيده بسرعة"، "بيلعب بالقلم"

  // 4. Knowledge Graph for Current Lesson (Concept -> Understanding %)
  knowledgeGraph: Record<string, number>;

  // 5. Short-term Episodic Classroom Memory
  memory: Array<{
    turnIndex: number;
    interaction: "praised" | "scolded" | "called_on" | "ignored" | "encouraged";
    notes: string;
  }>;

  // 6. Speaking Turn Dynamics
  timesSpoken: number;
  lastTurnSpoke: number;

  // 7. Active Misconception State Machine
  activeMisconception?: StudentMisconception | null;
}

export interface ClassroomOverallState {
  noiseLevel: number;       // 0 - 100 (يزداد مع الهمس والتشتت)
  overallAttention: number; // متوسط انتباه الطلاب
  classroomMood: "engaged" | "energetic" | "distracted" | "tense" | "quiet";
  consecutiveTeacherStatements: number; // كام مرة المدرس اتكلم ورا بعض بدون ما يسأل
  resolvedUnknownNames?: string[];
  lockedTeacherTitle?: string | null;
}

export const BASE_STUDENT_POLICIES: Record<string, { policy: StudentBehavioralPolicy; baseKnowledge: number; defaultAction: StudentPhysicalAction }> = {
  "عمر": {
    policy: {
      interruptProbability: 0.30,
      handRaiseProbability: 0.75,
      offTopicProbability: 0.25,
      answerWhenUnsure: 0.75, // بيفتي لما يكون مش متأكد
      shynessFactor: 0.10,
    },
    baseKnowledge: 65,
    defaultAction: "attentive",
  },
  "سارة": {
    policy: {
      interruptProbability: 0.05,
      handRaiseProbability: 0.85,
      offTopicProbability: 0.02,
      answerWhenUnsure: 0.20, // حذرة ومش بتجاوب غير لما تكون متأكدة
      shynessFactor: 0.15,
    },
    baseKnowledge: 88,
    defaultAction: "taking_notes",
  },
  "ياسين": {
    policy: {
      interruptProbability: 0.35,
      handRaiseProbability: 0.50,
      offTopicProbability: 0.35, // بيحب الهزار والألعاب
      answerWhenUnsure: 0.50,
      shynessFactor: 0.10,
    },
    baseKnowledge: 75,
    defaultAction: "attentive",
  },
  "نور": {
    policy: {
      interruptProbability: 0.02,
      handRaiseProbability: 0.60,
      offTopicProbability: 0.05,
      answerWhenUnsure: 0.15, // هادية ومنضبطة
      shynessFactor: 0.30,
    },
    baseKnowledge: 50,
    defaultAction: "attentive",
  },
};

export function initializeStudentBrain(
  personaId: string,
  name: string,
  age: number,
  baseAttention: number = 70,
  timesSpoken: number = 0,
  lessonContext?: string | null
): StudentBrainState {
  const profile = BASE_STUDENT_POLICIES[name] || {
    policy: {
      interruptProbability: 0.20,
      handRaiseProbability: 0.50,
      offTopicProbability: 0.20,
      answerWhenUnsure: 0.50,
      shynessFactor: 0.20,
    },
    baseKnowledge: 65,
    defaultAction: "attentive" as StudentPhysicalAction,
  };

  const isFractionLesson = Boolean(lessonContext && /(?:كسر|كسور|fraction|بسط|مقام)/i.test(lessonContext));
  const isWaterCycleLesson = Boolean(lessonContext && /(?:دورة\s*(?:الماء|المية)|تبخر|تكاثف|هطول|سحاب|مطر|water\s*cycle)/i.test(lessonContext));
  const isMatterStateLesson = Boolean(lessonContext && /(?:حالات\s*المادة|صلب|سائل|غاز|شكل\s*ثابت|حجم\s*ثابت|بالونة|هواء|states\s*of\s*matter)/i.test(lessonContext));

  let initialMisconception: StudentMisconception | null = null;
  if (name === "نور" && isMatterStateLesson) {
    initialMisconception = {
      conceptKey: "air_is_liquid_because_takes_shape",
      falseBeliefAr: "تظن أن الهواء مادة سائلة لأنه يأخذ شكل الإناء أو البالونة كالماء",
      correctionNeeded: "توضيح أن الهواء غاز يأخذ شكل وحجم الحيز، وليس سائلاً لأن السائل حجمه ثابت",
      isResolved: false,
      turnIntroduced: 1,
    };
  } else if (name === "عمر" && isMatterStateLesson) {
    initialMisconception = {
      conceptKey: "air_cannot_be_contained",
      falseBeliefAr: "يظن أن الهواء لا يمكن وضعه في إناء أو وعاء ولا يأخذ شكلاً لأنه غير مرئي ولا يمسك باليد",
      correctionNeeded: "توضيح أن الهواء غاز يملأ البالونة والزجاجة وإطارات السيارات وينتشر ليأخذ شكلها",
      isResolved: false,
      turnIntroduced: 1,
    };
  } else if (name === "نور" && isFractionLesson) {
    initialMisconception = {
      conceptKey: "fraction_comparison_numerator_order",
      falseBeliefAr: "تظن أن 2/6 أكبر من 5/6 بالتباس أرقام البسط",
      correctionNeeded: "توضيح أن المقامات متساوية وبالتالي البسط الأكبر (5) يعني الكسر الأكبر",
      isResolved: false,
      turnIntroduced: 1,
    };
  } else if (name === "ياسين" && isWaterCycleLesson) {
    initialMisconception = {
      conceptKey: "water_cycle_skip_condensation",
      falseBeliefAr: "يظن أن الماء يسخن ويتبخر ثم يمطر مباشرة متناسياً مرحلة التكاثف وتكوّن السحب",
      correctionNeeded: "توضيح أن بخار الماء يصعد في الهواء البارد ليتكاثف ويكون السحاب أولاً قبل نزول المطر",
      isResolved: false,
      turnIntroduced: 1,
    };
  }

  return {
    personaId,
    name,
    age,
    attention: baseAttention,
    understanding: profile.baseKnowledge,
    confidence: Math.round(profile.baseKnowledge * 0.9),
    energy: 75,
    frustration: 10,
    policy: profile.policy,
    physicalAction: profile.defaultAction,
    actionDescriptionAr: getActionDescription(profile.defaultAction, name),
    knowledgeGraph: { "general_concept": profile.baseKnowledge },
    memory: [],
    timesSpoken,
    lastTurnSpoke: -1,
    activeMisconception: initialMisconception,
  };
}

export function getActionDescription(action: StudentPhysicalAction, name: string): string {
  const isFemale = name === "سارة" || name === "نور";
  switch (action) {
    case "hand_raised":
      return isFemale ? `${name} رافعة إيدها بهدوء ومستنية دورها` : `${name} رافع إيده بحماس ومستني يجاوب`;
    case "taking_notes":
      return isFemale ? `${name} بتكتب وتسجل في الكشكول` : `${name} بيكتب ويسجل في الكشكول`;
    case "fidgeting":
      return isFemale ? `${name} بتلعب بالقلم وسرحت شوية` : `${name} بيلعب بالقلم ومش مركز في الشرح`;
    case "looking_away":
      return isFemale ? `${name} باصة في السقف ومشتتة` : `${name} باصص في السقف ومشتت`;
    case "whispering":
      return isFemale ? `${name} بتهمس للي جنبها` : `${name} بيهمس للي جنبه`;
    case "confused_head":
      return isFemale ? `${name} باصة بحيرة ومش مستوعبة النقطة` : `${name} باصص بحيرة ومش مستوعب النقطة`;
    case "nodding":
      return isFemale ? `${name} بتهز راسها بفهم وتأييد` : `${name} بيهز راسه بفهم وتأييد`;
    case "attentive":
    default:
      return isFemale ? `${name} منتبهة ومتابعة في صمت` : `${name} منتبه ومتابع في صمت`;
  }
}
