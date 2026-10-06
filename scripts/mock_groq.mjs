/**
 * Mock Groq server — mimics api.groq.com for LOCAL verification of the
 * resilient model-chain resolution (the sandbox egress is region-blocked
 * from real Groq).
 *
 * Simulates the 2026-10 outage shape:
 *   - GET  /models          → lineup WITHOUT openai/gpt-oss-120b
 *                             (llama-3.3-70b + llama-3.1-8b live)
 *   - POST /chat/completions with model=openai/gpt-oss-120b → 404
 *                             (decommissioned), any other model → SSE/JSON
 *   - POST /audio/transcriptions → staged /tmp/mock_stt_text.txt
 *
 * Env knobs:
 *   MOCK_MODELS    comma-separated model ids to expose via /models
 *                  (default: "llama-3.3-70b-versatile,llama-3.1-8b-instant,whisper-large-v3-turbo")
 *   MOCK_KILL_404  comma-separated models that always 404
 *                  (default: "openai/gpt-oss-120b")
 *
 * Run: node scripts/mock_groq.mjs   (listens on 127.0.0.1:5100)
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 5100;
const MOCK_MODELS = (process.env.MOCK_MODELS || "llama-3.3-70b-versatile,llama-3.1-8b-instant,whisper-large-v3-turbo")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MOCK_KILL_404 = (process.env.MOCK_KILL_404 || "openai/gpt-oss-120b")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// A few dialect-authentic student replies the mock cycles through.
const REPLIES = [
  JSON.stringify({ text: "أيوه يا مستر! المية بتاخد شكل الكوباية عشان هي مادة سائلة." }),
  JSON.stringify({ text: "صراحة مش متأكد يا مستر، بس أعتقد الجواب كذا!" }),
  JSON.stringify({ text: "أيوه يا أستاذ! عشان المقامات متساوية فبنبص على البسط." }),
];

let replyIndex = 0;

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

const server = createServer((req, res) => {
  const isModels = req.method === "GET" && req.url?.includes("/models");
  const isChat = req.method === "POST" && req.url?.includes("/chat/completions");
  const isStt = req.method === "POST" && req.url?.includes("/audio/transcriptions");
  if (!isChat && !isStt && !isModels) {
    res.writeHead(404).end();
    return;
  }

  if (isModels) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: MOCK_MODELS.map((id) => ({ id, object: "model", owned_by: "mock" })) }));
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    // ---- Whisper transcription mock: returns the text the harness
    // staged in /tmp/mock_stt_text.txt (local browser rehearsal only).
    if (isStt) {
      let text = "السلام عليكم";
      try {
        text = readFileSync("/tmp/mock_stt_text.txt", "utf8").trim();
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text }));
      return;
    }

    let parsed = {};
    try {
      parsed = JSON.parse(body);
    } catch {}
    const model = parsed.model || "openai/gpt-oss-120b";

    // Decommissioned simulation: the dead model 404s exactly like real
    // Groq ("The model ... does not exist or you do not have access").
    if (MOCK_KILL_404.includes(model)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: { message: `The model \`${model}\` does not exist or you do not have access to it.`, type: "invalid_request_error", code: "model_not_found" },
        })
      );
      return;
    }

    const reply = REPLIES[replyIndex++ % REPLIES.length];

    if (parsed.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      // initial role chunk
      sse(res, { id: "mock", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
      // stream the reply in word fragments (realistic cadence)
      const words = reply.split(" ");
      let i = 0;
      const timer = setInterval(() => {
        if (i >= words.length) {
          clearInterval(timer);
          sse(res, { id: "mock", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        const frag = (i === 0 ? "" : " ") + words[i];
        sse(res, { id: "mock", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { content: frag }, finish_reason: null }] });
        i++;
      }, 45);
    } else {
      // Non-streaming (classifier path)
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "mock",
          object: "chat.completion",
          model,
          choices: [{ index: 0, message: { role: "assistant", content: "closed" }, finish_reason: "stop" }],
        })
      );
    }
  });
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`mock groq on http://127.0.0.1:${PORT}/openai/v1 — models=[${MOCK_MODELS.join(",")}] kill404=[${MOCK_KILL_404.join(",")}]`)
);
