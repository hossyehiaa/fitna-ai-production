import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Lets a teacher (or admin) add a lesson topic that isn't in the seed
 * list, instead of being stuck with only the 4 seeded topics (spec §5:
 * the topic list "لازم تقدر تتوسع ديناميكيًا"). Scoped to the caller's
 * own institution_id via the `topics_write` RLS policy in schema.sql —
 * a teacher can't inject a topic into another institution's list.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("institution_id")
      .eq("id", user.id)
      .single();

    const { title } = (await request.json()) as { title?: string };
    const cleanTitle = title?.trim();
    if (!cleanTitle) {
      return NextResponse.json({ error: "اكتب اسم الموضوع" }, { status: 400 });
    }
    if (cleanTitle.length > 120) {
      return NextResponse.json({ error: "اسم الموضوع طويل جدًا" }, { status: 400 });
    }

    const { data: topic, error } = await supabase
      .from("lesson_topics")
      .insert({
        title_ar: cleanTitle,
        institution_id: profile?.institution_id ?? null,
        created_by: user.id,
      })
      .select("id, title_ar, title_en")
      .single();

    if (error || !topic) {
      console.error("Topic creation failed:", error);
      return NextResponse.json({ error: "حصل خطأ أثناء إضافة الموضوع" }, { status: 500 });
    }

    return NextResponse.json({ topic });
  } catch (err) {
    console.error("Topic creation crashed:", err);
    return NextResponse.json({ error: "حصل خطأ أثناء إضافة الموضوع" }, { status: 500 });
  }
}
