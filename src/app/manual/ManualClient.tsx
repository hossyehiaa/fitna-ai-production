"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BookOpen,
  Mic,
  ClipboardList,
  BarChart3,
  Settings2,
  Smartphone,
  MessageSquareText,
  CircleHelp,
  Keyboard,
} from "lucide-react";

type Lang = "ar" | "en";

const W = {
  ar: {
    dir: "rtl",
    title: "دليل استخدام فِطْنَة",
    subtitle: "كل خطوة تحتاجها لتتحول من أول تسجيل دخول إلى تقرير تقييم كامل — بالتفصيل.",
    back: "العودة للرئيسية",
    login: "تسجيل الدخول",
    about: "عن المنصة",
    cta: "ابدأ التدريب الآن",
    sections: [
      {
        icon: "login",
        title: "١) الحساب والدخول",
        items: [
          "ادخل من صفحة تسجيل الدخول ببريدك الإلكتروني وكلمة المرور، أو بزر «المتابعة بحساب Google» بضغطة واحدة.",
          "ما عندك حساب؟ اضغط «أنشئ حسابًا الآن» واملأ الاسم والبريد وكلمة المرور — الحساب الجاهز في ثوانٍ.",
          "عايز تجرب الأول؟ زر «تجربة المنصة فورًا بحساب تجريبي» يفتح لك حساب معلم كامل بدون أي تسجيل.",
          "نسيت كلمة المرور؟ «نسيت كلمة المرور؟» تحت حقل كلمة المرور ترسل لك رابط استعادة على بريدك.",
        ],
      },
      {
        icon: "setup",
        title: "٢) تجهيز جلسة المحاكاة",
        items: [
          "من لوحة التحكم اضغط «ابدأ جلسة جديدة» لتنتقل لصفحة التجهيز.",
          "اكتب موضوع الدرس (أو اختر موضوعًا موجودًا)، ثم الصق ملخص الدرس في خانة «محتوى الدرس» — أو ارفع ملف PDF فيقرأه النظام بنفسه.",
          "ما عايز تكتب درس من الصفر؟ اضغط أي قالب جاهز من شريط «قوالب دروس جاهزة» فيتحول لملخص درس كامل فورًا.",
          "اختر اللهجة (مصرية أو سعودية) — الطلاب هيتفاهموا ويتكلموا بنفس اللهجة اللي اخترتها.",
          "حدد مدة الجلسة (١٠–٣٠ دقيقة)، نمط الفصل (متوازن / مشاغب / فاقد للتركيز)، وهدفك التدريبي.",
          "حدد «يا مستر» أو «يا ميس» واكتب اسمك — الطلاب هينادوا بيك بالصيغة دي طول الجلسة.",
        ],
      },
      {
        icon: "mic",
        title: "٣) غرفة المحاكاة الحية",
        items: [
          "اضغط زر المايك الكبير مرة واحدة ليبدأ الاستماع المفتوح — كل ما تتكلم، الفصل يسمعك ويرد عليك بالصوت.",
          "اتكلم بشكل طبيعي من غير ما تضغط أي زر؛ النظام بيحدد نهاية جملتك لوحده من سكتتك.",
          "عايز تقطع طالب وهو بيتكلم؟ اتكلم بصوت واضح مباشرة — النظام يوقفه فورًا ويسمع لك (Barge-in).",
          "من تابة «سجل الحوار» تقرأ كل اللي اتقال في الجلسة لحظة بلحظة، ومن «الفصل» تشاهد حالة كل طالب.",
          "على الموبايل: اسمح لإذن المايكروفون من المتصفح أول مرة، واستخدم سماعة أو مكان هادئ لأفضل تجربة.",
          "زر كتم الصوت (جنب المايك) يوقف الاستماع مؤقتًا — مثلًا لو حبيت تشرب أو تشتغل حاجة تانية.",
        ],
      },
      {
        icon: "report",
        title: "٤) نهاية الجلسة والتقرير",
        items: [
          "اضغط زر إنهاء المحاكاة في أي وقت — أو خلّي المؤقت يخلص الجلسة تلقائيًا.",
          "بعد النهاية يولّد النظام تقريرًا تقييميًا كاملًا: ملخص الجلسة، ستة محاور بيداغوجية، تحليل نبرتك، نقاط قوتك، وخطط تطوير.",
          "من صفحة «كل الجلسات» ترجع لأي تقرير قديم، ومن «لوحة النمو» تتابع تطورك عبر الجلسات.",
          "تقدر تعيد توليد التقرير من صفحة الجلسة لو حبيت نسخة محدّثة بعد مراجعة الحوار.",
        ],
      },
      {
        icon: "settings",
        title: "٥) الإعدادات والنصائح",
        items: [
          "من الإعدادات تعدّل اسمك وصيغة المناداة ولهجة الفصل الافتراضية وهدفك التدريبي.",
          "بياناتك محفوظة ومشفّرة، وصوتك بيتعالج داخل الجلسة — ما بنستخدمه لأي تدريب خارجي.",
          "لأفضل أداء استخدم Chrome أو Safari حديثين، وتأكد إن المايك مش مكتوم من إعدادات النظام.",
          "لو الطالب مش بيرد: تأكد إن زر المايك مضاء، اتكلم أعلى شوية، أو اضغط المايك مرتين (إيقاف ثم تشغيل).",
        ],
      },
    ],
    faqTitle: "أسئلة سريعة",
    faqs: [
      { q: "هل صوتي بيتخزن؟", a: "بيتم معالجته لحظيًا لتحويل الكلام لنص وتحليل النبرة داخل الجلسة، وما بيتخزن بشكل دائم للتدريب الخارجي." },
      { q: "أقدر أغير اللهجة بعد ما أبدأ؟", a: "اللهجة بتتحدد عند إنشاء الجلسة. لجلسة بلهجة تانية، أنشئ جلسة جديدة واختر اللهجة اللي انت عايزها." },
      { q: "إزاي أوقف طالب مشاغب؟", a: "اتكلم مباشرة بصوت واضح وهو بيتكلم — المقاطعة الذكية توقفه فورًا وتسمع لك. أو وبّخه بجملة عادية زي فصل حقيقي." },
      { q: "التقرير بيتولد إزاي؟", a: "نموذج ذكاء اصطناعي متخصص بيحلل كل حوار الجلسة مع تحليل نبرة صوتك ويطلع تقييم على ستة محاور تربوية مع توصيات عملية." },
    ],
  },
  en: {
    dir: "ltr",
    title: "Fitna AI User Guide",
    subtitle: "Everything from your first login to a full evaluation report — step by step.",
    back: "Back to homepage",
    login: "Log in",
    about: "About the platform",
    cta: "Start training now",
    sections: [
      {
        icon: "login",
        title: "1) Account & login",
        items: [
          "Sign in with your email and password, or with the one-tap \"Continue with Google\" button.",
          "No account yet? Tap \"Create one now\" and fill in your name, email and password — ready in seconds.",
          "Just exploring? The instant demo button opens a full teacher account with zero registration.",
          "Forgot your password? The link under the password field emails you a recovery link.",
        ],
      },
      {
        icon: "setup",
        title: "2) Setting up a simulation",
        items: [
          "From the dashboard tap \"Start a new session\" to open the setup page.",
          "Type a lesson topic, paste your lesson summary — or upload a PDF and the platform reads it for you.",
          "Don't want to write from scratch? Tap any ready-made template chip and a full lesson summary fills in instantly.",
          "Pick the dialect (Egyptian or Saudi) — students will speak and be addressed in that dialect.",
          "Set the duration (10–30 min), classroom style (balanced / disruptive / disengaged) and your training goal.",
          "Choose \"يا مستر\" or \"يا ميس\" and your name — students will address you exactly this way.",
        ],
      },
      {
        icon: "mic",
        title: "3) The live simulation room",
        items: [
          "Tap the big mic button once to start open listening — every time you speak, the class hears you and replies by voice.",
          "Speak naturally without holding any button; the system detects your sentence end from your natural pause.",
          "Want to interrupt a speaking student? Just speak clearly — the smart barge-in stops them instantly.",
          "The transcript tab shows everything said in real time; the classroom tab shows every student's state.",
          "On mobile: allow the microphone permission on first use and prefer headphones or a quiet spot.",
          "The mute button next to the mic pauses listening — e.g. while you take a break.",
        ],
      },
      {
        icon: "report",
        title: "4) Ending the session & report",
        items: [
          "End the simulation any time — or let the timer close the session automatically.",
          "A full evaluation report is generated: session summary, six pedagogical axes, your tone analysis, strengths and a development plan.",
          "Revisit any past report from \"All sessions\" and track progress in the Growth dashboard.",
          "You can regenerate a report from the session page after reviewing the transcript.",
        ],
      },
      {
        icon: "settings",
        title: "5) Settings & tips",
        items: [
          "Update your name, addressing form, default classroom dialect and training goal from Settings.",
          "Your data is encrypted; your voice is processed within the session and never stored for external training.",
          "For best performance use a recent Chrome or Safari and make sure the mic isn't muted at OS level.",
          "If a student isn't replying: check the mic button is lit, speak a bit louder, or toggle the mic off and on.",
        ],
      },
    ],
    faqTitle: "Quick questions",
    faqs: [
      { q: "Is my voice stored?", a: "It is processed in real time for transcription and tone analysis within the session, and never stored for external training." },
      { q: "Can I change the dialect mid-session?", a: "The dialect is fixed at session creation. Start a new session to practice the other dialect." },
      { q: "How do I stop a disruptive student?", a: "Speak clearly while they're talking — smart barge-in stops them instantly. Or scold them naturally like a real classroom." },
      { q: "How is the report generated?", a: "A specialized AI model analyzes the full transcript plus your voice tone and scores six pedagogical axes with actionable recommendations." },
    ],
  },
} as const;

const ICONS: Record<string, React.ReactNode> = {
  login: <CircleHelp size={18} />,
  setup: <ClipboardList size={18} />,
  mic: <Mic size={18} />,
  report: <BarChart3 size={18} />,
  settings: <Settings2 size={18} />,
};

export function ManualClient({ initialLang }: { initialLang: Lang }) {
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
          <span className="text-sm font-bold text-[#071B3A] dark:text-white flex items-center gap-1.5">
            <BookOpen size={15} />
            {isRtl ? "دليل الاستخدام" : "User guide"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium">
          <ThemeToggle />
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="text-[#071B3A]/70 dark:text-white/70 hover:text-[#071B3A] dark:hover:text-white"
          >
            {lang === "ar" ? "EN" : "عربي"}
          </button>
          <Link href="/about" className="text-[#071B3A]/70 dark:text-white/70 hover:text-[#071B3A] dark:hover:text-white hidden sm:block">
            {t.about}
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#071B3A] dark:text-white mb-3">{t.title}</h1>
          <p className="text-sm sm:text-base text-[#071B3A]/60 dark:text-white/60 max-w-xl mx-auto leading-relaxed">{t.subtitle}</p>
        </div>

        <div className="space-y-6">
          {t.sections.map((s, i) => (
            <section
              key={i}
              className="bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 sm:p-6 shadow-sm"
            >
              <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-[#071B3A] dark:text-white mb-4">
                <span className="w-8 h-8 rounded-xl bg-[#12B8C4]/10 text-[#12B8C4] flex items-center justify-center shrink-0">
                  {ICONS[s.icon]}
                </span>
                {s.title}
              </h2>
              <ul className="space-y-2.5">
                {s.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5 text-sm text-[#071B3A]/80 dark:text-white/75 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] mt-2 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-8 bg-white dark:bg-white/5 rounded-2xl border border-[#071B3A]/10 dark:border-white/10 p-5 sm:p-6 shadow-sm">
          <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-[#071B3A] dark:text-white mb-4">
            <span className="w-8 h-8 rounded-xl bg-amber-400/10 text-amber-500 flex items-center justify-center shrink-0">
              <MessageSquareText size={18} />
            </span>
            {t.faqTitle}
          </h2>
          <div className="space-y-3">
            {t.faqs.map((f, i) => (
              <details key={i} className="group rounded-xl border border-[#071B3A]/10 dark:border-white/10 overflow-hidden">
                <summary className="px-4 py-3 text-sm font-bold text-[#071B3A] dark:text-white cursor-pointer select-none hover:bg-[#12B8C4]/5 transition-colors list-none flex items-center gap-2">
                  <Keyboard size={14} className="text-[#12B8C4] shrink-0" />
                  {f.q}
                </summary>
                <p className="px-4 pb-4 pt-1 text-sm text-[#071B3A]/70 dark:text-white/65 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="w-full sm:w-auto text-center px-6 py-3 rounded-xl bg-[#12B8C4] text-white font-bold hover:bg-[#0e9aa5] transition-colors shadow-lg shadow-[#12B8C4]/25"
          >
            {t.cta}
          </Link>
          <Link
            href="/about"
            className="w-full sm:w-auto text-center px-6 py-3 rounded-xl border border-[#12B8C4]/40 text-[#12B8C4] font-bold hover:bg-[#12B8C4]/10 transition-colors"
          >
            {t.about}
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-[#071B3A]/40 dark:text-white/40 flex items-center justify-center gap-1.5">
          <Smartphone size={13} />
          {isRtl ? "شغّل المايك واتكلم — الباقي علينا." : "Turn the mic on and just talk — we handle the rest."}
        </p>
      </main>
    </div>
  );
}
