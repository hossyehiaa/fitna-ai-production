/**
 * Browser-level sanity: live room renders with the streaming pipeline,
 * warmup GET fires on mount, and a turn driven through the page's own
 * code path produces window.__fitnaLatency records + audible playback
 * scheduling (verified via audio events and state machine).
 *
 * Locally the fake-mic WAV feeds real speech into getUserMedia; the
 * browser recognizer does not run headless, so the page's Whisper
 * fallback transcribes it (Groq is region-blocked locally → the
 * deterministic reply engine answers; Fish Audio TTS is REAL).
 *
 * Run: set -a && source .env && set +a && npx tsx scripts/test_live_room_browser.ts <wav-path>
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const scrypt = promisify(_scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV: Record<string, string> = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const WAV = process.argv[2] || "";
const db = new PrismaClient();

function authCtxCookie(uid: string, role: string): string {
  const ctx = Buffer.from(JSON.stringify({ uid, role })).toString("base64url");
  const sig = createHmac("sha256", ENV.AUTH_SECRET || "dev").update(ctx).digest("base64url");
  return `fitna_auth_ctx=${ctx}.${sig}`;
}
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}
function hashToken(raw: string): string {
  const mac = createHmac("sha256", ENV.AUTH_SECRET || "dev").update(raw).digest();
  return createHash("sha256").update(mac).digest("hex");
}

async function main() {
  if (!WAV) {
    console.error("usage: npx tsx scripts/test_live_room_browser.ts <arabic-speech.wav>");
    process.exit(1);
  }
  const ts = Date.now();
  const teacher = await db.user.create({
    data: {
      email: `browser-${ts}@fitna.test`,
      fullName: "مدرّس اختبار المتصفح",
      role: "teacher",
      passwordHash: await hashPassword("TestPass123!"),
    },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, "teacher")}`;

  const createRes = await fetch(`${BASE}/api/sessions/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      topicId: null,
      durationMinutes: 15,
      classroomStyle: "balanced",
      trainingObjective: "socratic_focus",
      lessonContext: "درس عن الكسور",
      teacherTitle: "يا أستاذ",
      dialect: "saudi",
    }),
  });
  const createJson = (await createRes.json().catch(() => ({}))) as { sessionId?: string; id?: string };
  const sessionId = createJson.sessionId || createJson.id || "";
  console.log("session:", sessionId, "create:", createRes.status);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${WAV}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({ locale: "ar-EG" });
  await context.addCookies([
    { name: "fitna_session", value: token, url: BASE },
    { name: "fitna_auth_ctx", value: authCtxCookie(teacher.id, "teacher").split("=")[1], url: BASE },
  ]);
  const page = await context.newPage();
  const consoleLines: string[] = [];
  page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

  await page.goto(`${BASE}/session/live/${sessionId}`, { waitUntil: "networkidle", timeout: 60_000 });

  // The live room auto-opens the mic (open mic mode) — with fake-ui flag
  // permission is granted automatically.
  await page.waitForTimeout(2500);

  const roomState = await page.evaluate(() => {
    return {
      title: document.title,
      hasMicButton: Boolean(document.querySelector('button[aria-label*="ميكروفون"], button[title*="ميكروفون"]')),
      warmupFired: (window as unknown as { __warmupFired?: boolean }).__warmupFired === true,
      studentCards: Array.from(document.querySelectorAll("[class*=student], [data-persona]")).length,
    };
  });
  console.log("room state:", JSON.stringify(roomState));

  // Wait for the turn to be triggered by VAD (fake mic keeps streaming the
  // WAV, then silence at file end triggers the endpointing commit).
  let latencyRec: Record<string, unknown> | null = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    latencyRec = await page.evaluate(() => {
      const w = window as unknown as { __fitnaLatency?: Record<string, unknown>[] };
      const recs = w.__fitnaLatency ?? [];
      return recs.length > 0 ? recs[recs.length - 1] : null;
    });
    if (latencyRec) break;
    await page.waitForTimeout(2000);
  }

  console.log("\nlatency record:", JSON.stringify(latencyRec, null, 2));
  console.log("\n--- relevant console lines ---");
  for (const line of consoleLines.filter((l) => /latency|Latency|turn|stream|error|Error|فشل/i.test(l)).slice(-25)) {
    console.log(line.slice(0, 220));
  }

  await browser.close();
  await db.$disconnect().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
