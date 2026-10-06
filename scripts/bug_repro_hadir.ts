/**
 * BUG REPRO: students allegedly stuck repeating «حاضر يا أستاذ» and the
 * LLM "not understanding". Fires varied real questions at the production
 * streaming turn route and prints FULL replies + per-stage latency so we
 * can see exactly which path answers (ritual / LLM / deterministic
 * fallback) and whether texts repeat.
 *
 * Run: set -a && source .env && set +a && \
 *      E2E_BASE_URL=https://fitna-ai-production.vercel.app \
 *      npx tsx scripts/bug_repro_hadir.ts
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

const QUESTIONS: { text: string; session: "sa" | "eg"; expect?: string }[] = [
  { text: "يا سلطان، إيه أكبر كسر، اثنين على ستة ولا أربعة على ستة؟", session: "sa", expect: "سلطان" },
  { text: "ليه الماء بياخد شكل الكوباية؟", session: "sa" },
  { text: "إيه هو البسط وإيه هو المقام في الكسر؟", session: "sa" },
  { text: "يا ريم، لو عندنا كسر ثلاثة على ثمانية وواحد على ثمانية، مين أكبر؟", session: "sa", expect: "ريم" },
  { text: "يا سارة، إيه المقصود بالتبخر؟", session: "eg", expect: "سارة" },
  { text: "الهواء مادة ولا مش مادة؟ وليه؟", session: "eg" },
  { text: "مين يحكي لي مراحل دورة الماء بالترتيب؟", session: "eg" },
  { text: "يا عمر، إزاي بنقارن كسرين ليهم نفس المقام؟", session: "eg", expect: "عمر" },
];

async function createSession(cookie: string, dialect: "saudi" | "egyptian"): Promise<string> {
  const res = await fetch(`${BASE}/api/sessions/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      topicId: null,
      durationMinutes: 30,
      classroomStyle: "balanced",
      trainingObjective: "socratic_focus",
      lessonContext: "درس عن الكسور وحالات المادة ودورة الماء",
      teacherTitle: dialect === "saudi" ? "يا أستاذ" : "يا مستر",
      dialect,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { sessionId?: string; id?: string };
  return json.sessionId || json.id || "";
}

async function runTurn(cookie: string, sessionId: string, text: string, elapsedMs: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = [];
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/turn/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ teacherText: text, elapsedMs, speechDurationMs: 2.5 }),
  });
  if (!res.ok || !res.body) {
    return { events, httpStatus: res.status, error: await res.text().catch(() => "") };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch {}
    }
  }
  return { events, httpStatus: res.status, error: null as string | null, totalMs: Date.now() - t0 };
}

async function main() {
  const ts = Date.now();
  const teacher = await db.user.create({
    data: {
      email: `bugrepro-${ts}@fitna.test`,
      fullName: "مدرّس تشخيص التكرار",
      role: "teacher",
      passwordHash: await hashPassword("TestPass123!"),
    },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7200_000) },
  });
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, "teacher")}`;

  const saSession = await createSession(cookie, "saudi");
  const egSession = await createSession(cookie, "egyptian");
  console.log(`BASE=${BASE}\nSA=${saSession.slice(0, 8)} EG=${egSession.slice(0, 8)}\n`);
  await fetch(`${BASE}/api/sessions/${saSession}/turn/stream`, { method: "GET", headers: { cookie } }).catch(() => {});
  await fetch(`${BASE}/api/sessions/${egSession}/turn/stream`, { method: "GET", headers: { cookie } }).catch(() => {});

  const replies: string[] = [];
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const sessionId = q.session === "sa" ? saSession : egSession;
    const out = await runTurn(cookie, sessionId, q.text, 4000 + i * 8000);
    if (out.error) {
      console.log(`T${i + 1} HTTP ${out.httpStatus}: ${out.error.slice(0, 200)}`);
      continue;
    }
    const done = out.events.find((e) => e.type === "done");
    const meta = out.events.find((e) => e.type === "meta");
    const speech = out.events.filter((e) => e.type === "speech");
    const warns = out.events.filter((e) => e.type === "warn" || e.type === "error");
    const model = done?.latency?.model ?? "fallback";
    const routeOk = !q.expect || meta?.routing?.targetName === q.expect;
    for (const s of speech) replies.push(String(s.fullText));
    console.log(
      `T${i + 1} [${q.session}] target=${meta?.routing?.targetName ?? "-"}${routeOk ? "" : " MISMATCH!"} ` +
        `model=${model} llm1st=${done?.latency?.llmFirstTokenMs ?? "-"}ms total=${out.totalMs}ms`
    );
    for (const s of speech) console.log(`   → ${s.name}: ${s.fullText}`);
    for (const w of warns) console.log(`   ⚠ ${w.type}: ${w.error}`);
    if (speech.length === 0) console.log(`   → (لا يوجد رد نصي) done=${JSON.stringify(done?.latency ?? {}).slice(0, 160)}`);
    await new Promise((r) => setTimeout(r, 9000));
  }

  const unique = new Set(replies.map((r) => r.replace(/[\s\p{P}]+/gu, "")));
  console.log(`\n==== SUMMARY ====`);
  console.log(`replies=${replies.length} unique=${unique.size}`);
  if (replies.length > 0 && unique.size <= Math.max(1, Math.ceil(replies.length / 4))) {
    console.log("🔴 REPETITION CONFIRMED — students are looping the same reply");
  } else {
    console.log("🟢 replies varied");
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
