/** Regenerate the missing sil_u09_openq.wav utterance via real Fish Audio. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();

const KEY = ENV.FISH_AUDIO_API_KEY;
const TEXT = "مين فاهم الفرق بين الحالة الصلبة والسائل؟";
const REFERENCE_ID = "1d51fdd65ff14342aec4dffa0ef58386"; // male teacher reference

const res = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    model: "s2.1-pro-free",
  },
  body: JSON.stringify({ text: TEXT, reference_id: REFERENCE_ID, format: "mp3", mp3_bitrate: 64, normalize: true, latency: "normal" }),
});
if (!res.ok) throw new Error(`Fish ${res.status}`);
const mp3 = Buffer.from(await res.arrayBuffer());
writeFileSync("/tmp/u09.mp3", mp3);
execFileSync("ffmpeg", ["-y", "-i", "/tmp/u09.mp3", "-ar", "16000", "-ac", "1", "/tmp/u09.wav"]);
execFileSync("ffmpeg", ["-y", "-i", "/tmp/u09.wav", "-f", "lavfi", "-t", "6", "-i", "anullsrc=r=16000:cl=mono", "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "/home/z/my-project/download/latency/utterances/sil_u09_openq.wav"]);
console.log("written sil_u09_openq.wav");
