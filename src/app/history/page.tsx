import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Language } from "@/lib/i18n";
import { HistoryClient, type SessionItem } from "./HistoryClient";

const PAGE_SIZE = 10;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const cookieStore = await cookies();
  const lang = (cookieStore.get("language")?.value === "en" ? "en" : "ar") as Language;
  const isEn = lang === "en";

  const supabase = await createClient();
  let user: any = null;
  try {
    const userRes = await supabase.auth.getUser();
    user = userRes?.data?.user ?? null;
  } catch {}

  if (!user) redirect("/login");

  const db = createAdminClient();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const {
    data: sessions,
    count,
  } = await Promise.race([
    db
      .from("sessions")
      .select(
        "id, started_at, duration_minutes, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, classroom_pattern, topic_id",
        { count: "exact" }
      )
      .eq("teacher_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .range(from, to),
    new Promise<{ data: any[]; count: number }>((resolve) =>
      setTimeout(() => resolve({ data: [], count: 0 }), 10000)
    ),
  ]).catch(() => ({ data: [], count: 0 }));

  const topicIds = [...new Set((sessions ?? []).map((s) => s.topic_id).filter(Boolean))] as string[];
  const { data: topics } = topicIds.length
    ? await db.from("lesson_topics").select("id, title_ar, title_en").in("id", topicIds)
    : { data: [] as { id: string; title_ar: string; title_en: string | null }[] };

  const mappedSessions: SessionItem[] = (sessions ?? []).map((s) => {
    const d = new Date(s.started_at);
    const dateStr = d.toLocaleDateString(isEn ? "en-US" : "ar-EG", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const timeStr = d.toLocaleTimeString(isEn ? "en-US" : "ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const topicObj = topics?.find((t) => t.id === s.topic_id);
    const topicTitle =
      (topicObj && (isEn && topicObj.title_en ? topicObj.title_en : topicObj.title_ar)) ||
      (isEn ? "Classroom Simulation" : "محاكاة تفاعل الفصل");
    const topicSubtitle = isEn ? "Pedagogical • Interactive Session" : "تربوي • تدريب تفاعلي";

    return {
      id: s.id,
      started_at: s.started_at,
      dateStr,
      timeStr,
      topicTitle,
      topicSubtitle,
      overall_score: s.overall_score,
      classroom_pattern: s.classroom_pattern,
    };
  });

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <HistoryClient
      sessions={mappedSessions}
      totalCount={count ?? 0}
      currentPage={page}
      totalPages={totalPages}
      lang={lang}
    />
  );
}
