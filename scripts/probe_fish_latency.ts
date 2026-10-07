/**
 * Fish Audio TTS first-chunk latency experiment (direct, local container):
 *   - latency mode: normal vs balanced
 *   - first-chunk text length: short interjection vs 55-char vs full
 * Uses a real character reference voice (ريم) from dialects.ts.
 */
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV: Record<string, string> = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();
const KEY = ENV.FISH_AUDIO_API_KEY;

// Reem's fish reference voice from src/lib/ai/dialects.ts FISH_VOICES
const REEM_REF = "14f1000b77d547eeb5f03b474dd29e0f";
const ref = process.argv[2] || REEM_REF;

async function timed(label: string, text: string, latencyMode: string) {
  const t0 = Date.now();
  try {
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        model: "s2.1-pro-free",
      },
      body: JSON.stringify({
        text,
        reference_id: ref,
        format: "mp3",
        mp3_bitrate: 128,
        normalize: true,
        latency: latencyMode,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const ms = Date.now() - t0;
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`${label}: ${ms}ms status=${res.status} bytes=${buf.length}`);
    return ms;
  } catch (err) {
    console.log(`${label}: FAILED ${String(err).slice(0, 100)}`);
    return -1;
  }
}

const SHORT = "أيوه يا مستر!";
const MID = "وعليكم السلام يا أستاذ! الحمد لله تمام.";
const LONG = "الحمد لله أنا تمام يا أستاذ، وأنا جاهز للدرس النهاردة ومستعد أجاوب على أي سؤال في الكسور.";

async function main() {
  console.log("== latency mode comparison (MID text) ==");
  await timed("normal-MID   ", MID, "normal");
  await timed("normal-MID   ", MID, "normal");
  await timed("balanced-MID ", MID, "balanced");
  await timed("balanced-MID ", MID, "balanced");
  console.log("== text length comparison (balanced) ==");
  await timed("balanced-SHORT", SHORT, "balanced");
  await timed("balanced-SHORT", SHORT, "balanced");
  await timed("balanced-LONG ", LONG, "balanced");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
