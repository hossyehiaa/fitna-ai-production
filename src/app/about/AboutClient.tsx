"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Users,
  Mic,
  Brain,
  BarChart3,
  ShieldCheck,
  Languages,
  Sparkles,
  BookOpen,
  HeartHandshake,
} from "lucide-react";

type Lang = "ar" | "en";

const W = {
  ar: {
    dir: "rtl",
    title: "عن منصة فِطْنَة",
    subtitle: "أول فصل افتراضي بيتكلم بلهجتك — تدرّب على إدارة الصف قبل ما تدخله.",
    login: "تسجيل الدخول",
    manual: "دليل الاستخدام",
    start: "ابدأ التدريب",
    whatTitle: "إيه هي فِطْنَة؟",
    whatBody:
      "فِطْنَة منصة تدريب للمعلمين بتحاكي فصل ابتدائي حقيقي بالذكاء الاصطناعي: ٤ طلاب لكل واحد شخصيته ومستواه وأسلوبه الخاص، بيسمعوا كلامك بصوتك، بيردوا عليك بالصوت ولهجة حقيقية (مصرية أو سعودية)، وبيتأثروا بطريقتك في الشرح والأسئلة والإدارة. الهدف: تجرب مواقف الصف الصعبة — الطالب المشاغب، السؤال المفاجئ، الفقدان المفاجئ للانتباه — في مكان آمن قبل أول حصة حقيقية.",
    howTitle: "المنصة بتشتغل إزاي؟",
    how: [
      {
        icon: "mic",
        title: "١. اتكلم زي ما انت بتكلم في فصل حقيقي",
        body: "اضغط زر المايك وابدأ الشرح أو الأسئلة أو التوبيخ — النظام بيحول صوتك لنص لحظيًا وبيحلل نبرتك (ثقة، سرعة، حماس، توتر، دفء).",
      },
      {
        icon: "brain",
        title: "٢. الطلاب بيفكروا ويردوا لحظيًا",
        body: "كل طالب له عقل محاكى: نسبة استيعاب، ثقة، انطباه، وأخطاء مفاهيم حقيقية. بيختاروا يتكلموا أو يسكتوا أو يرفعوا إيدهم — وبيجاوبوا بلهجة أطفال حقيقية.",
      },
      {
        icon: "chart",
        title: "٣. تقرير تقييم كامل في الآخر",
        body: "ستة محاور بيداغوجية (إدارة الفصل، التواصل، الأسئلة، الشمول، النبرة، التوقيت) بمعايير دانيالسون وCLASS، مع نقاط قوة وخطط تطوير عملية مبنية على حوارك فعليًا.",
      },
    ],
    featuresTitle: "اللي بيخلي التجربة حقيقية",
    features: [
      { icon: "users", title: "شخصيات طلاب ثابتة", body: "٤ شخصيات لكل لهجة بذكريات وأخطاء مفاهيم — ريم الفنانة، فهد الرياضي، سلطان المرِح، وجوري القارئة." },
      { icon: "lang", title: "لهجتين حقيقيتين", body: "مصري وسعودي بتفاصيلهما — مش فصحى جامدة. كل برومبت مُضبوط على اللهجة واللقب («يا مستر» / «يا أستاذ»)." },
      { icon: "spark", title: "أحداث صف عشوائية", body: "كل ٣٠–٦٠ ثانية ممكن يحصل حدث حقيقي: همس جانبي، سؤال خارج الموضوع، تشتت موبايل، رفع إيد مفاجئ." },
      { icon: "shield", title: "خصوصية بالكامل", body: "صوتك بيتعالج داخل الجلسة لإنتاج التقرير، ومفيش تخزين أو استخدام خارجي. بياناتك مشفّرة." },
      { icon: "heart", title: "مقاطعة ذكية", body: "اتكلم وأي طالب بيتكلم — يوقف فورًا ويسمع لك، زي فصل حقيقي بالظبط. دي مهارة إدارة صف جوهرية تتدرب عليها." },
    ],
    audienceTitle: "لمين؟",
    audienceBody:
      "للمعلم الجديد قبل أول حصة، للمعلم المخضّر اللي عايز يجرب استراتيجيات جديدة، ولمؤسسات تدريب المعلمين اللي عايزة قياس تطور فريقها عبر لوحة نمو واضحة.",
    ctaLine: "جاهز تدخل أول فصل افتراضي في حياتك؟",
  },
  en: {
    dir: "ltr",
    title: "About Fitna AI",
    subtitle: "The first virtual classroom that speaks your dialect — practice managing a class before you enter one.",
    login: "Log in",
    manual: "User guide",
    start: "Start training",
    whatTitle: "What is Fitna AI?",
    whatBody:
      "Fitna AI is a teacher-training platform that simulates a real primary classroom with AI: four students, each with their own personality, level and style. They hear your real voice, reply by voice in a real dialect (Egyptian or Saudi), and react to how you explain, question and manage. The goal: rehearse the hard classroom moments — the disruptive kid, the surprise question, the sudden attention loss — in a safe space before your first real class.",
    howTitle: "How does it work?",
    how: [
      {
        icon: "mic",
        title: "1. Talk like you would in a real classroom",
        body: "Press the mic and start explaining, questioning or redirecting — speech is transcribed live and your tone is analyzed (confidence, pace, enthusiasm, stress, warmth).",
      },
      {
        icon: "brain",
        title: "2. Students think and reply in real time",
        body: "Every student has a simulated mind: comprehension, confidence, attention and genuine misconceptions. They choose to speak, stay silent or raise a hand — answering in real child dialect.",
      },
      {
        icon: "chart",
        title: "3. A full evaluation report at the end",
        body: "Six pedagogical axes (management, communication, questioning, inclusion, tone, timing) against Danielson & CLASS frameworks, with strengths and actionable development plans built from your actual dialogue.",
      },
    ],
    featuresTitle: "What makes it feel real",
    features: [
      { icon: "users", title: "Persistent student identities", body: "Four characters per dialect with memories and misconceptions — Reem the artist, Fahad the footballer, Sultan the joker and Jouri the bookworm." },
      { icon: "lang", title: "Two real dialects", body: "Egyptian and Saudi with full detail — never stiff MSA. Every prompt is tuned to the dialect and your addressing form." },
      { icon: "spark", title: "Random classroom events", body: "Every 30–60 seconds a real event may fire: side talk, an off-topic question, phone distraction, a sudden raised hand." },
      { icon: "shield", title: "Full privacy", body: "Your voice is processed within the session to produce the report — never stored or used externally. Your data is encrypted." },
      { icon: "heart", title: "Smart barge-in", body: "Speak while a student is talking — they stop instantly and listen, exactly like a real class. A core management skill you actually rehearse." },
    ],
    audienceTitle: "Who is it for?",
    audienceBody:
      "New teachers before their first class, veterans trying new strategies, and teacher-training institutions measuring team growth through a clear growth dashboard.",
    ctaLine: "Ready to enter your first virtual classroom?",
  },
} as const;

const HOW_ICONS: Record<string, React.ReactNode> = {
  mic: <Mic size={20} />,
  brain: <Brain size={20} />,
  chart: <BarChart3 size={20} />,
};
const FEAT_ICONS: Record<string, React.ReactNode> = {
  users: <Users size={18} />,
  lang: <Languages size={18} />,
  spark: <Sparkles size={18} />,
  shield: <ShieldCheck size={18} />,
  heart: <HeartHandshake size={18} />,
};

export function AboutClient({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = W[lang];
  const isRtl = lang === "ar";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang, t.dir]);

  return (
    <div dir={t.dir} lang={lang} className="min-h-screen bg-[#F6F9FC] dark:bg-[#071B3A]">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3 bg-white/90 dark:bg-[#071B3A]/90 backdrop-blur border-b border-[#071B3A]/10 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center">
            <Logo variant="dark" height={24} className="dark:hidden" />
            <Logo variant="light" height={24} className="hidden dark:block" />
          </Link>
          <span className="text-[#071B3A]/40 dark:text-white/40">/</span>
          <span className="text-sm font-bold text-[#071B3A] dark:text-white">{isRtl ? "عن المنصة" : "About"}</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium">
          <ThemeToggle />
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="text-[#071B3A]/70 dark:text-white/70 hover:text-[#071B3A] dark:hover:text-white"
          >
            {lang === "ar" ? "EN" : "عربي"}
          </button>
          <Link href="/manual" className="text-[#071B3A]/70 dark:text-white/70 hover:text-[#071B3A] dark:hover:text-white hidden sm:block">
            {t.manual}
          </Link>
          <Link
            href="/login"
            className="px-3 py-1.5 rounded-lg bg-[#12B8C4] text-white font-bold hover:bg-[#0e9aa5] transition-colors"
          >
            {t.login}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#071B3A] dark:text-white mb-3">{t.title}</h1>
          <p className="text-sm sm:text-base text-[#12B8C4] font-bold max-w-xl mx-auto">{t.subtitle}</p>
        </div>

        <section className="bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 sm:p-7 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#071B3A] dark:text-white mb-3">{t.whatTitle}</h2>
          <p className="text-sm text-[#071B3A]/75 dark:text-white/70 leading-loose">{t.whatBody}</p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold text-[#071B3A] dark:text-white mb-4">{t.howTitle}</h2>
          <div className="space-y-4">
            {t.how.map((s, i) => (
              <div
                key={i}
                className="flex gap-4 bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 shadow-sm"
              >
                <span className="w-10 h-10 rounded-xl bg-[#12B8C4]/10 text-[#12B8C4] flex items-center justify-center shrink-0">
                  {HOW_ICONS[s.icon]}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#071B3A] dark:text-white mb-1.5">{s.title}</h3>
                  <p className="text-sm text-[#071B3A]/70 dark:text-white/65 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold text-[#071B3A] dark:text-white mb-4">{t.featuresTitle}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {t.features.map((f, i) => (
              <div
                key={i}
                className="bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="w-8 h-8 rounded-lg bg-[#12B8C4]/10 text-[#12B8C4] flex items-center justify-center shrink-0">
                    {FEAT_ICONS[f.icon]}
                  </span>
                  <h3 className="text-sm font-bold text-[#071B3A] dark:text-white">{f.title}</h3>
                </div>
                <p className="text-sm text-[#071B3A]/70 dark:text-white/65 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gradient-to-l from-[#12B8C4]/10 to-transparent dark:from-[#12B8C4]/15 rounded-2xl border border-[#12B8C4]/25 p-5 sm:p-7 mb-10">
          <h2 className="text-lg font-bold text-[#071B3A] dark:text-white mb-3">{t.audienceTitle}</h2>
          <p className="text-sm text-[#071B3A]/75 dark:text-white/70 leading-loose mb-4">{t.audienceBody}</p>
          <p className="text-base font-bold text-[#12B8C4] mb-4">{t.ctaLine}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="text-center px-6 py-3 rounded-xl bg-[#12B8C4] text-white font-bold hover:bg-[#0e9aa5] transition-colors shadow-lg shadow-[#12B8C4]/25"
            >
              {t.start}
            </Link>
            <Link
              href="/manual"
              className="text-center px-6 py-3 rounded-xl border border-[#12B8C4]/40 text-[#12B8C4] font-bold hover:bg-[#12B8C4]/10 transition-colors inline-flex items-center justify-center gap-2"
            >
              <BookOpen size={16} />
              {t.manual}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
