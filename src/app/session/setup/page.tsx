import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureAgentsSeeded } from "@/lib/agents/seed";
import { AppHeader } from "@/components/app/AppHeader";
import { DIALECT_CONFIG, parseDialect } from "@/lib/dialect/config";
import { SessionSetupForm } from "./SessionSetupForm";

export const metadata = { title: "تجهيز جلسة التدريب" };
export const dynamic = "force-dynamic";

export default async function SessionSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/session/setup");

  await ensureAgentsSeeded();
  const topics = await db.lessonTopic.findMany({
    where: { isGlobal: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const dialect = parseDialect(user.profile?.dialect);
  const agents = await db.agent.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
    select: { key: true, name: true, description: true, comprehension: true },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        userName={(user.profile?.fullName || "المستخدم").split(" ")[0]}
        dialectLabel={DIALECT_CONFIG[dialect].labelAr}
      />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8">
        <SessionSetupForm
          topics={topics.map((t) => ({ id: t.id, title: t.titleAr }))}
          agents={agents}
          dialect={dialect}
          dialectLabel={DIALECT_CONFIG[dialect].labelAr}
        />
      </main>
    </div>
  );
}
