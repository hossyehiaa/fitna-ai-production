/**
 * Probe production Groq health via the STT route (Whisper uses the SAME
 * GROQ_API_KEY as chat). A real transcript ⇒ key alive; the generic MSA
 * "تعذّر فهم الصوت" error ⇒ provider call failed server-side.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const scrypt = promisify(_scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV: Record<string, string> = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();

const BASE = process.env.E2E_BASE_URL || "https://fitna-ai-production.vercel.app";
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
  const ts = Date.now();
  const teacher = await db.user.create({
    data: {
      email: `sttprobe-${ts}@fitna.test`,
      fullName: "مدرّس فحص STT",
      role: "teacher",
      passwordHash: await hashPassword("TestPass123!"),
    },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, "teacher")}`;

  // 1s of real Arabic speech (the latency harness utterance)
  const wav = readFileSync("/home/z/my-project/download/latency/utterances/sil_u02_howru.wav");
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "probe.wav");
  form.append("dialect", "saudi");
  form.append("language", "ar");

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/stt`, { method: "POST", headers: { cookie }, body: form });
  const body = await res.text();
  console.log(`STT probe: HTTP ${res.status} in ${Date.now() - t0}ms`);
  console.log(`body: ${body.slice(0, 400)}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
