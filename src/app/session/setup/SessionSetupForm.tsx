"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOutAction } from "@/app/(auth)/login/actions";
import { resolveCharacter } from "@/lib/characters/registry";
import { useTranslation } from "@/lib/i18n/context";
import { X, GraduationCap, UserCheck, MessageSquare, Globe, Sparkles } from "lucide-react";

type Topic = { id: string; title_ar: string; title_en: string | null };
type Persona = {
  id: string;
  name: string;
  age: number;
  base_attention: number;
  strengths: string[];
  weaknesses: string[];
  dialect?: string;
};

type ClassroomStyle = "balanced" | "disruptive" | "disengaged";
type TrainingObjective = "socratic_focus" | "talk_time_reduction" | "inclusive_engagement" | "behavior_redirection";
type ClassroomDialect = "egyptian" | "saudi";

// ---------------------------------------------------------------------
// Ready-made lesson templates — a first-time teacher can start a full
// simulation with ONE tap instead of writing a lesson from scratch.
// Each template fills a realistic, misconception-rich lesson summary the
// simulation engine already knows how to dramatize (fractions comparison,
// water cycle, parts of speech...).
// ---------------------------------------------------------------------
const LESSON_TEMPLATES = [
  {
    id: "fractions",
    chipTitle: "جمع وطرح الكسور — رياضيات",
    topicTitle: "جمع وطرح الكسور ذات المقامات المختلفة — سادس ابتدائي",
    summary:
      "الدرس: جمع وطرح الكسور ذات المقامات المختلفة (سادس ابتدائي).\nأهداف الدرس: الطالب يوحد المقامات باستخدام المضاعف المشترك الأصغر ثم يجمع ويطرح الكسور الاعتيادية.\nالمفاهيم المفتاحية: البسط والمقام، الكسر المتكافئ، توحيد المقامات، المضاعف المشترك الأصغر.\nتسلسل الشرح: (١) مراجعة سريعة: كسور متكافئة بضرب البسط والمقام في نفس العدد. (٢) مثال محلول: ١/٢ + ١/٣ نوحّد المقام إلى ٦ فتصبح ٣/٦ + ٢/٦ = ٥/٦. (٣) تمرين صفّي: ٢/٣ + ١/٤، وطرح: ٣/٤ − ١/٦. (٤) خرائط ونماذج بصرية لتقسيم قطعة كيك لشرح لماذا يجب تساوي المقامات قبل الجمع.\nأسئلة مقترحة للفصل: ليه بنوحّد المقامات قبل الجمع؟ إيه الفرق بين البسط والمقام؟ مين أكبر ٢/٦ ولا ٥/٦ وليه؟\nأخطاء متوقعة من الطلاب: جمع البسطين والمقامين مباشرة (١/٢ + ١/٣ = ٢/٥)، مقارنة الكسور بالبسط فقط.",
  },
  {
    id: "water-cycle",
    chipTitle: "دورة الماء — علوم",
    topicTitle: "دورة الماء في الطبيعة — رابع ابتدائي",
    summary:
      "الدرس: دورة الماء في الطبيعة (رابع ابتدائي).\nأهداف الدرس: الطالب يصف مراحل دورة الماء (التبخر ← التكاثف ← الهطول ← الجريان) ويفهم أن كمية الماء على الأرض ثابتة تتغير حالتها فقط.\nالمفاهيم المفتاحية: التبخر، بخار الماء، التكاثف، السحب، الهطول (مطر/ثلج/بَرَد)، الجريان السطحي.\nتسلسل الشرح: (١) تجربة استهلال: كوب ماء في الشمس — فين المية بعد يومين؟ (٢) شرح التبخر بمصادر حياة: ملابس تنشف، بركة مية بتقل. (٣) التكاثف: مرآة الحمام البخارية، قطرات على كوب الشاي. (٤) السحب والهطول ثم رجوع المية للبحار والأنهار.\nأسئلة مقترحة: إيه اللي بيحصل لمية البحر في الجوّ الحر؟ إزاي بتتكون السحب؟ هو المية بتخلص من الأرض يوم؟\nأخطاء متوقعة: الطالب يعتقد إن المية بتطلع للسما وتمطر على طول بدون تكاثف، أو إن المطر مية جديدة مش نفس مية البحر.",
  },
  {
    id: "grammar",
    chipTitle: "المفعول به — لغة عربية",
    topicTitle: "المفعول به وعلامات نصبه — خامس ابتدائي",
    summary:
      "الدرس: المفعول به وعلامات نصبه (خامس ابتدائي).\nأهداف الدرس: الطالب يحدد المفعول به في الجملة ويميزه عن الفاعل والمبتدأ والخبر، ويعرف علامات نصبه (الفتحة، الألف للأسماء الخمسة، الياء للمثنى وجمع المذكر السالم).\nالمفاهيم المفتاحية: الجملة الفعلية، الفاعل، المفعول به، النصب، الأسماء الخمسة.\nتسلسل الشرح: (١) أمثلة استنتاجية: «شرب الولدُ اللبنَ» — مين اللي شرب؟ ومين اللي اتشرب منه؟ (٢) قاعدة: المفعول به اسم منصوب يدل على من وقع عليه فعل الفاعل. (٣) تدريبات إعراب على السبورة: «زار أحمدُ جدهُ»، «رأيت الفائزَين». (٤) تمييز الفاعل من المفعول بتغيير مواضع الكلام.\nأسئلة مقترحة: عرّف المفعول به، أعرب: «فهمت الدرسَ»، فرّق بين الفاعل والمفعول به في «ساعد محمدٌ خالدًا».\nأخطاء متوقعة: الخلط بين الفاعل والمفعول به، نسيان علامة النصب في الأسماء الخمسة.",
  },
  {
    id: "english",
    chipTitle: "Past Simple — إنجليزي",
    topicTitle: "The Past Simple Tense — أول إعدادي",
    summary:
      "الدرس: The Past Simple Tense (أول إعدادي).\nObjectives: Students form and use the past simple with regular (-ed) and common irregular verbs, in affirmative, negative (didn't) and question (Did...?) forms.\nKey language: went, ate, drank, saw, played, visited, didn't, Did you...?, yesterday, last week, ago.\nتسلسل الشرح: (١) Warm-up story: ماذا فعلت أمس؟ (٢) Regular verbs: play → played. (٣) Irregular verbs: go → went, eat → ate. (٤) Negative: I didn't play. (٥) Questions: Did you play? Yes, I did.\nأسئلة مقترحة: Give three irregular verbs in the past. Turn «She eats apples» into the past. Make a question with «Did».\nأخطاء متوقعة: استخدام did مع الفعل في الماضي (Did you went?)، نسيان الـ -ed مع الأفعال المنتظمة، إثبات ed على الأفعال الشاذة.",
  },
  {
    id: "climate",
    chipTitle: "التغير المناخي — دراسات",
    topicTitle: "التغير المناخي وأثره على كوكب الأرض — خامس ابتدائي",
    summary:
      "الدرس: التغير المناخي وأثره (خامس ابتدائي).\nأهداف الدرس: الطالب يفرّق بين الطقس والمناخ، يذكر أسباب التغير المناخي (الغازات الدفيئة، حرق الوقود، إزالة الغابات) ويقترح سلوكيات لحماية الكوكب.\nالمفاهيم المفتاحية: الطقس، المناخ، الغازات الدفيئة، الاحتباس الحراري، البصمة الكربونية، الطاقة المتجددة.\nتسلسل الشرح: (١) الفرق بين الطقس والمناخ بأمثلة من يومنا. (٢) طبقة الغازات الدفيئة كـ«غطاء» للأرض — التسخين الزائد. (٣) مصادر الغازات: عادم السيارات والمصانع. (٤) آثار: ذوبان الجليد وارتفاع البحار وتغير مواسم المطر. (٥) حلول صغيرة بإيدينا: المواصلات العامة، ترشيد الكهرباء، إعادة التدوير.\nأسئلة مقترحة: إيه الفرق بين الطقس والمناخ؟ إيه اللي بيخلي الأرض تسخن أكتر من اللازم؟ إيه حاجة صغيرة تعملها كل يوم تساعد الكوكب؟\nأخطاء متوقعة: الخلط بين تلوث الهواء والاحتباس الحراري، الاعتقاد إن التغير المناخي مجرد «حرارة صيف عادية».",
  },
  {
    id: "free-discussion",
    chipTitle: "نقاش مفتوح — إدارة صف",
    topicTitle: "نقاش مفتوح: قواعد الفصل — بداية السنة",
    summary:
      "النشاط: نقاش مفتوح لبناء قواعد الفصل مع بداية العام الدراسي (بديل للدرس الأكاديمي — تدريب خالص على إدارة الصف والحوار).\nالهدف التدريبي: توزيع وقت الكلام، إشراك الطلاب الصامتين، التعامل مع المقاطعات والمشاغبات، وتحويل الانتباه المفقود لمشاركة.\nأسئلة مقترحة للفتح: إيه القاعدة اللي تحب تكون في فصلنا؟ ليه أصلاً محتاجين قواعد؟ مين مسؤول عن التزام القواعد — المعلم بس ولا كلنا؟ إيه اللي يحصل لو حد كسر قاعدة؟\nسيناريوهات متوقعة: طالب يقاطع باستمرار، طالب خجول ما يتكلمش، اثنين يبدأوا دردشة جانبية، سؤال خارج الموضوع.",
  },
] as const;

function getStudentPreviewAvatar(name: string, avatarKey?: string | null): { key: string; image: string; ringColor: string } {
  // Character identity: DB avatar_key first, deterministic name fallback.
  // Saudi students resolve to their OWN sprites — never an Egyptian girl's.
  const character = resolveCharacter(avatarKey, name);
  if (character) {
    const ringMap: Record<string, string> = {
      omar: "border-teal-400 ring-2 ring-teal-400/30",
      sara: "border-rose-400 ring-2 ring-rose-400/30",
      yassin: "border-blue-400 ring-2 ring-blue-400/30",
      nour: "border-purple-400 ring-2 ring-purple-400/30",
      sultan: "border-amber-400 ring-2 ring-amber-400/30",
      fahad: "border-emerald-400 ring-2 ring-emerald-400/30",
      reem: "border-fuchsia-400 ring-2 ring-fuchsia-400/30",
      jouri: "border-sky-400 ring-2 ring-sky-400/30",
    };
    return {
      key: character.key,
      image: `${character.spriteDir}/neutral.jpg`,
      ringColor: ringMap[character.key] ?? "border-[#12B8C4] ring-2 ring-[#12B8C4]/30",
    };
  }
  return { key: "student", image: "/students/sara/neutral.jpg", ringColor: "border-[#12B8C4] ring-2 ring-[#12B8C4]/30" };
}

export function SessionSetupForm({
  topics: initialTopics,
  personas,
}: {
  topics: Topic[];
  personas: Persona[];
}) {
  const router = useRouter();
  const { t, lang } = useTranslation();
  const isRtl = lang === "ar";

  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [topicQuery, setTopicQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [addTopicError, setAddTopicError] = useState<string | null>(null);
  const [duration, setDuration] = useState(15);
  const [classroomStyle, setClassroomStyle] = useState<ClassroomStyle>("balanced");
  const [trainingObjective, setTrainingObjective] = useState<TrainingObjective>("socratic_focus");
  const [contextMode, setContextMode] = useState<"text" | "pdf">("text");
  const [textSummary, setTextSummary] = useState("");
  const [templateApplied, setTemplateApplied] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfFileSize, setPdfFileSize] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [teacherTitle, setTeacherTitle] = useState<"يا مستر" | "يا ميس">("يا مستر");
  const [teacherName, setTeacherName] = useState("");
  const [dialect, setDialect] = useState<ClassroomDialect>("egyptian");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTitle = localStorage.getItem("fitna_teacher_title");
      if (savedTitle === "يا ميس" || savedTitle === "يا مستر") {
        setTeacherTitle(savedTitle);
      }
      const savedName = localStorage.getItem("fitna_teacher_name");
      if (savedName) {
        setTeacherName(savedName);
      }
      const savedDialect = localStorage.getItem("fitna_classroom_dialect");
      if (savedDialect === "saudi" || savedDialect === "egyptian") {
        setDialect(savedDialect);
      }
    }
  }, []);

  const handleTitleSelect = (title: "يا مستر" | "يا ميس") => {
    setTeacherTitle(title);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitna_teacher_title", title);
    }
  };

  const handleNameChange = (val: string) => {
    setTeacherName(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitna_teacher_name", val);
    }
  };

  const handleDialectSelect = (d: ClassroomDialect) => {
    setDialect(d);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitna_classroom_dialect", d);
    }
  };

  const filteredTopics = useMemo(() => {
    if (!topicQuery.trim()) return topics;
    const q = topicQuery.trim().toLowerCase();
    return topics.filter(
      (topic) =>
        topic.title_ar.toLowerCase().includes(q) ||
        (topic.title_en && topic.title_en.toLowerCase().includes(q))
    );
  }, [topicQuery, topics]);

  async function handleAddTopic() {
    const title = topicQuery.trim();
    if (!title) return;
    setAddingTopic(true);
    setAddTopicError(null);
    try {
      const res = await fetch("/api/lesson-topics/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddTopicError(json.error || t.common.error);
        return;
      }
      setTopics((prev) => [...prev, json.topic]);
      setSelectedTopic(json.topic);
      setTopicQuery("");
    } catch {
      setAddTopicError(t.common.error);
    } finally {
      setAddingTopic(false);
    }
  }

  async function handlePdfUpload(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError(isRtl ? "يرجى اختيار ملف بصيغة PDF فقط." : "Please select a PDF file only.");
      return;
    }
    setPdfLoading(true);
    setPdfError(null);
    setPdfText(null);
    setPdfFileName(file.name);
    setPdfFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/pdf-extract", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setPdfError(json.error || t.common.error);
        return;
      }
      setPdfText(json.text);
      setPdfFileName(file.name);
    } catch {
      setPdfError(t.common.error);
    } finally {
      setPdfLoading(false);
    }
  }

  const clearPdf = () => {
    setPdfText(null);
    setPdfFileName(null);
    setPdfFileSize(null);
    setPdfError(null);
    setShowPreview(false);
  };

  async function handleStart() {
    setStartError(null);
    const lessonContext = contextMode === "pdf" ? pdfText : textSummary.trim();

    if (!lessonContext) {
      setStartError(isRtl ? "يرجى كتابة ملخص للدرس أو رفع ملف PDF قبل بدء المحاكاة." : t.sessionSetup.missingContentError);
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: selectedTopic?.id ?? null,
          durationMinutes: duration,
          classroomStyle,
          trainingObjective,
          lessonContext,
          teacherTitle,
          teacherName: teacherName.trim(),
          dialect,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStartError(json.error || t.common.error);
        return;
      }
      router.push(`/session/live/${json.sessionId}`);
    } catch {
      setStartError(t.common.error);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div
      className="bg-[#F6F0E4] dark:bg-[#05142B] text-[#071B3A] dark:text-white font-readex antialiased min-h-screen flex flex-col selection:bg-[#12B8C4]/20 selection:text-[#071B3A] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Sticky Nile Top Navigation Bar (Identical to Growth, Dashboard & History) */}
      <nav className="bg-[#071B3A]/95 backdrop-blur-md text-[#F6F0E4] border-b border-[#F6F0E4]/10 sticky top-0 z-30 shadow-md transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[#12B8C4]/40 after:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3.5 py-2 group">
            <Logo variant="light" height={38} className="transition-transform duration-200 group-hover:scale-105" />
            <div className="h-4 w-px bg-white/20 mx-1 hidden md:block" />
            <div className="hidden md:flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] animate-pulse" />
              <span className="text-xs text-[#12B8C4] font-medium tracking-wide">
                {isRtl ? "نظام محاكاة الفصول الذكي" : "Classroom Simulation System"}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5 text-xs">
            <LanguageSwitcher className="hover:scale-105 active:scale-95 transition-transform duration-150" />
            <div className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <ThemeToggle />
            </div>

            {/* Return to Dashboard Button */}
            <Link
              href="/dashboard/teacher"
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 text-[#F6F0E4] hover:text-white text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              title={isRtl ? "العودة إلى لوحة التحكم" : "Return to Dashboard"}
            >
              <svg
                className="w-3.5 h-3.5 text-[#12B8C4] shrink-0 transition-transform duration-200 rtl:group-hover:translate-x-0.5 ltr:group-hover:-translate-x-0.5 rtl:rotate-0 ltr:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span className="hidden sm:inline">{isRtl ? "العودة للوحة التحكم" : "Return to Dashboard"}</span>
              <span className="sm:hidden">{isRtl ? "الرئيسية" : "Home"}</span>
            </Link>

            <div className="h-3.5 w-[1px] bg-white/20 mx-1 hidden sm:block" />

            <form action={signOutAction} className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <button
                type="submit"
                className="text-[#D96B58] hover:text-[#D96B58]/80 font-medium px-2 py-1 transition cursor-pointer"
              >
                <span className="hidden sm:inline">{isRtl ? "تسجيل الخروج" : "Logout"}</span>
                <span className="sm:hidden">{isRtl ? "خروج" : "Exit"}</span>
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 w-full flex-grow space-y-8">
        {/* Header Section */}
        <section className="pb-3 border-b border-[#071B3A]/10 dark:border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#071B3A] text-[#F6F0E4] mb-2 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#12B8C4] animate-pulse" />
              <span>{isRtl ? "البيئة التفاعلية الذكية" : "Smart Interactive Environment"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#071B3A] dark:text-white tracking-tight">
              {isRtl ? "إعداد جلسة المحاكاة" : "Session Configuration"}
            </h1>
            <p className="text-xs sm:text-sm text-[#071B3A]/60 dark:text-white/60 mt-1">
              {isRtl
                ? "اضبط معايير وسلوكيات طلاب الفصل الافتراضي قبل بدء سيناريو التدريب"
                : "Configure the virtual classroom dynamics and challenges before initiating simulation"}
            </p>
          </div>

          <div className="text-xs font-bold text-[#071B3A]/60 dark:text-white/60 bg-white dark:bg-white/5 px-3.5 py-1.5 rounded-xl border border-[#071B3A]/10 dark:border-white/10 shadow-sm">
            {isRtl ? "الوضع: محاكاة فورية مخصصة" : "Mode: Custom Real-Time Simulation"}
          </div>
        </section>

        {/* Setup Form */}
        <div className="space-y-6">
          {/* Card 0: Teacher Title & Vocative (مستر / ميس) */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#12B8C4]" />
                  <span>{isRtl ? "لقب المعلم ومناداة الطلاب لك" : "Teacher Title & Student Vocative"}</span>
                </h2>
                <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1">
                  {isRtl
                    ? "اختر اللقب المفضل لكي يناديك به الطلاب الافتراضيون بدقة من أول ثانية"
                    : "Choose how virtual students should address you accurately from turn one"}
                </p>
              </div>
              <span className="text-[11px] text-[#12B8C4] font-semibold bg-[#12B8C4]/10 border border-[#12B8C4]/20 px-2.5 py-1 rounded-full">
                {isRtl ? "حفظ تلقائي" : "Auto-saved"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Option 1: مستر */}
              <button
                type="button"
                onClick={() => handleTitleSelect("يا مستر")}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                  teacherTitle === "يا مستر"
                    ? "bg-[#12B8C4]/10 border-[#12B8C4] shadow-sm text-[#071B3A] dark:text-white ring-2 ring-[#12B8C4]/30"
                    : "bg-[#F6F0E4]/30 dark:bg-white/5 border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/70 dark:text-white/70 hover:border-[#12B8C4]/40"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition ${
                    teacherTitle === "يا مستر"
                      ? "bg-[#071B3A] text-[#12B8C4] shadow-sm"
                      : "bg-[#071B3A]/10 dark:bg-white/10 text-[#071B3A]/60 dark:text-white/60"
                  }`}
                >
                  <GraduationCap className="w-5 h-5 text-[#12B8C4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#071B3A] dark:text-white">
                      {isRtl ? "مستر (معلم)" : "Mr. (Male Teacher)"}
                    </span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        teacherTitle === "يا مستر"
                          ? "border-[#12B8C4] bg-[#12B8C4]"
                          : "border-[#071B3A]/20 dark:border-white/20"
                      }`}
                    >
                      {teacherTitle === "يا مستر" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {isRtl ? "يناديك الطلاب: «يا مستر»" : "Students address you: «Mr.»"}
                  </p>
                </div>
              </button>

              {/* Option 2: ميس */}
              <button
                type="button"
                onClick={() => handleTitleSelect("يا ميس")}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                  teacherTitle === "يا ميس"
                    ? "bg-[#FFB52E]/15 border-[#FFB52E] shadow-sm text-[#071B3A] dark:text-white ring-2 ring-[#FFB52E]/30"
                    : "bg-[#F6F0E4]/30 dark:bg-white/5 border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/70 dark:text-white/70 hover:border-[#FFB52E]/40"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition ${
                    teacherTitle === "يا ميس"
                      ? "bg-[#071B3A] text-[#FFB52E] shadow-sm"
                      : "bg-[#071B3A]/10 dark:bg-white/10 text-[#071B3A]/60 dark:text-white/60"
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-[#FFB52E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#071B3A] dark:text-white">
                      {isRtl ? "ميس (معلمة)" : "Ms. (Female Teacher)"}
                    </span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        teacherTitle === "يا ميس"
                          ? "border-[#FFB52E] bg-[#FFB52E]"
                          : "border-[#071B3A]/20 dark:border-white/20"
                      }`}
                    >
                      {teacherTitle === "يا ميس" && <span className="w-1.5 h-1.5 rounded-full bg-[#071B3A]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {isRtl ? "يناديك الطلاب: «يا ميس»" : "Students address you: «Ms.»"}
                  </p>
                </div>
              </button>
            </div>

            {/* Optional Teacher Name input */}
            <div className="pt-2 border-t border-[#071B3A]/5 dark:border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="teacher-name-input" className="text-xs font-semibold text-[#071B3A]/70 dark:text-white/70">
                  {isRtl ? "اسمك المفضل (اختياري)" : "Preferred Name (Optional)"}
                </label>
                <span className="text-[11px] text-[#071B3A]/40 dark:text-white/40">
                  {isRtl ? "اختياري" : "Optional"}
                </span>
              </div>
              <input
                id="teacher-name-input"
                type="text"
                value={teacherName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={
                  teacherTitle === "يا ميس"
                    ? (isRtl ? "مثال: مريم، سارة، هدى... (لينادوك: يا ميس مريم)" : "e.g. Mariam, Sara...")
                    : (isRtl ? "مثال: أحمد، محمد، طارق... (لينادوك: يا مستر أحمد)" : "e.g. Ahmed, Mohamed...")
                }
                className="w-full bg-[#F6F0E4]/45 dark:bg-white/5 border border-[#071B3A]/15 dark:border-white/15 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#071B3A] dark:text-white placeholder-[#071B3A]/35 dark:placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 transition"
              />
              <div className="flex items-center gap-2 text-xs text-[#071B3A]/60 dark:text-white/60">
                <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4]" />
                <span>
                  {isRtl ? "شكل نداء الطلاب في الحصة: " : "Student vocative in class: "}
                  <strong className="text-[#12B8C4] font-bold">
                    {teacherName.trim() ? `${teacherTitle} ${teacherName.trim()}` : teacherTitle}
                  </strong>
                </span>
              </div>
            </div>
          </section>

          {/* Card 0b: Classroom Dialect (مصري / سعودي) — production AI pipeline selector */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#12B8C4]" />
                  <span>{isRtl ? "لهجة طلاب الفصل الافتراضي" : "Virtual Classroom Dialect"}</span>
                </h2>
                <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1">
                  {isRtl
                    ? "اختر لهجة حوار الطلاب وأصواتهم خلال المحاكاة"
                    : "Choose the students' conversational dialect and voices"}
                </p>
              </div>
              <span className="text-[11px] text-[#12B8C4] font-semibold bg-[#12B8C4]/10 border border-[#12B8C4]/20 px-2.5 py-1 rounded-full">
                {isRtl ? "حفظ تلقائي" : "Auto-saved"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Dialect 1: مصري */}
              <button
                type="button"
                onClick={() => handleDialectSelect("egyptian")}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                  dialect === "egyptian"
                    ? "bg-[#12B8C4]/10 border-[#12B8C4] shadow-sm text-[#071B3A] dark:text-white ring-2 ring-[#12B8C4]/30"
                    : "bg-[#F6F0E4]/30 dark:bg-white/5 border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/70 dark:text-white/70 hover:border-[#12B8C4]/40"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition ${
                    dialect === "egyptian"
                      ? "bg-[#071B3A] text-[#12B8C4] shadow-sm"
                      : "bg-[#071B3A]/10 dark:bg-white/10 text-[#071B3A]/60 dark:text-white/60"
                  }`}
                >
                  <MessageSquare className="w-5 h-5 text-[#12B8C4]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#071B3A] dark:text-white">
                      {isRtl ? "فصل مصري (عمر، سارة، ياسين، نور)" : "Egyptian Classroom"}
                    </span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        dialect === "egyptian"
                          ? "border-[#12B8C4] bg-[#12B8C4]"
                          : "border-[#071B3A]/20 dark:border-white/20"
                      }`}
                    >
                      {dialect === "egyptian" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {isRtl ? "طلاب يتحدثون باللهجة المصرية" : "Students speak Egyptian Arabic"}
                  </p>
                </div>
              </button>

              {/* Dialect 2: سعودي */}
              <button
                type="button"
                onClick={() => handleDialectSelect("saudi")}
                className={`flex items-center gap-3.5 p-4 rounded-2xl border text-start transition-all cursor-pointer ${
                  dialect === "saudi"
                    ? "bg-[#FFB52E]/15 border-[#FFB52E] shadow-sm text-[#071B3A] dark:text-white ring-2 ring-[#FFB52E]/30"
                    : "bg-[#F6F0E4]/30 dark:bg-white/5 border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/70 dark:text-white/70 hover:border-[#FFB52E]/40"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition ${
                    dialect === "saudi"
                      ? "bg-[#071B3A] text-[#FFB52E] shadow-sm"
                      : "bg-[#071B3A]/10 dark:bg-white/10 text-[#071B3A]/60 dark:text-white/60"
                  }`}
                >
                  <Globe className="w-5 h-5 text-[#FFB52E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#071B3A] dark:text-white">
                      {isRtl ? "فصل سعودي (ريم، سلطان، فهد، جوري)" : "Saudi Classroom"}
                    </span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        dialect === "saudi"
                          ? "border-[#FFB52E] bg-[#FFB52E]"
                          : "border-[#071B3A]/20 dark:border-white/20"
                      }`}
                    >
                      {dialect === "saudi" && <span className="w-1.5 h-1.5 rounded-full bg-[#071B3A]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                    {isRtl ? "طلاب يتحدثون باللهجة السعودية" : "Students speak Saudi Arabic"}
                  </p>
                </div>
              </button>
            </div>
          </section>

          {/* Card 1: Topic search/select */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <label htmlFor="topic-input" className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFB52E]" />
                <span>{isRtl ? "موضوع الدرس والمفاهيم الرئيسية" : "Lesson Topic & Key Concepts"}</span>
              </label>
              <span className="text-[11px] text-[#071B3A]/40 dark:text-white/40 font-mono">
                {isRtl ? "مطلوب" : "Required"}
              </span>
            </div>
            <div className="relative">
              <input
                id="topic-input"
                type="text"
                value={
                  selectedTopic
                    ? lang === "en" && selectedTopic.title_en
                      ? selectedTopic.title_en
                      : selectedTopic.title_ar
                    : topicQuery
                }
                onChange={(e) => {
                  setSelectedTopic(null);
                  setTopicQuery(e.target.value);
                }}
                placeholder={
                  isRtl
                    ? "مثال: ضرب الكسور الاعتيادية، مفهوم الاحتباس الحراري، التوكيد اللفظي والمعنوي..."
                    : "e.g. Fractions Multiplication, Photosynthesis, Quadratic Equations..."
                }
                className="w-full bg-[#F6F0E4]/45 dark:bg-white/5 border border-[#071B3A]/15 dark:border-white/15 rounded-2xl px-5 py-3.5 pl-11 rtl:pl-11 ltr:pr-11 text-sm font-semibold text-[#071B3A] dark:text-white placeholder-[#071B3A]/35 dark:placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition"
              />
              <svg
                className="w-5 h-5 text-[#071B3A]/40 dark:text-white/40 absolute left-4 rtl:left-4 ltr:right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>

              {selectedTopic && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTopic(null);
                    setTopicQuery("");
                  }}
                  className="absolute left-10 rtl:left-10 ltr:right-10 top-1/2 -translate-y-1/2 text-xs text-[#071B3A]/40 dark:text-white/40 hover:text-red-500 font-bold p-1 cursor-pointer"
                  aria-label="Clear selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!selectedTopic && topicQuery.trim() && (
              <div className="border border-[#071B3A]/10 dark:border-white/10 rounded-2xl max-h-48 overflow-y-auto divide-y divide-[#071B3A]/5 dark:divide-white/5 bg-white dark:bg-[#071B3A] shadow-lg">
                {filteredTopics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setSelectedTopic(topic);
                      setTopicQuery("");
                    }}
                    className="w-full text-start px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#071B3A] dark:text-white hover:bg-[#12B8C4]/10 transition cursor-pointer"
                  >
                    {lang === "en" && topic.title_en ? topic.title_en : topic.title_ar}
                  </button>
                ))}
                {filteredTopics.length === 0 && (
                  <div className="p-3 text-center">
                    <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mb-2">
                      {isRtl ? "لم يتم العثور على موضوع مطابق." : t.sessionSetup.noTopicsFound}
                    </p>
                    <button
                      type="button"
                      disabled={addingTopic}
                      onClick={handleAddTopic}
                      className="text-xs text-[#12B8C4] font-bold hover:underline cursor-pointer"
                    >
                      {addingTopic
                        ? (isRtl ? "جاري إضافة الموضوع..." : t.sessionSetup.addingTopic)
                        : (isRtl ? `+ إضافة كـ موضوع جديد: "${topicQuery.trim()}"` : `+ Add new topic "${topicQuery.trim()}"`)}
                    </button>
                  </div>
                )}
              </div>
            )}
            {addTopicError && <p className="text-xs text-red-600">{addTopicError}</p>}
          </section>

          {/* Card 2: Classroom Style */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#12B8C4]" />
                <span>{isRtl ? "نمط وتحدي الفصل الافتراضي" : "Virtual Classroom Dynamics"}</span>
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-1">
                {isRtl
                  ? "يحدد شخصية الطلاب ومستوى تفاعلهم وميلهم للمقاطعة أو الخمول"
                  : "Determines student persona engagement, interruptions, or passivity levels"}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Balanced */}
              <div
                onClick={() => setClassroomStyle("balanced")}
                className={`relative flex flex-col justify-between p-5 rounded-2xl cursor-pointer transition ${
                  classroomStyle === "balanced"
                    ? "border-2 border-[#12B8C4] bg-[#12B8C4]/[0.06] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#12B8C4]/40"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#12B8C4]/20 text-[#12B8C4] flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97zM2.25 5.49a48.88 48.88 0 013-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L2.25 5.49z" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                        {isRtl ? "متوازن ومعياري" : "Balanced & Standard"}
                      </h3>
                    </div>
                    <span className="w-4 h-4 rounded-full border-2 border-[#12B8C4] flex items-center justify-center">
                      {classroomStyle === "balanced" && <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 leading-relaxed">
                    {isRtl
                      ? "تفاعل طبيعي ومستويات انتباه قياسية تتيح نقاشاً سلساً واختباراً متزناً للأساليب التدريسية."
                      : "Standard attention and realistic discussion, offering a well-balanced pedagogical test."}
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-[#12B8C4] bg-white dark:bg-[#071B3A] px-2 py-0.5 rounded border border-[#12B8C4]/20 w-fit">
                  {isRtl ? "موصى به للتقييم الأسبوعي" : "Recommended for Evaluation"}
                </span>
              </div>

              {/* Disruptive */}
              <div
                onClick={() => setClassroomStyle("disruptive")}
                className={`relative flex flex-col justify-between p-5 rounded-2xl cursor-pointer transition ${
                  classroomStyle === "disruptive"
                    ? "border-2 border-[#FFB52E] bg-[#FFB52E]/[0.06] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#FFB52E]/60"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#FFB52E]/20 text-amber-800 dark:text-[#FFB52E] flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                        {isRtl ? "نشط ومقاطعات" : "Active & Disruptive"}
                      </h3>
                    </div>
                    <span className="w-4 h-4 rounded-full border border-[#071B3A]/30 dark:border-white/30 flex items-center justify-center">
                      {classroomStyle === "disruptive" && <span className="w-2 h-2 rounded-full bg-[#FFB52E]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 leading-relaxed">
                    {isRtl
                      ? "انتباه متذبذب وشغف عالٍ مع مقاطعات متكررة تحتاج لضبط حازم واستعادة انتباه الصف بمرونة."
                      : "Energetic classroom with frequent interruptions, challenging behavior management."}
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-[#071B3A]/60 dark:text-white/60 bg-white dark:bg-[#071B3A] px-2 py-0.5 rounded border border-[#071B3A]/10 dark:border-white/10 w-fit">
                  {isRtl ? "تحدي إدارة وضبط" : "Classroom Management Challenge"}
                </span>
              </div>

              {/* Disengaged / Passive */}
              <div
                onClick={() => setClassroomStyle("disengaged")}
                className={`relative flex flex-col justify-between p-5 rounded-2xl cursor-pointer transition ${
                  classroomStyle === "disengaged"
                    ? "border-2 border-[#D96B58] bg-[#D96B58]/[0.06] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#D96B58]/60"
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#D96B58]/20 text-[#D96B58] flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                        {isRtl ? "خامل وهادئ" : "Passive & Quiet"}
                      </h3>
                    </div>
                    <span className="w-4 h-4 rounded-full border border-[#071B3A]/30 dark:border-white/30 flex items-center justify-center">
                      {classroomStyle === "disengaged" && <span className="w-2 h-2 rounded-full bg-[#D96B58]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 leading-relaxed">
                    {isRtl
                      ? "انتباه منخفض وتردد ملحوظ في التجاوب؛ يتطلب تحفيزاً مستمراً وتوجيه أسئلة سابرة مفتوحة."
                      : "Hesitant participation requiring active Socratic inquiry to draw students out."}
                  </p>
                </div>
                <span className="mt-4 text-[10px] font-bold text-[#D96B58] bg-white dark:bg-[#071B3A] px-2 py-0.5 rounded border border-[#D96B58]/20 w-fit">
                  {isRtl ? "تحدي استثارة التفاعل" : "Engagement Challenge"}
                </span>
              </div>
            </div>
          </section>

          {/* Card 3: Training Objective */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFB52E]" />
                <span>{isRtl ? "هدفك التدريبي المحدد للجلسة" : "Target Pedagogical Objective"}</span>
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-1">
                {isRtl
                  ? "المعيار الذي سيقوم الذكاء الاصطناعي بالتركيز على قياسه واحتساب درجات التميز بناءً عليه"
                  : "The primary skill benchmark telemetry will track and grade during the simulation"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Socratic Focus */}
              <div
                onClick={() => setTrainingObjective("socratic_focus")}
                className={`flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition ${
                  trainingObjective === "socratic_focus"
                    ? "border-2 border-[#12B8C4] bg-[#12B8C4]/[0.05] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#12B8C4]/40"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#071B3A] text-[#FFB52E] flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.516 0c.85.493 1.508 1.333 1.508 2.316V18" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                      {isRtl ? "الأسئلة السقراطية (> 70%)" : "Socratic Questioning (> 70%)"}
                    </h3>
                    <span className="w-4 h-4 rounded-full border-2 border-[#12B8C4] flex items-center justify-center">
                      {trainingObjective === "socratic_focus" && <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1 leading-relaxed">
                    {isRtl
                      ? "طرح أسئلة مفتوحة تحفز الاستكشاف والتفكير وتجنب تقديم الإجابات المباشرة الجاهزة."
                      : "Formulate open-ended inquiries that spark deductive reasoning."}
                  </p>
                </div>
              </div>

              {/* TTT Reduction */}
              <div
                onClick={() => setTrainingObjective("talk_time_reduction")}
                className={`flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition ${
                  trainingObjective === "talk_time_reduction"
                    ? "border-2 border-[#12B8C4] bg-[#12B8C4]/[0.05] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#12B8C4]/40"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#071B3A] text-[#12B8C4] flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                      {isRtl ? "تقليل وقت حديث المعلم (< 50%)" : "Reduce Teacher Talk Time (< 50%)"}
                    </h3>
                    <span className="w-4 h-4 rounded-full border border-[#071B3A]/30 dark:border-white/30 flex items-center justify-center">
                      {trainingObjective === "talk_time_reduction" && <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1 leading-relaxed">
                    {isRtl
                      ? "إعطاء مساحة أوسع للطلاب للتعبير وبناء الأفكار ومناقشة الزملاء داخل الصف الافتراضي."
                      : "Maximize student floor-time and collective peer dialogue."}
                  </p>
                </div>
              </div>

              {/* Inclusivity */}
              <div
                onClick={() => setTrainingObjective("inclusive_engagement")}
                className={`flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition ${
                  trainingObjective === "inclusive_engagement"
                    ? "border-2 border-[#12B8C4] bg-[#12B8C4]/[0.05] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#12B8C4]/40"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#071B3A] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.199l-.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                      {isRtl ? "إشراك جميع الطلاب (100%)" : "Involve All Students (100%)"}
                    </h3>
                    <span className="w-4 h-4 rounded-full border border-[#071B3A]/30 dark:border-white/30 flex items-center justify-center">
                      {trainingObjective === "inclusive_engagement" && <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1 leading-relaxed">
                    {isRtl
                      ? "تشجيع الطلاب الهادئين وموازنة المشاركات الفردية والجماعية بعدالة دون استثناء."
                      : "Engage quiet learners and distribute voice fairly across all personas."}
                  </p>
                </div>
              </div>

              {/* Behavior Redirection */}
              <div
                onClick={() => setTrainingObjective("behavior_redirection")}
                className={`flex items-start gap-4 p-5 rounded-2xl cursor-pointer transition ${
                  trainingObjective === "behavior_redirection"
                    ? "border-2 border-[#12B8C4] bg-[#12B8C4]/[0.05] shadow-sm"
                    : "border border-[#071B3A]/10 dark:border-white/10 bg-[#F6F0E4]/35 dark:bg-white/[0.02] hover:border-[#12B8C4]/40"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#071B3A] text-[#D96B58] flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">
                      {isRtl ? "إدارة التشتت والسلوك الصفي" : "Classroom Management & Redirection"}
                    </h3>
                    <span className="w-4 h-4 rounded-full border border-[#071B3A]/30 dark:border-white/30 flex items-center justify-center">
                      {trainingObjective === "behavior_redirection" && <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1 leading-relaxed">
                    {isRtl
                      ? "الحفاظ على تركيز وانتباه المجموعة وإعادة توجيه الطلاب المتشتتين بلباقة وحسم."
                      : "Restore classroom focus and deflect tangents with composure."}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Card 4: Duration Slider */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#12B8C4]" />
                  <span>{isRtl ? "مدة الجلسة التفاعلية" : "Simulation Duration"}</span>
                </h2>
                <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                  {isRtl
                    ? "تحدد الفترة الزمنية المتاحة لتغطية المفهوم وتلقي تقرير الأداء"
                    : "Sets the simulation timeline before generating comprehensive evaluation"}
                </p>
              </div>
              <div className="flex items-baseline gap-1 px-4 py-1.5 rounded-2xl bg-[#12B8C4]/15 border border-[#12B8C4]/30 text-[#12B8C4] font-bold">
                <span className="text-xl font-mono">{duration}</span>
                <span className="text-xs font-sans">{isRtl ? "دقيقة" : "min"}</span>
              </div>
            </div>

            <div className="pt-3 pb-1 space-y-2">
              <input
                type="range"
                min="10"
                max="30"
                step="5"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                aria-label={isRtl ? "مدة الجلسة التفاعلية بالدقائق" : "Session duration in minutes"}
                className="w-full h-2 bg-[#F6F0E4] dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#12B8C4]"
              />
              <div className="flex justify-between text-xs font-mono font-semibold text-[#071B3A]/40 dark:text-white/40">
                <span>{isRtl ? "10 دقائق (خاطفة)" : "10 min (Quick)"}</span>
                <span className="text-[#12B8C4] font-bold">{isRtl ? "15 دقيقة (معياري)" : "15 min (Standard)"}</span>
                <span>{isRtl ? "20 دقيقة" : "20 min"}</span>
                <span>{isRtl ? "30 دقيقة (كاملة)" : "30 min (Full)"}</span>
              </div>
            </div>
          </section>

          {/* Card 5: Lesson Content & Plan */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFB52E]" />
                  <span>{isRtl ? "محتوى وخطة الدرس" : "Lesson Plan & Context"}</span>
                </h2>
                <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                  {isRtl
                    ? "زود المحاكي بنقاط الدرس الأساسية لكي يتفاعل الطلاب بناءً عليها"
                    : "Provide lesson concepts so simulated students respond accurately"}
                </p>
              </div>

              <div className="bg-[#F6F0E4]/70 dark:bg-white/10 p-1 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 flex items-center text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setContextMode("text")}
                  className={`px-4 py-1.5 rounded-xl transition cursor-pointer ${
                    contextMode === "text"
                      ? "bg-[#071B3A] text-white shadow-sm"
                      : "text-[#071B3A]/60 dark:text-white/60 hover:text-[#071B3A] dark:hover:text-white"
                  }`}
                >
                  {isRtl ? "اكتب ملخص الدرس" : "Type Summary"}
                </button>
                <button
                  type="button"
                  onClick={() => setContextMode("pdf")}
                  className={`px-4 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                    contextMode === "pdf"
                      ? "bg-[#071B3A] text-white shadow-sm"
                      : "text-[#071B3A]/60 dark:text-white/60 hover:text-[#071B3A] dark:hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 text-[#D96B58]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span>{isRtl ? "رفع خطة (PDF)" : "Upload PDF Plan"}</span>
                </button>
              </div>
            </div>

            {contextMode === "text" ? (
              <div className="relative space-y-3">
                {/* Ready-made lesson templates — one tap fills a complete,
                    realistic lesson summary so first-time users can start a
                    simulation without writing a lesson from scratch. */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#12B8C4]" />
                    <span className="text-xs font-bold text-[#071B3A]/70 dark:text-white/70">
                      {isRtl ? "قوالب دروس جاهزة — اضغط وابدأ فورًا:" : "Ready-made lesson templates — tap and start:"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LESSON_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setTextSummary(tpl.summary);
                          if (!selectedTopic) setTopicQuery(tpl.topicTitle);
                          setTemplateApplied(tpl.id);
                        }}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                          templateApplied === tpl.id
                            ? "bg-[#12B8C4] text-white border-[#12B8C4] shadow-sm shadow-[#12B8C4]/25"
                            : "bg-[#12B8C4]/5 text-[#12B8C4] border-[#12B8C4]/30 hover:bg-[#12B8C4]/15"
                        }`}
                      >
                        {tpl.chipTitle}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={textSummary}
                  onChange={(e) => {
                    setTextSummary(e.target.value);
                    setTemplateApplied(null);
                  }}
                  placeholder={
                    isRtl
                      ? "اكتب هنا النقاط الرئيسية والمفاهيم التي ستشرحها خلال هذه الجلسة، والأسئلة المفتاحية التي تود توجيهها للطلاب..."
                      : "Outline key lesson milestones, inquiry points, and core concepts to cover..."
                  }
                  className="w-full bg-[#F6F0E4]/45 dark:bg-white/5 border border-[#071B3A]/15 dark:border-white/15 rounded-2xl p-4 text-xs sm:text-sm font-medium text-[#071B3A] dark:text-white placeholder-[#071B3A]/35 dark:placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-[#12B8C4]/60 focus:border-[#12B8C4] transition resize-none leading-relaxed"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Upload Zone (Idle) */}
                {!pdfText && !pdfLoading && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handlePdfUpload(file);
                    }}
                    onClick={() => document.getElementById("pdf-upload")?.click()}
                    className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all duration-200 cursor-pointer ${
                      isDragging
                        ? "border-[#12B8C4] bg-[#12B8C4]/10 scale-[1.01]"
                        : "border-[#071B3A]/20 dark:border-white/20 hover:border-[#12B8C4]/60 bg-[#F6F0E4]/30 dark:bg-white/[0.02]"
                    }`}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      id="pdf-upload"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePdfUpload(file);
                      }}
                    />
                    <div className="w-13 h-13 mx-auto rounded-2xl bg-[#D96B58]/10 dark:bg-[#D96B58]/20 border border-[#D96B58]/30 flex items-center justify-center text-[#D96B58] shadow-sm mb-3 group-hover:scale-105 transition-transform">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-bold text-[#071B3A] dark:text-white mb-1">
                      {isRtl ? "اسحب وأفلت ملف خطة الدرس هنا، أو انقر للتصفح" : "Drag and drop your lesson plan here, or browse"}
                    </h4>
                    <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mb-3.5">
                      {isRtl ? "يدعم ملفات PDF • استخراج فوري وتلقائي لمحاور وأهداف الدرس" : "Supports PDF documents • Instant automatic pedagogical extraction"}
                    </p>
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#071B3A] dark:bg-white text-white dark:text-[#071B3A] shadow-sm hover:opacity-90 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{isRtl ? "اختيار ملف PDF" : "Choose PDF file"}</span>
                    </span>
                  </div>
                )}

                {/* Upload Loading State */}
                {pdfLoading && (
                  <div className="border border-[#12B8C4]/30 rounded-2xl p-6 text-center bg-[#12B8C4]/5 dark:bg-[#12B8C4]/10 space-y-3 animate-in fade-in">
                    <div className="w-11 h-11 mx-auto rounded-full bg-[#12B8C4]/20 border border-[#12B8C4]/40 flex items-center justify-center text-[#12B8C4] animate-spin">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#071B3A] dark:text-white">
                        {isRtl ? "جاري قراءة واستخراج خطة الدرس بالذكاء الاصطناعي..." : "Extracting lesson plan with AI..."}
                      </p>
                      {pdfFileName && (
                        <p className="text-[11px] text-[#071B3A]/60 dark:text-white/60 font-mono truncate max-w-sm mx-auto">
                          {pdfFileName}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload Success & Extracted Content Card */}
                {pdfText && !pdfLoading && (
                  <div className="border border-teal-500/30 rounded-2xl p-4 sm:p-5 bg-teal-500/5 dark:bg-teal-500/10 space-y-3.5 animate-in fade-in">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-[#D96B58]/15 border border-[#D96B58]/30 flex items-center justify-center text-[#D96B58] shrink-0 font-black text-xs">
                          PDF
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-[#071B3A] dark:text-white truncate">
                            {pdfFileName}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#071B3A]/60 dark:text-white/60 mt-0.5">
                            {pdfFileSize && <span>{pdfFileSize}</span>}
                            <span className="w-1 h-1 rounded-full bg-teal-500" />
                            <span className="text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                              </svg>
                              <span>{isRtl ? "تمت قراءة الخطة بنجاح" : "Plan parsed successfully"}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => document.getElementById("pdf-upload-replace")?.click()}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#071B3A] dark:text-white bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-[#071B3A]/10 dark:border-white/10 transition shadow-sm"
                        >
                          {isRtl ? "استبدال" : "Replace"}
                        </button>
                        <input
                          type="file"
                          accept="application/pdf"
                          id="pdf-upload-replace"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePdfUpload(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={clearPdf}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition"
                          title={isRtl ? "حذف الملف" : "Remove file"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Extracted Plan Content Preview */}
                    <div className="border-t border-teal-500/20 pt-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-[#071B3A] dark:text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-teal-500" />
                          <span>{isRtl ? "موجز خطة الدرس المستخرجة:" : "Extracted Lesson Summary:"}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPreview(!showPreview)}
                          className="text-[11px] text-[#12B8C4] hover:underline font-semibold"
                        >
                          {showPreview 
                            ? (isRtl ? "إخفاء التفاصيل" : "Collapse text") 
                            : (isRtl ? "عرض النص الكامل" : "Expand full text")}
                        </button>
                      </div>
                      <div className={`bg-[#F6F0E4]/60 dark:bg-black/20 rounded-xl p-3 text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed font-sans ${
                        showPreview ? "max-h-64 overflow-y-auto" : "max-h-20 overflow-hidden line-clamp-3"
                      }`}>
                        {pdfText}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {pdfError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-500 dark:text-red-400 font-medium flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{pdfError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPdfError(null)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold"
                    >
                      {isRtl ? "إغلاق" : "Dismiss"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Card 6: Student Personas Preview */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#12B8C4]" />
                  <span>
                    {isRtl
                      ? `معاينة طلاب الفصل الافتراضي (${personas.length} طلاب)`
                      : `Virtual Classroom Students (${personas.length} Personas)`}
                  </span>
                </h2>
                <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                  {isRtl
                    ? "الشخصيات التي ستتفاعل معك بالصوت والنص خلال الجلسة"
                    : "Real-time AI personas responding to voice and pedagogical cues"}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[#12B8C4] bg-[#12B8C4]/10 px-2.5 py-1 rounded-xl">
                {isRtl ? "جاهزون للبث" : "Live Ready"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              {personas
                .filter((p) => (p.dialect ?? "egyptian_arabic").startsWith(dialect))
                .map((p, idx) => {
                const avatar = getStudentPreviewAvatar(p.name, (p as { avatar_key?: string | null }).avatar_key);
                const colorSchemes = [
                  { bg: "bg-[#12B8C4]/20", text: "text-[#12B8C4]", bar: "bg-[#12B8C4]" },
                  { bg: "bg-[#FFB52E]/25", text: "text-amber-800 dark:text-[#FFB52E]", bar: "bg-[#FFB52E]" },
                  { bg: "bg-[#12B8C4]/20", text: "text-[#12B8C4]", bar: "bg-[#12B8C4]" },
                  { bg: "bg-[#D96B58]/20", text: "text-[#D96B58]", bar: "bg-[#D96B58]" },
                ];
                const scheme = colorSchemes[idx % colorSchemes.length];

                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/[0.03] border border-[#071B3A]/5 dark:border-white/10 hover:border-[#12B8C4]/40 transition flex flex-col items-center text-center space-y-2.5 group"
                  >
                    {/* Student Image Avatar in Small Circle */}
                    <div className="relative">
                      <div
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden shadow-md border-2 bg-slate-900 flex items-center justify-center transition-all duration-300 group-hover:scale-105 ${avatar.ringColor}`}
                      >
                        <img
                          src={avatar.image}
                          alt={p.name}
                          className="w-full h-full object-cover object-top scale-105 transition-transform duration-300 group-hover:scale-110"
                        />
                      </div>
                      <span className="absolute bottom-0 end-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#071B3A] shadow-sm" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#071B3A] dark:text-white">{p.name}</h3>
                      <span className="text-[11px] text-[#071B3A]/40 dark:text-white/40 font-mono">
                        {p.age} {isRtl ? "سنوات" : "yo"}
                      </span>
                    </div>
                    <div className="w-full pt-2 border-t border-[#071B3A]/5 dark:border-white/10">
                      <div className="flex justify-between text-[10px] font-bold text-[#071B3A]/60 dark:text-white/60 mb-1">
                        <span>{isRtl ? "الانتباه:" : "Attention:"}</span>
                        <span className={scheme.text}>{p.base_attention}%</span>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`${scheme.bar} h-1.5 rounded-full`}
                          style={{ width: `${p.base_attention}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Error Banner */}
          {startError && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 p-3.5 rounded-2xl border border-red-200 dark:border-red-900">
              {startError}
            </p>
          )}

          {/* Submit Button CTA */}
          <div className="pt-6 pb-4 space-y-3.5">
            <button
              type="button"
              disabled={starting}
              onClick={handleStart}
              className="w-full py-4 px-6 rounded-2xl bg-[#FFB52E] hover:bg-[#FFB52E]/90 disabled:opacity-60 text-[#071B3A] font-black text-base sm:text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] border-2 border-amber-400 flex items-center justify-center cursor-pointer"
            >
              <span>{starting ? (isRtl ? "جاري بدء الجلسة..." : "Initiating...") : (isRtl ? "بدء محاكاة الفصل الآن" : "Start Classroom Simulation Now")}</span>
            </button>
            <p className="text-center text-xs text-[#071B3A]/60 dark:text-white/60 leading-relaxed font-medium px-4">
              {isRtl
                ? "بالضغط على بدء، سيتم تفعيل الاتصال بالخادم الصوتي وتشغيل النماذج المعرفية لطلاب الفصل."
                : "Upon starting, audio websockets and student persona cognitive models will initialize."}
            </p>
          </div>
        </div>
      </main>

      {/* Clean Corporate Footer (Identical to Growth, Dashboard & History) */}
      <footer className="border-t border-[#071B3A]/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-xs text-[#071B3A]/50 dark:text-white/50 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>
            {isRtl
              ? "جميع الحقوق محفوظة © 2026 نظام فطنة للذكاء الاصطناعي التربوي"
              : "All rights reserved © 2026 Fitna AI Pedagogical System"}
          </span>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {isRtl ? "المعايير المعتمدة" : "Standards"}
            </Link>
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {isRtl ? "سياسة الخصوصية" : "Privacy Policy"}
            </Link>
            <Link href="/" className="hover:text-[#071B3A] dark:hover:text-white transition">
              {isRtl ? "المساعدة والدعم" : "Help & Support"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
