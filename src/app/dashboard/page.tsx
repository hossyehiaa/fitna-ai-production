import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/app/AppHeader";
import { DIALECT_CONFIG, parseDialect } from "@/lib/dialect/config";
import { DashboardCards } from "./DashboardCards";
import { Button } from "@/components/ui/button";
import { PlayCircle, BookOpenText, Award, Mic, BarChart3, Clock } from "lucide-react";

export const metadata = { title: "لوحة التحكم" };
export const dynamic = "force-dynamic";

const BADGE_LABELS: Record<string, { label: string; emoji: string }> = {
  pioneer_teacher: { label: "المعلم الرائد", emoji: "🚀" },
  streak_master: { label: "بطل الاستمرارية", emoji: "🔥" },
  socrates_incarnate: { label: "سقراط الفصل", emoji: "🏛️" },
  master_listener: { label: "المستمع الحكيم", emoji: "🎧" },
  inclusive_educator: { label: "معلم العدالة والشمول", emoji: "⚖️" },
  classroom_captain: { label: "قائد الفصل", emoji: "🛡️" },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/dashboard");

  const dialect = parseDialect(user.profile?.dialect);
  const dialectCfg = DIALECT_CONFIG[dialect];
  const firstName = (user.profile?.fullName || "المستخدم").split(" ")[0];

  const [completedCount, inProgress, totalScore, badges, lastSessions, topicCount] =
    await Promise.all([
      db.simSession.count({ where: { userId: user.id, status: "completed" } }),
      db.simSession.findFirst({
        where: { userId: user.id, status: "in_progress" },
        orderBy: { startedAt: "desc" },
      }),
      db.simSession.aggregate({
        where: { userId: user.id, status: "completed", overallScore: { not: null } },
        _avg: { overallScore: true },
      }),
      db.badge.findMany({ where: { userId: user.id }, orderBy: { unlockedAt: "desc" } }),
      db.simSession.findMany({
        where: { userId: user.id, status: "completed" },
        orderBy: { startedAt: "desc" },
        take: 4,
        include: { topic: { select: { titleAr: true } } },
      }),
      db.lessonTopic.count(),
    ]);

  const avgScore = Math.round(totalScore._avg.overallScore || 0);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader userName={firstName} dialectLabel={dialectCfg.labelAr} />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 space-y-8">
        {/* Welcome + start CTA */}
        <section className="rounded-3xl border bg-gradient-to-bl from-primary/10 via-card to-card p-6 sm:p-8" aria-labelledby="welcome-title">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1 space-y-3">
              <h1 id="welcome-title" className="font-heading text-2xl sm:text-3xl font-extrabold">
                أهلاً وسهلاً بك يا {firstName} في منصة فِطنة
              </h1>
              <p className="text-muted-foreground leading-relaxed max-w-xl">
                فصلك الافتراضي جاهز — أربعة طلابٍ بلهجة
                <span className="font-semibold text-foreground"> {dialectCfg.labelAr} </span>
                بانتظار حوارك التربوي. ابدأ جلسة تدريب جديدة أو تابع جلستك الأخيرة.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild size="lg" className="h-12 px-7 text-base">
                  <Link href="/session/setup">
                    <PlayCircle className="h-5 w-5" aria-hidden="true" />
                    {inProgress ? "متابعة الجلسة الجارية" : "بدء جلسة تدريب"}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
                  <Link href="/history">استعراض سجل الجلسات</Link>
                </Button>
              </div>
            </div>
            {inProgress && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 text-sm space-y-2 shrink-0">
                <p className="font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                  جلسة قيد التنفيذ
                </p>
                <p className="text-muted-foreground">
                  الموضوع: {inProgress.lessonContext?.slice(0, 40) || "جلسة تدريب"}
                </p>
                <Button asChild size="sm" className="w-full">
                  <Link href={`/session/${inProgress.id}`}>العودة إلى الفصل</Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Stats */}
        <DashboardCards
          completedCount={completedCount}
          avgScore={avgScore}
          badgeCount={badges.length}
          topicCount={topicCount}
        />

        {/* Badges */}
        <section aria-labelledby="badges-title">
          <h2 id="badges-title" className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" aria-hidden="true" />
            شاراتك التربوية
          </h2>
          {badges.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">لم تفتح أي شارة بعد</p>
              <p className="text-sm">
                أكمل أول جلسة تدريب لتحصل على شارة «المعلم الرائد»
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {badges.map((b) => {
                const meta = BADGE_LABELS[b.badgeKey] || { label: b.badgeKey, emoji: "🏅" };
                return (
                  <div
                    key={b.id}
                    className="rounded-2xl border bg-card p-4 text-center shadow-sm"
                    title={`فُتحت في ${new Date(b.unlockedAt).toLocaleDateString("ar")}`}
                  >
                    <span className="text-3xl block mb-1.5" aria-hidden="true">
                      {meta.emoji}
                    </span>
                    <span className="text-xs font-semibold block leading-snug">{meta.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent sessions */}
        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
            أحدث جلساتك
          </h2>
          {lastSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              <Mic className="h-8 w-8 mx-auto mb-3 opacity-50" aria-hidden="true" />
              <p className="mb-1 font-medium text-foreground">لم تُجرِ أي جلسة بعد</p>
              <p className="text-sm">ابدأ أول جلسة تدريب واستلم تقريرك التشخيصي الأول</p>
              <Button asChild className="mt-4">
                <Link href="/session/setup">
                  <BookOpenText className="h-4 w-4" aria-hidden="true" />
                  تجهيز الجلسة الأولى
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {lastSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/report/${s.id}`}
                    className="flex items-center gap-4 rounded-2xl border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all"
                  >
                    <span className="shrink-0 h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center font-heading font-extrabold">
                      {Math.round(s.overallScore || 0)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">
                        {s.topic?.titleAr || "جلسة تدريب"}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {new Date(s.startedAt).toLocaleString("ar", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {" · "}
                        {dialectCfg.labelAr}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      عرض التقرير ←
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
