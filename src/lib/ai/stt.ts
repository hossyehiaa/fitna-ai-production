// =====================================================================
// SHARED SPEECH-TO-TEXT PIPELINE (server-only).
//
// Extracted from /api/stt so the LOW-LATENCY streaming turn route can
// run Whisper INLINE (audio multipart → transcript → routing → LLM →
// TTS in ONE request/response stream) instead of the browser doing a
// separate /api/stt round trip first. The standalone /api/stt route
// keeps the exact same behavior for the legacy turn route.
//
// Contents:
//   * transcribeAudio()      — Groq whisper-large-v3-turbo call
//   * hallucination/quality filters + dialect auto-correct bank
//   * sttResultFromError()   — maps provider errors to MSA user copy
// =====================================================================

import { groq, WHISPER_MODEL } from "@/lib/ai/groq";
import { toFile } from "groq-sdk";
import { parseDialect, sttBiasPrompt, type Dialect } from "@/lib/ai/dialects";

export type SttOutcome =
  | { ok: true; text: string }
  | { ok: false; error: string; status: number };

/** Detect the container format from magic bytes (mobile browsers vary). */
function detectFilename(buf: Buffer, audio: { name?: string; type?: string }): string {
  if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") return "utterance.mp4";
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "RIFF") return "utterance.wav";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "utterance.webm";
  if (audio.name?.endsWith(".mp4") || audio.name?.endsWith(".m4a") || audio.type?.includes("mp4") || audio.type?.includes("aac")) return "utterance.mp4";
  if (audio.name?.endsWith(".wav") || audio.type?.includes("wav")) return "utterance.wav";
  if (audio.name?.endsWith(".ogg") || audio.type?.includes("ogg")) return "utterance.ogg";
  return "utterance.webm";
}

/** Common Whisper silence/noise hallucinations (training-data artifacts). */
function isHallucination(text: string, targetLanguage: string): boolean {
  const t = text.trim();
  return (
    /^(\.|\s|\(|\)|\[|\])*(موسيقى|موسيقي|music|applause|cheering|laughter|ضحك|تصفيق)[.!؟?]*$/i.test(t) ||
    /^(\[|\().*(\]|\))$/i.test(t) ||
    /^(موسيقى|music)$/i.test(t) ||
    /^(thank\s*you|thanks|thank\s*you\s*very\s*much|thanks\s*for\s*watching|thank\s*you\s*for\s*watching)[.!؟?]*$/i.test(t) ||
    /^(bye|goodbye|see\s*you|see\s*you\s*next\s*time|have\s*a\s*good\s*day)[.!؟?]*$/i.test(t) ||
    /^(so\s*,?\s*i['’]?m\s*going\s*to\s*go\s*ahead.*)$/i.test(t) ||
    /^(english\s*(and|&)?\s*(eglisian|egyptian)?\s*arabic.*)$/i.test(t) ||
    /^(you|okay|ok|alright|yes|no)[.!؟?]*$/i.test(t) ||
    /^(subtitles\s*by|translated\s*by|captions\s*by).*$/i.test(t) ||
    /^(please\s*subscribe|subscribe\s*to\s*the\s*channel|like\s*and\s*subscribe).*$/i.test(t) ||
    /^(interactive\s*school|classroom\s*session|teacher\s*explanation).*$/i.test(t) ||
    /字幕|中文字幕|李宗盛|Captions|Subtitles/i.test(t) ||
    /M\.?D\.?:/i.test(t) ||
    /^(Moula|Pulsaro)/i.test(t) ||
    (targetLanguage !== "zh" && /[\u4e00-\u9fff]/.test(t)) ||
    (targetLanguage !== "fr" && /c'est la même chose|je t'airo|moula/i.test(t)) ||
    /ترجمة\s*(نانسي|قنقر|للقناة|بواسطة|فريق|مستمر)/i.test(t) ||
    /المترجم\s*للقناة/i.test(t) ||
    /اشترك\s*(في\s*)?القناة/i.test(t) ||
    /سيبسكرايب|سبسكرايب/i.test(t) ||
    /تمت\s*الترجمة/i.test(t) ||
    /حقوق\s*الترجمة/i.test(t) ||
    /المعلم\s*يشرح/i.test(t) ||
    /فصل\s*دراسي\s*مصري/i.test(t) ||
    /موضوع\s*الدرس/i.test(t) ||
    /حصة\s*(تفاعلية|وشرح)/i.test(t) ||
    /(Past Simple.*){2,}/i.test(t) ||
    /أفعال\s*منتظمة.*(play|watched|run)/i.test(t) ||
    /(play.*watched|watched.*visited|visited.*run|play.*watched.*run)/i.test(t) ||
    /اشرح\s*يا\s*عمر.*برافو/i.test(t) ||
    /^(\.|\s)*(سبحان\s*الله(\s*وبحمده)?|أستغفر\s*الله)[.!؟?]*$/i.test(t) ||
    /^(\.|\s)*شكرا(ً)?(\s*(لكم|جزيلا(ً)?))?[.!؟?]*$/i.test(t) ||
    /^(\.|\s)*(مع\s*السلامة|إلى\s*اللقاء|في\s*أمان\s*الله)[.!؟?]*$/i.test(t) ||
    /^(\.|\s)*(نعم|أجل)[.!؟?]*$/i.test(t)
  );
}

/** Dialect/lesson-aware bias prompt exactly as the standalone route builds it. */
function buildPrompt(dialect: Dialect, lessonContext: string | null, targetLanguage: string): string {
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
  const lessonSnippet =
    lessonContext && lessonContext.trim() ? ` موضوع الدرس: ${lessonContext.trim().slice(0, 150)}.` : "";
  return prompt + lessonSnippet;
}

/** Auto-correct common phonetic mishearings (Unicode-safe lookaround). */
function autocorrect(text: string): string {
  const arBoundary = (pattern: string) =>
    new RegExp(`(?<=^|[\\s.,?!،؛:])(${pattern})(?=$|[\\s.,?!،؛:])`, "gi");

  return text
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
}

/**
 * Transcribe one teacher utterance end-to-end.
 * `lessonContext` biases Whisper toward the current lesson vocabulary,
 * `dialect` steers Saudi vs Egyptian vocabulary, `language` locks the
 * output alphabet (default Arabic).
 */
export async function transcribeTeacherAudio(
  audio: { buffer: Buffer; name?: string; type?: string },
  opts: { lessonContext?: string | null; dialect?: string | null; language?: string | null } = {}
): Promise<SttOutcome> {
  try {
    const buf = audio.buffer;
    if (!buf || buf.length < 200) {
      return { ok: false, error: "لا يوجد تسجيل صوتي واضح", status: 400 };
    }
    const filename = detectFilename(buf, audio);
    const file = await toFile(buf, filename);

    const requestedLang = opts.language ?? null;
    // Lock to Arabic unless the teacher explicitly picked another subject
    // language — auto-detect hallucinated Chinese/French subtitles before.
    const targetLanguage = requestedLang && requestedLang !== "auto" ? requestedLang : "ar";
    const dialect = parseDialect(opts.dialect ?? null);
    const prompt = buildPrompt(dialect, opts.lessonContext ?? null, targetLanguage);

    const transcription = await groq.audio.transcriptions.create({
      model: WHISPER_MODEL,
      file,
      language: targetLanguage,
      prompt,
      temperature: 0,
      response_format: "json",
    });

    let text = transcription.text?.trim() ?? "";

    if (isHallucination(text, targetLanguage)) {
      return { ok: false, error: "صمت أو ضوضاء غير واضحة", status: 400 };
    }

    text = text.replace(/\s+/g, " ").trim();
    // Collapse repetitive loop hallucinations ("اليوم يومي يومي" → "اليوم")
    text = text.replace(/(?:^|\s)(يومي|اليوم)(?:\s+(?:يومي|اليوم)){2,}/gi, " اليوم").trim();
    text = text.replace(/(?:^|\s)([\u0621-\u064A]{3,})(?:\s+\1){2,}/gi, " $1").trim();
    text = autocorrect(text);

    if (!/[\p{L}\p{N}]/u.test(text) || text.trim().length < 1) {
      return { ok: false, error: "الصوت غير واضح بما يكفي. يُرجى المحاولة مرة أخرى.", status: 400 };
    }
    return { ok: true, text };
  } catch (err) {
    console.error("STT failed:", err);
    return { ok: false, error: "تعذّر فهم الصوت. يُرجى المحاولة مرة أخرى.", status: 500 };
  }
}
