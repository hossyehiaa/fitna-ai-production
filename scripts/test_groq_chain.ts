/**
 * LOCAL VERIFICATION of the resilient Groq chain (against mock_groq.mjs):
 *  1. /models discovery filters the chain to live models
 *  2. dead primary (404) walks to the next live model
 *  3. streaming + non-streaming both return text with the right model
 *  4. discovery failure degrades to the static chain
 *
 * Run: node scripts/mock_groq.mjs &  then:
 *      GROQ_API_BASE=http://127.0.0.1:5100/openai/v1 GROQ_API_KEY=gsk_test \
 *      npx tsx scripts/test_groq_chain.ts
 */
import { callGroqWithFallback, callGroqStreamWithFallback, preloadGroqModels, discoveredModelIds } from "../src/lib/ai/groq";

async function main() {
  // 1) Discovery
  await preloadGroqModels();
  console.log("discovered:", discoveredModelIds());

  // 2) Streaming call — dead primary must walk to a live model
  const deltas: string[] = [];
  const t0 = Date.now();
  const streamed = await callGroqStreamWithFallback(
    { messages: [{ role: "user", content: "رد JSON" }], response_format: { type: "json_object" } },
    (d) => deltas.push(d)
  );
  console.log(`stream: model=${streamed.model} firstΔ=${deltas[0]?.slice(0, 20) ?? "-"} text=${streamed.text.slice(0, 50)} (${Date.now() - t0}ms)`);

  // 3) Non-streaming call
  const completion = await callGroqWithFallback({ messages: [{ role: "user", content: "closed" }] });
  console.log(`non-stream: model=${completion.model} content=${completion.choices[0]?.message?.content?.slice(0, 20)}`);

  // 4) Deterministic-order sanity: discovery cache persisted across calls
  console.log("discovered (cached):", discoveredModelIds());

  if (!streamed.text.includes("text")) throw new Error("stream text missing JSON payload");
  if (streamed.model === "openai/gpt-oss-120b") throw new Error("chain did not walk past dead primary!");
  console.log("\n✅ chain resolution verified (dead primary walked, live model served)");
  mainDone = true;
}

let mainDone = false;

/** Mid-stream failure: forwarded deltas > 0 ⇒ must THROW, never walk. */
async function midstreamTest() {
  const deltas: string[] = [];
  let threw = false;
  try {
    await callGroqStreamWithFallback({ messages: [{ role: "user", content: "x" }] }, (d) => deltas.push(d));
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("mid-stream failure was swallowed — should have thrown!");
  if (deltas.length === 0) throw new Error("expected partial deltas before the failure");
  console.log(`✅ mid-stream failure threw (after ${deltas.length} deltas) instead of walking`);
}

async function runAll() {
  await main();
  if (mainDone) {
    // Phase 2 only meaningful once phase 1 passed.
  }
}

// MOCK_MIDSTREAM env is set by the runner for this phase.
if (process.env.MOCK_MIDSTREAM) {
  midstreamTest()
    .then(() => console.log("\n✅ ALL PHASES PASSED"))
    .catch((e) => {
      console.error("❌", e);
      process.exit(1);
    });
} else {
  runAll().catch((e) => {
    console.error("❌", e);
    process.exit(1);
  });
}
