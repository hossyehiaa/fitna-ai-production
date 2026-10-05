import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { LiveRoom } from "./LiveRoom";

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, duration_minutes, classroom_style, training_objective, lesson_context, status, started_at, teacher_id, dialect")
    .eq("id", id)
    .single();

  if (!session) notFound();
  if (session.teacher_id !== user.id) redirect("/unauthorized");

  const { data: teacherProfile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const teacherName = teacherProfile?.full_name || user.user_metadata?.full_name || user.email || "";

  if (session.status !== "in_progress") {
    redirect(`/report/${id}`);
  }

  const { data: sessionStudents } = await supabase
    .from("session_students")
    .select("id, persona_id, final_attention")
    .eq("session_id", id);

  const personaIds = (sessionStudents ?? []).map((s) => s.persona_id);
  const { data: personas } = personaIds.length
    ? await supabase.from("student_personas").select("id, name, age, base_attention, avatar_key, gender, nationality, character_key").in("id", personaIds)
    : { data: [] as { id: string; name: string; age: number; base_attention: number }[] };

  const students = (sessionStudents ?? []).map((s) => {
    const persona = personas?.find((p) => p.id === s.persona_id);
    return {
      personaId: s.persona_id,
      name: persona?.name ?? "؟",
      age: persona?.age ?? 0,
      attention: s.final_attention ?? persona?.base_attention ?? 70,
      // Character identity (deterministic, persisted): drives avatar +
      // voice + routing everywhere the session is rendered.
      avatarKey: (persona as { avatar_key?: string | null } | undefined)?.avatar_key ?? null,
      gender: (persona as { gender?: string } | undefined)?.gender ?? "male",
      nationality: (persona as { nationality?: string } | undefined)?.nationality ?? "EG",
      characterKey: (persona as { character_key?: string | null } | undefined)?.character_key ?? null,
    };
  });

  return (
    <LiveRoom
      sessionId={session.id}
      durationMinutes={session.duration_minutes}
      classroomStyle={session.classroom_style ?? "balanced"}
      trainingObjective={session.training_objective ?? "socratic_focus"}
      lessonContext={session.lesson_context ?? ""}
      startedAt={session.started_at}
      initialStudents={students}
      teacherName={teacherName}
      dialect={(session as { dialect?: string }).dialect ?? "egyptian"}
    />
  );
}
