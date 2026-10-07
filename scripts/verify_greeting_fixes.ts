/**
 * FOCUSED verification of the 2026-10-08 fixes:
 *   A. «ازيك يا فهد» (directed re-greeting after the opening greeting) →
 *      MUST get a warm reply from the addressed student — never silence,
 *      never a fabricated «أعتقد الجواب كذا».
 *   B. Repeated greeting («السلام عليكم» twice) → still greeted back
 *      (repeated_statement exemption for greetings).
 *   C. Opening greeting regression check (ritual fast path + TTS chunks).
 *   D. LLM-down resilience: no OPENROUTER_API_KEY locally → every LLM call
 *      fails → students must STILL reply (deterministic bank / fast path).
 *
 * Run: DATABASE_URL=... npx tsx scripts/verify_greeting_fixes.ts
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

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const ENV_AUTH_SECRET = process.env.AUTH_SECRET || ENV.AUTH_SECRET || "dev";

const db = new PrismaClient();

function authCtxCookie(uid: string, role: string): string {
  const ctx = Buffer.from(JSON.stringify({ uid, role })).toString("base64url");
  const sig = createHmac("sha256", ENV_AUTH_SECRET).update(ctx).digest("base64url");
  return `fitna_auth_ctx=${ctx}.${sig}`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function hashToken(raw: string): string {
  const mac = createHmac("sha256", ENV_AUTH_SECRET).update(raw).digest();
  return createHash("sha256").update(mac).digest("hex");
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}`);
  }
}

async function main() {
  const ts = Date.now();
  const email = `greet-teacher-${ts}@fitna.test`;
  const teacher = await db.user.create({
    data: { email, fullName: "مدرّس اختبار التحيات", role: "teacher", passwordHash: await hashPassword("TestPass123!") },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, "teacher")}`;

  try {
    // SAUDI session — the dialect of the reported bug transcript.
    const createRes = await fetch(`${BASE}/api/sessions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        topicId: null,
        durationMinutes: 15,
        classroomStyle: "balanced",
        trainingObjective: "socratic_focus",
        lessonContext: "درس عن جمع الكسور ذات المقامات المختلفة",
        teacherTitle: "يا أستاذ",
        dialect: "saudi",
      }),
    });
    const createJson = (await createRes.json().catch(() => ({}))) as { sessionId?: string; error?: string };
    const sessionId = createJson.sessionId || "";
    check("A0 session created (shim RETURNING fix: no phantom RLS)", createRes.ok && !!sessionId, JSON.stringify(createJson));

    // The shim fix: session_students rows must actually EXIST.
    const studentRows = await db.sessionStudent.count({ where: { sessionId } });
    check("A1 session_students rows inserted (4)", studentRows === 4, `count=${studentRows}`);

    type Ev = Record<string, any>;
    const runStreamTurn = async (text: string): Promise<Ev[]> => {
      const res = await fetch(`${BASE}/api/sessions/${sessionId}/turn/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ teacherText: text, elapsedMs: Date.now() % 100000, speechDurationMs: 2.0 }),
      });
      if (!res.ok || !(res.headers.get("content-type") || "").includes("x-ndjson")) {
        console.log("   stream error:", res.status, await res.text().catch(() => ""));
        return [];
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const events: Ev[] = [];
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
      return events;
    };

    console.log("\n== TURN 1: opening greeting (regression) ==");
    {
      const events = await runStreamTurn("السلام عليكم ورحمة الله");
      const speech = events.find((e) => e.type === "speech");
      const audio = events.find((e) => e.type === "audio");
      check("T1 greeting replied", !!speech?.fullText, speech?.fullText || "(no speech event)");
      check("T1 Saudi salam reply", String(speech?.fullText || "").includes("وعليكم السلام"), speech?.fullText);
      check("T1 audio chunk (TTS works, LLM-down path)", !!audio?.b64 && audio.b64.length > 2000, `b64=${audio?.b64?.length ?? 0}`);
    }

    console.log("\n== TURN 2: «ازيك يا فهد» — THE REPORTED BUG ==");
    {
      const events = await runStreamTurn("ازيك يا فهد");
      const speech = events.find((e) => e.type === "speech");
      const audio = events.find((e) => e.type === "audio");
      const types = events.map((e) => e.type);
      const text = String(speech?.fullText || "");
      check("T2 فهد replied (not silence)", !!speech?.fullText, `events=${types.join(",")}`);
      check("T2 reply is a warm re-greeting (الحمد لله)", text.includes("الحمد لله"), text || "(none)");
      check("T2 NO fabricated answer («أعتقد الجواب»)", !text.includes("أعتبد الجواب") && !text.includes("الجواب"), text);
      check("T2 addressed student is فهد", String(speech?.name || "") === "فهد", speech?.name);
      check("T2 audio present", !!audio?.b64, `b64=${audio?.b64?.length ?? 0}`);
      console.log("   T2 reply:", text, "| speaker:", speech?.name);
    }

    console.log("\n== TURN 3: repeated greeting (silence exemption) ==");
    {
      const events = await runStreamTurn("السلام عليكم");
      const speech = events.find((e) => e.type === "speech");
      const text = String(speech?.fullText || "");
      check("T3 repeated greeting still answered", !!speech?.fullText, text || "(silence)");
      check("T3 reply is a greeting back", text.includes("وعليكم السلام") || text.includes("الحمد لله") || text.includes("هلا"), text);
      console.log("   T3 reply:", text, "| speaker:", speech?.name);
    }

    console.log("\n== TURN 4: real question still answers (regression) ==");
    {
      const events = await runStreamTurn("مين يقول لي يعني إيه البسط؟");
      const speech = events.find((e) => e.type === "speech");
      const text = String(speech?.fullText || "");
      check("T4 question got a reply", !!speech?.fullText, text || "(none)");
      check("T4 reply mentions بسط/مقام content", /بسط|مقام|فوق|تحت/.test(text), text);
      console.log("   T4 reply:", text, "| speaker:", speech?.name);
    }

    console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
    process.exitCode = fail > 0 ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("script crashed:", e);
  process.exit(1);
});
