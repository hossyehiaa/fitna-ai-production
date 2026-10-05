/**
 * Mock Groq SSE server — faithfully mimics api.groq.com chat completions
 * (both streaming and non-streaming) so the LLM streaming path can be
 * verified locally (the sandbox egress is region-blocked from real Groq).
 *
 * Emits json_object tokens at realistic cadence (~40-70ms per fragment).
 *
 * Run: node scripts/mock_groq.mjs   (listens on 127.0.0.1:5100)
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 5100;

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
  const isChat = req.method === "POST" && req.url?.includes("/chat/completions");
  const isStt = req.method === "POST" && req.url?.includes("/audio/transcriptions");
  if (!isChat && !isStt) {
    res.writeHead(404).end();
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

server.listen(PORT, "127.0.0.1", () => console.log(`mock groq on http://127.0.0.1:${PORT}/openai/v1`));
