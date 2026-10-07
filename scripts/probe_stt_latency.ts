/**
 * Direct production /api/stt latency probe — measures auth+upload+Groq
 * whisper round trip for a real Arabic utterance (16kHz WAV).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const scrypt = promisify(_scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV: Record<string, string> = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();

const BASE = process.env.E2E_BASE_URL || "https://fitna-ai-production.vercel.app";

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

const db = new PrismaClient();

async function main() {
  const ts = Date.now();
  const teacher = await db.user.create({
    data: {
      email: `stt-probe-${ts}@fitna.test`,
      fullName: "مدرّس اختبار",
      role: "teacher",
      passwordHash: await hashPassword("TestPass123!"),
    },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, "teacher")}`;

  // Format/size scaling experiment against the PRODUCTION route:
  // full 9s wav vs trimmed 3.4s wav vs 24k-opus webm (lean upload).
  const full = readFileSync("/home/z/my-project/download/latency/utterances/sil_u01_greeting.wav");
  execFileSync("ffmpeg", ["-y", "-i", "/home/z/my-project/download/latency/utterances/sil_u01_greeting.wav", "-t", "3.4", "-c", "copy", "/tmp/trim34.wav"]);
  const trim = readFileSync("/tmp/trim34.wav");
  execFileSync("ffmpeg", ["-y", "-i", "/tmp/trim34.wav", "-c:a", "libopus", "-b:a", "24k", "/tmp/trim34.webm"]);
  const webm = readFileSync("/tmp/trim34.webm");

  for (const [label, buf, name, type] of [
    ["full-9s-wav-290KB", full, "utterance.wav", "audio/wav"],
    ["trim-3.4s-wav-110KB", trim, "utterance.wav", "audio/wav"],
    ["trim-3.4s-webm-10KB", webm, "utterance.webm", "audio/webm"],
  ] as [string, Buffer, string, string][]) {
    const t0 = Date.now();
    const form = new FormData();
    form.append("audio", new Blob([buf], { type }), name);
    form.append("dialect", "saudi");
    try {
      const res = await fetch(`${BASE}/api/stt`, { method: "POST", headers: { cookie }, body: form });
      const ms = Date.now() - t0;
      const json: any = await res.json().catch(() => ({}));
      console.log(`SCALE ${label}: ${ms}ms status=${res.status} text=${JSON.stringify(String(json.text ?? json.error ?? "").slice(0, 50))}`);
    } catch (err) {
      console.log(`SCALE ${label}: FAILED ${String(err).slice(0, 100)}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  await db.$disconnect();
}

main().catch(async (e) => { console.error("FATAL:", e); await db.$disconnect(); process.exit(1); });
