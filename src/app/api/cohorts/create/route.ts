import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, institution_id")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "institution_admin" || !profile.institution_id) {
      return NextResponse.json(
        { error: "يجب أن تكون مشرف مؤسسة لإنشاء مجموعة." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, teacherIds } = body as {
      name: string;
      description?: string;
      teacherIds?: string[];
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "اسم المجموعة مطلوب" }, { status: 400 });
    }

    // Create cohort
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .insert({
        institution_id: profile.institution_id,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select("id, name, description, created_at")
      .single();

    if (cohortError || !cohort) {
      console.error("Failed to create cohort:", cohortError);
      return NextResponse.json({ error: "فشل في إنشاء المجموعة" }, { status: 500 });
    }

    // Add member teachers if provided
    if (teacherIds && Array.isArray(teacherIds) && teacherIds.length > 0) {
      const memberRows = teacherIds.map((tid) => ({
        cohort_id: cohort.id,
        teacher_id: tid,
      }));
      await supabase.from("cohort_members").insert(memberRows);
    }

    return NextResponse.json({ cohort });
  } catch (err) {
    console.error("Cohort creation crashed:", err);
    return NextResponse.json(
      { error: "حصل خطأ غير متوقع أثناء إنشاء المجموعة" },
      { status: 500 }
    );
  }
}
