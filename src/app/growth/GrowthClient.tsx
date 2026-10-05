"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOutAction } from "@/app/(auth)/login/actions";
import { type Language } from "@/lib/i18n";
import { Target, Check, Lock } from "lucide-react";

type SessionPoint = {
  id: string;
  startedAt: string;
  date: string;
  fullDate: string;
  overallScore: number | null;
  teacherTalkRatio: number | null;
  socraticQuestionRate: number | null;
  inclusivityIndex: number | null;
  topicTitle: string;
};

type Profile = {
  full_name: string | null;
  email: string;
};

type BadgeItem = {
  key: string;
  unlockedAt: string | null;
};

export function GrowthClient({
  sessions,
  profile,
  badges,
  lang,
}: {
  sessions: SessionPoint[];
  profile: Profile | null;
  badges: BadgeItem[];
  lang: Language;
}) {
  const isRtl = lang === "ar";
  const [timeScope, setTimeScope] = useState<"week" | "month" | "semester">("month");
  const [activeMetric, setActiveMetric] = useState<"overallScore" | "teacherTalkRatio" | "socraticQuestionRate" | "inclusivityIndex">("overallScore");
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; val: number; date: string; topic: string } | null>(null);

  // Time scope filtering
  const now = Date.now();
  const filteredSessions = sessions.filter((s) => {
    const sessionTime = new Date(s.startedAt).getTime();
    if (timeScope === "week") {
      return now - sessionTime <= 7 * 24 * 3600 * 1000;
    }
    if (timeScope === "month") {
      return now - sessionTime <= 30 * 24 * 3600 * 1000;
    }
    return true; // semester / all
  });

  const activeSessions = filteredSessions.length > 0 ? filteredSessions : sessions;

  // STRICTLY query backend badges table. No frontend overrides!
  const unlockedBadgeMap = new Map(badges.map((b) => [b.key, b.unlockedAt]));

  const badgeDefs = [
    {
      key: "socrates_incarnate",
      title: isRtl ? "سقراط المتجسد" : "Socrates Incarnate",
      description: isRtl
        ? "أكثر من 80% من أسئلتك في جلسة واحدة كانت أسئلة سقراطية مفتوحة تحفز التفكير."
        : "More than 80% of questions in a single session were open-ended Socratic inquiries.",
      color: "text-[#FFB52E]",
      iconPath: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V9.75m-15 11.25V9.75M3 21h18",
      isUnlocked: unlockedBadgeMap.has("socrates_incarnate"),
      unlockedAt: unlockedBadgeMap.get("socrates_incarnate") || null,
    },
    {
      key: "master_listener",
      title: isRtl ? "فن الاستماع" : "Master Listener",
      description: isRtl
        ? "نسبة حديث المعلم بين 25% و 50%، مما أتاح مساحة مثالية لمشاركة الطلاب."
        : "Teacher talk time was between 25% and 50%, providing ideal space for student voice.",
      color: "text-[#12B8C4]",
      iconPath: "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.21-1.614.57-2.302.234-.847 1.058-1.354 1.938-1.354h2.24z",
      isUnlocked: unlockedBadgeMap.has("master_listener"),
      unlockedAt: unlockedBadgeMap.get("master_listener") || null,
    },
    {
      key: "inclusive_educator",
      title: isRtl ? "رائد الشمولية" : "Inclusive Educator",
      description: isRtl
        ? "تحقيق مؤشر شمولية 100% بمشاركة جميع طلاب الفصل دون استثناء."
        : "Achieved a 100% Inclusivity Index with active contribution from every student.",
      color: "text-white",
      iconPath: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.199l-.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
      isUnlocked: unlockedBadgeMap.has("inclusive_educator"),
      unlockedAt: unlockedBadgeMap.get("inclusive_educator") || null,
    },
    {
      key: "classroom_captain",
      title: isRtl ? "قبطان الفصل" : "Classroom Captain",
      description: isRtl
        ? "الحصول على درجة أداء كلية 90% فأعلى في جلسة متكاملة."
        : "Scored 90% or higher overall score in an integrated simulation session.",
      color: "text-[#FFB52E]",
      iconPath: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
      isUnlocked: unlockedBadgeMap.has("classroom_captain"),
      unlockedAt: unlockedBadgeMap.get("classroom_captain") || null,
    },
    {
      key: "pioneer_teacher",
      title: isRtl ? "المعلم الرائد" : "Pioneer Teacher",
      description: isRtl
        ? "إتمام أول محاكاة تدريس تفاعلية بنجاح داخل البيئة الافتراضية."
        : "Successfully completed your first interactive classroom simulation.",
      color: "text-[#12B8C4]",
      iconPath: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
      isUnlocked: unlockedBadgeMap.has("pioneer_teacher"),
      unlockedAt: unlockedBadgeMap.get("pioneer_teacher") || null,
    },
    {
      key: "streak_master",
      title: isRtl ? "المثابر المتميز" : "Streak Master",
      description: isRtl
        ? "إتمام 3 جلسات محاكاة تدريسية مكتملة وموثقة على النظام."
        : "Completed 3 or more verified pedagogical simulation sessions.",
      color: "text-[#D96B58]",
      iconPath: "M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z",
      isUnlocked: unlockedBadgeMap.has("streak_master"),
      unlockedAt: unlockedBadgeMap.get("streak_master") || null,
    },
  ];

  const actualUnlockedCount = badgeDefs.filter((b) => b.isUnlocked).length;

  // Real Cumulative Averages across completed sessions
  const getAvg = (key: keyof SessionPoint) => {
    const valid = activeSessions.map((s) => s[key]).filter((v): v is number => typeof v === "number" && v !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  const avgScore = getAvg("overallScore");
  const avgTTT = getAvg("teacherTalkRatio");
  const avgSocratic = getAvg("socraticQuestionRate");
  const avgInclusivity = getAvg("inclusivityIndex");

  const latestSession = activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : null;
  const prevSession = activeSessions.length > 1 ? activeSessions[activeSessions.length - 2] : null;

  // Real difference between latest session and previous session
  const scoreDiff =
    latestSession && prevSession && latestSession.overallScore !== null && prevSession.overallScore !== null
      ? latestSession.overallScore - prevSession.overallScore
      : null;

  const inclusivityDiff =
    latestSession && prevSession && latestSession.inclusivityIndex !== null && prevSession.inclusivityIndex !== null
      ? latestSession.inclusivityIndex - prevSession.inclusivityIndex
      : null;

  // SVG Chart calculation
  const svgWidth = 800;
  const svgHeight = 240;
  const padX = 40;
  const padY = 25;

  const chartPoints = activeSessions.map((s, i) => {
    const rawVal = s[activeMetric];
    const val = typeof rawVal === "number" ? Math.min(100, Math.max(0, rawVal)) : 0;
    const x =
      activeSessions.length > 1
        ? padX + (i / (activeSessions.length - 1)) * (svgWidth - padX * 2)
        : svgWidth / 2;
    const y = svgHeight - padY - (val / 100) * (svgHeight - padY * 2);
    return { x, y, val, date: s.date, topic: s.topicTitle, rawVal };
  });

  const polylinePoints = chartPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const polygonPoints =
    chartPoints.length > 0
      ? `${chartPoints[0].x},${svgHeight} ` +
        chartPoints.map((p) => `${p.x},${p.y}`).join(" ") +
        ` ${chartPoints[chartPoints.length - 1].x},${svgHeight}`
      : "";

  const startDateStr = activeSessions[0]?.date || null;
  const endDateStr = activeSessions[activeSessions.length - 1]?.date || null;

  return (
    <div
      className="bg-[#F6F0E4] dark:bg-[#05142B] text-[#071B3A] dark:text-white font-readex antialiased min-h-screen flex flex-col selection:bg-[#12B8C4]/20 selection:text-[#071B3A] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Sticky Nile Top Navigation Bar with Official Logo & Animation */}
      <nav className="bg-[#071B3A]/95 backdrop-blur-md text-[#F6F0E4] border-b border-[#F6F0E4]/10 sticky top-0 z-30 shadow-md transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[#12B8C4]/40 after:to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3.5 py-2 group">
            <Logo variant="light" height={38} className="transition-transform duration-200 group-hover:scale-105" />
            <div className="h-4 w-px bg-white/20 mx-1 hidden md:block" />
            <div className="hidden md:flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] animate-pulse" />
              <span className="text-xs text-[#12B8C4] font-medium tracking-wide">
                {lang === "ar" ? "نظام محاكاة الفصول الذكي" : "Classroom Simulation System"}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5 text-xs">
            <LanguageSwitcher className="hover:scale-105 active:scale-95 transition-transform duration-150" />
            <div className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <ThemeToggle />
            </div>

            {/* Prominent Return Button */}
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
              <span>{isRtl ? "العودة للوحة التحكم" : "Return to Dashboard"}</span>
            </Link>

            <div className="h-3.5 w-[1px] bg-white/20 mx-1 hidden sm:block" />

            <form action={signOutAction} className="hover:scale-105 active:scale-95 transition-transform duration-150">
              <button
                type="submit"
                className="text-[#D96B58] hover:text-[#D96B58]/80 font-medium px-2 py-1 transition cursor-pointer"
              >
                {isRtl ? "تسجيل الخروج" : "Logout"}
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col gap-8">
        {/* Header & Scope Section */}
        <section className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-[#071B3A]/10 dark:border-white/10">
          <div className="space-y-2 sm:space-y-2.5">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#071B3A] dark:text-white leading-snug">
              {isRtl ? "لوحة النمو والتطور التربوي" : "Educational Growth & Trajectory"}
            </h1>
            <p className="text-xs sm:text-sm text-[#071B3A]/65 dark:text-white/65 leading-relaxed">
              {isRtl
                ? "تتبع مسار المؤشرات التراكمية، ومقارنة الجلسات بمتوسط المعايير التعليمية"
                : "Continuous variance tracking against target pedagogical benchmarks"}
            </p>
          </div>

            <div className="flex items-center gap-2 bg-white dark:bg-white/5 px-3 py-1.5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 shadow-sm text-xs font-semibold text-[#071B3A]/70 dark:text-white/70">
              <span className="text-[#071B3A]/40 dark:text-white/40 ml-1 rtl:ml-1 ltr:mr-1">
                {isRtl ? "النطاق:" : "Scope:"}
              </span>
              <button
                type="button"
                onClick={() => setTimeScope("week")}
                className={`px-3.5 py-1.5 rounded-xl transition-colors duration-150 ${
                  timeScope === "week"
                    ? "bg-[#071B3A] text-white shadow-sm"
                    : "hover:text-[#071B3A] dark:hover:text-white"
                }`}
              >
                {isRtl ? "أسبوع" : "Week"}
              </button>
              <button
                type="button"
                onClick={() => setTimeScope("month")}
                className={`px-3.5 py-1.5 rounded-xl transition-colors duration-150 ${
                  timeScope === "month"
                    ? "bg-[#071B3A] text-white shadow-sm"
                    : "hover:text-[#071B3A] dark:hover:text-white"
                }`}
              >
                {isRtl ? "شهر" : "Month"}
              </button>
              <button
                type="button"
                onClick={() => setTimeScope("semester")}
                className={`px-3.5 py-1.5 rounded-xl transition-colors duration-150 ${
                  timeScope === "semester"
                    ? "bg-[#071B3A] text-white shadow-sm"
                    : "hover:text-[#071B3A] dark:hover:text-white"
                }`}
              >
                {isRtl ? "فصل كامل" : "Semester"}
              </button>
            </div>
        </section>

        {/* Section 1: Performance Trajectory Chart */}
        <section className="relative isolation-isolate w-full bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-[#071B3A]/5 dark:border-white/10">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#071B3A] dark:text-white">
                {isRtl ? "منحنى تطور الأداء" : "Performance Curve"}
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                {sessions.length === 0
                  ? (isRtl ? "تتبع بياني لمؤشر الكفاءة وتطور الجلسات" : "Visual tracking of pedagogical efficiency across sessions")
                  : (isRtl
                    ? `تغير مؤشر الكفاءة التدريسية عبر ${activeSessions.length} جلسات مكتملة`
                    : `Pedagogical score shifts across ${activeSessions.length} completed sessions`)}
              </p>
            </div>

            {sessions.length > 0 && (
              <div className="relative min-w-[200px]">
                <select
                  aria-label={isRtl ? "تصفية حسب المقياس" : "Filter by metric"}
                  value={activeMetric}
                  onChange={(e) => setActiveMetric(e.target.value as any)}
                  className="w-full appearance-none bg-[#F6F0E4]/60 dark:bg-white/10 border border-[#071B3A]/10 dark:border-white/15 rounded-2xl px-4 py-2 pl-9 rtl:pl-9 ltr:pr-9 text-xs sm:text-sm font-semibold text-[#071B3A] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#12B8C4] cursor-pointer"
                >
                  <option value="overallScore">{isRtl ? "الدرجة الكلية (%)" : "Overall Score (%)"}</option>
                  <option value="teacherTalkRatio">{isRtl ? "نسبة حديث المعلم (TTT)" : "Teacher Talk Time (TTT)"}</option>
                  <option value="socraticQuestionRate">{isRtl ? "الأسئلة السقراطية" : "Socratic Questioning"}</option>
                  <option value="inclusivityIndex">{isRtl ? "مؤشر الشمولية" : "Inclusivity Index"}</option>
                </select>
                <svg
                  className="w-4 h-4 text-[#071B3A]/60 dark:text-white/60 absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 sm:py-16 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-[#FFB52E]/15 text-[#071B3A] dark:text-[#FFB52E] flex items-center justify-center mx-auto">
                <Target className="w-7 h-7 text-[#071B3A] dark:text-[#FFB52E]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base sm:text-lg font-bold text-[#071B3A] dark:text-white">
                  {isRtl ? "لا توجد جلسات محاكاة مكتملة بعد" : "No Completed Simulation Sessions Yet"}
                </h3>
                <p className="text-xs sm:text-sm text-[#071B3A]/60 dark:text-white/60 leading-relaxed">
                  {isRtl
                    ? "ابدأ أول جلسة محاكاة تدريبية مع الطلاب الافتراضيين لإنشاء مؤشرات الأداء الحقيقية وتحليل نموك المهني."
                    : "Start your first interactive teaching simulation to generate telemetry and track your pedagogical growth curve."}
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/session/setup"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#FFB52E] hover:bg-[#E5A93C] text-[#071B3A] font-bold text-xs sm:text-sm shadow-md transition transform active:scale-95"
                >
                  <span>{isRtl ? "+ ابدأ أول جلسة محاكاة" : "+ Start First Simulation"}</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="relative w-full h-72 sm:h-80 mt-8">
                <div className="absolute inset-0 flex flex-col justify-between text-[11px] font-mono font-medium text-[#071B3A]/30 dark:text-white/30 pointer-events-none">
                <div className="flex items-center gap-3 w-full">
                  <span className="w-10 text-left">100%</span>
                  <div className="flex-grow border-b border-dashed border-[#071B3A]/10 dark:border-white/10" />
                </div>
                <div className="flex items-center gap-3 w-full">
                  <span className="w-10 text-left text-[#12B8C4] font-bold">50%</span>
                  <div className="flex-grow border-b border-dashed border-[#12B8C4]/30" />
                  <span className="text-[10px] bg-[#12B8C4]/10 px-2 py-0.5 rounded text-[#12B8C4] font-sans font-semibold">
                    {isRtl ? "الحد الأدنى المتوازن" : "Balanced Baseline"}
                  </span>
                </div>
                <div className="flex items-center gap-3 w-full">
                  <span className="w-10 text-left">0%</span>
                  <div className="flex-grow border-b border-[#071B3A]/15 dark:border-white/15" />
                </div>
              </div>

              <svg className="w-[calc(100%-3rem)] h-full mr-12 rtl:mr-12 ltr:ml-12 overflow-visible" viewBox="0 0 800 240" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradientFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#12B8C4" stopOpacity="0.25" />
                    <stop offset="70%" stopColor="#D96B58" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#D96B58" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {polygonPoints && activeSessions.length > 1 && (
                  <polygon points={polygonPoints} fill="url(#chartGradientFill)" />
                )}

                {polylinePoints && activeSessions.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#12B8C4"
                    strokeWidth="4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={polylinePoints}
                  />
                )}

                {/* If single session, show horizontal indicator line */}
                {activeSessions.length === 1 && chartPoints.length === 1 && (
                  <line
                    x1="40"
                    y1={chartPoints[0].y}
                    x2="760"
                    y2={chartPoints[0].y}
                    stroke="#12B8C4"
                    strokeWidth="3"
                    strokeDasharray="6,4"
                  />
                )}

                {chartPoints.map((p, idx) => {
                  const isLast = idx === chartPoints.length - 1;
                  const isDrop = isLast && p.val < 50;
                  const isHovered = hoveredPoint?.x === p.x;

                  return (
                    <g
                      key={idx}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      {/* Generous invisible hit target so hover never flickers or slips */}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="22"
                        fill="transparent"
                      />

                      {/* Drop glow halo */}
                      {isDrop && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 15 : 11}
                          fill="#D96B58"
                          opacity={isHovered ? "0.35" : "0.2"}
                          className="transition-all duration-200"
                        />
                      )}

                      {/* Hover ring for normal points */}
                      {isHovered && !isDrop && (
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="13"
                          fill="#12B8C4"
                          opacity="0.25"
                          className="transition-all duration-200"
                        />
                      )}

                      {/* Core point with smooth SVG radius scaling */}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? (isDrop ? 9 : 8) : (isDrop ? 8 : 6)}
                        fill={isDrop ? "#D96B58" : "#071B3A"}
                        stroke={isDrop ? "#FFFFFF" : "#12B8C4"}
                        strokeWidth={isHovered ? "3.5" : "3"}
                        className="transition-all duration-150"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Hover Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute bg-[#071B3A] text-white text-[11px] rounded-xl px-3 py-1.5 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full border border-white/10 z-20 whitespace-nowrap"
                  style={{
                    left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                    top: `${(hoveredPoint.y / svgHeight) * 100 - 8}%`,
                  }}
                >
                  <p className="font-bold text-[#FFB52E]">{hoveredPoint.topic}</p>
                  <p className="text-white/70">{hoveredPoint.date} — {hoveredPoint.val}%</p>
                </div>
              )}
            </div>

            <div className="mr-12 rtl:mr-12 ltr:ml-12 mt-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs font-medium">
              <span className="text-[#071B3A]/50 dark:text-white/50">{startDateStr || "—"}</span>

              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12B8C4]/10 border border-[#12B8C4]/20 text-[#12B8C4] font-bold">
                {scoreDiff !== null ? (
                  <>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      {scoreDiff < 0 ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      )}
                    </svg>
                    <span>
                      {scoreDiff < 0
                        ? (isRtl ? `المسار: في تراجع (${scoreDiff}% في آخر جلسة تفاعلية)` : `Trajectory: Decreasing (${scoreDiff}% in last session)`)
                        : (isRtl ? `المسار: في تحسن مستمر (+${scoreDiff}%)` : `Trajectory: Improving (+${scoreDiff}%)`)}
                    </span>
                  </>
                ) : (
                  <span>
                    {isRtl ? "الجلسة الأولى: نقطة انطلاق التقييم" : "Baseline Session: Initial Evaluation Point"}
                  </span>
                )}
              </div>

              <span className="text-[#071B3A]/50 dark:text-white/50">{endDateStr || "—"}</span>
            </div>
          </>
        )}
      </section>

      {/* Section 2: Four Key Quantitative Metrics (Cumulative Averages) */}
      <section className="relative isolation-isolate w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: الدرجة الكلية (Cumulative Average) */}
        <div className="min-h-[175px] bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-6 shadow-sm hover:border-[#12B8C4]/40 transition flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs text-[#071B3A]/50 dark:text-white/50 font-semibold">
            <span>{isRtl ? "الدرجة الكلية" : "Overall Score"}</span>
            <span className={`w-2.5 h-2.5 rounded-full ${avgScore && avgScore >= 50 ? "bg-[#12B8C4]" : "bg-[#D96B58]"}`} />
          </div>
          <div className="my-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-[#071B3A] dark:text-white tracking-tight">
              {avgScore !== null ? `${avgScore}%` : "—"}
            </span>
            {scoreDiff !== null && (
              <span className={`text-xs font-bold ${scoreDiff < 0 ? "text-[#D96B58]" : "text-[#12B8C4]"}`}>
                {scoreDiff < 0 ? `▼ ${Math.abs(scoreDiff)}%` : `▲ ${scoreDiff}%`}
              </span>
            )}
          </div>
          <div>
            <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden mb-2">
              <div
                className={`h-2 rounded-full ${avgScore && avgScore >= 50 ? "bg-[#12B8C4]" : "bg-[#D96B58]"}`}
                style={{ width: `${Math.min(100, avgScore ?? 0)}%` }}
              />
            </div>
            <span className="text-[11px] text-[#071B3A]/45 dark:text-white/45">
              {avgScore === null
                ? (isRtl ? "بانتظار أول جلسة محاكاة" : "Awaiting first simulation")
                : avgScore >= 75
                ? (isRtl ? "أداء استثنائي ومتقدم" : "High pedagogical mastery")
                : avgScore >= 50
                ? (isRtl ? "أداء متوازن ومستقر" : "Stable, balanced performance")
                : (isRtl ? "مستوى متراجع يستدعي المراجعة" : "Requires targeted review")}
            </span>
          </div>
        </div>

        {/* Metric 2: نسبة حديث المعلم (Cumulative Average) */}
        <div className="min-h-[175px] bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-6 shadow-sm hover:border-[#12B8C4]/40 transition flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs text-[#071B3A]/50 dark:text-white/50 font-semibold">
            <span>{isRtl ? "نسبة حديث المعلم" : "Teacher Talk Time"}</span>
            <span className={`w-2.5 h-2.5 rounded-full ${avgTTT && avgTTT >= 20 && avgTTT <= 35 ? "bg-[#12B8C4]" : "bg-[#FFB52E]"}`} />
          </div>
          <div className="my-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-[#071B3A] dark:text-white tracking-tight">
              {avgTTT !== null ? `${avgTTT}%` : "—"}
            </span>
            <span className={`text-xs font-bold ${avgTTT && avgTTT >= 20 && avgTTT <= 35 ? "text-[#12B8C4]" : "text-[#12B8C4]"}`}>
              {avgTTT === null
                ? "—"
                : avgTTT >= 10 && avgTTT <= 35
                ? (isRtl ? "ضمن النطاق المثالي" : "Ideal Range")
                : (isRtl ? "مقبول" : "Acceptable")}
            </span>
          </div>
          <div>
            <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="bg-[#12B8C4] h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, avgTTT ?? 0))}%` }}
              />
            </div>
            <span className="text-[11px] text-[#071B3A]/45 dark:text-white/45">
              {avgTTT !== null
                ? (isRtl ? "المعدل النموذجي: 20% - 35%" : "Standard Benchmark: 20% - 35%")
                : (isRtl ? "يُوصى بموازنة زمن حديث المعلم" : "Balance teacher talk time")}
            </span>
          </div>
        </div>

        {/* Metric 3: الأسئلة السقراطية (Cumulative Average) */}
        <div className="min-h-[175px] bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-6 shadow-sm hover:border-[#FFB52E]/40 transition flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs text-[#071B3A]/50 dark:text-white/50 font-semibold">
            <span>{isRtl ? "الأسئلة السقراطية" : "Socratic Questions"}</span>
            <span className={`w-2.5 h-2.5 rounded-full ${avgSocratic && avgSocratic >= 50 ? "bg-[#12B8C4]" : "bg-[#FFB52E]"}`} />
          </div>
          <div className="my-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-[#071B3A] dark:text-white tracking-tight">
              {avgSocratic !== null ? `${avgSocratic}%` : "—"}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                avgSocratic && avgSocratic >= 50
                  ? "text-[#12B8C4] bg-[#12B8C4]/15"
                  : "text-amber-800 dark:text-amber-300 bg-[#FFB52E]/20"
              }`}
            >
              {avgSocratic === null
                ? "—"
                : avgSocratic >= 50
                ? (isRtl ? "مستوى متقدم" : "Advanced")
                : (isRtl ? "يحتاج تحسين" : "Needs Practice")}
            </span>
          </div>
          <div>
            <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="bg-[#FFB52E] h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, avgSocratic ?? 0))}%` }}
              />
            </div>
            <span className="text-[11px] text-[#071B3A]/45 dark:text-white/45">
              {isRtl ? "المستهدف: أعلى من 50%" : "Target: Above 50%"}
            </span>
          </div>
        </div>

        {/* Metric 4: مؤشر الشمولية (Cumulative Average) */}
        <div className="min-h-[175px] bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-6 shadow-sm hover:border-[#12B8C4]/40 transition flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-[#071B3A]/50 dark:text-white/50 font-semibold">
              <span>{isRtl ? "مؤشر الشمولية" : "Inclusivity Index"}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${avgInclusivity && avgInclusivity >= 60 ? "bg-[#12B8C4]" : "bg-[#D96B58]"}`} />
            </div>
            <div className="my-4 flex items-baseline gap-2">
              <span className="text-4xl font-black text-[#071B3A] dark:text-white tracking-tight">
                {avgInclusivity !== null ? `${avgInclusivity}%` : "—"}
              </span>
              {inclusivityDiff !== null ? (
                <span className={`text-xs font-bold ${inclusivityDiff < 0 ? "text-[#D96B58]" : "text-[#12B8C4]"}`}>
                  {inclusivityDiff < 0
                    ? `▼ ${Math.abs(inclusivityDiff)}%`
                    : inclusivityDiff > 0
                    ? `▲ ${inclusivityDiff}% ${isRtl ? "تقدم" : "Progress"}`
                    : (isRtl ? "مستقر" : "Stable")}
                </span>
              ) : (
                <span className="text-xs font-bold text-[#12B8C4]">
                  {avgInclusivity === null
                    ? "—"
                    : avgInclusivity >= 60
                    ? (isRtl ? "تفاعل متكافئ" : "Balanced")
                    : (isRtl ? "تفاعل جزئي" : "Partial")}
                </span>
              )}
            </div>
            <div>
              <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden mb-2">
                <div
                  className="bg-[#12B8C4] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, avgInclusivity ?? 0))}%` }}
                />
              </div>
              <span className="text-[11px] text-[#071B3A]/45 dark:text-white/45">
                {avgInclusivity && avgInclusivity >= 60
                  ? (isRtl ? "تفاعل متكافئ لمعظم الطلاب" : "Equal participation across class")
                  : (isRtl ? "المستهدف: أعلى من 70%" : "Target: Above 70%")}
              </span>
            </div>
          </div>
        </section>

        {/* Section 3: Achievement Badges & Mastery (STRICTLY FROM BACKEND) */}
        <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-6 mb-6 border-b border-[#071B3A]/5 dark:border-white/10">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#071B3A] dark:text-white">
                {isRtl ? "شارات الإنجاز والتميز التربوي" : "Achievement Badges & Micro-Credentials"}
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                {isRtl
                  ? "معايير مهارية تعتمد وتفتح تلقائياً عند تحقيق أهداف تدريسية محددة"
                  : "Verified pedagogical competencies unlocked automatically upon meeting criteria"}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#071B3A] text-[#F6F0E4] border border-[#071B3A]/20 text-xs font-bold shadow-sm">
              <svg className="w-4 h-4 text-[#FFB52E]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span>
                {isRtl ? `تم فتح ${actualUnlockedCount} من 6 شارات` : `${actualUnlockedCount} of 6 Badges Unlocked`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {badgeDefs.map((b) => (
              <div
                key={b.key}
                className={`flex items-start gap-4 p-5 rounded-2xl border transition group ${
                  b.isUnlocked
                    ? "bg-[#12B8C4]/5 dark:bg-[#12B8C4]/10 border-[#12B8C4]/40"
                    : "bg-[#F6F0E4]/40 dark:bg-white/[0.03] border-[#071B3A]/10 dark:border-white/10 opacity-75 hover:opacity-100 hover:bg-[#F6F0E4]/70 dark:hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`w-12 h-12 p-3 rounded-2xl flex items-center justify-center shrink-0 shadow-inner transition group-hover:scale-105 ${
                    b.isUnlocked ? "bg-[#071B3A] text-[#12B8C4]" : "bg-[#071B3A]/90 text-white/50"
                  }`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={b.iconPath} />
                  </svg>
                </div>
                <div className="flex-grow space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm sm:text-base text-[#071B3A] dark:text-white">
                      {b.title}
                    </h3>
                    <span
                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                        b.isUnlocked
                          ? "text-[#12B8C4] bg-[#12B8C4]/15 border-[#12B8C4]/30 font-bold"
                          : "text-[#071B3A]/50 dark:text-white/50 bg-white/80 dark:bg-white/10 border-[#071B3A]/5 dark:border-white/10"
                      }`}
                    >
                      {b.isUnlocked ? (
                        <>
                          <Check className="w-2.5 h-2.5" />
                          <span>{isRtl ? "معتمدة ومفتوحة" : "Unlocked"}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-2.5 h-2.5" />
                          <span>{isRtl ? "مقفلة" : "Locked"}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-[#071B3A]/60 dark:text-white/60 leading-relaxed">
                    {b.description}
                  </p>
                  {b.isUnlocked && b.unlockedAt && (
                    <p className="text-[10px] text-[#12B8C4] font-medium pt-1">
                      {isRtl ? "تاريخ الاعتماد: " : "Unlocked on: "}
                      {new Date(b.unlockedAt).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Clean Corporate Footer */}
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
