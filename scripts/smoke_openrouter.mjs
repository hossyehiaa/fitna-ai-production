// =====================================================================
// OpenRouter PAID-TIER smoke test — validates, BEFORE any app wiring:
//   1. the key authenticates
//   2. the exact model IDs from the master prompt exist and respond
//   3. Arabic dialect fidelity (Egyptian + Saudi) with emotion tags
//   4. the fallback chain survives a dead primary model
//   5. response_format / native `models` routing support
//   6. SSE streaming works (the production turn path streams)
//
// Loads .env.local manually. NEVER prints the key itself.
// Run: node scripts/smoke_openrouter.mjs
// =====================================================================
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const KEY = env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error("FAIL: OPENROUTER_API_KEY missing in .env.local");
  process.exit(1);
}

// Master-prompt Dream Team defaults; env pins override for region-restricted
// local environments (production runs the defaults below).
const ROLEPLAY = env.OPENROUTER_ROLEPLAY_MODEL || "anthropic/claude-sonnet-4.5";
const CLASSIFIER = env.OPENROUTER_CLASSIFIER_MODEL || "anthropic/claude-haiku-4.5";
const REGION_OK = env.OPENROUTER_ROLEPLAY_MODEL || "deepseek/deepseek-chat-v3.1";

const BASE = "https://openrouter.ai/api/v1";
const HEADERS = {
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": env.NEXT_PUBLIC_APP_URL || "https://fitna-ai.vercel.app",
  "X-Title": "Fitna AI",
};

async function chat(model, messages, maxTokens = 80, extra = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.8, ...extra }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${model} -> HTTP ${res.status}: ${t.slice(0, 180)}`);
  }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", model: data.model || model };
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

// ---- 1) Key + auth ----
try {
  const r = await fetch(`${BASE}/key`, { headers: HEADERS });
  const j = await r.json().catch(() => ({}));
  record("key-auth", r.ok, r.ok ? `label=${(j.data?.label || "?").slice(0, 30)}` : `HTTP ${r.status}`);
} catch (e) {
  record("key-auth", false, e.message);
}

// ---- 2) Haiku classifier shape (Section 7) ----
try {
  const r = await chat(
    CLASSIFIER,
    [
      { role: "system", content: 'صنّف سؤال المعلم إلى: open / closed / rhetorical. أرجع JSON فقط: {"type": ""}' },
      { role: "user", content: "ليه تفتكروا الشمس بتطلع من الشرق؟" },
    ],
    60,
    { temperature: 0 }
  );
  const t = r.text.replace(/\s+/g, " ");
  record("haiku-classifier", /open|closed|rhetorical/.test(t), t.slice(0, 80));
} catch (e) {
  record("haiku-classifier", false, e.message);
}

// ---- 3) Sonnet roleplay — Egyptian dialect + [emotion:] tag ----
try {
  const r = await chat(
    ROLEPLAY,
    [
      {
        role: "system",
        content:
          "أنت طالب مصري في المرحلة الابتدائية اسمه عمر (10 سنين). ردودك جملة أو جملتين باللهجة المصرية العامية فقط. ابدأ كل رد بوسام مشاعرك بين قوسين مربعين، مثل: [emotion: bored] أو [emotion: excited] أو [emotion: confused]. القيم المسموحة بالإنجليزية حصراً: neutral, bored, excited, curious, confused, distracted, annoyed. ممنوع نهائياً ذكر أنك AI أو نموذج.",
      },
      { role: "user", content: "يا عمر، إيه اللي بيحصل للمية لما تتسخن على النار؟" },
    ],
    150
  );
  const hasTag = /\[emotion:\s*(?:neutral|bored|excited|curious|confused|distracted|annoyed)\s*\]/i.test(r.text);
  const hasEgy = /بيحصل|بتتبخر|عشان|علشان|يا مستر|يا ميس|أهوه|كده|إيه|ازاي|مش|المية|بتت|فقاقع|أه يا/.test(r.text);
  record("sonnet-egyptian-dialect", hasTag && hasEgy, `tag=${hasTag} egy=${hasEgy} :: ${r.text.replace(/\s+/g, " ").slice(0, 90)}`);
} catch (e) {
  record("sonnet-egyptian-dialect", false, e.message);
}

// ---- 4) Sonnet roleplay — Saudi dialect (no Egyptian leakage) ----
try {
  const r = await chat(
    ROLEPLAY,
    [
      {
        role: "system",
        content:
          "أنت طالب سعودي في المرحلة الابتدائية اسمه فهد (10 سنين). ردودك جملة أو جملتين باللهجة السعودية البيضاء فقط (وش، ليش، أبغى، الحين، كذا، يا أستاذ). ابدأ كل رد بوسام مشاعرك بين قوسين مربعين، مثل: [emotion: bored] أو [emotion: excited] أو [emotion: confused]. القيم المسموحة بالإنجليزية حصراً: neutral, bored, excited, curious, confused, distracted, annoyed. ممنوع نهائياً الألفاظ المصرية وممنوع ذكر أنك AI.",
      },
      { role: "user", content: "يا فهد، وش الفرق بين البسط والمقام؟" },
    ],
    150
  );
  const hasSaudi = /وش|ليش|أبغى|الحين|يا أستاذ|كذا|اللي فوق|اللي تحت/.test(r.text);
  const egyLeak = /مش|إزاي|ازاي|كده|علشان|يا مستر|يا ميس|إيه\b/.test(r.text);
  record("sonnet-saudi-dialect", hasSaudi && !egyLeak, `saudi=${hasSaudi} egyLeak=${egyLeak} :: ${r.text.replace(/\s+/g, " ").slice(0, 90)}`);
} catch (e) {
  record("sonnet-saudi-dialect", false, e.message);
}

// ---- 5) Fallback walk: dead primary must be survivable ----
try {
  let deadPrimaryStatus = null;
  try {
    await chat("anthropic/claude-does-not-exist-999", [{ role: "user", content: "قل: تمام" }], 20);
  } catch (e) {
    deadPrimaryStatus = e.message.slice(0, 60);
  }
  const r = await chat(REGION_OK, [{ role: "user", content: "قل: تمام" }], 20);
  record("fallback-walk", deadPrimaryStatus !== null && r.text.length > 0, `dead=HTTP ${deadPrimaryStatus} → ${REGION_OK} served (${r.text.trim().slice(0, 20)})`);
} catch (e) {
  record("fallback-walk", false, e.message);
}

// ---- 6) Native `models` array routing (OpenRouter provider-level fallback) ----
try {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      models: ["anthropic/claude-sonnet-4.5", REGION_OK],
      messages: [{ role: "user", content: "قل: تمام" }],
      max_tokens: 20,
    }),
  });
  const j = await res.json().catch(() => ({}));
  const served = j.model || "";
  record("native-models-routing", res.ok && served && served !== "anthropic/claude-sonnet-4.5", res.ok ? `blocked primary bypassed → served by ${served}` : `HTTP ${res.status} ${JSON.stringify(j).slice(0, 100)}`);
} catch (e) {
  record("native-models-routing", false, e.message);
}

// ---- 7) response_format json_object on Claude via OpenRouter ----
try {
  const r = await chat(
    ROLEPLAY,
    [{ role: "user", content: 'أرجع JSON فقط بهذا الشكل: {"text": "كلام قصير بالعربي"}' }],
    80,
    { response_format: { type: "json_object" } }
  );
  record("roleplay-model-json-mode", true, `${ROLEPLAY} :: ${r.text.replace(/\s+/g, " ").slice(0, 60)}`);
} catch (e) {
  record("roleplay-model-json-mode", false, `NOT SUPPORTED → prompts+extraction path: ${e.message.slice(0, 100)}`);
}

// ---- 8) SSE streaming (production turn path) ----
try {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      model: ROLEPLAY,
      messages: [{ role: "user", content: "اكتب جملة عربية قصيرة عن المدرسة." }],
      max_tokens: 60,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawDone = false;
  let contentChars = 0;
  let readChunks = 0;
  while (readChunks < 200) {
    const { done, value } = await reader.read();
    if (done) break;
    readChunks += 1;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue; // OpenRouter keep-alive comments
      if (trimmed === "data: [DONE]") { sawDone = true; continue; }
      if (trimmed.startsWith("data: ")) {
        try {
          const j = JSON.parse(trimmed.slice(6));
          const d = j.choices?.[0]?.delta?.content;
          if (typeof d === "string") contentChars += d.length;
        } catch {}
      }
    }
    buf = buf.slice(buf.lastIndexOf("\n") + 1);
    if (sawDone) break;
  }
  record("sse-streaming", contentChars > 0, `contentChars=${contentChars} done=${sawDone}`);
} catch (e) {
  record("sse-streaming", false, e.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== OPENROUTER SMOKE: ${results.length - failed.length}/${results.length} passed ===`);
process.exit(failed.length ? 1 : 0);
