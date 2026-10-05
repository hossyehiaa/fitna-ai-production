"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { type Language } from "@/lib/i18n";
import { type FrameworkScoresProps } from "./FrameworkScorecard";
import { Check, Lightbulb, Mic } from "lucide-react";

export type PlaybackTurn = {
  id: string;
  speaker: string;
  content: string;
  timestampMs: number;
  isTeacher: boolean;
  audioUrl?: string | null;
};

export type EvidenceMoment = {
  eventId: string;
  label: string;
  timestampMs: number;
};

import { cleanPedagogicalText } from "@/lib/utils/pedagogy";

export function ReportClient({
  session,
  report,
  transcript,
  evidenceMoments,
  lang,
}: {
  session: {
    id: string;
    overall_score: number | null;
    teacher_talk_ratio: number | null;
    socratic_question_rate: number | null;
    inclusivity_index: number | null;
    classroom_pattern: string | null;
    duration_minutes: number;
    started_at: string;
  };
  report: {
    summary_ar?: string | null;
    session_signal_ar?: string | null;
    strengths?: string[] | null;
    weaknesses?: string[] | null;
    recommendations?: string[] | null;
    evidence_moments?: unknown;
    framework_scores?: unknown;
    share_token?: string | null;
  } | null;
  transcript: PlaybackTurn[];
  evidenceMoments: EvidenceMoment[];
  lang: Language;
}) {
  const isRtl = lang === "ar";
  const [copied, setCopied] = useState(false);

  // Audio Playback Engine
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number | null>(null);
  const [loadingTurnId, setLoadingTurnId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const isPlayingAllRef = useRef(false);
  const turnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    isPlayingAllRef.current = isPlayingAll;
  }, [isPlayingAll]);

  function stopCurrentAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  // Ensure exported report always uses light background and light theme
  useEffect(() => {
    let wasDark = false;
    const handleBeforePrint = () => {
      wasDark = document.documentElement.classList.contains("dark");
      if (wasDark) {
        document.documentElement.classList.remove("dark");
      }
    };
    const handleAfterPrint = () => {
      if (wasDark) {
        document.documentElement.classList.add("dark");
      }
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  async function playTurnAtIndex(index: number, continueSequence = false) {
    if (index < 0 || index >= transcript.length) {
      setIsPlayingAll(false);
      setCurrentTurnIndex(null);
      return;
    }

    const turn = transcript[index];
    stopCurrentAudio();
    setCurrentTurnIndex(index);
    setLoadingTurnId(turn.id);
    setHighlightedTurnId(turn.id);

    // Scroll turn into view smoothly
    turnRefs.current[turn.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      let audioSourceUrl = "";
      if (turn.isTeacher && turn.audioUrl) {
        audioSourceUrl = turn.audioUrl;
      } else {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: turn.content,
            personaName: turn.speaker,
          }),
        });
        if (!res.ok) throw new Error("TTS generation failed");
        const blob = await res.blob();
        audioSourceUrl = URL.createObjectURL(blob);
        currentBlobUrlRef.current = audioSourceUrl;
      }

      const audio = new Audio(audioSourceUrl);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;

      audio.onended = () => {
        setLoadingTurnId(null);
        if (isPlayingAllRef.current) {
          const nextIndex = index + 1;
          if (nextIndex < transcript.length) {
            void playTurnAtIndex(nextIndex, true);
          } else {
            setIsPlayingAll(false);
            setCurrentTurnIndex(null);
          }
        } else {
          setCurrentTurnIndex(null);
        }
      };

      audio.onerror = () => {
        setLoadingTurnId(null);
        if (isPlayingAllRef.current) {
          void playTurnAtIndex(index + 1, true);
        } else {
          setCurrentTurnIndex(null);
        }
      };

      await audio.play();
      setLoadingTurnId(null);
    } catch (err) {
      console.error("Audio playback error:", err);
      setLoadingTurnId(null);
      if (continueSequence && isPlayingAllRef.current) {
        void playTurnAtIndex(index + 1, true);
      } else {
        setCurrentTurnIndex(null);
        setIsPlayingAll(false);
      }
    }
  }

  function handleTogglePlayAll() {
    if (isPlayingAll) {
      stopCurrentAudio();
      setIsPlayingAll(false);
      setCurrentTurnIndex(null);
    } else {
      setIsPlayingAll(true);
      const startIndex = currentTurnIndex !== null ? currentTurnIndex : 0;
      void playTurnAtIndex(startIndex, true);
    }
  }

  function handleSingleTurnClick(index: number) {
    if (currentTurnIndex === index && !isPlayingAll) {
      stopCurrentAudio();
      setCurrentTurnIndex(null);
    } else {
      setIsPlayingAll(false);
      void playTurnAtIndex(index, false);
    }
  }

  function handleSpeedChange(speed: number) {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }

  function handleJumpToMoment(eventId: string) {
    const idx = transcript.findIndex((t) => t.id === eventId);
    if (idx !== -1) {
      turnRefs.current[eventId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      void playTurnAtIndex(idx, false);
    }
  }

  function handleShare() {
    if (!report?.share_token) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/report/share/${report.share_token}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function handlePrint() {
    const wasDark = document.documentElement.classList.contains("dark");
    if (wasDark) {
      document.documentElement.classList.remove("dark");
    }
    window.print();
    if (wasDark) {
      setTimeout(() => {
        document.documentElement.classList.add("dark");
      }, 1000);
    }
  }

  const score = session.overall_score ?? 0;
  const circumference = 364.4;
  const scoreOffset = Math.max(0, circumference - (circumference * score) / 100);

  const d = new Date(session.started_at);
  const formattedDate = d.toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const patternName =
    session.classroom_pattern === "disruptive"
      ? (isRtl ? "نشط ومقاطعات" : "Disruptive & Active")
      : session.classroom_pattern === "disengaged"
      ? (isRtl ? "خامل وهادئ" : "Passive & Quiet")
      : (isRtl ? "متوازن ومعياري" : "Balanced & Standard");

  const frameworkScores = report?.framework_scores as FrameworkScoresProps | null | undefined;

  return (
    <div
      className="bg-[#F6F0E4] dark:bg-[#05142B] text-[#071B3A] dark:text-white font-readex antialiased min-h-screen flex flex-col selection:bg-[#12B8C4]/20 selection:text-[#071B3A] transition-colors"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Sticky Nile Top Navigation Bar */}
      <header className="bg-[#071B3A]/95 text-white sticky top-0 z-40 border-b border-white/10 backdrop-blur-md shadow-md print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Cluster */}
          <div className="flex items-center gap-3.5 sm:gap-5">
            <Link href="/dashboard/teacher" className="flex items-center group py-1" title={isRtl ? "لوحة التحكم" : "Dashboard"}>
              <Logo variant="light" height={38} className="transition-transform duration-200 group-hover:scale-105" />
            </Link>
            <div className="h-5 w-px bg-white/15 hidden sm:block" />
            <div className="hidden sm:block text-start">
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-wider uppercase bg-[#12B8C4]/20 text-[#12B8C4] px-2 py-0.5 rounded font-mono font-semibold">
                  AI Analytics
                </span>
                <span className="text-white/20 text-xs">/</span>
                <span className="text-xs text-white/80 font-medium">
                  {isRtl ? "تقرير الجلسة المعتمد" : "Session Report"}
                </span>
              </div>
              <p className="text-[11px] text-white/50 mt-0.5">
                {isRtl ? "التقييم البيداغوجي وفق معايير CLASS و Danielson" : "Evaluation based on CLASS & Danielson Frameworks"}
              </p>
            </div>
          </div>

          {/* Action Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-3 print:hidden">
            {/* Return to Dashboard */}
            <Link
              href="/dashboard/teacher"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/10 active:scale-95 cursor-pointer"
              title={isRtl ? "لوحة التحكم" : "Dashboard"}
            >
              <svg
                className="w-3.5 h-3.5 text-[#12B8C4] rtl:rotate-0 ltr:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span className="hidden sm:inline">{isRtl ? "لوحة التحكم" : "Dashboard"}</span>
            </Link>

            {/* Share Report */}
            {report?.share_token && (
              <button
                type="button"
                onClick={handleShare}
                className="px-2.5 sm:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10 active:scale-95 cursor-pointer"
                title={copied ? (isRtl ? "تم نسخ الرابط!" : "Copied!") : (isRtl ? "مشاركة" : "Share")}
              >
                <svg className="w-3.5 h-3.5 text-[#12B8C4]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                <span className="hidden sm:inline">{copied ? (isRtl ? "تم نسخ الرابط!" : "Copied!") : (isRtl ? "مشاركة" : "Share")}</span>
              </button>
            )}

            {/* Export PDF / Print */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 sm:px-4 py-2 rounded-xl bg-[#FFB52E] hover:bg-[#FFB52E]/90 text-[#071B3A] text-xs font-black transition flex items-center gap-1.5 shadow-sm border border-amber-400 active:scale-95 cursor-pointer"
              title={isRtl ? "تصدير PDF" : "Print PDF"}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span className="hidden sm:inline">{isRtl ? "تصدير PDF" : "Print PDF"}</span>
              <span className="sm:hidden">PDF</span>
            </button>

            <div className="h-5 w-px bg-white/15 hidden md:block" />
            <div className="hidden md:flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Document Canvas */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 w-full flex-grow space-y-8 print:py-0 print:space-y-5">
        {/* Formal Institutional Header for Print / PDF Export */}
        <div className="hidden print:flex items-center justify-between pb-5 mb-4 border-b-2 border-[#071B3A] w-full">
          <div className="flex items-center gap-4">
            <Logo variant="dark" height={52} />
            <div className="text-start">
              <h1 className="text-xl font-black text-[#071B3A] tracking-tight leading-tight">
                {isRtl ? "تقرير التقييم البيداغوجي المعتمد" : "Certified Pedagogical Assessment Report"}
              </h1>
              <p className="text-xs text-[#071B3A]/70 font-semibold mt-0.5">
                {isRtl
                  ? "نظام فطنة للذكاء الاصطناعي التربوي • معايير CLASS & Danielson"
                  : "Fitna AI Pedagogical System • CLASS & Danielson Standards"}
              </p>
            </div>
          </div>

          <div className="text-end text-xs font-mono grid grid-cols-2 gap-x-4 gap-y-1 bg-[#F6F0E4]/60 p-3 rounded-xl border border-[#071B3A]/10">
            <div>
              <span className="text-[#071B3A]/60">{isRtl ? "تاريخ التقييم: " : "Date: "}</span>
              <strong className="text-[#071B3A] font-bold">{formattedDate}</strong>
            </div>
            <div>
              <span className="text-[#071B3A]/60">{isRtl ? "مدة الجلسة: " : "Duration: "}</span>
              <strong className="text-[#071B3A] font-bold">{session.duration_minutes} دقيقة</strong>
            </div>
            <div>
              <span className="text-[#071B3A]/60">{isRtl ? "نمط الفصل: " : "Pattern: "}</span>
              <strong className="text-[#071B3A] font-bold">{patternName}</strong>
            </div>
            <div>
              <span className="text-[#071B3A]/60">{isRtl ? "رقم الجلسة: " : "ID: "}</span>
              <strong className="text-[#071B3A] font-bold">#{session.id.slice(0, 8).toUpperCase()}</strong>
            </div>
          </div>
        </div>

        {/* 1. Hero Score Banner (Organized Layout) */}
        <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-8 sm:p-10 shadow-sm relative overflow-hidden flex flex-col items-center text-center print:p-6 print:rounded-2xl space-y-6">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-[#FFB52E] via-[#12B8C4] to-[#D96B58]" />

          {/* Organized Metadata Chips Strip */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {/* Pattern Chip */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A] dark:text-white border border-[#071B3A]/10 dark:border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
              <span className="text-[#071B3A]/60 dark:text-white/60">{isRtl ? "النمط:" : "Pattern:"}</span>
              <strong>{patternName}</strong>
            </div>

            {/* Date Chip */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A] dark:text-white border border-[#071B3A]/10 dark:border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#FFB52E]" />
              <span className="text-[#071B3A]/60 dark:text-white/60">{isRtl ? "التاريخ:" : "Date:"}</span>
              <span className="font-mono">{formattedDate}</span>
            </div>

            {/* Duration Chip */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A] dark:text-white border border-[#071B3A]/10 dark:border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
              <span className="text-[#071B3A]/60 dark:text-white/60">{isRtl ? "المدة:" : "Duration:"}</span>
              <span className="font-mono">{session.duration_minutes} {isRtl ? "دقيقة" : "min"}</span>
            </div>
          </div>

          {/* Main Radial Score Dial */}
          <div className="relative w-52 h-52 sm:w-56 sm:h-56 flex items-center justify-center my-1 print:w-44 print:h-44">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="#F6F0E4" strokeWidth="12" className="dark:stroke-white/10" />
              <circle
                cx="70"
                cy="70"
                r="58"
                fill="none"
                stroke="#12B8C4"
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={scoreOffset}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl sm:text-6xl font-black text-[#071B3A] dark:text-white tracking-tight font-mono print:text-5xl">
                {score}
                <span className="text-3xl text-[#12B8C4]">%</span>
              </span>
              <span className="text-xs font-bold text-[#071B3A]/60 dark:text-white/60 uppercase tracking-wider mt-1">
                {isRtl ? "الدرجة الكلية المركبة" : "Composite Score"}
              </span>
            </div>
          </div>

          {/* Diagnostic Statement Box */}
          <div className="max-w-2xl w-full bg-[#F6F0E4]/50 dark:bg-white/[0.03] p-5 rounded-2xl border border-[#071B3A]/5 dark:border-white/5 space-y-2">
            <h2 className="text-base sm:text-lg font-black text-[#D96B58] leading-snug">
              {cleanPedagogicalText(report?.session_signal_ar || (isRtl ? "تقرير التقييم البيداغوجي المعتمد" : "Pedagogical Assessment Summary"))}
            </h2>
            <p className="text-xs sm:text-sm text-[#071B3A]/80 dark:text-white/80 leading-relaxed font-medium">
              {cleanPedagogicalText(report?.summary_ar || (isRtl ? "أظهرت الجلسة تفاعلاً عاماً في الفصل، ويمكن تحسين الأداء بالتركيز على الأسئلة السقراطية المفتوحة." : "Session performance evaluated across key pedagogical indicators."))}
            </p>
          </div>
        </section>

        {/* 2. Core Triad Metrics (Cleanly Aligned) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* TTT */}
          <div className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm flex flex-col justify-between hover:border-[#12B8C4]/40 transition space-y-4">
            <div className="flex justify-between items-center text-xs font-bold text-[#071B3A]/60 dark:text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                {isRtl ? "نسبة حديث المعلم (TTT)" : "Teacher Talk Time (TTT)"}
              </span>
              <span className="font-mono text-[10px] bg-[#F6F0E4] dark:bg-white/10 px-2.5 py-1 rounded-md">
                {isRtl ? "المعيار: 25-40%" : "Benchmark: 25-40%"}
              </span>
            </div>
            <div>
              <span className="text-4xl sm:text-5xl font-black text-[#071B3A] dark:text-white font-mono">
                {session.teacher_talk_ratio ?? 0}%
              </span>
              <span className="inline-block mr-2 rtl:mr-2 ltr:ml-2 text-xs font-bold text-[#12B8C4] bg-[#12B8C4]/10 px-2.5 py-1 rounded-md">
                {(session.teacher_talk_ratio ?? 0) <= 50 ? (isRtl ? "متوازن ومثالي" : "Balanced") : (isRtl ? "مرتفع نسبياً" : "High")}
              </span>
            </div>
            <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#12B8C4] h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, session.teacher_talk_ratio ?? 0)}%` }}
              />
            </div>
          </div>

          {/* Socratic Questions */}
          <div className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm flex flex-col justify-between hover:border-[#D96B58]/40 transition space-y-4">
            <div className="flex justify-between items-center text-xs font-bold text-[#071B3A]/60 dark:text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
                {isRtl ? "الأسئلة السقراطية" : "Socratic Questions"}
              </span>
              <span className="font-mono text-[10px] bg-[#D96B58]/10 text-[#D96B58] px-2.5 py-1 rounded-md">
                {isRtl ? "المستهدف: > 50%" : "Target: > 50%"}
              </span>
            </div>
            <div>
              <span className="text-4xl sm:text-5xl font-black text-[#D96B58] font-mono">
                {session.socratic_question_rate ?? 0}%
              </span>
              <span className="inline-block mr-2 rtl:mr-2 ltr:ml-2 text-xs font-bold text-[#D96B58] bg-[#D96B58]/10 px-2.5 py-1 rounded-md">
                {(session.socratic_question_rate ?? 0) >= 50
                  ? (isRtl ? "تفكير سابر متميز" : "Excellent")
                  : (isRtl ? "بحاجة لمزيد من الأسئلة المفتوحة" : "Needs Growth")}
              </span>
            </div>
            <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#D96B58] h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, session.socratic_question_rate ?? 0)}%` }}
              />
            </div>
          </div>

          {/* Inclusivity Index */}
          <div className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-6 sm:p-7 shadow-sm flex flex-col justify-between hover:border-[#12B8C4]/40 transition space-y-4">
            <div className="flex justify-between items-center text-xs font-bold text-[#071B3A]/60 dark:text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                {isRtl ? "مؤشر الشمولية الصفية" : "Inclusivity Index"}
              </span>
              <span className="font-mono text-[10px] bg-[#12B8C4]/10 text-[#12B8C4] px-2.5 py-1 rounded-md">
                {isRtl ? "تغطية الفصل" : "Full Coverage"}
              </span>
            </div>
            <div>
              <span className="text-4xl sm:text-5xl font-black text-[#12B8C4] font-mono">
                {session.inclusivity_index ?? 0}%
              </span>
              <span className="inline-block mr-2 rtl:mr-2 ltr:ml-2 text-xs font-bold text-[#12B8C4] bg-[#12B8C4]/10 px-2.5 py-1 rounded-md">
                {(session.inclusivity_index ?? 0) >= 75 ? (isRtl ? "تفاعل متكافئ كامل" : "Equitable") : (isRtl ? "مشاركة جزئية" : "Partial")}
              </span>
            </div>
            <div className="w-full bg-[#F6F0E4] dark:bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#12B8C4] h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, session.inclusivity_index ?? 0)}%` }}
              />
            </div>
          </div>
        </section>

        {/* 3. Qualitative Review Grid (Balanced Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Summary + Strengths Column */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-7 sm:p-8 shadow-sm space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold text-[#071B3A]/60 dark:text-white/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#071B3A]/40 dark:bg-white/40" />
                  <span>{isRtl ? "ملخص الأداء العام" : "Performance Summary"}</span>
                </h3>
                <p className="text-xs sm:text-sm text-[#071B3A]/85 dark:text-white/85 leading-relaxed bg-[#F6F0E4]/40 dark:bg-white/5 p-4 rounded-2xl border border-[#071B3A]/5 dark:border-white/5">
                  {cleanPedagogicalText(report?.summary_ar || (isRtl ? "توضح هذه الجلسة ممارسات المعلم والتفاعل الصفي المباشر." : "General performance summary."))}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-bold text-[#12B8C4] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#12B8C4]" />
                  <span>{isRtl ? "نقاط القوة المرصودة" : "Observed Strengths"}</span>
                </h3>
                <div className="space-y-3">
                  {(report?.strengths && report.strengths.length > 0
                    ? report.strengths
                    : [
                        isRtl ? "المعلم أظهر تشجيعاً عاماً للطلاب وطلب التركيز أثناء المحاكاة." : "Maintained class focus.",
                        isRtl ? "استجابة سريعة لاستفسارات الطلاب في المواقف الصفية." : "Responded to student inquiries.",
                      ]
                  ).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-[#F6F0E4]/35 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/5 text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed flex items-start gap-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#12B8C4]/20 text-[#12B8C4] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <p>{cleanPedagogicalText(item)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Areas for Improvement + Actionable Advice Column */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-7 sm:p-8 shadow-sm space-y-6 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-[#D96B58] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D96B58]" />
                <span>{isRtl ? "مجالات تحتاج إلى تحسين" : "Areas for Improvement"}</span>
              </h3>
              <div className="space-y-3">
                {(report?.weaknesses && report.weaknesses.length > 0
                  ? report.weaknesses
                  : [
                      isRtl ? "الحاجة إلى زيادة وتيرة الأسئلة السقراطية والاستفسارات التحفيزية." : "Incorporate deeper inquiry.",
                      isRtl ? "توضيح الهدف الرئيسي للدرس بصورة محددة ومسبقة للطلاب." : "Clarify objective early.",
                    ]
                ).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-[#F6F0E4]/35 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/5 text-xs text-[#071B3A]/80 dark:text-white/80 leading-relaxed flex items-start gap-2.5"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#D96B58]/20 text-[#D96B58] flex items-center justify-center shrink-0 font-bold mt-0.5">
                      !
                    </span>
                    <p>{cleanPedagogicalText(item)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations Card */}
            <div className="bg-[#071B3A] dark:bg-[#0B2349] text-[#F6F0E4] p-5 sm:p-6 rounded-2xl border border-white/10 space-y-2.5">
              <span className="text-xs font-bold text-[#FFB52E] flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-[#FFB52E]" /> {isRtl ? "توصيات مخصصة لجلستك القادمة:" : "Recommendations for Next Session:"}
              </span>
              <ul className="text-xs text-white/85 space-y-2 list-disc list-inside leading-relaxed">
                {(report?.recommendations && report.recommendations.length > 0
                  ? report.recommendations
                  : [
                      isRtl ? "تحديد هدف واضح للدرس في البداية واستخدام عبارات مثل 'اليوم سنتعلم عن...'" : "Set a clear goal early.",
                      isRtl ? "إدراج أسئلة مفتوحة تستدعي التفكير والتحقق من الفهم قبل الانتقال." : "Incorporate open-ended inquiry.",
                      isRtl ? "استخدام استراتيجيات تفاعلية مثل العصف الذهني لتفعيل مشاركة الجميع." : "Use participatory strategies.",
                    ]
                ).map((rec, idx) => (
                  <li key={idx} className="leading-relaxed">{cleanPedagogicalText(rec)}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* 4. Global Educational Frameworks (Danielson & CLASS) */}
        {frameworkScores && (
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-7 sm:p-9 shadow-sm space-y-8 print:break-before-page print:p-6 print:space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#071B3A] text-white mb-2">
                {isRtl ? "المعايير الدولية" : "International Standards"}
              </div>
              <h2 className="text-xl font-bold text-[#071B3A] dark:text-white">
                {isRtl ? "التقييم وفق الأطر التربوية المعتمدة" : "Framework Assessment"}
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                {isRtl
                  ? "تحليل ممارسات المعلم بالاستناد إلى معايير Danielson Framework ومنظومة CLASS للبيئة الصفية"
                  : "Analysis benchmarked against Danielson Framework and CLASS Classroom Environment"}
              </p>
            </div>

            {/* Danielson Group */}
            {frameworkScores.danielson && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#071B3A]/5 dark:border-white/10">
                  <h3 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-md bg-[#12B8C4]" />
                    <span>{isRtl ? "إطار دانييلسون للتدريس (Danielson Framework)" : "Danielson Framework"}</span>
                  </h3>
                  <span className="text-[11px] font-mono text-[#071B3A]/50 dark:text-white/50">
                    {isRtl ? "مقياس من 1 إلى 4" : "Scale 1 to 4"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {frameworkScores.danielson.questioningDiscussion && (
                    <div className="p-5 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-xs text-[#071B3A] dark:text-white">
                            {isRtl ? "تقنيات الأسئلة والنقاش (3b)" : "Questioning & Discussion (3b)"}
                          </h4>
                          <span className="font-mono text-xs font-bold text-[#D96B58] bg-[#D96B58]/15 px-2.5 py-0.5 rounded-md">
                            {frameworkScores.danielson.questioningDiscussion.score} / 4
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-[#D96B58] block mb-2">
                          {isRtl ? `المستوى: ${frameworkScores.danielson.questioningDiscussion.label}` : frameworkScores.danielson.questioningDiscussion.label}
                        </span>
                        <p className="text-xs text-[#071B3A]/70 dark:text-white/70 leading-relaxed">
                          {cleanPedagogicalText(frameworkScores.danielson.questioningDiscussion.feedback)}
                        </p>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 mt-4 overflow-hidden">
                        <div
                          className="bg-[#D96B58] h-1.5 rounded-full"
                          style={{ width: `${(frameworkScores.danielson.questioningDiscussion.score / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {frameworkScores.danielson.studentEngagement && (
                    <div className="p-5 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-xs text-[#071B3A] dark:text-white">
                            {isRtl ? "إشراك الطلاب في التعلم (3c)" : "Student Engagement (3c)"}
                          </h4>
                          <span className="font-mono text-xs font-bold text-amber-800 dark:text-[#FFB52E] bg-[#FFB52E]/20 px-2.5 py-0.5 rounded-md">
                            {frameworkScores.danielson.studentEngagement.score} / 4
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-amber-800 dark:text-[#FFB52E] block mb-2">
                          {isRtl ? `المستوى: ${frameworkScores.danielson.studentEngagement.label}` : frameworkScores.danielson.studentEngagement.label}
                        </span>
                        <p className="text-xs text-[#071B3A]/70 dark:text-white/70 leading-relaxed">
                          {cleanPedagogicalText(frameworkScores.danielson.studentEngagement.feedback)}
                        </p>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 mt-4 overflow-hidden">
                        <div
                          className="bg-[#FFB52E] h-1.5 rounded-full"
                          style={{ width: `${(frameworkScores.danielson.studentEngagement.score / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {frameworkScores.danielson.managingBehavior && (
                    <div className="p-5 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-xs text-[#071B3A] dark:text-white">
                            {isRtl ? "إدارة سلوك الطلاب (2d)" : "Managing Behavior (2d)"}
                          </h4>
                          <span className="font-mono text-xs font-bold text-[#12B8C4] bg-[#12B8C4]/15 px-2.5 py-0.5 rounded-md">
                            {frameworkScores.danielson.managingBehavior.score} / 4
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-[#12B8C4] block mb-2">
                          {isRtl ? `المستوى: ${frameworkScores.danielson.managingBehavior.label}` : frameworkScores.danielson.managingBehavior.label}
                        </span>
                        <p className="text-xs text-[#071B3A]/70 dark:text-white/70 leading-relaxed">
                          {cleanPedagogicalText(frameworkScores.danielson.managingBehavior.feedback)}
                        </p>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 mt-4 overflow-hidden">
                        <div
                          className="bg-[#12B8C4] h-1.5 rounded-full"
                          style={{ width: `${(frameworkScores.danielson.managingBehavior.score / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CLASS Group */}
            {frameworkScores.classFramework && (
              <div className="space-y-4 pt-4 border-t border-[#071B3A]/5 dark:border-white/10">
                <div className="flex items-center justify-between pb-2 border-b border-[#071B3A]/5 dark:border-white/10">
                  <h3 className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-md bg-[#FFB52E]" />
                    <span>{isRtl ? "منظومة كلاس للبيئة الصفية (CLASS Framework)" : "CLASS Framework"}</span>
                  </h3>
                  <span className="text-[11px] font-mono text-[#071B3A]/50 dark:text-white/50">
                    {isRtl ? "مقياس من 1 إلى 7" : "Scale 1 to 7"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {frameworkScores.classFramework.instructionalSupport && (
                    <div className="p-5 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-xs text-[#071B3A] dark:text-white">
                            {isRtl ? "الدعم التعليمي (Instructional)" : "Instructional Support"}
                          </h4>
                          <span className="font-mono text-xs font-bold text-amber-800 dark:text-[#FFB52E] bg-[#FFB52E]/20 px-2.5 py-0.5 rounded-md">
                            {frameworkScores.classFramework.instructionalSupport.score} / 7
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-amber-800 dark:text-[#FFB52E] block mb-2">
                          {isRtl ? `المستوى: ${frameworkScores.classFramework.instructionalSupport.label}` : frameworkScores.classFramework.instructionalSupport.label}
                        </span>
                        <p className="text-xs text-[#071B3A]/70 dark:text-white/70 leading-relaxed">
                          {cleanPedagogicalText(frameworkScores.classFramework.instructionalSupport.feedback)}
                        </p>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 mt-4 overflow-hidden">
                        <div
                          className="bg-[#FFB52E] h-1.5 rounded-full"
                          style={{ width: `${(frameworkScores.classFramework.instructionalSupport.score / 7) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {frameworkScores.classFramework.classroomOrganization && (
                    <div className="p-5 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-xs text-[#071B3A] dark:text-white">
                            {isRtl ? "تنظيم الفصل (Organization)" : "Classroom Organization"}
                          </h4>
                          <span className="font-mono text-xs font-bold text-[#12B8C4] bg-[#12B8C4]/15 px-2.5 py-0.5 rounded-md">
                            {frameworkScores.classFramework.classroomOrganization.score} / 7
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-[#12B8C4] block mb-2">
                          {isRtl ? `المستوى: ${frameworkScores.classFramework.classroomOrganization.label}` : frameworkScores.classFramework.classroomOrganization.label}
                        </span>
                        <p className="text-xs text-[#071B3A]/70 dark:text-white/70 leading-relaxed">
                          {cleanPedagogicalText(frameworkScores.classFramework.classroomOrganization.feedback)}
                        </p>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 mt-4 overflow-hidden">
                        <div
                          className="bg-[#12B8C4] h-1.5 rounded-full"
                          style={{ width: `${(frameworkScores.classFramework.classroomOrganization.score / 7) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {frameworkScores.classFramework.emotionalSupport && (
                    <div className="p-5 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/5 dark:border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-xs text-[#071B3A] dark:text-white">
                            {isRtl ? "الدعم النفسي (Emotional)" : "Emotional Support"}
                          </h4>
                          <span className="font-mono text-xs font-bold text-[#12B8C4] bg-[#12B8C4]/15 px-2.5 py-0.5 rounded-md">
                            {frameworkScores.classFramework.emotionalSupport.score} / 7
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-[#12B8C4] block mb-2">
                          {isRtl ? `المستوى: ${frameworkScores.classFramework.emotionalSupport.label}` : frameworkScores.classFramework.emotionalSupport.label}
                        </span>
                        <p className="text-xs text-[#071B3A]/70 dark:text-white/70 leading-relaxed">
                          {cleanPedagogicalText(frameworkScores.classFramework.emotionalSupport.feedback)}
                        </p>
                      </div>
                      <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-1.5 mt-4 overflow-hidden">
                        <div
                          className="bg-[#12B8C4] h-1.5 rounded-full"
                          style={{ width: `${(frameworkScores.classFramework.emotionalSupport.score / 7) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 5. Audio Evidence Cards (Cleanly Aligned Grid & Table) */}
        {evidenceMoments.length > 0 && (
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-7 sm:p-9 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-[#071B3A]/5 dark:border-white/10">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFB52E]" />
                  <span>{isRtl ? "أدلة من الجلسة والتسجيل الصوتي" : "Audio Evidence Markers"}</span>
                </h2>
                <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                  {isRtl
                    ? "اضغط على أي دليل للانتقال للسطر والاستماع للتسجيل الصوتي الفعلي"
                    : "Click any evidence card to jump to the moment and listen to the audio"}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#12B8C4]/15 text-[#12B8C4] border border-[#12B8C4]/30">
                {isRtl ? `${evidenceMoments.length} أدلة موثقة` : `${evidenceMoments.length} Recorded Evidences`}
              </span>
            </div>

            {/* Web View: Interactive Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:hidden">
              {evidenceMoments.map((m, idx) => {
                const totalSeconds = Math.floor(m.timestampMs / 1000);
                const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
                const secs = String(totalSeconds % 60).padStart(2, "0");

                return (
                  <div
                    key={idx}
                    onClick={() => handleJumpToMoment(m.eventId)}
                    className="p-4 rounded-2xl bg-[#F6F0E4]/40 dark:bg-white/5 border border-[#071B3A]/10 dark:border-white/10 hover:bg-[#F6F0E4]/70 dark:hover:bg-white/10 transition flex items-center justify-between cursor-pointer group space-x-3 rtl:space-x-reverse"
                  >
                    <div className="space-y-1">
                      <h4 className="font-bold text-xs text-[#071B3A] dark:text-white group-hover:text-[#12B8C4] transition leading-snug">
                        {cleanPedagogicalText(m.label)}
                      </h4>
                      <span className="text-[10px] font-mono text-[#071B3A]/50 dark:text-white/50 block">
                        {isRtl ? `الموقع: ${mins}:${secs}` : `Timestamp: ${mins}:${secs}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="w-9 h-9 rounded-xl bg-[#071B3A] dark:bg-white/10 text-[#FFB52E] flex items-center justify-center shrink-0 shadow transition group-hover:scale-105 print:hidden cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Print View: Structured Evidence Table */}
            <div className="hidden print:block overflow-hidden rounded-xl border border-[#071B3A]/20 mt-3">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F6F0E4] border-b border-[#071B3A]/15 text-[#071B3A] font-bold">
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3 w-28 text-center">{isRtl ? "التوقيت" : "Time"}</th>
                    <th className="py-2.5 px-4 text-start">{isRtl ? "الموقف البيداغوجي الموثق من الجلسة" : "Observed Pedagogical Moment"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#071B3A]/10 text-[#071B3A]">
                  {evidenceMoments.map((m, idx) => {
                    const totalSeconds = Math.floor(m.timestampMs / 1000);
                    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
                    const secs = String(totalSeconds % 60).padStart(2, "0");
                    return (
                      <tr key={idx} className="bg-white">
                        <td className="py-2 px-3 text-center font-bold text-[#071B3A]/50">{idx + 1}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-[#12B8C4]">{mins}:{secs}</td>
                        <td className="py-2 px-4 font-semibold text-[#071B3A] leading-relaxed">{cleanPedagogicalText(m.label)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 6. Full Audio Player & Transcript Log (Print Hidden) */}
        <section className="bg-white dark:bg-white/5 rounded-3xl border border-[#071B3A]/10 dark:border-white/10 p-7 sm:p-9 shadow-sm space-y-6 print:hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-5 border-b border-[#071B3A]/5 dark:border-white/10">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#071B3A] dark:text-white flex items-center gap-2">
                <Mic className="w-5 h-5 text-[#12B8C4]" />
                <span>{isRtl ? "تسجيل وتشغيل الجلسة" : "Session Playback & Transcript"}</span>
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                {isRtl
                  ? "استمع لتسجيل الجلسة بالكامل بصوت المعلم الحقيقي المسجل من المايك وأصوات الطلاب التفاعلية"
                  : "Listen to the complete session with authentic teacher microphone audio and student responses"}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F6F0E4] dark:bg-white/10 text-[#071B3A]/70 dark:text-white/70 border border-[#071B3A]/10 dark:border-white/10">
              {isRtl ? `${transcript.length} حوار مسجل` : `${transcript.length} Recorded Turns`}
            </span>
          </div>

          {/* Master Audio Deck */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#F6F0E4]/50 dark:bg-white/5 border border-[#071B3A]/10 dark:border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Play Controls */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTogglePlayAll}
                  className="px-6 py-2.5 rounded-2xl bg-[#12B8C4] hover:bg-[#12B8C4]/90 text-[#071B3A] font-black text-xs sm:text-sm flex items-center gap-2 shadow-sm transition cursor-pointer active:scale-95"
                >
                  {isPlayingAll ? (
                    <>
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                      <span>{isRtl ? "إيقاف مؤقت" : "Pause Session"}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      <span>{isRtl ? "تشغيل الجلسة كاملة" : "Play Entire Session"}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Speed Switcher */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-white/10 p-1 rounded-xl border border-[#071B3A]/10 dark:border-white/10 text-xs font-semibold">
                <span className="text-[#071B3A]/40 dark:text-white/40 px-2">{isRtl ? "السرعة:" : "Speed:"}</span>
                {[0.75, 1.0, 1.25, 1.5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSpeedChange(s)}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      playbackSpeed === s
                        ? "bg-[#071B3A] text-white shadow-sm"
                        : "text-[#071B3A]/60 dark:text-white/60 hover:text-[#071B3A] dark:hover:text-white"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Progress Bar / Scrubber */}
            <div className="space-y-1 pt-2">
              <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 rounded-full h-2 relative overflow-hidden">
                <div
                  className="bg-[#12B8C4] h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      transcript.length > 0 && currentTurnIndex !== null
                        ? ((currentTurnIndex + 1) / transcript.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[#071B3A]/50 dark:text-white/50">
                <span>
                  {currentTurnIndex !== null
                    ? `${currentTurnIndex + 1} / ${transcript.length}`
                    : "0 / " + transcript.length}
                </span>
                <span>{session.duration_minutes}:00 {isRtl ? "دقيقة" : "min"}</span>
              </div>
            </div>
          </div>

          {/* Transcript Dialogue Stream */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scroll pr-1">
            {transcript.length === 0 ? (
              <p className="p-6 text-center text-xs text-[#071B3A]/50 dark:text-white/50">
                {isRtl ? "لا توجد حوارات مسجلة لهذه الجلسة." : "No transcript events recorded."}
              </p>
            ) : (
              transcript.map((t, idx) => {
                const isPlaying = currentTurnIndex === idx;
                const isLoading = loadingTurnId === t.id;
                const isHighlighted = highlightedTurnId === t.id;
                const totalSec = Math.floor(t.timestampMs / 1000);
                const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
                const s = String(totalSec % 60).padStart(2, "0");

                return (
                  <div
                    key={t.id}
                    ref={(el) => {
                      turnRefs.current[t.id] = el;
                    }}
                    className={`p-4 rounded-2xl border transition flex items-start justify-between gap-4 ${
                      isPlaying
                        ? "bg-[#12B8C4]/15 border-[#12B8C4]/40 shadow-sm"
                        : isHighlighted
                        ? "bg-[#FFB52E]/10 border-[#FFB52E]/30"
                        : "bg-[#F6F0E4]/35 dark:bg-white/[0.02] border-[#071B3A]/5 dark:border-white/5 hover:bg-[#F6F0E4]/60 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#071B3A] dark:text-white">{t.speaker}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            t.isTeacher
                              ? "bg-[#12B8C4]/15 text-[#12B8C4] border-[#12B8C4]/20"
                              : "bg-[#FFB52E]/20 text-amber-900 dark:text-[#FFB52E] border-[#FFB52E]/30"
                          }`}
                        >
                          {t.isTeacher
                            ? isRtl
                              ? "صوت المعلم الحقيقي"
                              : "Teacher Voice"
                            : isRtl
                            ? "صوت الطالب"
                            : "Student Voice"}
                        </span>
                        <span className="font-mono text-[10px] text-[#071B3A]/40 dark:text-white/40">
                          {m}:{s}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-[#071B3A]/90 dark:text-white/90 leading-relaxed">
                        {t.content}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSingleTurnClick(idx)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer ${
                        isPlaying
                          ? "bg-[#12B8C4] text-[#071B3A] border-[#12B8C4]"
                          : "bg-white dark:bg-white/10 border-[#071B3A]/10 dark:border-white/10 text-[#071B3A]/70 dark:text-white/70 hover:text-[#12B8C4] hover:border-[#12B8C4]"
                      }`}
                    >
                      {isLoading ? (
                        <span>...</span>
                      ) : isPlaying ? (
                        <span>{isRtl ? "إيقاف" : "Pause"}</span>
                      ) : (
                        <>
                          <span>{isRtl ? "استمع" : "Listen"}</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.21-1.614.57-2.302.234-.847 1.058-1.354 1.938-1.354h2.24z" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Clean Corporate Footer */}
      <footer className="border-t border-[#071B3A]/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-xs text-[#071B3A]/50 dark:text-white/50 py-6 mt-12 print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
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

      {/* Print / PDF Export Styling: Preserves colors, ensures high legibility and organization */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 10mm 12mm;
            size: A4 portrait;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, html.dark, body, body.dark {
            background-color: #ffffff !important;
            color: #071B3A !important;
          }
          main {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            max-width: 100% !important;
            background-color: #ffffff !important;
          }
          /* Keep cards neatly boxed on pure light background with intact accents */
          main section, html.dark main section {
            background-color: #ffffff !important;
            border: 1px solid rgba(7, 27, 58, 0.15) !important;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Reset dark mode text overrides in print */
          html.dark main h1, html.dark main h2, html.dark main h3, html.dark main h4, html.dark main p, html.dark main span {
            color: #071B3A;
          }
          /* Multi-column layouts in print */
          .print\\:break-before-page {
            break-before: page !important;
            page-break-before: always !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:flex {
            display: flex !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
