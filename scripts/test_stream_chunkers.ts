/**
 * Unit tests for the streaming turn pipeline primitives:
 *  - createJsonTextFieldExtractor (incremental JSON string decoding)
 *  - createSentenceChunker (latency-oriented sentence cutting)
 *
 * Run: npx tsx scripts/test_stream_chunkers.ts
 */
import {
  createJsonTextFieldExtractor,
  createSentenceChunker,
} from "../src/lib/ai/streamChunker";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------
// 1. JSON field extractor — simulate Groq json_object token streaming.
// ---------------------------------------------------------------------
{
  // Tokens exactly like Groq streams them (arbitrary fragment sizes).
  const tokens = ['{"', "te", "xt", '":', ' "أي', "وه يا مستر!", " أنا ", "فاهم", " الكسر", " صح", '."', "}"];
  const ex = createJsonTextFieldExtractor("text");
  let assembled = "";
  for (const t of tokens) assembled += ex.push(t);
  check("extractor: assembles the full field value", assembled === "أيوه يا مستر! أنا فاهم الكسر صح.", JSON.stringify(assembled));
  check("extractor: marks done at closing quote", ex.done === true);
  check("extractor: ignores trailing tokens", ex.push("garbage") === "");
  check("extractor: .text matches", ex.text === "أيوه يا مستر! أنا فاهم الكسر صح.");
}

{
  // Escaped quotes + unicode escapes split across deltas.
  const tokens = ['{"text":"قالي \\"تعالى\\" بقى', " \\u0645", 'ستر\\""', "}"];
  const ex = createJsonTextFieldExtractor("text");
  let assembled = "";
  for (const t of tokens) assembled += ex.push(t);
  check("extractor: handles escaped quotes", assembled.includes('"تعالى"'), JSON.stringify(assembled));
  check("extractor: handles \\uXXXX escapes", assembled.includes("مستر"), JSON.stringify(assembled));
}

{
  // Key not seen yet / other fields first.
  const ex = createJsonTextFieldExtractor("text");
  check("extractor: empty before key appears", ex.push('{"other": 1, ') === "");
  const rest = ex.push('"text": "رد');
  check("extractor: starts after key regardless of position", rest === "رد", JSON.stringify(rest));
}

{
  // Never completes (truncated stream) — partial text must survive.
  const ex = createJsonTextFieldExtractor("text");
  ex.push('{"text":"جزء');
  ex.push(" من الرد بدون إغلاق");
  check("extractor: partial text on truncated stream", ex.text === "جزء من الرد بدون إغلاق", ex.text);
  check("extractor: not done on truncated stream", ex.done === false);
}

// ---------------------------------------------------------------------
// 2. Sentence chunker — first-chunk latency behavior.
// ---------------------------------------------------------------------
{
  const chunks: string[] = [];
  const ch = createSentenceChunker((t) => chunks.push(t));
  // Simulate token-by-token arrival of a full reply.
  const reply = "أيوه يا مستر! أنا فاهم الكسر اللي فوق اسمه البسط واللي تحت اسمه المقام.";
  for (const w of reply.split(" ")) ch.push(w + " ");
  ch.flush();
  check("chunker: emits more than one chunk", chunks.length >= 2, JSON.stringify(chunks));
  check("chunker: first chunk is the short interjection", chunks[0].includes("مستر"), JSON.stringify(chunks[0]));
  check(
    "chunker: chunks reassemble the reply",
    chunks.join(" ").replace(/\s+/g, " ").trim().startsWith("أيوه يا مستر"),
    JSON.stringify(chunks)
  );
}

{
  // First chunk must fire EARLY (before the rest of the text arrives).
  let firstChunkAt = -1;
  let pushedAfterFirst = 0;
  const ch = createSentenceChunker((t) => {
    if (firstChunkAt === -1 && t.length > 0) firstChunkAt = pushedAfterFirst;
  });
  ch.push("أيوه يا مستر! ");
  for (let i = 0; i < 5; i++) {
    ch.push("كلام إضافي بعد الجملة الأولى ");
    pushedAfterFirst++;
  }
  check("chunker: first chunk fires before later tokens arrive", firstChunkAt === 0, `firstChunkAt=${firstChunkAt}`);
}

{
  // Clause comma cut for long first sentences (no sentence-ender early).
  const chunks: string[] = [];
  const ch = createSentenceChunker((t) => chunks.push(t));
  ch.push("المقامات متساوية في الكسرين دول يا مستر، فبنبص على البسط اللي فوق والرقم الأكبر بيبقى هو الكسر الأكبر.");
  ch.flush();
  check("chunker: comma cut splits long first sentence", chunks.length >= 2, JSON.stringify(chunks));
  check("chunker: comma chunk is short", chunks[0].length <= 60, JSON.stringify(chunks[0]));
}

{
  // Hard cut on a word boundary when no punctuation at all.
  const chunks: string[] = [];
  const ch = createSentenceChunker((t) => chunks.push(t));
  const long = "كلام ".repeat(40).trim();
  ch.push(long);
  ch.flush();
  check("chunker: hard cut applies on punctuation-free text", chunks.length >= 2, JSON.stringify(chunks.map((c) => c.length)));
  check("chunker: hard cut respects word boundary", !chunks[0].trim().startsWith(" "), JSON.stringify(chunks[0]));
}

{
  // Deltas smaller than a word (character-level streaming).
  const chunks: string[] = [];
  const ch = createSentenceChunker((t) => chunks.push(t));
  for (const c of "تمام يا مستر! شكراً ليكي.") ch.push(c);
  ch.flush();
  check("chunker: char-level deltas reassemble", chunks.length >= 2 && chunks.join("").includes("تمام"), JSON.stringify(chunks));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
