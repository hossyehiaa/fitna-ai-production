/**
 * Generate Arabic speech WAVs (16kHz mono PCM) via the REAL Fish Audio
 * pipeline — used as fake-microphone input for browser-level latency
 * tests (mic → VAD → STT → routing → LLM → TTS → playback).
 *
 * Run: set -a && source .env && set +a && node scripts/gen_speech_wavs.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const FISH_KEY = process.env.FISH_AUDIO_API_KEY;
if (!FISH_KEY) {
  console.error("FISH_AUDIO_API_KEY missing");
  process.exit(1);
}

const OUT_DIR = "/home/z/my-project/download/latency/utterances";
mkdirSync(OUT_DIR, { recursive: true });

// [filename, arabic text, speaker persona reference (سعودي ذكر للمعلم)]
const UTTERANCES = [
  ["u01_greeting.wav", "السلام عليكم ورحمة الله وبركاته"],
  ["u02_howru.wav", "كيف حالكم اليوم يا شباب؟"],
  ["u03_call_sultan.wav", "يا سلطان، إيه أكبر كسر، اثنين على ستة ولا أربعة على ستة؟"],
  ["u04_call_reem.wav", "يا ريم، لو عندنا كسر ثلاثة على ثمانية وواحد على ثمانية، مين أكبر؟"],
  ["u05_why.wav", "ليه الماء بياخد شكل الكوباية؟"],
  ["u06_praise.wav", "برافو عليك يا فهد، إجابة ممتازة!"],
  ["u07_attention.wav", "مركزين معايا؟ سامعيني كويس؟"],
  ["u08_explain.wav", "خلينا نشرح درس النهاردة عن حالات المادة"],
  ["u09_greeting2.wav", "صباح الخير يا أبنائي"],
  ["u10_call_jouri.wav", "يا جوري، قوليلنا إيه الفرق بين السائل والغاز؟"],
  ["u11_fractions.wav", "إيه هو البسط وإيه هو المقام في الكسر؟"],
  ["u12_call_sara.wav", "يا سارة، إيه المقصود بالتبخر؟"],
  ["u13_call_omar.wav", "يا عمر، إزاي بنقارن كسرين ليهم نفس المقام؟"],
  ["u14_thanks.wav", "شكراً ليكم يا شطار، تعبكم معايا النهاردة"],
  ["u15_watercycle.wav", "مين يحكي لي مراحل دورة الماء بالترتيب؟"],
  ["u16_handsup.wav", "مين عايز يجاوب؟ ارفع إيدك يا نور"],
  ["u17_matter.wav", "الهواء مادة ولا مش مادة؟ وليه؟"],
  ["u18_call_nour.wav", "يا نور، سؤال تاني ليك، إيه اللي بيحصل للمية لما تتسخن؟"],
  ["u19_encourage.wav", "ما تخافش يا ياسين، جرب وقول رأيك"],
  ["u20_farewell.wav", "كده خلصنا الدرس، مع السلامة وشكراً على التفاعل"],
];

// Male Saudi teacher reference voice (سلطان's reference is a student; use a
// generic male reference — Fish free tier works with any ar voice).
const REFERENCE_ID = process.argv[2] || "1d51fdd65ff14342aec4dffa0ef58386";

async function synth(text) {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FISH_KEY}`,
      "Content-Type": "application/json",
      model: "s2.1-pro-free",
    },
    body: JSON.stringify({ text, reference_id: REFERENCE_ID, format: "mp3", mp3_bitrate: 64, normalize: true, latency: "normal" }),
  });
  if (!res.ok) throw new Error(`Fish ${res.status}: ${await res.text().catch(() => "")}`);
  return Buffer.from(await res.arrayBuffer());
}

let ok = 0;
for (const [name, text] of UTTERANCES) {
  try {
    const mp3 = await synth(text);
    const mp3Path = `${OUT_DIR}/${name}.mp3`;
    writeFileSync(mp3Path, mp3);
    // Convert to 16kHz mono WAV + append 2.5s of trailing silence so the
    // VAD endpointing fires after the utterance ends.
    const wavPath = `${OUT_DIR}/${name}`;
    execFileSync("ffmpeg", ["-y", "-i", mp3Path, "-ar", "16000", "-ac", "1", "-f", "wav", wavPath]);
    const withSilence = `${OUT_DIR}/sil_${name}`;
    execFileSync("ffmpeg", ["-y", "-i", wavPath, "-f", "lavfi", "-t", "6", "-i", "anullsrc=r=16000:cl=mono", "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", withSilence]);
    console.log(`✅ ${name} (${text})`);
    ok++;
  } catch (err) {
    console.log(`❌ ${name}: ${String(err).slice(0, 120)}`);
  }
}
console.log(`\n${ok}/${UTTERANCES.length} generated in ${OUT_DIR}`);
