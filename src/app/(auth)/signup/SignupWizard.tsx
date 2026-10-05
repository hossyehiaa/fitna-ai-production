"use client";

// =====================================================================
// Signup wizard — polished onboarding (spec §16).
//   Step 1: إنشاء حساب (email + password)
//   Step 2: نوع المستخدم  [معلم] [مؤسسة]
//   Step 3: اختيار اللهجة الصوتية [سعودي] [مصري]
//   Step 4: إكمال الملف الشخصي (name [+ institution]) → لوحة التحكم
// UI is ALWAYS Modern Standard Arabic. The dialect only configures AI speech.
// =====================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Loader2,
  Mail,
  Lock,
  User,
  Building2,
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Volume2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { api, ApiClientError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type UserType = "teacher" | "institution";
type Dialect = "saudi" | "egyptian";

const STEPS = ["إنشاء الحساب", "نوع المستخدم", "نمط التحدث الصوتي", "إكمال الملف"];

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [userType, setUserType] = useState<UserType | null>(null);
  const [dialect, setDialect] = useState<Dialect | null>(null);

  const [fullName, setFullName] = useState("");
  const [institutionName, setInstitutionName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function next() {
    setError(null);
    if (step === 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("يرجى إدخال بريد إلكتروني صحيح");
        return;
      }
      if (password.length < 8 || !/[0-9]/.test(password) || !/[A-Za-z\u0600-\u06FF]/.test(password)) {
        setError("كلمة المرور يجب أن تتكون من 8 أحرف على الأقل وتضم حرفاً ورقماً");
        return;
      }
      if (password !== confirm) {
        setError("كلمتا المرور غير متطابقتين");
        return;
      }
    }
    if (step === 1 && !userType) {
      setError("يرجى اختيار نوع الحساب للمتابعة");
      return;
    }
    if (step === 2 && !dialect) {
      setError("يرجى اختيار نمط التحدث الصوتي المفضل لديك");
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) {
      setError("يرجى إدخال اسمك الكامل (حرفان على الأقل)");
      return;
    }
    if (userType === "institution" && institutionName.trim().length < 2) {
      setError("يرجى إدخال اسم المؤسسة التعليمية");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ redirectTo: string }>("/api/auth/signup", {
        email,
        password,
        fullName: fullName.trim(),
        userType,
        dialect,
        institutionName: userType === "institution" ? institutionName.trim() : "",
      });
      router.push(res.redirectTo || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-lg border-border/70">
      <CardHeader className="space-y-3">
        <CardTitle className="font-heading text-2xl font-extrabold text-center">
          الانضمام إلى منصة فِطنة
        </CardTitle>
        <CardDescription className="text-center">
          أنشئ حسابك واختر تفضيلاتك — تستغرق العملية أقل من دقيقتين
        </CardDescription>
        <div className="pt-2 space-y-2">
          <Progress value={((step + 1) / STEPS.length) * 100} aria-label={`الخطوة ${step + 1} من ${STEPS.length}`} />
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((label, i) => (
              <span key={label} className={cn(i === step && "text-primary font-semibold")}>
                {i < step ? "✓ " : ""}
                {label}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="su-email">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="su-email"
                  type="email"
                  dir="ltr"
                  className="pr-10 text-left"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  maxLength={254}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-password">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="su-password"
                  type="password"
                  className="pr-10"
                  placeholder="8 أحرف على الأقل، تضم حرفاً ورقماً"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={128}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-confirm">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="su-confirm"
                  type="password"
                  className="pr-10"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  maxLength={128}
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <fieldset className="space-y-3" aria-label="نوع المستخدم">
            <legend className="text-sm font-medium mb-2">ما نوع حسابك؟</legend>
            {(
              [
                {
                  value: "teacher",
                  icon: GraduationCap,
                  title: "معلم",
                  desc: "معلمٌ أو مُعلِّمٌ يسعى لتطوير مهاراته في إدارة الفصل والحوار الصفي.",
                },
                {
                  value: "institution",
                  icon: Building2,
                  title: "مؤسسة",
                  desc: "مدرسةٌ أو مؤسسةٌ تعليميةٌ تدرّب كادرها التدريسي وتتابع تطوره.",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setUserType(opt.value)}
                aria-pressed={userType === opt.value}
                className={cn(
                  "w-full text-right rounded-xl border-2 p-4 flex gap-3 items-start transition-all focus-visible:outline-2 focus-visible:outline-ring",
                  userType === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-secondary/40"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 h-11 w-11 rounded-xl grid place-items-center",
                    userType === opt.value ? "bg-primary text-primary-foreground" : "bg-secondary"
                  )}
                >
                  <opt.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className="block font-bold text-base mb-0.5">{opt.title}</span>
                  <span className="block text-sm text-muted-foreground leading-relaxed">{opt.desc}</span>
                </span>
                {userType === opt.value && (
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-1" aria-hidden="true" />
                )}
              </button>
            ))}
          </fieldset>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              اختر نمط التحدث الصوتي المفضل لديك. يحدد هذا الاختيار أسلوب تحدث وكلاء الذكاء
              الاصطناعي ونطقهم، بينما تبقى واجهة الموقع بالعربية الفصحى دائماً. يمكنك تغييره
              لاحقاً من الإعدادات.
            </p>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="نمط التحدث الصوتي">
              {(
                [
                  {
                    value: "saudi",
                    flag: "🇸🇦",
                    title: "اللهجة السعودية",
                    desc: "وكلاء يتفاعلون وينطقون باللهجة السعودية",
                    locale: "ar-SA",
                  },
                  {
                    value: "egyptian",
                    flag: "🇪🇬",
                    title: "اللهجة المصرية",
                    desc: "وكلاء يتفاعلون وينطقون باللهجة المصرية",
                    locale: "ar-EG",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={dialect === opt.value}
                  onClick={() => setDialect(opt.value)}
                  className={cn(
                    "rounded-xl border-2 p-4 text-center transition-all focus-visible:outline-2 focus-visible:outline-ring",
                    dialect === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-secondary/40"
                  )}
                >
                  <span className="text-3xl block mb-2" aria-hidden="true">
                    {opt.flag}
                  </span>
                  <span className="block font-bold mb-1">{opt.title}</span>
                  <span className="block text-xs text-muted-foreground leading-relaxed">{opt.desc}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground" dir="ltr">
                    <Volume2 className="h-3 w-3" aria-hidden="true" />
                    {opt.locale}
                  </span>
                </button>
              ))}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              واجهة الموقع بالعربية الفصحى في الحالتين — الاختيار يؤثر على الصوت واللهجة المحكية فقط.
            </p>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="su-name">
                {userType === "institution" ? "اسمك الكامل (مسؤول المؤسسة)" : "اسمك الكامل"}
              </Label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="su-name"
                  className="pr-10"
                  placeholder="مثال: أحمد عبد الرحمن"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  maxLength={80}
                />
              </div>
            </div>
            {userType === "institution" && (
              <div className="space-y-2">
                <Label htmlFor="su-inst">اسم المؤسسة التعليمية</Label>
                <div className="relative">
                  <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="su-inst"
                    className="pr-10"
                    placeholder="مثال: مدرسة النور الأهلية"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    maxLength={120}
                  />
                </div>
              </div>
            )}
            <div className="rounded-lg border bg-secondary/40 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">نوع الحساب</span>
                <span className="font-medium">{userType === "institution" ? "مؤسسة" : "معلم"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">نمط التحدث</span>
                <span className="font-medium">
                  {dialect === "saudi" ? "السعودية 🇸🇦" : "المصرية 🇪🇬"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">لغة الواجهة</span>
                <span className="font-medium">العربية الفصحى</span>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  إنشاء الحساب والدخول
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        )}

        {step < 3 && (
          <div className="mt-6 flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={back} className="h-11">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                السابق
              </Button>
            )}
            <Button type="button" onClick={next} className="flex-1 h-11 text-base">
              التالي
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            سجّل الدخول
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
