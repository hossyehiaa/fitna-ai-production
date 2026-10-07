"use client";

import { useCallback, useEffect, useState } from "react";
import { Mic, Rocket, ClipboardList, BarChart3, CircleHelp, X, ArrowLeft, ArrowRight } from "lucide-react";

/**
 * First-visit onboarding tour — a lightweight multi-step walkthrough shown
 * ONCE per browser (localStorage flag). Skip / Finish mark it done; the
 * Settings modal offers a replay (listens for the `fitna:replay-onboarding`
 * window event).
 */

const STORAGE_KEY = "fitna_onboarding_done";

const STEPS = {
  ar: [
    {
      icon: "rocket",
      title: "أهلًا بك في فِطْنَة! 👋",
      body: "دي أول منصة بتحاكي فصل ابتدائي حقيقي: ٤ طلاب بيردوا عليك بالصوت وبلهجتك. الجولة دي ٣٠ ثانية وتخلص — تعشّي معايا؟",
    },
    {
      icon: "list",
      title: "ابدأ جلسة في ثانية",
      body: "من زر «ابدأ جلسة جديدة» في لوحة التحكم. مش عايز تكتب درس؟ شريط «قوالب دروس جاهزة» في صفحة التجهيز بيحطّ لك درس كامل بضغطة واحدة.",
    },
    {
      icon: "mic",
      title: "شغّل المايك واتكلم بس",
      body: "اضغط زر المايك مرة واحدة واتكلم زي فصل حقيقي — الطلاب بيسمعوك وبيردوا بالصوت. وعايز تقطع أحدهم؟ اتكلم مباشرة وهيتوقف فورًا.",
    },
    {
      icon: "chart",
      title: "تقريرك في الآخر",
      body: "في نهاية كل جلسة يطلعلك تقييم كامل: ٦ محاور تربوية، تحليل نبرة صوتك، نقاط قوتك، وخطط تطوير عملية. تتابع تطورك من «لوحة النمو».",
    },
    {
      icon: "help",
      title: "محتاج مساعدة؟",
      body: "«دليل الاستخدام» و«عن المنصة» موجودين في الشريط العلوي في أي وقت. يلا نبدأ أول محاكاة؟",
    },
  ],
  en: [
    {
      icon: "rocket",
      title: "Welcome to Fitna AI! 👋",
      body: "The first platform simulating a real primary classroom: 4 students replying to your voice in your dialect. This tour takes 30 seconds — walk with me?",
    },
    {
      icon: "list",
      title: "Start a session in seconds",
      body: "From \"Start New Session\" on the dashboard. Don't want to write a lesson? The ready-made template chips fill a complete lesson with one tap.",
    },
    {
      icon: "mic",
      title: "Just turn the mic on and talk",
      body: "Tap the mic once and speak like a real classroom — students hear you and reply by voice. Want to interrupt one? Just speak and they stop instantly.",
    },
    {
      icon: "chart",
      title: "Your report at the end",
      body: "Every session ends with a full evaluation: six pedagogical axes, your tone analysis, strengths and actionable plans. Track progress in the Growth dashboard.",
    },
    {
      icon: "help",
      title: "Need help?",
      body: "\"User Guide\" and \"About\" live in the top bar any time. Ready for your first simulation?",
    },
  ],
} as const;

const ICONS: Record<string, React.ReactNode> = {
  rocket: <Rocket size={26} />,
  list: <ClipboardList size={26} />,
  mic: <Mic size={26} />,
  chart: <BarChart3 size={26} />,
  help: <CircleHelp size={26} />,
};

export function OnboardingTour({ lang }: { lang: "ar" | "en" }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const isRtl = lang === "ar";
  const steps = STEPS[lang];
  const last = step === steps.length - 1;

  useEffect(() => {
    // First visit (flag absent) → open automatically.
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") {
        const t = setTimeout(() => setOpen(true), 900);
        return () => clearTimeout(t);
      }
    } catch {}
    return () => {};
  }, []);

  useEffect(() => {
    // Replay hook (Settings modal button).
    const replay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("fitna:replay-onboarding", replay);
    return () => window.removeEventListener("fitna:replay-onboarding", replay);
  }, []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;
  const s = steps[step];

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-[#071B3A]/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={finish}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#071B3A] rounded-3xl border border-[#071B3A]/10 dark:border-white/15 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#071B3A] text-white px-5 sm:px-6 pt-4 pb-5 relative">
          <button
            type="button"
            onClick={finish}
            className="absolute top-3 start-3 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Skip tour"
          >
            <X size={14} />
          </button>
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-3 pt-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-[#12B8C4]" : i < step ? "w-1.5 bg-[#12B8C4]/60" : "w-1.5 bg-white/25"
                }`}
              />
            ))}
          </div>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#12B8C4]/15 border border-[#12B8C4]/30 text-[#12B8C4] flex items-center justify-center">
            {ICONS[s.icon]}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 py-6 text-center">
          <h2 className="text-lg font-extrabold text-[#071B3A] dark:text-white mb-2.5">{s.title}</h2>
          <p className="text-sm text-[#071B3A]/70 dark:text-white/65 leading-relaxed">{s.body}</p>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 pb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#071B3A]/50 dark:text-white/50 hover:text-[#071B3A] dark:hover:text-white hover:bg-[#F6F0E4] dark:hover:bg-white/5 transition cursor-pointer"
          >
            {isRtl ? "تخطي الجولة" : "Skip tour"}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((v) => Math.max(0, v - 1))}
                className="w-9 h-9 rounded-xl border border-[#071B3A]/15 dark:border-white/15 text-[#071B3A]/70 dark:text-white/70 hover:bg-[#F6F0E4] dark:hover:bg-white/5 flex items-center justify-center transition cursor-pointer"
                aria-label="Previous"
              >
                {isRtl ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep((v) => v + 1))}
              className="px-6 py-2.5 rounded-xl bg-[#12B8C4] text-white font-bold text-xs hover:bg-[#0e9aa5] transition shadow-lg shadow-[#12B8C4]/25 cursor-pointer"
            >
              {last ? (isRtl ? "يلا نبدأ! 🚀" : "Let's go! 🚀") : isRtl ? "التالي" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
