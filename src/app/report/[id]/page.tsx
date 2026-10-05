import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DIALECT_CONFIG, parseDialect } from "@/lib/dialect/config";
import { AppHeader } from "@/components/app/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, CircleAlert, Lightbulb, Trophy, Activity } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "تقرير الجلسة" };
export const dynamic = "force-dynamic";

const SCORE_LABEL = (score: number) =>
  score >= 85 ? "ممتاز" : score >= 70 ? "جيد جداً" : score >= 55 ? "جيد" : score >= 40 ? "مقبول" : "يحتاج تطويراً";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!id || id.length > 60) notFound();

  // IDOR: ownership enforced at the query level.
  const session = await db.simSession.findFirst({
    where: { id, userId: user.id },
    include: {
      topic: { select: { titleAr: true } },
      report: true,
      events: { orderBy: { occurredMs: "asc" } },
    },
  });
  if (!session) notFound();

  const dialect = parseDialect(session.dialect);
  const report = session.report;
  const metrics = {
    ttr: session.teacherTalkRatio,
    socratic: session.socraticRate,
    inclusivity: session.inclusivityIndex,
    score: session.overallScore,
  };
  const framework = (report?.frameworkScores || {}) as Record<string, number>;

  const teacherEvents = session.events.filter((e) => e.actor === "teacher");
  const studentEvents = session.events.filter((e) => e.eventType === "student_reaction");

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        userName={(user.profile?.fullName || "المستخدم").split(" ")[0]}
        dialectLabel={DIALECT_CONFIG[dialect].labelAr}
      />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 space-y-6">
        {/* Header */}
        <section className="text-center space-y-2">
          <h1 className="font-heading text-3xl font-extrabold">تقرير الجلسة التشخيصي</h1>
          <p className="text-muted-foreground">
            {session.topic?.titleAr || "جلسة تدريب"} ·{" "}
            {new Date(session.startedAt).toLocaleString("ar", { dateStyle: "long", timeStyle: "short" })}
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Badge variant="secondary">{DIALECT_CONFIG[dialect].labelAr}</Badge>
            <Badge variant="secondary">{session.durationMinutes} دقيقة</Badge>
            <Badge variant="secondary">{teacherEvents.length} تدخلاً</Badge>
            {session.status === "completed" ? (
              <Badge>مكتملة</Badge>
            ) : (
              <Badge variant="destructive">غير مكتملة</Badge>
            )}
          </div>
        </section>

        {/* Score hero */}
        {report && metrics.score != null && (
          <Card className="border-primary/30 bg-gradient-to-bl from-primary/5 to-transparent">
            <CardContent className="p-8 flex flex-col sm:flex-row items-center gap-8">
              <div className="shrink-0 text-center">
                <p className="font-heading text-6xl font-extrabold tabular-nums text-primary">
                  {Math.round(metrics.score)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">من 100 · {SCORE_LABEL(metrics.score)}</p>
              </div>
              <div className="flex-1 space-y-4">
                <p className="text-lg leading-relaxed">{report.sessionSignalAr}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{report.summaryAr}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metrics + framework */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
                المؤشرات التربوية
              </CardTitle>
              <CardDescription>قياس كمي دقيق لأدائك خلال الجلسة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                {
                  label: "نسبة كلام المعلم",
                  value: metrics.ttr ?? 0,
                  display: `${Math.round(metrics.ttr ?? 0)}%`,
                  target: "المستهدف 30–45%",
                  good: (metrics.ttr ?? 0) >= 30 && (metrics.ttr ?? 0) <= 45,
                },
                {
                  label: "معدل الأسئلة السقراطية",
                  value: metrics.socratic ?? 0,
                  display: `${Math.round(metrics.socratic ?? 0)}%`,
                  target: "المستهدف ≥ 40%",
                  good: (metrics.socratic ?? 0) >= 40,
                },
                {
                  label: "مؤشر شمول الانتباه",
                  value: metrics.inclusivity ?? 0,
                  display: `${Math.round(metrics.inclusivity ?? 0)}%`,
                  target: "المستهدف ≥ 75%",
                  good: (metrics.inclusivity ?? 0) >= 75,
                },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-sm font-bold tabular-nums">{m.display}</span>
                  </div>
                  <Progress value={Math.min(100, m.value)} aria-hidden="true" />
                  <p className="text-[11px] mt-1 text-muted-foreground">{m.target}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {report && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
                  بطاقة الكفايات التدريسية
                </CardTitle>
                <CardDescription>محاور التقييم الستة للإطار المهني</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "engagement", label: "التفاعل وإدارة الحوار" },
                  { key: "socratic", label: "التقنية السقراطية" },
                  { key: "control", label: "ضبط الفصل" },
                  { key: "inclusivity", label: "الشمول والعدالة" },
                ].map((f) => {
                  const v = Math.round(framework[f.key] ?? 0);
                  return (
                    <div key={f.key}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium">{f.label}</span>
                        <span className="text-sm font-bold tabular-nums">{v}%</span>
                      </div>
                      <Progress value={v} aria-hidden="true" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Strengths / weaknesses / recommendations */}
        {report && (
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-primary/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  نقاط القوة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="text-sm leading-relaxed flex gap-2">
                      <span className="text-primary shrink-0" aria-hidden="true">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="border-chart-4/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2 text-chart-4">
                  <CircleAlert className="h-5 w-5" aria-hidden="true" />
                  فرص التحسين
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.weaknesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد مواطن ضعف جوهرية — أداء متوازن</p>
                ) : (
                  <ul className="space-y-2.5">
                    {report.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm leading-relaxed flex gap-2">
                        <span className="text-chart-4 shrink-0" aria-hidden="true">!</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card className="border-chart-2/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2 text-chart-2">
                  <Lightbulb className="h-5 w-5" aria-hidden="true" />
                  التوصيات العملية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {report.recommendations.map((r, i) => (
                    <li key={i} className="text-sm leading-relaxed flex gap-2">
                      <span className="text-chart-2 shrink-0" aria-hidden="true">◆</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">سجل الحوار الكامل</CardTitle>
            <CardDescription>
              {teacherEvents.length} تدخلاً منك و{studentEvents.length} ردّاً من الطلاب
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto scroll-area-rtl space-y-3">
            {session.events.map((ev) => (
              <div
                key={ev.id}
                className={
                  ev.actor === "teacher"
                    ? "flex justify-start"
                    : ev.eventType === "student_reaction"
                      ? "flex justify-end"
                      : "hidden"
                }
              >
                <div
                  className={
                    ev.actor === "teacher"
                      ? "max-w-[85%] rounded-xl bg-secondary px-3.5 py-2 text-sm"
                      : "max-w-[85%] rounded-xl border px-3.5 py-2 text-sm"
                  }
                >
                  <span className="block text-[11px] font-semibold text-muted-foreground mb-0.5">
                    {ev.actor === "teacher" ? "المعلم (أنت)" : ev.actor}
                  </span>
                  <span className="leading-relaxed">{ev.content}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-center gap-3 pb-6">
          <Button asChild size="lg">
            <Link href="/session/setup">جلسة تدريب جديدة</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/history">كل الجلسات</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
