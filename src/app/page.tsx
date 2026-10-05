import Link from "next/link";
import {
  Mic,
  Brain,
  BarChart3,
  ShieldCheck,
  Languages,
  GraduationCap,
  PlayCircle,
  Sparkles,
  Building2,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <Logo />
          <div className="flex-1" />
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">تسجيل الدخول</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">
              إنشاء حساب
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10 opacity-60 dark:opacity-40"
            style={{
              background:
                "radial-gradient(60% 50% at 80% 10%, color-mix(in oklab, var(--primary) 14%, transparent), transparent), radial-gradient(45% 40% at 15% 30%, color-mix(in oklab, var(--chart-2) 18%, transparent), transparent)",
            }}
            aria-hidden="true"
          />
          <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 text-center">
            <Badge variant="secondary" className="mb-6 gap-1.5 py-1.5 px-4 text-sm">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              محاكي الفصل الدراسي بالذكاء الاصطناعي
            </Badge>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight max-w-3xl mx-auto">
              تدرّب على إدارة الفصل
              <span className="text-primary"> قبل أن تدخله</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              منصة تدريب تربوي صوتية تفاعلية تُحاكي فصلاً دراسياً واقعياً بطلابٍ افتراضيين
              لكلٍّ منهم شخصيته المستقلة. تحدّث بصوتك، وتلقَّ ردود الطلاب، واحصل على تقرير
              تشخيصي فوري لمهاراتك التدريسية.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <Link href="/signup">
                  <PlayCircle className="h-5 w-5" aria-hidden="true" />
                  ابدأ التدريب الآن
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                <Link href="/login">لدي حساب بالفعل</Link>
              </Button>
            </div>

            {/* Dialect highlight */}
            <div className="mt-10 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl border bg-card/80 px-5 py-3 shadow-sm">
              <Languages className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">اختر نمط تحدث وكلاء الذكاء الاصطناعي:</span>
              <Badge className="gap-1">
                <span aria-hidden="true">🇸🇦</span> اللهجة السعودية
              </Badge>
              <Badge className="gap-1">
                <span aria-hidden="true">🇪🇬</span> اللهجة المصرية
              </Badge>
              <span className="text-xs text-muted-foreground">— وتبقى واجهة الموقع بالعربية الفصحى دائماً</span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-secondary/30 py-16" aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="features-title" className="font-heading text-3xl font-bold text-center mb-3">
              مميزات منصة فِطنة
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              صُممت المنصة مع خبراء تربويين لمحاكاة تحديات الفصل الحقيقي بأمانٍ تام
            </p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Mic,
                  title: "محاكاة صوتية حية",
                  desc: "تحدّث بصوتك مباشرةً إلى طلابٍ افتراضيين، واستمع إلى ردودهم المنطوقة بتفاعلٍ فوريٍّ طبيعي.",
                },
                {
                  icon: Brain,
                  title: "شخصيات طلاب مستقلة",
                  desc: "أربعة طلاب افتراضيين لكلٍّ منهم شخصيته ومستوى فهمه وحالته الانفعالية المتغيرة بحسب أسلوبك.",
                },
                {
                  icon: BarChart3,
                  title: "تقارير تشخيصية فورية",
                  desc: "قياس تربوي دقيق: نسبة كلام المعلم، ومعدل الأسئلة السقراطية، ومؤشر شمول الانتباه بين الطلاب.",
                },
                {
                  icon: Languages,
                  title: "لهجتان صوتيتان",
                  desc: "اختر التحدث السعودي أو المصري لوكلاء المحاكاة الصوتيين، مع بقاء واجهة الموقع بالفصحى.",
                },
                {
                  icon: ShieldCheck,
                  title: "خصوصية وأمان",
                  desc: "جلساتك مشفّرة ومعزولة، وبياناتك ملكك وحدك مع إمكانية حذف حسابك نهائياً في أي وقت.",
                },
                {
                  icon: GraduationCap,
                  title: "شارات إنجاز تربوية",
                  desc: "اكسب شارات مهنية عند إتقان مهارات التدريس: الاستماع الحكيم، سقراط الفصل، قائد الفصل وغيرها.",
                },
              ].map((f) => (
                <Card key={f.title} className="border-border/70 transition-shadow hover:shadow-md">
                  <CardContent className="p-6 flex gap-4">
                    <span className="shrink-0 h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
                      <f.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-heading font-bold text-lg mb-1.5">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="py-16" aria-labelledby="audience-title">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <h2 id="audience-title" className="font-heading text-3xl font-bold mb-10">
              لمن صُممت المنصة؟
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="text-right">
                <CardContent className="p-6">
                  <span className="inline-flex h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-4">
                    <GraduationCap className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="font-heading font-bold text-xl mb-2">المعلم</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    معلمٌ يسعى لتطوير مهارات إدارة الفصل والحوار السقراطي قبل التطبيق الفعلي،
                    أو خريجٌ جديد يستعد لمقابلات التدريس العملية.
                  </p>
                </CardContent>
              </Card>
              <Card className="text-right">
                <CardContent className="p-6">
                  <span className="inline-flex h-12 w-12 rounded-2xl bg-accent text-accent-foreground grid place-items-center mb-4">
                    <Building2 className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="font-heading font-bold text-xl mb-2">المؤسسة التعليمية</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    مدرسةٌ أو أكاديميةٌ تودّ تدريب كادرها التدريسي وقياس أثر التدريب عبر
                    تقارير تقييمٍ موحّدة وموثوقة.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t bg-secondary/30 py-16" aria-labelledby="how-title">
          <div className="mx-auto max-w-4xl px-4">
            <h2 id="how-title" className="font-heading text-3xl font-bold text-center mb-12">
              كيف تعمل المحاكاة؟
            </h2>
            <ol className="space-y-6">
              {[
                { t: "أنشئ حسابك واختر نمط التحدث", d: "حدد نوع حسابك (معلم أو مؤسسة) ونمط التحدث الصوتي المفضل: السعودي أو المصري." },
                { t: "جهّز جلسة التدريب", d: "اختر موضوع الدرس ومدته ونمط الفصل: متوازن، أو مشاغب، أو خامل." },
                { t: "أدر الحوار الصوتي", d: "تحدث بصوتك كأنك في فصلٍ حقيقي، واستمع إلى ردود الطلاب وتفاعلاتهم اللحظية." },
                { t: "استلم تقريرك التشخيصي", d: "احصل على تحليلٍ تربوي شامل لنقاط قوتك وفرص تحسينك مع توصيات عملية." },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-4 items-start">
                  <span className="shrink-0 h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-heading font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{s.t}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4">
            <div className="rounded-3xl border bg-gradient-to-bl from-primary to-primary/80 text-primary-foreground p-10 text-center shadow-lg">
              <h2 className="font-heading text-3xl font-extrabold mb-3">
                فصلك الافتراضي بانتظارك
              </h2>
              <p className="opacity-90 mb-8 leading-relaxed">
                أنشئ حسابك المجاني اليوم وابدأ أول جلسة تدريب خلال دقيقتين.
              </p>
              <Button asChild size="lg" variant="secondary" className="h-12 px-10 text-base">
                <Link href="/signup">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  إنشاء حساب مجاني
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
          </div>
          <p>جميع الحقوق محفوظة — منصة فِطنة</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">
              تسجيل الدخول
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              إنشاء حساب
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
