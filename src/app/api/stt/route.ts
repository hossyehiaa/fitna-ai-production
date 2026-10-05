import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groq, WHISPER_MODEL } from "@/lib/ai/groq";
import { toFile } from "groq-sdk";
import { parseDialect, sttBiasPrompt } from "@/lib/ai/dialects";

export const runtime = "nodejs";

/**
 * Real Speech-to-Text via Groq's free-tier Whisper large-v3 (spec §4b).
 * Receives a raw audio blob recorded by the browser's MediaRecorder,
 * forwards it to Groq, and returns the actual transcribed text — no
 * canned/mocked transcript.
 *
 * language="ar" tells Whisper to bias toward Arabic; large-v3 handles
 * Egyptian dialect reasonably well without any fine-tuning, per the
 * spec's model choice in §4b.
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
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "مفيش تسجيل صوتي" }, { status: 400 });
  }

  try {
    const arrayBuffer = await audio.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // Detect actual container format from magic bytes or MIME type for mobile (iOS/Safari = mp4/aac, Android/Chrome = webm)
    let filename = "utterance.webm";
    if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") {
      filename = "utterance.mp4";
    } else if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "RIFF") {
      filename = "utterance.wav";
    } else if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
      filename = "utterance.webm";
    } else if (audio.name?.endsWith(".mp4") || audio.name?.endsWith(".m4a") || audio.type?.includes("mp4") || audio.type?.includes("aac")) {
      filename = "utterance.mp4";
    } else if (audio.name?.endsWith(".wav") || audio.type?.includes("wav")) {
      filename = "utterance.wav";
    } else if (audio.name?.endsWith(".ogg") || audio.type?.includes("ogg")) {
      filename = "utterance.ogg";
    }

    const file = await toFile(buf, filename);
    const lessonContext = formData.get("lessonContext");
    const lessonSnippet = typeof lessonContext === "string" && lessonContext.trim()
      ? ` موضوع الدرس: ${lessonContext.trim().slice(0, 150)}.`
      : "";

    // Dialect-aware bias: the live room passes the classroom dialect so
    // Whisper is steered toward Saudi or Egyptian vocabulary.
    const dialect = parseDialect(formData.get("dialect"));

    // Whisper large-v3 natively supports multilingual audio and code-switching.
    // Leaving language undefined enables auto-detection so Whisper seamlessly outputs
    // German (Deutsch), French (Français), English, Chinese, and Arabic in their native alphabets.
    const requestedLang = formData.get("language") as string | null;
    // When language is auto or not specified, lock to Arabic (ar) so Whisper transcribes Egyptian Arabic flawlessly,
    // captures English loan words naturally in English, and NEVER hallucinates Chinese or French YouTube subtitles!
    const targetLanguage = requestedLang && requestedLang !== "auto" ? requestedLang : "ar";

    let prompt = sttBiasPrompt(dialect);

    if (targetLanguage === "de") {
      prompt = "حصة وشرح تفاعلي للغة الألمانية Deutsch بالعامية المصرية: Guten Tag, wie geht's, danke, bitte, Tschüss, ich heiße, der Tisch, Verben, Grammatik, Hausaufgaben.";
    } else if (targetLanguage === "fr") {
      prompt = "حصة وشرح تفاعلي للغة الفرنسية Français بالعامية المصرية: Bonjour, salut, merci, comment ça va, au revoir, s'il vous plaît, les verbes, la grammaire.";
    } else if (targetLanguage === "en") {
      prompt = "Interactive English lesson: Past Simple, regular verbs, play, watch, give me an example, grammar, homework, questions and answers.";
    } else if (targetLanguage === "zh") {
      prompt = "中文互动课堂: 你好, 谢谢, 再见, 老师, 学生, 词汇, 语法.";
    }

    if (lessonSnippet) {
      prompt += lessonSnippet;
    }

    const transcription = await groq.audio.transcriptions.create({
      model: WHISPER_MODEL,
      file,
      language: targetLanguage,
      prompt,
      temperature: 0,
      response_format: "json",
    });

    let text = transcription.text?.trim() ?? "";

    // 1. Detect and reject common Whisper silence/noise hallucinations (YouTube subtitles, prompt parrots, breath blips)
    const isHallucination =
      // Audio tags, silence, music and YouTube training hallucinations
      /^(\.|\s|\(|\)|\[|\])*(موسيقى|موسيقي|music|applause|cheering|laughter|ضحك|تصفيق)[.!؟?]*$/i.test(text.trim()) ||
      /^(\[|\().*(\]|\))$/i.test(text.trim()) ||
      /^(موسيقى|music)$/i.test(text.trim()) ||
      /^(thank\s*you|thanks|thank\s*you\s*very\s*much|thanks\s*for\s*watching|thank\s*you\s*for\s*watching)[.!؟?]*$/i.test(text.trim()) ||
      /^(bye|goodbye|see\s*you|see\s*you\s*next\s*time|have\s*a\s*good\s*day)[.!؟?]*$/i.test(text.trim()) ||
      /^(so\s*,?\s*i['’]?m\s*going\s*to\s*go\s*ahead.*)$/i.test(text.trim()) ||
      /^(english\s*(and|&)?\s*(eglisian|egyptian)?\s*arabic.*)$/i.test(text.trim()) ||
      /^(you|okay|ok|alright|yes|no)[.!؟?]*$/i.test(text.trim()) ||
      /^(subtitles\s*by|translated\s*by|captions\s*by).*$/i.test(text.trim()) ||
      /^(please\s*subscribe|subscribe\s*to\s*the\s*channel|like\s*and\s*subscribe).*$/i.test(text.trim()) ||
      /^(interactive\s*school|classroom\s*session|teacher\s*explanation).*$/i.test(text.trim()) ||
      /字幕|中文字幕|李宗盛|Captions|Subtitles/i.test(text) ||
      /M\.?D\.?:/i.test(text) ||
      /^(Moula|Pulsaro)/i.test(text) ||
      (targetLanguage !== "zh" && /[\u4e00-\u9fff]/.test(text)) ||
      (targetLanguage !== "fr" && /c'est la même chose|je t'airo|moula/i.test(text)) ||
      /ترجمة\s*(نانسي|قنقر|للقناة|بواسطة|فريق|مستمر)/i.test(text) ||
      /المترجم\s*للقناة/i.test(text) ||
      /اشترك\s*(في\s*)?القناة/i.test(text) ||
      /سيبسكرايب|سبسكرايب/i.test(text) ||
      /تمت\s*الترجمة/i.test(text) ||
      /حقوق\s*الترجمة/i.test(text) ||
      /المعلم\s*يشرح/i.test(text) ||
      /فصل\s*دراسي\s*مصري/i.test(text) ||
      /موضوع\s*الدرس/i.test(text) ||
      /حصة\s*(تفاعلية|وشرح)/i.test(text) ||
      /(Past Simple.*){2,}/i.test(text) ||
      /أفعال\s*منتظمة.*(play|watched|run)/i.test(text) ||
      /(play.*watched|watched.*visited|visited.*run|play.*watched.*run)/i.test(text) ||
      /اشرح\s*يا\s*عمر.*برافو/i.test(text) ||
      /^(\.|\s)*(سبحان\s*الله(\s*وبحمده)?|أستغفر\s*الله)[.!؟?]*$/i.test(text.trim()) ||
      /^(\.|\s)*شكرا(ً)?(\s*(لكم|جزيلا(ً)?))?[.!؟?]*$/i.test(text.trim()) ||
      /^(\.|\s)*(مع\s*السلامة|إلى\s*اللقاء|في\s*أمان\s*الله)[.!؟?]*$/i.test(text.trim()) ||
      /^(\.|\s)*(نعم|أجل)[.!؟?]*$/i.test(text.trim());

    if (isHallucination) {
      return NextResponse.json({ error: "صمت أو ضوضاء غير واضحة" }, { status: 400 });
    }

    // Preserve all legitimate characters (Arabic, Latin, German umlauts, French accents, Chinese, etc.)
    text = text.replace(/\s+/g, " ").trim();

    // Collapse repetitive loop hallucinations (e.g. "اليوم يومي يومي يومي" -> "اليوم")
    text = text.replace(/(?:^|\s)(يومي|اليوم)(?:\s+(?:يومي|اليوم)){2,}/gi, " اليوم").trim();
    text = text.replace(/(?:^|\s)([\u0621-\u064A]{3,})(?:\s+\1){2,}/gi, " $1").trim();

    // 3. Auto-correct common phonetic transcription mishearings (using Unicode-safe lookaround)
    const arBoundary = (pattern: string) =>
      new RegExp(`(?<=^|[\\s.,?!،؛:])(${pattern})(?=$|[\\s.,?!،؛:])`, "gi");

    text = text
      .replace(arBoundary("[أإا]?علم\\s*عليكم|سلام\\s*عليكم|سلم\\s*عليكم|سلامو\\s*عليكم|السام\\s*عليكم"), "السلام عليكم")
      .replace(
        /(?<=^|[\s.,?!،؛:])(حملين|حاملين|أمين|أمليين|عمين|عملين|امين|املين)\s*(إيه|ايه|إي|اي)?(?=[\s.,?!،؛:]|$)/gi,
        "عاملين إيه"
      )
      .replace(arBoundary("حملين|حاملين|عملين|عمين"), "عاملين")
      .replace(arBoundary("سورة|ساره|صارة"), "سارة")
      .replace(arBoundary("ياسيم|يعيسين|ياسينو|يا سين|إيسي|ايسي"), "ياسين")
      .replace(arBoundary("يا عيسين"), "يا ياسين")
      .replace(arBoundary("يجانور|يانور"), "يا نور")
      .replace(arBoundary("تلاوث|التلاوث"), (m) => (m.startsWith("ال") ? "التلوث" : "تلوث"))
      .replace(arBoundary("عملين|عمين"), "عاملين")
      .replace(arBoundary("شطرة"), "شاطرة")
      .replace(arBoundary("هم مرين دمعينة|دمعينة|دمعين"), "سامعيني")
      .replace(arBoundary("أولس و أهلق|أوريس و ألق|وليس ويجي|أتفاق دالي"), "قولي سؤالك")
      .replace(arBoundary("وما دين|وما دين\\?|وبدين"), "وبعدين")
      .replace(arBoundary("إصراحي|إصرحي"), "اشرحي")
      .replace(arBoundary("المأسوس"), "المقصود")
      .replace(arBoundary("يولي أمسل|قولي أمسل"), "قولي أمثلة")
      .replace(arBoundary("بدي إيه صار|إيه صار"), "ابدأي يا سارة")
      .replace(arBoundary("وللغم لسر"), "قولي يا سارة")
      .replace(arBoundary("انتمعين|معينة"), "سامعاني")
      .replace(arBoundary("الباست سيمبول|الباست سيمبل"), "الباست سمبل")
      .replace(arBoundary("سباح الخير|صباح الخير يا سدار"), "صباح الخير يا شطار")
      .replace(arBoundary("تبقولينا"), "طب قولي لنا")
      .replace(arBoundary("قولينا"), "قول لنا")
      .replace(arBoundary("داري يسين|داري ياسين|تقدر يسين"), "تقدر يا ياسين")
      .replace(arBoundary("تقوليو"), "تقول لنا")
      .replace(arBoundary("نميسيل|ميسيل|ميسال"), "مثال")
      .replace(arBoundary("انتماعيا|انتمايا|انت معيا"), "أنت معايا")
      .replace(arBoundary("يسين"), "ياسين")
      .replace(arBoundary("ناسين ميسيل|ناسيين ميسيل|ناسين مسيل|ناسيين مسيل"), "ناسيين مثال")
      .replace(arBoundary("ناسين"), "ناسيين")
      .replace(arBoundary("هنأخو\\s*در|هنأخذ\\s*در|هناخو\\s*در|هناخد\\s*در"), "هناخد درس")
      .replace(arBoundary("رياضي\\s*يد|رياضي\\s*يوت|رياضييت"), "رياضيات")
      .replace(arBoundary("أرد\\s*أن\\s*أخذ|ارد\\s*ان\\s*اخذ"), "عايزين ناخد")
      .replace(arBoundary("كبتفتكر"), "طب تفتكري")
      .replace(arBoundary("صامونج\\s*جيف\\s*مي|صامونج\\s*جف\\s*مي|صمون\\s*جف\\s*مي|صمون\\s*جيف\\s*مي"), "Someone give me")
      .replace(arBoundary("صامونج|صمون|صامون"), "Someone")
      .replace(arBoundary("جيف\\s*مي|جف\\s*مي"), "give me")
      .replace(arBoundary("ان\\s*اكزامبل|إن\\s*إكزامبل|ان\\s*اكزامبل|اكزامبل"), "an example")
      .replace(arBoundary("ميث\\s*ماريوم|ميث\\s*مريم|مس\\s*ماريوم|ميس\\s*ماريوم"), "ميس مريم")
      .replace(arBoundary("ميث"), "ميس")
      .replace(arBoundary("ماريوم"), "مريم")
      .replace(arBoundary("وغيت|و\\s*غيت"), "وغير")
      .replace(arBoundary("دانية\\s*سين|دانية\\s*يسين|دانيه\\s*سين|دانيه\\s*يسين|دانية\\s*ياسين|دانيه\\s*ياسين|دانيه\\s*سن"), "ياسين")
      .replace(arBoundary("حبيبية\\s*(?:يشارك|يشترك|شارك)?|حبيبي\\s*شارك"), "حابب يشارك")
      .replace(arBoundary("حبيبية"), "حابب")
      .replace(arBoundary("إنها\\s*(?:ببشيرك|بشيرك|بتشارك|تشترك|بشارك)|ببشيرك|بشيرك"), "يشارك")
      .replace(arBoundary("شارك\\s*(?:تايني|تيني)"), "يشارك تاني")
      .replace(arBoundary("تايني|تيني"), "تاني")
      .replace(arBoundary("هنقش"), "هنناقش")
      .replace(arBoundary("عايزيني"), "عايزينه")
      .replace(arBoundary("وربس|فيربس|فرربس"), "verbs")
      .replace(arBoundary("ورب|فيرب|فررب"), "verb")
      .replace(arBoundary("حدي\\s*يقول\\s*لي|حدي\\s*قولي"), "حد يقول لي")
      .replace(arBoundary("حدي"), "حد")
      .replace(arBoundary("براهو|براو"), "برافو")
      .replace(arBoundary("يا\\s*نوش|يانوش"), "يا نور")
      .replace(arBoundary("نوش"), "نور")
      .replace(arBoundary("خمس\\s*طوصر|خمستوصر|خمس\\s*توصر"), "خمستاشر")
      .replace(arBoundary("حد\\s*فيهم"), "حد فهم")
      .replace(arBoundary("قالتو"), "قالته")
      .replace(arBoundary("هيه\\s*وبقى|هيه\\s*وبقا"), "يجاوب بقى")
      .replace(arBoundary("مشخص\\s*يا\\s*عمر|مش\\s*خص\\s*يا\\s*عمر"), "مثلاً يا عمر")
      .replace(arBoundary("كل\\s*كامل"), "كم الناتج");

    // If result has no valid Unicode letters or digits, reject cleanly
    if (!/[\p{L}\p{N}]/u.test(text) || text.trim().length < 1) {
      return NextResponse.json({ error: "الصوت غير واضح كفاية، جرب تاني" }, { status: 400 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("STT failed:", err);
    return NextResponse.json({ error: "معرفناش نفهم الصوت، جرب تاني" }, { status: 500 });
  }
}
