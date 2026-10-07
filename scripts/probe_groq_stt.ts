/**
 * Isolate Groq Whisper transcription latency (direct from container) vs
 * the /api/stt route overhead. Tests both the full 9s WAV and a trimmed
 * ~3.5s version (what the browser actually records after endpointing).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV: Record<string, string> = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();

const KEY = ENV.GROQ_API_KEY;
const BASE = ENV.GROQ_API_BASE || "https://api.groq.com/openai/v1";

async function timed(label: string, buf: Buffer, filename: string, type: string) {
  const t0 = Date.now();
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), filename);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "ar");
  form.append("temperature", "0");
  form.append("response_format", "json");
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });
  const ms = Date.now() - t0;
  const json: any = await res.json().catch(() => ({}));
  console.log(`${label}: ${ms}ms status=${res.status} text=${JSON.stringify(String(json.text ?? json.error ?? "").slice(0, 60))}`);
  return ms;
}

async function main() {
  // full 9s wav
  const full = readFileSync("/home/z/my-project/download/latency/utterances/sil_u01_greeting.wav");
  await timed("groq-full-9s-wav", full, "utterance.wav", "audio/wav");

  // trimmed ~3.4s (speech + 430ms endpointing tail) — what the browser records
  execFileSync("ffmpeg", ["-y", "-i", "/home/z/my-project/download/latency/utterances/sil_u01_greeting.wav", "-t", "3.4", "-c", "copy", "/tmp/trim34.wav"]);
  const trim = readFileSync("/tmp/trim34.wav");
  await timed("groq-trim-3.4s-wav", trim, "utterance.wav", "audio/wav");

  // compressed webm/opus 24k mono (what a leaner MediaRecorder would send)
  execFileSync("ffmpeg", ["-y", "-i", "/tmp/trim34.wav", "-c:a", "libopus", "-b:a", "24k", "-ar", "48000", "/tmp/trim34.webm"]);
  const webm = readFileSync("/tmp/trim34.webm");
  console.log("webm size:", webm.length, "bytes (wav was", trim.length, ")");
  await timed("groq-trim-3.4s-webm24k", webm, "utterance.webm", "audio/webm");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
