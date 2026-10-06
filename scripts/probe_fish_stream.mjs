/** Test Fish Audio streaming mode (SSE) — time-to-first-audio-bytes vs full buffer. */
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();
const KEY = ENV.FISH_AUDIO_API_KEY;
const REF = "14f1000b77d547eeb5f03b474dd29e0f"; // reem

async function testStream(text) {
  const t0 = Date.now();
  let firstByte = -1;
  let totalBytes = 0;
  let events = 0;
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", model: "s2.1-pro-free" },
    body: JSON.stringify({
      text, reference_id: REF, format: "mp3", mp3_bitrate: 64, normalize: true, latency: "balanced", stream: true,
    }),
  });
  console.log(`status=${res.status} ctype=${res.headers.get("content-type")}`);
  if (!res.ok) { console.log(await res.text()); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstByte < 0) firstByte = Date.now() - t0;
    totalBytes += value.length;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) events++;
    }
  }
  console.log(`"${text.slice(0, 30)}" firstByte=${firstByte}ms full=${Date.now() - t0}ms bytes=${totalBytes} events=${events}`);
}

await testStream("أيوه يا مستر! الحمد لله تمام.");
await testStream("وعليكم السلام يا أستاذ! الحمد لله تمام والدرس عاجبني أوي.");
