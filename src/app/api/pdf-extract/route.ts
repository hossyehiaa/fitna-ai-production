import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFParse } from "pdf-parse";

// pdf-parse needs full Node.js APIs (not the Edge runtime).
export const runtime = "nodejs";


/**
 * Real PDF text extraction (spec §Stage 5: "ارفع خطة الدرس (PDF)").
 * The extracted text is handed back to the client so it can be stored
 * as `sessions.lesson_context` — genuine document content, not a
 * filename placeholder — and later injected into every student agent's
 * system prompt in the live simulation room (Milestone 3).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم رفع ملف" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "الملف لازم يكون PDF" }, { status: 400 });
  }
  const MAX_BYTES = 15 * 1024 * 1024; // 15MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "حجم الملف كبير جدًا (الحد الأقصى 15MB)" }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    const text = result.text?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "معرفناش نستخرج نص من الملف ده. جرب ملف تاني أو اكتب ملخص بدل كده." },
        { status: 422 }
      );
    }

    // Cap what we store/send to the LLM later — a full 40-page lesson
    // plan doesn't need to all be in-context, the first ~6000 chars
    // (a few pages) is plenty for building student-agent context.
    const trimmed = text.slice(0, 6000);

    return NextResponse.json({ text: trimmed, truncated: text.length > 6000 });
  } catch (err) {
    console.error("PDF extraction failed:", err);
    return NextResponse.json(
      { error: "حصل خطأ أثناء قراءة الملف. جرب ملف PDF تاني." },
      { status: 500 }
    );
  }
}
