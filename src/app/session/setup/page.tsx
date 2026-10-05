import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SessionSetupForm } from "./SessionSetupForm";

const FALLBACK_TOPICS = [
  { id: "f7a3f81e-1111-4000-8000-000000000001", title_ar: "تغير المناخ والاحتباس الحراري (Climate Change)", title_en: "Climate Change & Global Warming" },
  { id: "f7a3f81e-2222-4000-8000-000000000002", title_ar: "الكسور والأعداد ومقارنتها", title_en: "Fractions & Number Comparison" },
  { id: "f7a3f81e-3333-4000-8000-000000000003", title_ar: "إدارة الصف والتفاعل الصفي", title_en: "Classroom Management & Dynamics" },
  { id: "f7a3f81e-4444-4000-8000-000000000004", title_ar: "العلوم والتجربة والاستنتاج", title_en: "Science & Scientific Inquiry" },
];

const FALLBACK_PERSONAS = [
  { id: "p-sara", name: "سارة", age: 10, base_attention: 88, strengths: ["متفوقة ومنظمة"], weaknesses: ["حساسة للمقاطعة"] },
  { id: "p-yassin", name: "ياسين", age: 10, base_attention: 75, strengths: ["مجتهد وعملي"], weaknesses: ["مفاهيم ملتبسة أحياناً"] },
  { id: "p-omar", name: "عمر", age: 10, base_attention: 65, strengths: ["نشيط ومتحمس"], weaknesses: ["تشتت الانتباه بسرعة"] },
  { id: "p-nour", name: "نور", age: 9, base_attention: 50, strengths: ["هادئة وتفكر بعمق"], weaknesses: ["خجولة وتحتاج تشجيع"] },
];

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]).catch(() => fallback);
}

export default async function SessionSetupPage() {
  const supabase = await createClient();
  let user: any = null;
  try {
    const userRes = await supabase.auth.getUser();
    user = userRes?.data?.user ?? null;
  } catch {}

  if (!user) redirect("/login");

  const db = createAdminClient();
  const profileRes = await withTimeout(
    db.from("users").select("role").eq("id", user.id).single(),
    10000,
    { data: null, error: null }
  );
  const role = profileRes.data?.role ?? "teacher";
  if (role !== "teacher") redirect("/unauthorized");

  const topicsRes = await withTimeout(
    db.from("lesson_topics").select("id, title_ar, title_en").order("created_at", { ascending: true }),
    10000,
    { data: null, error: null }
  );
  const topics = topicsRes.data && topicsRes.data.length > 0 ? topicsRes.data : FALLBACK_TOPICS;

  const personasRes = await withTimeout(
    db
      .from("student_personas")
      .select("id, name, age, base_attention, strengths, weaknesses, dialect")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    10000,
    { data: null, error: null }
  );
  const personas = personasRes.data && personasRes.data.length > 0 ? personasRes.data : FALLBACK_PERSONAS;

  return <SessionSetupForm topics={topics} personas={personas} />;
}
