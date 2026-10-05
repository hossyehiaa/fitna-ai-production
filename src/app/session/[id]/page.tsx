import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DIALECT_CONFIG, parseDialect } from "@/lib/dialect/config";
import { LiveRoom } from "./LiveRoom";

export const metadata = { title: "الفصل المباشر" };
export const dynamic = "force-dynamic";

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!id || id.length > 60) notFound();

  // IDOR: ownership enforced at the query level.
  const session = await db.simSession.findFirst({
    where: { id, userId: user.id },
    include: {
      topic: { select: { titleAr: true } },
      events: { orderBy: { occurredMs: "asc" } },
    },
  });
  if (!session) notFound();

  const dialect = parseDialect(session.dialect);
  const agents = await db.agent.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
    select: { key: true, name: true, description: true, gender: true },
  });

  return (
    <LiveRoom
      session={{
        id: session.id,
        status: session.status,
        topicTitle: session.topic?.titleAr || "جلسة تدريب",
        durationMinutes: session.durationMinutes,
        classroomStyle: session.classroomStyle,
        dialectLabel: DIALECT_CONFIG[dialect].labelAr,
        startedAtMs: session.startedAt.getTime(),
      }}
      agents={agents}
      initialEvents={session.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actor: e.actor,
        content: e.content,
        occurredMs: e.occurredMs,
        emotion: (e.metadata as { emotion?: string } | null)?.emotion || null,
      }))}
    />
  );
}
