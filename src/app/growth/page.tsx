import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Language } from "@/lib/i18n";
import { GrowthClient } from "./GrowthClient";

export default async function GrowthPage() {
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

  const profileRes = await Promise.race([
    db.from("users").select("full_name, email").eq("id", user.id).single(),
    new Promise<any>((resolve) => setTimeout(() => resolve({ data: null }), 10000))
  ]).catch(() => ({ data: null }));

  const profile = profileRes?.data ?? {
    full_name: user.user_metadata?.full_name || user.email || "معلم",
    email: user.email || "",
  };

  const sessionsRes = await Promise.race([
    db
      .from("sessions")
      .select("id, started_at, overall_score, teacher_talk_ratio, socratic_question_rate, inclusivity_index, topic_id")
      .eq("teacher_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: true })
      .limit(50),
    new Promise<any>((resolve) => setTimeout(() => resolve({ data: [] }), 10000))
  ]).catch(() => ({ data: [] }));

  const rawSessions = sessionsRes.data ?? [];

  const topicIds = [...new Set((rawSessions ?? []).map((s: any) => s.topic_id).filter(Boolean))] as string[];
  const topicsRes = topicIds.length
    ? await Promise.race([
        db.from("lesson_topics").select("id, title_ar, title_en").in("id", topicIds),
        new Promise<any>((resolve) => setTimeout(() => resolve({ data: [] }), 10000))
      ]).catch(() => ({ data: [] }))
    : { data: [] as { id: string; title_ar: string; title_en: string | null }[] };

  const topics = topicsRes.data ?? [];

  const topicTitleObj: Record<string, string> = {};
  for (const item of topics ?? []) {
    topicTitleObj[item.id] = isEn && item.title_en ? item.title_en : item.title_ar;
  }

  const sessions = (rawSessions ?? []).map((s: any) => {
    const d = new Date(s.started_at);
    const dateStr = d.toLocaleDateString(isEn ? "en-US" : "ar-EG", { month: "short", day: "numeric", year: "numeric" });
    const fullDateStr = d.toISOString().split("T")[0];
    const topic = (s.topic_id && topicTitleObj[s.topic_id]) || (isEn ? "Classroom Simulation" : "جلسة تدريس تفاعلية");

    return {
      id: s.id,
      startedAt: s.started_at,
      date: dateStr,
      fullDate: fullDateStr,
      overallScore: s.overall_score,
      teacherTalkRatio: s.teacher_talk_ratio,
      socraticQuestionRate: s.socratic_question_rate,
      inclusivityIndex: s.inclusivity_index,
      topicTitle: topic,
    };
  });

  const badgesRes = await Promise.race([
    db
      .from("badges")
      .select("badge_key, unlocked_at")
      .eq("user_id", user.id)
      .order("unlocked_at", { ascending: false }),
    new Promise<any>((resolve) => setTimeout(() => resolve({ data: [] }), 10000))
  ]).catch(() => ({ data: [] }));

  const rawBadges = (badgesRes.data ?? []).map((b: any) => ({
    key: b.badge_key,
    unlockedAt: b.unlocked_at,
  }));

  // Automatic verification fallback: if verified sessions meet badge criteria, guarantee unlock!
  const badgeMap = new Map<string, string | null>(rawBadges.map((b: any) => [b.key, b.unlockedAt]));

  if (sessions.length >= 1 && !badgeMap.has("pioneer_teacher")) {
    badgeMap.set("pioneer_teacher", sessions[0]?.startedAt || new Date().toISOString());
  }
  if (sessions.length >= 3 && !badgeMap.has("streak_master")) {
    badgeMap.set("streak_master", sessions[2]?.startedAt || new Date().toISOString());
  }
  const socratesSession = sessions.find((s: any) => (s.socraticQuestionRate ?? 0) > 80);
  if (socratesSession && !badgeMap.has("socrates_incarnate")) {
    badgeMap.set("socrates_incarnate", socratesSession.startedAt);
  }
  const listenerSession = sessions.find((s: any) => (s.teacherTalkRatio ?? 0) >= 25 && (s.teacherTalkRatio ?? 0) <= 50);
  if (listenerSession && !badgeMap.has("master_listener")) {
    badgeMap.set("master_listener", listenerSession.startedAt);
  }
  const inclusiveSession = sessions.find((s: any) => (s.inclusivityIndex ?? 0) === 100);
  if (inclusiveSession && !badgeMap.has("inclusive_educator")) {
    badgeMap.set("inclusive_educator", inclusiveSession.startedAt);
  }
  const captainSession = sessions.find((s: any) => (s.overallScore ?? 0) >= 90);
  if (captainSession && !badgeMap.has("classroom_captain")) {
    badgeMap.set("classroom_captain", captainSession.startedAt);
  }

  const badges = Array.from(badgeMap.entries()).map(([key, unlockedAt]) => ({
    key,
    unlockedAt,
  }));

  return (
    <GrowthClient
      sessions={sessions}
      profile={profile}
      badges={badges}
      lang={lang}
    />
  );
}
