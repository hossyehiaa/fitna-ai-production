"use client";

import { useActionState, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Eye, EyeOff, ShieldCheck, Sparkles, UserRound, UsersRound } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signInAction, signUpAction, requestPasswordResetAction, loginAsDemoAction, type ActionState } from "./actions";

const logo = "/manus-storage/fitna-logo-lockup-transparent_3e70d851.png";

type Lang = "ar" | "en";
const words = {
  ar: {
    dir: "rtl",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    welcomeLogin: "مرحبًا بك في Fitna AI",
    welcomeSignup: "كن فَطِنًا منذ الخطوة الأولى",
    subLogin: "ادخل إلى مساحة التدريب التي تحوّل مواقف الفصل إلى ممارسة واثقة.",
    subSignup: "أنشئ مساحتك وابدأ في تدريب ردود فعلك قبل أول حصة.",
    google: "المتابعة بحساب Google",
    googleComingSoon: "المتابعة بحساب Google ستتوفر قريباً! يرجى استخدام البريد الإلكتروني حالياً.",
    comingSoonBadge: "قريباً",
    or: "أو",
    email: "البريد الإلكتروني",
    emailPlaceholder: "example@email.com",
    password: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    name: "الاسم الكامل",
    namePlaceholder: "اكتب اسمك بالكامل",
    forgot: "نسيت كلمة المرور؟",
    submitLogin: "تسجيل الدخول",
    submitSignup: "إنشاء حساب",
    switchLogin: "ليس لديك حساب؟",
    switchSignup: "لديك حساب بالفعل؟",
    switchLoginLink: "أنشئ حسابًا الآن",
    switchSignupLink: "تسجيل الدخول",
    back: "العودة إلى الصفحة الرئيسية",
    sideSlogan: "Master the Classroom Before Entering It.",
    sideArabic: "قبل أن تدخل الفصل... كُن فَطِنًا.",
    sideNote: "Practice the moment before it becomes a problem.",
    language: "EN",
    secure: "بياناتك محمية ومشفّرة",
    forgotTitle: "استعادة كلمة المرور",
    forgotSub: "أدخل بريدك الإلكتروني وسنرسل لك رابطاً لاستعادة كلمة المرور.",
    forgotSubmit: "إرسال رابط الاستعادة",
    forgotBack: "العودة لتسجيل الدخول",
    resetLinkSent: "تم إرسال رابط استعادة كلمة المرور إلى بريدك.",
    accountTypeQuestion: "نوع الحساب",
    accountIndividualTitle: "فرد",
    accountIndividualDesc: "تدريب شخصي على إدارة الفصل",
    roleQuestion: "كيف ستستخدم فِطنة؟",
    roleTeacherTitle: "معلّم",
    roleTeacherDesc: "تدريب فردي ومحاكاة لمواقف الفصل",
    roleAdminTitle: "مؤسسة",
    roleAdminDesc: "إدارة وتدريب فريق المعلمين ومتابعة نموهم",
    nationalityQuestion: "الجنسية",
    nationalitySA: "سعودي 🇸🇦",
    nationalityEG: "مصري 🇪🇬",
    orgSA: "مؤسسة سعودية",
    orgEG: "مؤسسة مصرية",
    teacherSA: "معلّم سعودي",
    teacherEG: "معلّم مصري",
    individualSA: "مستخدم سعودي",
    individualEG: "مستخدم مصري",
    demoBtn: "تجربة المنصة فوراً بحساب تجريبي (بدون تسجيل)",
    demoSub: "وصول كامل ومجاني للمعلم والمحاكاة بنقرة واحدة"
  },
  en: {
    dir: "ltr",
    login: "Log in",
    signup: "Sign up",
    welcomeLogin: "Welcome to Fitna AI",
    welcomeSignup: "Be thoughtful from the first step",
    subLogin: "Enter the practice room that turns classroom moments into confident action.",
    subSignup: "Create your space and rehearse your response before the first class.",
    google: "Continue with Google",
    googleComingSoon: "Continue with Google is coming soon! Please use email and password for now.",
    comingSoonBadge: "Coming soon",
    or: "or",
    email: "Email address",
    emailPlaceholder: "example@email.com",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    name: "Full name",
    namePlaceholder: "Your full name",
    forgot: "Forgot password?",
    submitLogin: "Log in",
    submitSignup: "Create account",
    switchLogin: "Don't have an account?",
    switchSignup: "Already have an account?",
    switchLoginLink: "Create one now",
    switchSignupLink: "Log in",
    back: "Back to homepage",
    sideSlogan: "Master the Classroom Before Entering It.",
    sideArabic: "Before you enter the classroom... be thoughtful.",
    sideNote: "Practice the moment before it becomes a problem.",
    language: "عربي",
    secure: "Your data is protected and encrypted",
    forgotTitle: "Reset Password",
    forgotSub: "Enter your email address and we will send you a reset link.",
    forgotSubmit: "Send reset link",
    forgotBack: "Back to login",
    resetLinkSent: "A password reset link has been sent to your email.",
    accountTypeQuestion: "Account Type",
    accountIndividualTitle: "Individual",
    accountIndividualDesc: "Personal classroom management training",
    roleQuestion: "How will you use Fitna AI?",
    roleTeacherTitle: "Teacher",
    roleTeacherDesc: "Individual classroom practice & simulation",
    roleAdminTitle: "Institution",
    roleAdminDesc: "Manage and train teacher teams",
    nationalityQuestion: "Nationality",
    nationalitySA: "Saudi 🇸🇦",
    nationalityEG: "Egyptian 🇪🇬",
    orgSA: "Saudi organization",
    orgEG: "Egyptian organization",
    teacherSA: "Saudi teacher",
    teacherEG: "Egyptian teacher",
    individualSA: "Saudi user",
    individualEG: "Egyptian user",
    demoBtn: "1-Click Instant Demo (No Signup Required)",
    demoSub: "Full instant access to the simulation & classroom"
  }
};

const initialState: ActionState = { error: null };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const [lang, setLang] = useState<Lang>("ar");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"teacher" | "institution_admin">("teacher");
  // Account type: فرد | معلّم | مؤسسة (mapped to role + account_type)
  const [accountType, setAccountType] = useState<"individual" | "teacher" | "organization">("teacher");
  // Nationality: explicit user selection (EG | SA) — never inferred from
  // locale, IP, or device.
  const [country, setCountry] = useState<"EG" | "SA">("EG");
  const [googleComingSoon, setGoogleComingSoon] = useState(false);

  // Google Sign-In: live when GOOGLE_CLIENT_ID/SECRET are configured
  // (GET /api/auth/google → 302 consent redirect), "coming soon" otherwise.
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/google", { method: "GET" })
      .then((res) => {
        if (!cancelled) setGoogleReady(res.status !== 501);
      })
      .catch(() => {
        if (!cancelled) setGoogleReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoogleClick = () => {
    if (googleReady) {
      window.location.href = "/api/auth/google";
      return;
    }
    setGoogleComingSoon(true);
    setTimeout(() => {
      setGoogleComingSoon(false);
    }, 4000);
  };

  useEffect(() => {
    document.cookie = "fitna_demo=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    const match = document.cookie.match(/(?:^|;\s*)language=(ar|en)(?:;|$)/);
    if (match && (match[1] === "ar" || match[1] === "en")) {
      setLang(match[1]);
      document.documentElement.lang = match[1];
      document.documentElement.dir = match[1] === "en" ? "ltr" : "rtl";
    }
  }, []);

  const flipLang = () => {
    const nextLang = lang === "ar" ? "en" : "ar";
    setLang(nextLang);
    document.cookie = `language=${nextLang}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "en" ? "ltr" : "rtl";
  };

  const searchParams = useSearchParams();
  const resetSuccessParam = searchParams.get("reset") === "success";

  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, initialState);
  const [resetState, resetFormAction, resetPending] = useActionState(requestPasswordResetAction, initialState);

  const t = words[lang];
  const isLogin = mode === "login";

  const queryError = searchParams.get("error");
  const activeError = (showForgot ? resetState.error : isLogin ? signInState.error : signUpState.error) || (!signInState.error && !signUpState.error && !resetState.error ? queryError : null);
  const resetSent = resetSuccessParam || (!resetState.error && !resetPending && resetState !== initialState);

  useEffect(() => {
    if (signInState?.redirectTo) {
      window.location.href = signInState.redirectTo;
    }
  }, [signInState?.redirectTo]);

  useEffect(() => {
    if (signUpState?.redirectTo) {
      window.location.href = signUpState.redirectTo;
    }
  }, [signUpState?.redirectTo]);

  return (
    <div className="auth-page" dir={t.dir}>
      {/* Brand Visual Side */}
      <section className="auth-visual" aria-label="Fitna AI brand panel">
        <div className="auth-grid-lines" />
        <div className="auth-glow glow-one" />
        <div className="auth-glow glow-two" />
        <div className="auth-visual-top">
          <Link className="auth-back" href="/">
            {lang === "ar" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
            {t.back}
          </Link>
          <div className="flex items-center gap-3">
            <Link
              className="auth-back !no-underline"
              href="/manual"
              title={lang === "ar" ? "دليل استخدام المنصة خطوة بخطوة" : "Step-by-step platform guide"}
            >
              <BookOpen size={15} className="inline-block align-[-2px]" />
              <span className="ms-1">{lang === "ar" ? "دليل الاستخدام" : "User guide"}</span>
            </Link>
            <button className="auth-lang" onClick={flipLang}>
              {t.language}
            </button>
          </div>
        </div>
        <div className="auth-brand-center">
          <img src={logo} alt={lang === "ar" ? "Fitna AI فِطْنَة" : "Fitna AI"} />
          <span className="brand-rule" />
          <p>{t.sideSlogan}</p>
          <strong>{t.sideArabic}</strong>
          <small>{t.sideNote}</small>
        </div>
        <div className="auth-visual-footer">
          <span>
            <ShieldCheck size={14} /> {t.secure}
          </span>
          <span>FITNA / 2026</span>
        </div>
      </section>

      {/* Authentication Form Side */}
      <section className="auth-form-side">
        <div className="auth-form-top">
          <ThemeToggle className="auth-mode" />
          <Link href="/" className="mobile-form-logo">
            <img src={logo} alt="Fitna AI" />
          </Link>
        </div>

        <div className="form-card">
          {!showForgot && (
            <div className="mode-switch" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={isLogin ? "active" : ""}
                onClick={() => setMode("login")}
                role="tab"
                aria-selected={isLogin}
              >
                {t.login}
              </button>
              <button
                type="button"
                className={!isLogin ? "active" : ""}
                onClick={() => setMode("signup")}
                role="tab"
                aria-selected={!isLogin}
              >
                {t.signup}
              </button>
            </div>
          )}

          <div className="form-heading">
            <h1>
              {showForgot ? t.forgotTitle : isLogin ? t.welcomeLogin : t.welcomeSignup}
            </h1>
            <p>
              {showForgot ? t.forgotSub : isLogin ? t.subLogin : t.subSignup}
            </p>
          </div>

          {!showForgot && (
            <>
              {/* Dedicated Demo Account Access (Form Action: Never prefetched by Next.js) */}
              <form action={loginAsDemoAction} className="w-full mb-3">
                <button
                  type="submit"
                  className="demo-pop-btn w-full py-3 px-4 rounded-xl flex items-center justify-between bg-amber-500/[0.08] hover:bg-amber-500/[0.14] dark:bg-amber-400/10 dark:hover:bg-amber-400/15 border border-amber-400/40 hover:border-amber-400/80 group text-start cursor-pointer shadow-sm hover:shadow transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-500 dark:text-[#ffb52e] flex items-center justify-center shrink-0">
                      <Sparkles size={16} className="transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12" />
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-[#071b3a] dark:text-[#ffb52e]">
                        {t.demoBtn}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                        {t.demoSub}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-[-2px] rtl:group-hover:translate-x-[-2px] ltr:group-hover:translate-x-[2px] transition-transform">
                    {lang === "ar" ? "دخول ←" : "Enter →"}
                  </span>
                </button>
              </form>

              <div className="or-divider">
                <span>{lang === "ar" ? "أو الدخول بحسابك الخاص" : "Or sign in to your personal account"}</span>
              </div>

              <button
                className={`google-button relative overflow-hidden transition-all duration-300 ${
                  googleComingSoon ? "!border-amber-400/60 !bg-amber-400/10 shadow-[0_0_15px_rgba(255,181,46,0.15)]" : ""
                }`}
                type="button"
                onClick={handleGoogleClick}
              >
                <span className="google-g">G</span>
                <span>{t.google}</span>
                {googleComingSoon && (
                  <span className="ms-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-[#071B3A] animate-pulse">
                    {t.comingSoonBadge}
                  </span>
                )}
              </button>

              {googleComingSoon && (
                <div className="mt-2.5 p-3 bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-400/30 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-semibold text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-ping shrink-0" />
                  <span>{t.googleComingSoon}</span>
                </div>
              )}

              <div className="or-divider">
                <span>{t.or}</span>
              </div>
            </>
          )}

          {resetSent && showForgot && (
            <div className="p-3 mb-4 bg-teal-500/10 border border-teal-500/30 rounded-lg text-xs text-teal-400 font-medium text-center">
              {resetState.info || t.resetLinkSent}
            </div>
          )}

          {signUpState.info && !isLogin && !showForgot && (
            <div className="p-3.5 mb-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center leading-relaxed animate-in fade-in">
              {signUpState.info}
            </div>
          )}

          {(signInState?.redirectTo || signUpState?.redirectTo) && (
            <div className="p-3.5 mb-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center leading-relaxed animate-in fade-in flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <span>{lang === "ar" ? "تم بنجاح! جاري تحويلك إلى لوحة التحكم..." : "Success! Redirecting to your dashboard..."}</span>
            </div>
          )}

          {activeError && (
            <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 font-medium text-center">
              {activeError}
            </div>
          )}

          {/* Form: Sign In */}
          {!showForgot && isLogin && (
            <form
              action={signInFormAction}
            >
              <label>
                {t.email}
                <span className="input-wrap">
                  <input
                    type="email"
                    name="email"
                    placeholder={t.emailPlaceholder}
                    required
                  />
                </span>
              </label>

              <label>
                {t.password}
                <span className="input-wrap relative block">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder={t.passwordPlaceholder}
                    required
                    minLength={6}
                    style={{
                      paddingInlineStart: "15px",
                      paddingInlineEnd: "44px",
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                      left: lang === "ar" ? "12px" : "auto",
                      right: lang === "ar" ? "auto" : "12px",
                      zIndex: 2,
                    }}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <div className="form-meta">
                <a
                  href="#forgot"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowForgot(true);
                  }}
                >
                  {t.forgot}
                </a>
              </div>

              <button className="auth-submit" type="submit" disabled={signInPending || Boolean(signInState?.redirectTo)}>
                {signInState?.redirectTo
                  ? lang === "ar"
                    ? "جاري التوجيه..."
                    : "Redirecting..."
                  : signInPending
                  ? lang === "ar"
                    ? "جارٍ تسجيل الدخول..."
                    : "Logging in..."
                  : t.submitLogin}
                {t.dir === "rtl" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {/* Form: Sign Up */}
          {!showForgot && !isLogin && (
            <form
              action={signUpFormAction}
            >
              {/* Role Selection inside Sign Up */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", marginBottom: "8px", display: "block" }}>
                  {t.roleQuestion}
                </label>
                <input type="hidden" name="role" value={accountType === "organization" ? "institution_admin" : "teacher"} />
                <input type="hidden" name="account_type" value={accountType} />
                <input type="hidden" name="country" value={country} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType("individual");
                      setRole("teacher");
                    }}
                    style={{
                      textAlign: "inherit",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: accountType === "individual" ? "2px solid var(--teal)" : "1px solid var(--border)",
                      background: accountType === "individual" ? "color-mix(in srgb, var(--teal) 14%, transparent)" : "color-mix(in srgb, var(--background) 40%, transparent)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: accountType === "individual" ? "0 0 14px rgba(18,184,196,0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <UserRound size={16} color={accountType === "individual" ? "var(--teal)" : "var(--muted)"} />
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--foreground)" }}>
                        {t.accountIndividualTitle}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" }}>
                      {t.accountIndividualDesc}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountType("teacher");
                      setRole("teacher");
                    }}
                    style={{
                      textAlign: "inherit",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: accountType === "teacher" ? "2px solid var(--teal)" : "1px solid var(--border)",
                      background: accountType === "teacher" ? "color-mix(in srgb, var(--teal) 14%, transparent)" : "color-mix(in srgb, var(--background) 40%, transparent)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: accountType === "teacher" ? "0 0 14px rgba(18,184,196,0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <UserRound size={16} color={accountType === "teacher" ? "var(--teal)" : "var(--muted)"} />
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--foreground)" }}>
                        {t.roleTeacherTitle}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" }}>
                      {t.roleTeacherDesc}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountType("organization");
                      setRole("institution_admin");
                    }}
                    style={{
                      textAlign: "inherit",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: accountType === "organization" ? "2px solid var(--amber)" : "1px solid var(--border)",
                      background: accountType === "organization" ? "color-mix(in srgb, var(--amber) 14%, transparent)" : "color-mix(in srgb, var(--background) 40%, transparent)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: accountType === "organization" ? "0 0 14px rgba(255,181,46,0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <UsersRound size={16} color={accountType === "organization" ? "var(--amber)" : "var(--muted)"} />
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--foreground)" }}>
                        {t.roleAdminTitle}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" }}>
                      {t.roleAdminDesc}
                    </p>
                  </button>
                </div>
              </div>

              {/* Nationality Selection — explicit, never inferred */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ fontSize: "11px", fontWeight: "700", marginBottom: "8px", display: "block" }}>
                  {t.nationalityQuestion}
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setCountry("SA")}
                    style={{
                      textAlign: "inherit",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: country === "SA" ? "2px solid var(--teal)" : "1px solid var(--border)",
                      background: country === "SA" ? "color-mix(in srgb, var(--teal) 14%, transparent)" : "color-mix(in srgb, var(--background) 40%, transparent)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: country === "SA" ? "0 0 14px rgba(18,184,196,0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "16px" }}>🇸🇦</span>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--foreground)" }}>
                        {t.nationalitySA}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" }}>
                      {accountType === "organization" ? t.orgSA : accountType === "teacher" ? t.teacherSA : t.individualSA}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCountry("EG")}
                    style={{
                      textAlign: "inherit",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: country === "EG" ? "2px solid var(--teal)" : "1px solid var(--border)",
                      background: country === "EG" ? "color-mix(in srgb, var(--teal) 14%, transparent)" : "color-mix(in srgb, var(--background) 40%, transparent)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: country === "EG" ? "0 0 14px rgba(18,184,196,0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "16px" }}>🇪🇬</span>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--foreground)" }}>
                        {t.nationalityEG}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.5" }}>
                      {accountType === "organization" ? t.orgEG : accountType === "teacher" ? t.teacherEG : t.individualEG}
                    </p>
                  </button>
                </div>
              </div>

              <label>
                {t.name}
                <span className="input-wrap">
                  <input
                    type="text"
                    name="full_name"
                    placeholder={t.namePlaceholder}
                    required
                  />
                </span>
              </label>

              <label>
                {t.email}
                <span className="input-wrap">
                  <input
                    type="email"
                    name="email"
                    placeholder={t.emailPlaceholder}
                    required
                  />
                </span>
              </label>

              <label>
                {t.password}
                <span className="input-wrap relative block">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder={t.passwordPlaceholder}
                    required
                    minLength={6}
                    style={{
                      paddingInlineStart: "15px",
                      paddingInlineEnd: "44px",
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                      left: lang === "ar" ? "12px" : "auto",
                      right: lang === "ar" ? "auto" : "12px",
                      zIndex: 2,
                    }}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <button className="auth-submit" type="submit" disabled={signUpPending || Boolean(signUpState?.redirectTo)}>
                {signUpState?.redirectTo
                  ? lang === "ar"
                    ? "جاري التوجيه..."
                    : "Redirecting..."
                  : signUpPending
                  ? lang === "ar"
                    ? "جارٍ إنشاء الحساب..."
                    : "Creating account..."
                  : t.submitSignup}
                {t.dir === "rtl" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {/* Form: Forgot Password */}
          {showForgot && (
            <form
              action={resetFormAction}
            >
              <label>
                {t.email}
                <span className="input-wrap">
                  <input
                    type="email"
                    name="email"
                    placeholder={t.emailPlaceholder}
                    required
                  />
                </span>
              </label>

              <button className="auth-submit" type="submit" disabled={resetPending}>
                {resetPending
                  ? lang === "ar"
                    ? "جارٍ الإرسال..."
                    : "Sending link..."
                  : t.forgotSubmit}
                {t.dir === "rtl" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}
              </button>

              <div className="form-meta" style={{ marginTop: "16px", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
                >
                  {t.forgotBack}
                </button>
              </div>
            </form>
          )}

          {!showForgot && (
            <>
              <p className="switch-copy">
                {isLogin ? t.switchLogin : t.switchSignup}{" "}
                <button
                  type="button"
                  onClick={() => setMode(isLogin ? "signup" : "login")}
                >
                  {isLogin ? t.switchLoginLink : t.switchSignupLink}
                </button>
              </p>
            </>
          )}
        </div>

        <div className="auth-form-footer">
          <span>© 2026 Fitna AI</span>
          <span>Privacy · Terms</span>
        </div>
      </section>
    </div>
  );
}
