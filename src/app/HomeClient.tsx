"use client";
// Design philosophy: Nile Intelligence — asymmetric editorial edtech, deep navy field, teal telemetry, amber signals, calm Arabic-first hierarchy.
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, Check, CirclePlay, Languages, ShieldCheck, Sparkles, Users, Waves, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const getTrainingEntryPath = () => "/login";

const logo = "/manus-storage/fitna-logo-lockup-transparent_3e70d851.png";
const texture = "/manus-storage/fitna-nile-signal-texture_6eb544b1.png";
const deviceImage = "/manus-storage/fitna-live-simulation-screen_f1b6fe69.png";

const copy = {
  ar: {
    dir: "rtl",
    nav: ["كيف تعمل", "المميزات", "الأسعار"],
    login: "تسجيل الدخول",
    start: "جرّب الآن",
    eyebrow: "محاكي الفصول الذكي للمعلمين",
    title: "اتقن إدارة الفصل قبل أن تدخله",
    desc: "تدرّب بصوتك الطبيعي داخل فصل افتراضي حيّ، وتعلّم كيف تتعامل مع التشتت والفروق الفردية قبل أن تصبح واقعاً.",
    primary: "جرّب المحاكاة الآن",
    secondary: "شاهد كيف تعمل",
    mainSlogan: "قبل ما تدخل الفصل... خليك فِطِن.",
    secondarySlogan: "Where Pedagogical Mastery Meets Agentic Intelligence.",
    trust: ["+500 معلم", "لهجة مصرية عامية", "أطر Danielson & CLASS"],
    problemTitle: "التدريب الميداني وحده لا يكفي",
    problemIntro: "الواقع لا يمنحك زر إيقاف مؤقت. امنح نفسك مساحة آمنة للتجربة قبل أول حصة.",
    features: [
      "جيش الوكلاء الذاتي",
      "لهجة مصرية عامية",
      "تقييم بأطر عالمية",
      "Timeline Playback",
      "لوحة نمو شخصية",
      "تحليل الصوت لحظياً"
    ],
    howTitle: "من القرار إلى ردة الفعل",
    howIntro: "جلسة واحدة. أربع لحظات تصنع فرقاً في حضورك داخل الفصل.",
    ctaTitle: "الفصل القادم يبدأ هنا",
    ctaText: "حوّل القلق إلى ممارسة، والممارسة إلى حضور واثق.",
    cta: "ابدأ رحلتك التدريبية الآن",
    language: "EN",
    dark: "الوضع الداكن",
    light: "الوضع الفاتح"
  },
  en: {
    dir: "ltr",
    nav: ["How it works", "Features", "Pricing"],
    login: "Log in",
    start: "Try now",
    eyebrow: "The intelligent classroom simulator",
    title: "Master the Classroom Before Entering It.",
    desc: "Practice in your natural voice inside a living virtual classroom—and learn to navigate disruption, misconceptions, and difference before day one.",
    primary: "Try the simulation",
    secondary: "See how it works",
    mainSlogan: "Before you enter the classroom... be thoughtful.",
    secondarySlogan: "Where Pedagogical Mastery Meets Agentic Intelligence.",
    trust: ["500+ teachers", "Egyptian Arabic dialect", "Danielson & CLASS frameworks"],
    problemTitle: "Field practice alone is not enough",
    problemIntro: "Reality has no pause button. Give yourself a safe room to rehearse before the first class.",
    features: [
      "Agentic student swarm",
      "Egyptian Arabic dialect",
      "Global framework scoring",
      "Audio + video playback",
      "Personal growth telemetry",
      "Real-time voice analysis"
    ],
    howTitle: "From Decision to Reaction",
    howIntro: "One session. Four moments that change how you show up in the room.",
    ctaTitle: "Your next classroom starts here",
    ctaText: "Turn uncertainty into practice, and practice into confident presence.",
    cta: "Start your training journey",
    language: "عربي",
    dark: "Dark mode",
    light: "Light mode"
  }
};

const problemIcons = [Zap, Waves, Sparkles];
const stepsAr = ["اختر السيناريو", "تحدث بصوتك الطبيعي", "احصل على تقرير فوري", "تابع نموك عبر الجلسات"];
const stepsEn = ["Choose a scenario", "Speak naturally", "Get instant feedback", "Track your growth"];

export function HomeClient({ initialLang = "ar" }: { initialLang?: "ar" | "en" }) {
  const [lang, setLang] = useState<"ar" | "en">(initialLang);
  const [menu, setMenu] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Sync with cookie on mount
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)language=(ar|en)(?:;|$)/);
    if (match && (match[1] === "ar" || match[1] === "en")) {
      setLang(match[1]);
      document.documentElement.lang = match[1];
      document.documentElement.dir = match[1] === "en" ? "ltr" : "rtl";
    }
  }, []);

  const t = copy[lang];
  const steps = lang === "ar" ? stepsAr : stepsEn;

  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>(".reveal-on-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const flipLanguage = () => {
    const nextLang = lang === "ar" ? "en" : "ar";
    setLang(nextLang);
    document.cookie = `language=${nextLang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "en" ? "ltr" : "rtl";
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const NextArrow = ({ size = 16, className = "" }: { size?: number; className?: string }) =>
    lang === "ar" ? <ArrowLeft size={size} className={className} /> : <ArrowRight size={size} className={className} />;

  const CardArrow = ({ size = 18, className = "" }: { size?: number; className?: string }) =>
    lang === "ar" ? <ArrowUpLeft size={size} className={className} /> : <ArrowUpRight size={size} className={className} />;

  return (
    <div dir={t.dir} className="fitna-site">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="Fitna AI home">
            <img src={logo} alt="Fitna AI" />
          </a>
          <button className="mobile-menu" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">
            <span /><span />
          </button>
          <nav className={menu ? "nav open" : "nav"} aria-label="Main navigation">
            <button onClick={() => { scrollTo("how"); setMenu(false); }}>{t.nav[0]}</button>
            <button onClick={() => { scrollTo("features"); setMenu(false); }}>{t.nav[1]}</button>
            <button onClick={() => { scrollTo("pricing"); setMenu(false); }}>{t.nav[2]}</button>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            <button className="language-button" onClick={flipLanguage} title={lang === "ar" ? "Switch to English" : "التحويل إلى العربية"}>
              {t.language}
            </button>
            <button className="ghost-button" onClick={() => { window.location.href = getTrainingEntryPath(); }}>
              {t.login}
            </button>
            <button className="amber-button small cta-primary" onClick={() => { window.location.href = getTrainingEntryPath(); }}>
              {t.start}
              <NextArrow size={15} />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero-section !px-0 !pt-[140px] md:!pt-[160px] !pb-20 sm:!pb-28">
          <div className="hero-noise" style={{ backgroundImage: `url(${texture})` }} />
          <div className="hero-grid w-full max-w-7xl mx-auto px-6 sm:px-10 md:px-12 lg:px-20">
            <div className="hero-copy reveal">
              <div className="eyebrow"><span className="eyebrow-dot" />{t.eyebrow}</div>
              <h1>{t.title}</h1>
              <p className="hero-desc">{t.desc}</p>
              <div className="hero-buttons flex-wrap items-center gap-3">
                <button
                  className="amber-button cta-primary"
                  onClick={() => { window.location.href = getTrainingEntryPath(); }}
                >
                  <span>{t.primary}</span>
                  <NextArrow size={17} />
                </button>
                <button className="outline-button" onClick={() => scrollTo("how")}>
                  <CirclePlay size={18} />
                  {t.secondary}
                </button>
              </div>
              <div className="slogan-lockup">
                <span>{t.mainSlogan}</span>
                <small
                  dir="ltr"
                  className="block text-slate-300 font-medium text-xs tracking-normal mt-1"
                  style={{ unicodeBidi: "isolate" }}
                >
                  {t.secondarySlogan}
                </small>
              </div>
            </div>

            <div className="hero-visual reveal-delay">
              <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />

              <div
                className="simulation-window !p-0 !bg-slate-900/90 !backdrop-blur-xl !border !border-slate-700/70 !rounded-3xl flex flex-col relative overflow-hidden shadow-2xl min-h-[510px]"
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {/* Simulation Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800/50">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/15 text-rose-300 rounded-lg text-xs font-bold tracking-wider border border-rose-500/25 shadow-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_#f43f5e]"></span>
                      {lang === "ar" ? "تسجيل مباشر" : "LIVE RECORDING"}
                    </div>
                    <span className="text-sm font-semibold text-[#E2E8F0]">
                      {lang === "ar" ? "الفصل 8ب • الرياضيات والكسور" : "Class 8B • Fractions"}
                    </span>
                  </div>
                  <div className="text-xs text-[#E2E8F0] font-mono tracking-widest bg-white/[0.08] px-3 py-1 rounded-md border border-white/10" dir="ltr">
                    04:28
                  </div>
                </div>

                {/* Transcript Area */}
                <div className="flex-1 overflow-hidden p-6 flex flex-col gap-5 relative">
                  <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-slate-900/90 to-transparent z-10 pointer-events-none"></div>

                  {/* Teacher Speech 1 */}
                  <div className="flex gap-3.5 items-start opacity-75 transition-opacity">
                    <div className="w-9 h-9 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center text-sm font-bold border border-teal-500/30 shrink-0 mt-0.5">
                      {lang === "ar" ? "م" : "T"}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-teal-300 mb-1">
                        {lang === "ar" ? "أنت (المعلم)" : "You (Teacher)"}
                      </div>
                      <p className="text-[15px] text-[#E2E8F0] leading-relaxed font-normal">
                        {lang === "ar"
                          ? "دعونا ننظر إلى المثال الأول على السبورة. من يخبرني ماذا يحدث عندما يكبر المقام؟"
                          : "Let's look at the first example. Who can tell me what happens when the denominator gets larger?"}
                      </p>
                    </div>
                  </div>

                  {/* Alert Badge */}
                  <div className="mx-2 sm:mx-6 bg-amber-500/15 border-2 border-amber-400/60 rounded-xl p-4 relative shadow-[0_4px_24px_rgba(245,158,11,0.18)]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles size={16} className="text-amber-300 shrink-0" />
                      <span className="text-xs font-black text-amber-300 tracking-wide uppercase">
                        {lang === "ar" ? "فترة صمت (3.4 ثانية)" : "Wait Time Detected (3.4s)"}
                      </span>
                    </div>
                    <p className="text-[13px] text-[#FEF3C7] font-medium leading-relaxed">
                      {lang === "ar"
                        ? "وقفة تدريسية ممتازة. منحت الطلاب 3.4 ثانية لمعالجة السؤال والتفكير قبل استقبال الإجابة."
                        : "Excellent pedagogical pause. You gave students 3.4s to process before calling on someone."}
                    </p>
                  </div>

                  {/* Student Speech */}
                  <div className="flex gap-3.5 items-start opacity-90 mt-0.5">
                    <div className="w-9 h-9 rounded-full bg-slate-700/60 text-slate-200 flex items-center justify-center text-sm font-bold border border-slate-500/40 shrink-0 mt-0.5">
                      {lang === "ar" ? "س" : "S"}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-300 mb-1">
                        {lang === "ar" ? "سارة م." : "Sara M."}
                      </div>
                      <p className="text-[15px] text-[#F1F5F9] leading-relaxed font-normal">
                        {lang === "ar"
                          ? "القطع تصبح أصغر... يعني قيمة الكسر الإجمالية تكون أصغر؟"
                          : "The pieces get smaller... so the overall fraction is smaller?"}
                      </p>
                    </div>
                  </div>

                  {/* Teacher Speech 2 */}
                  <div className="flex gap-3.5 items-start relative z-0 mt-0.5">
                    <div className="w-9 h-9 rounded-full bg-teal-400 text-slate-950 flex items-center justify-center text-sm font-black shadow-[0_0_20px_rgba(45,212,191,0.5)] shrink-0 mt-0.5">
                      {lang === "ar" ? "م" : "T"}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-teal-300 mb-1">
                        {lang === "ar" ? "أنت (المعلم)" : "You (Teacher)"}
                      </div>
                      <p className="text-[15px] text-white leading-relaxed font-semibold">
                        {lang === "ar"
                          ? "أحسنتِ تماماً يا سارة! إذن لو قارنا بين رُبع وثُمن، أيهما "
                          : "Exactly right, Sara. So if we compare one fourth to one eighth, which one "}
                        <span className="inline-block bg-teal-400/30 text-teal-200 px-2 py-0.5 rounded font-mono animate-pulse">...</span>
                      </p>
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-900/90 to-transparent z-10 pointer-events-none"></div>
                </div>

                {/* Footer Microphone / Waveform */}
                <div className="p-4 px-6 bg-slate-800/90 border-t border-white/10 backdrop-blur-md z-20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-300 border border-teal-400/40 shadow-sm">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs text-teal-300 font-bold uppercase tracking-wider mb-0.5">
                          {lang === "ar" ? "الميكروفون نشط" : "Active Microphone"}
                        </div>
                        <div className="text-xs text-[#E2E8F0] font-medium">
                          {lang === "ar" ? "تحدث بنبرتك الطبيعية..." : "Speak in your natural voice..."}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 h-7" dir="ltr">
                      <div className="w-1.5 bg-teal-400 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '40%' }}></div>
                      <div className="w-1.5 bg-teal-400 rounded-full animate-[wave_1.2s_ease-in-out_infinite_0.1s]" style={{ height: '75%' }}></div>
                      <div className="w-1.5 bg-teal-400 rounded-full animate-[wave_0.9s_ease-in-out_infinite_0.2s]" style={{ height: '100%' }}></div>
                      <div className="w-1.5 bg-teal-400 rounded-full animate-[wave_1.1s_ease-in-out_infinite_0.3s]" style={{ height: '65%' }}></div>
                      <div className="w-1.5 bg-teal-400 rounded-full animate-[wave_1.3s_ease-in-out_infinite_0.4s]" style={{ height: '85%' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="floating-metric">
                <span className="metric-label">{lang === "ar" ? "مؤشر الانتباه" : "ATTENTION MAP"}</span>
                <strong>72%</strong>
                <span className="metric-up">{lang === "ar" ? "+14% هذه الجلسة" : "+14% this session"}</span>
              </div>
              <div className="floating-agent">
                <span className="agent-spark">
                  <Sparkles className="w-3.5 h-3.5 text-[#12B8C4]" />
                </span>
                <span>
                  <b>{lang === "ar" ? "سرب الوكلاء" : "Agent swarm"}</b>
                  <small>{lang === "ar" ? "مزامنة 24 حالة طالب" : "24 student states synced"}</small>
                </span>
              </div>
            </div>
          </div>

          {/* Trust Row - Ultra Spacious & Elevated */}
          <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-6 sm:mt-10 mb-0">
            <div className="flex flex-wrap items-center justify-center gap-10 sm:gap-14 lg:gap-20">
              {t.trust.map((item, idx) => (
                <div
                  key={item}
                  className="group flex items-center gap-3.5 px-6 sm:px-7 py-3 sm:py-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#12B8C4]/50 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-4px_rgba(18,184,196,0.3)] cursor-default"
                >
                  <span 
                    className={`w-2 h-2 rounded-full shrink-0 transition-transform duration-300 group-hover:scale-125 ${
                      idx === 1 
                        ? "bg-[#12B8C4] shadow-[0_0_8px_#12B8C4]" 
                        : "bg-[#FFB52E] shadow-[0_0_8px_#FFB52E]"
                    }`} 
                  />
                  <span className="text-xs sm:text-sm font-semibold text-[#F6F0E4] tracking-wide">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="section cream-section reveal-on-scroll" id="problem">
          <div className="section-heading split-heading">
            <div><h2>{t.problemTitle}</h2></div>
            <p>{t.problemIntro}</p>
          </div>
          <div className="problem-grid">
            {[0, 1, 2].map((i) => {
              const Icon = problemIcons[i];
              const titles = lang === "ar"
                ? ["تشتت الطلاب المفاجئ", "سوء الفهم المفاهيمي", "الديناميكيات غير المتكافئة"]
                : ["Sudden student drift", "Conceptual misconceptions", "Uneven dynamics"];
              const descs = lang === "ar"
                ? ["حين تتغير طاقة الفصل في ثوانٍ، هل تملك ردة الفعل المناسبة؟", "اكتشف أين يتعثر الفهم قبل أن يضيع الدرس كله.", "اقرأ الغرف الصغيرة داخل الفصل، لا الصوت الأعلى فقط."]
                : ["When the room shifts in seconds, do you have the right response?", "Spot the gap in understanding before the whole lesson slips.", "Read the quiet dynamics, not just the loudest voice."];
              return (
                <article className={`problem-card reveal-on-scroll reveal-delay-${i + 1}`} key={titles[i]}>
                  <Icon size={24} strokeWidth={1.5} />
                  <h3>{titles[i]}</h3>
                  <p>{descs[i]}</p>
                  <CardArrow className="card-arrow" size={18} />
                </article>
              );
            })}
          </div>
        </section>

        {/* How It Works Section */}
        <section className="section navy-section reveal-on-scroll" id="how">
          <div className="section-heading light split-heading">
            <div><h2>{t.howTitle}</h2></div>
            <p>{t.howIntro}</p>
          </div>
          <div className="timeline-tabs">
            {steps.map((step, i) => (
              <button
                className={activeStep === i ? "timeline-tab active" : "timeline-tab"}
                key={step}
                onClick={() => setActiveStep(i)}
              >
                <span>{i + 1}</span>
                <b>{step}</b>
              </button>
            ))}
          </div>
          <div className="step-panel reveal-on-scroll">
            <div className="step-copy">
              <h3>{steps[activeStep]}</h3>
              <p>
                {lang === "ar"
                  ? [
                      "ابدأ من موقف واقعي: نقاش، فوضى، أو لحظة تحتاج قراراً واضحاً.",
                      "تحدث كما تتحدث مع طلابك. النبرة، التوقيت، واللغة كلها تصبح جزءاً من التحليل.",
                      "بعد الجلسة، شاهد ما حدث واحصل على إشارات عملية قابلة للتطبيق.",
                      "قارن جلساتك، لاحظ التحسن، وادخل كل مرة بوعي أكبر."
                    ][activeStep]
                  : [
                      "Start with a real moment: a debate, a disruption, or a decision that needs clarity.",
                      "Speak as you would with your students. Tone, timing, and language become part of the analysis.",
                      "After the session, replay what happened and get practical signals you can use.",
                      "Compare sessions, see the shift, and enter every room with more intention."
                    ][activeStep]}
              </p>
              <button className="text-link" onClick={() => setActiveStep((activeStep + 1) % 4)}>
                {lang === "ar" ? "الخطوة التالية" : "Next step"}
                <NextArrow size={16} />
              </button>
            </div>
            <div className="step-screen">
              <div className="screen-header">
                <span /><span /><span />
                <em>{steps[activeStep]}</em>
              </div>
              <div className="screen-content">
                <div className="screen-chart">
                  <div className="chart-label">
                    {lang === "ar" ? "مستوى التفاعل" : "ENGAGEMENT"} <strong>{[68, 76, 86, 92][activeStep]}%</strong>
                  </div>
                  <div className="chart-bars">
                    {[40, 58, 47, 75, 61, 82, 70, 92].map((h, i) => (
                      <i key={i} style={{ height: `${h - activeStep * 3}%` }} />
                    ))}
                  </div>
                </div>
                <div className="screen-side">
                  <span>{lang === "ar" ? "إشارة حيّة" : "LIVE SIGNAL"}</span>
                  <strong>
                    {lang === "ar"
                      ? ["استماع", "تحدث", "تأمل", "نمو"][activeStep]
                      : ["Listening", "Speaking", "Reflecting", "Growing"][activeStep]}
                  </strong>
                  <div className="tiny-ring">
                    <span>{[68, 76, 86, 92][activeStep]}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="section cream-section reveal-on-scroll" id="features">
          <div className="section-heading">
            <h2>{lang === "ar" ? "ذكاء حيّ. تدريب يتغير معك." : "Live intelligence. Practice that changes with you."}</h2>
          </div>
          <div className="feature-grid">
            {t.features.map((feature, i) => (
              <article className={`feature-card reveal-on-scroll reveal-delay-${i + 1}`} key={feature}>
                <div className="feature-top"><Sparkles size={19} /></div>
                <h3>{feature}</h3>
                <p>
                  {lang === "ar"
                    ? [
                        "طلاب افتراضيون بشخصيات وحالات انتباه تتغير لحظياً.",
                        "تدرّب باللهجة التي ستسمعها فعلاً في فصلك.",
                        "تقييم واضح يرتبط بـ Danielson و CLASS.",
                        "ارجع للحظة، اسمعها، وشاهدها من جديد.",
                        "مسار بصري يوضح أين تنمو وأين تحتاج تركيزاً.",
                        "حلّل نبرتك، سرعتك، وتوقيت تدخلاتك."
                      ][i]
                    : [
                        "Virtual students with shifting personalities and attention states.",
                        "Practice in the dialect you will actually hear in the room.",
                        "Clear scoring mapped to Danielson and CLASS.",
                        "Return to the moment. Hear it. See it again.",
                        "A visual path showing where you grow and focus.",
                        "Read tone, pace, and timing as they happen."
                      ][i]}
                </p>
                <NextArrow className="feature-arrow" size={17} />
              </article>
            ))}
          </div>
        </section>

        {/* Device Section */}
        <section className="section device-section reveal-on-scroll">
          <div className="device-copy">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#12B8C4]/15 text-[#12B8C4] border border-[#12B8C4]/30 mb-3.5">
              <span className="w-2 h-2 rounded-full bg-[#12B8C4] animate-pulse" />
              <span>{lang === "ar" ? "تحليلات بيداغوجية حية" : "Live Pedagogical Telemetry"}</span>
            </div>
            <h2>{lang === "ar" ? "كل قرار يترك أثراً." : "Every decision leaves a signal."}</h2>
            <p>
              {lang === "ar"
                ? "منصة لا تكتفي بإخبارك بما حدث؛ تساعدك على فهم لماذا حدث، وماذا تفعل في المرة القادمة."
                : "A platform that does not only tell you what happened—it helps you understand why, and what to do next."}
            </p>
            <button 
              className="device-explore-btn group" 
              onClick={() => { window.location.href = getTrainingEntryPath(); }}
            >
              <span>{lang === "ar" ? "استكشف المنصة" : "Explore the platform"}</span>
              <span className="btn-arrow-wrap">
                <NextArrow size={16} />
              </span>
            </button>
          </div>
          <div className="device-visual group">
            <img 
              src={deviceImage} 
              alt={lang === "ar" ? "فطنة AI - لوحة المحاكاة والتحليل الصفي المباشر" : "Fitna AI - Live Classroom Simulation Dashboard"} 
            />
            <div className="device-chip">
              <span className="chip-dot" />
              {lang === "ar" ? "جلسة تحليل حيّة" : "Live session analysis"}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="section pricing-section reveal-on-scroll" id="pricing">
          <div className="section-heading split-heading">
            <div><h2>{lang === "ar" ? "ابدأ من حيث أنت." : "Start where you are."}</h2></div>
            <p>
              {lang === "ar"
                ? "تدريب عملي واضح، للأفراد الذين يريدون أن يكبروا، والمؤسسات التي تريد أن تبني ثقافة تعليم أقوى."
                : "Practical, focused rehearsal for educators who want to grow—and institutions building a stronger teaching culture."}
            </p>
          </div>
          <div className="pricing-grid">
            <article className="price-card reveal-on-scroll reveal-delay-1">
              <h3>{lang === "ar" ? "فردي" : "Individual"}</h3>
              <div className="price">
                <strong>$19</strong>
                <span>{lang === "ar" ? "/ شهرياً" : "/ month"}</span>
              </div>
              <ul>
                {(lang === "ar"
                  ? ["جلسات محاكاة غير محدودة", "تقرير تشخيصي بعد كل جلسة", "لهجة مصرية عامية", "مسار نمو شخصي"]
                  : ["Unlimited simulations", "Post-session diagnostic report", "Egyptian Arabic dialect", "Personal growth path"]
                ).map((x) => (
                  <li key={x}><Check size={15} />{x}</li>
                ))}
              </ul>
              <button className="outline-button full" onClick={() => { window.location.href = getTrainingEntryPath(); }}>
                {lang === "ar" ? "اختر الخطة الفردية" : "Choose individual plan"}
              </button>
            </article>

            <article className="price-card featured reveal-on-scroll reveal-delay-2">
              <span className="popular">{lang === "ar" ? "الأكثر شيوعاً" : "MOST POPULAR"}</span>
              <h3>{lang === "ar" ? "مؤسسي" : "Institution"}</h3>
              <div className="price">
                <strong>{lang === "ar" ? "مخصص" : "Custom"}</strong>
              </div>
              <ul>
                {(lang === "ar"
                  ? ["لوحات متابعة للفرق", "معايير تقييم مخصصة", "تدريب وإعداد للمشرفين", "دعم مؤسسي وأولوية", "تحليلات على مستوى البرنامج"]
                  : ["Team progress dashboards", "Custom assessment criteria", "Supervisor onboarding", "Priority institutional support", "Program-level analytics"]
                ).map((x) => (
                  <li key={x}><Check size={15} />{x}</li>
                ))}
              </ul>
              <button className="amber-button full" onClick={() => { window.location.href = getTrainingEntryPath(); }}>
                {lang === "ar" ? "تحدث مع فريقنا" : "Talk to our team"}
                <NextArrow size={15} />
              </button>
            </article>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section reveal-on-scroll" id="cta">
          <div className="cta-orbit" />
          <h2>{t.ctaTitle}</h2>
          <p>{t.ctaText}</p>
          <button className="amber-button cta-primary" onClick={() => { window.location.href = getTrainingEntryPath(); }}>
            {t.cta}
            <NextArrow size={17} />
          </button>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <img src={logo} alt="Fitna AI" />
          <p>
            {lang === "ar"
              ? "حيث تلتقي الكفاءة التربوية بالذكاء الحي."
              : "Where pedagogical mastery meets agentic intelligence."}
          </p>
        </div>
        <div className="footer-links">
          <div>
            <b>{lang === "ar" ? "عن المنصة" : "Platform"}</b>
            <a href="#features">{t.nav[0]}</a>
            <a href="#how">{t.nav[1]}</a>
            <a href="#pricing">{t.nav[2]}</a>
          </div>
          <div>
            <b>{lang === "ar" ? "تواصل معنا" : "Contact"}</b>
            <a href="#cta">hello@fitna.ai</a>
            <a href="#cta">LinkedIn</a>
            <a href="#cta">Instagram</a>
          </div>
          <div>
            <b>{lang === "ar" ? "قانوني" : "Legal"}</b>
            <a href="#cta">{lang === "ar" ? "الخصوصية" : "Privacy"}</a>
            <a href="#cta">{lang === "ar" ? "الشروط" : "Terms"}</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Fitna AI. {lang === "ar" ? "جميع الحقوق محفوظة." : "All rights reserved."}</span>
          <span>Made for the moments that matter.</span>
        </div>
      </footer>
    </div>
  );
}
