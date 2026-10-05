import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/app/AppHeader";
import { DIALECT_CONFIG, parseDialect } from "@/lib/dialect/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { History as HistoryIcon, Trophy } from "lucide-react";

export const metadata = { title: "سجل الجلسات" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  completed: { label: "مكتملة", variant: "default" },
  in_progress: { label: "قيد التنفيذ", variant: "secondary" },
  abandoned: { label: "متروكة", variant: "destructive" },
};

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/history");

  const dialect = parseDialect(user.profile?.dialect);
  const sessions = await db.simSession.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { topic: { select: { titleAr: true } } },
  });

  const scores = sessions
    .filter((s) => s.overallScore != null)
    .map((s) => s.overallScore as number);
  const best = scores.length ? Math.max(...scores) : null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        userName={(user.profile?.fullName || "المستخدم").split(" ")[0]}
        dialectLabel={DIALECT_CONFIG[dialect].labelAr}
      />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold">سجل جلساتك</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {sessions.length} جلسة — أفضل أداء: {best != null ? `${Math.round(best)}/100` : "—"}
            </p>
          </div>
          <Button asChild>
            <Link href="/session/setup">جلسة جديدة</Link>
          </Button>
        </div>

        {sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <HistoryIcon className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" aria-hidden="true" />
              <h2 className="font-heading font-bold text-lg mb-1">لا توجد جلسات بعد</h2>
              <p className="text-sm text-muted-foreground mb-4">
                ابدأ أول جلسة تدريب وسيظهر سجلها وتقريرها هنا
              </p>
              <Button asChild>
                <Link href="/session/setup">بدء أول جلسة</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const st = STATUS_LABEL[s.status] || STATUS_LABEL.in_progress;
              const sDialect = parseDialect(s.dialect);
              return (
                <li key={s.id}>
                  <Link
                    href={s.status === "completed" ? `/report/${s.id}` : `/session/${s.id}`}
                    className="flex items-center gap-4 rounded-2xl border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all"
                  >
                    <span
                      className={
                        s.overallScore != null
                          ? "shrink-0 h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center font-heading font-extrabold tabular-nums"
                          : "shrink-0 h-12 w-12 rounded-xl bg-muted text-muted-foreground grid place-items-center"
                      }
                    >
                      {s.overallScore != null ? (
                        Math.round(s.overallScore)
                      ) : (
                        <Trophy className="h-5 w-5 opacity-50" aria-hidden="true" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {s.topic?.titleAr || "جلسة تدريب"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(s.startedAt).toLocaleString("ar", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {" · "}
                        {s.durationMinutes} دقيقة · {DIALECT_CONFIG[sDialect].labelAr}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {s.status === "completed" ? "التقرير ←" : "المتابعة ←"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
