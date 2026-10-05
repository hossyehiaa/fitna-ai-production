import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const envText = readFileSync("/home/z/my-project/.env", "utf8");
const ENV = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) { ENV[m[1]] = m[2].trim(); process.env[m[1]] = m[2].trim(); }
const db = new PrismaClient();
const ctx = (uid, role) => { const c = Buffer.from(JSON.stringify({ uid, role })).toString("base64url"); return `fitna_auth_ctx=${c}.${createHmac("sha256", ENV.AUTH_SECRET).update(c).digest("base64url")}`; };
const hashToken = (raw) => createHash("sha256").update(createHmac("sha256", ENV.AUTH_SECRET).update(raw).digest()).digest("hex");
const BASE = "http://localhost:3000";
writeFileSync("/tmp/mock_stt_text.txt", "السلام عليكم ورحمة الله وبركاته", "utf8");
const teacher = await db.user.create({ data: { email: `dbg-${Date.now()}@fitna.test`, fullName: "تصحيح", role: "teacher", passwordHash: "scrypt$16384$8$1$AAAA$AAAA" } });
const token = randomBytes(32).toString("base64url");
await db.authSession.create({ data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
const cookie = `fitna_session=${token}; ${ctx(teacher.id, "teacher")}`;
const r = await fetch(`${BASE}/api/sessions/create`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ durationMinutes: 15, classroomStyle: "balanced", trainingObjective: "socratic_focus", lessonContext: "درس", teacherTitle: "يا أستاذ", dialect: "saudi" }) });
const { sessionId, id } = await r.json();
const sid = sessionId || id;
console.log("session:", sid);
const browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--use-file-for-fake-audio-capture=/home/z/my-project/download/latency/utterances/sil_u01_greeting.wav", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ locale: "ar-EG" });
await context.addCookies([{ name: "fitna_session", value: token, url: BASE }, { name: "fitna_auth_ctx", value: ctx(teacher.id, "teacher").split("=")[1], url: BASE }]);
const page = await context.newPage();
const netlog = [];
page.on("request", (req) => { if (req.url().includes("/api/")) netlog.push(`→ ${req.method()} ${req.url().replace(BASE, "")}`); });
page.on("response", (res) => { if (res.url().includes("/api/")) netlog.push(`← ${res.status()} ${res.url().replace(BASE, "")}`); });
page.on("console", (msg) => { const t = msg.text(); if (/error|Error|warn|Latency|latency|فشل|تعذّر/i.test(t)) netlog.push(`[console.${msg.type()}] ${t.slice(0, 160)}`); });
page.on("pageerror", (e) => netlog.push(`[pageerror] ${e.message.slice(0, 200)}`));
await page.goto(`${BASE}/session/live/${sid}`, { waitUntil: "domcontentloaded", timeout: 45000 });
const btn = page.locator('button:has-text("بدء الحصة")');
try { await btn.waitFor({ state: "visible", timeout: 15000 }); console.log("mic button FOUND"); } catch { console.log("mic button NOT FOUND"); }
await btn.click().then(() => console.log("clicked")).catch((e) => console.log("click failed:", e.message.slice(0, 100)));
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const w = window;
    return {
      latencyRecs: (w.__fitnaLatency || []).length,
      liveTranscript: document.body.innerText.match(/اللاقط الصوتي[^\n]*/)?.[0] ?? "",
      hasListening: document.body.innerText.includes("يستمع"),
      bodySnippet: document.body.innerText.slice(0, 200).replace(/\n/g, " | "),
    };
  });
  if (i % 4 === 0 || state.latencyRecs > 0) console.log(`t=${(i + 1) * 3}s`, JSON.stringify(state).slice(0, 300));
  if (state.latencyRecs > 0) {
      const rec = await page.evaluate(() => (window.__fitnaLatency || [])[0]);
      console.log("\nLATENCY RECORD:", JSON.stringify(rec, null, 2).slice(0, 900));
      break;
    }
}
console.log("\nNETWORK/CONSOLE LOG:");
console.log(netlog.slice(-30).join("\n"));
await page.screenshot({ path: "/tmp/debug_turn.png" });
await browser.close();
await db.$disconnect();
