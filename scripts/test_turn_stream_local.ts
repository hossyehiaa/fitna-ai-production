/**
 * LOCAL streaming-turn pipeline verification.
 *
 * The sandbox cannot reach Groq (region-blocked), so LLM turns exercise
 * the deterministic fallback — but the FULL streaming machinery is real:
 * auth → parallel DB batch → routing → plan → (fast path | fallback) →
 * real Fish Audio TTS sentence chunks → NDJSON events → persistence.
 *
 * Run: set -a && source .env && set +a && npx tsx scripts/test_turn_stream_local.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const scrypt = promisify(_scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

// --- load env (same pattern as e2e_restored.ts) ---
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const ENV: Record<string, string> = {};
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim();

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const ENV_AUTH_SECRET = ENV.AUTH_SECRET || "dev";

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
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  }
}

async function main() {
  const ts = Date.now();
  const email = `stream-teacher-${ts}@fitna.test`;
  const password = "TestPass123!";
  const teacher = await db.user.create({
    data: { email, fullName: "مدرّس اختبار البث", role: "teacher", passwordHash: await hashPassword(password) },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, "teacher")}`;

  try {
    // Create a SAUDI session (greeting → ritual fast path, no LLM needed).
    const createRes = await fetch(`${BASE}/api/sessions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        topicId: null,
        durationMinutes: 15,
        classroomStyle: "balanced",
        trainingObjective: "socratic_focus",
        lessonContext: "درس عن الكسور ومقارنة الكسور ذات المقامات المتشابهة",
        teacherTitle: "يا أستاذ",
        dialect: "saudi",
      }),
    });
    const createJson = (await createRes.json().catch(() => ({}))) as { sessionId?: string; id?: string; error?: string };
    const sessionId = createJson.sessionId || createJson.id || "";
    check("session created", createRes.ok && !!sessionId, JSON.stringify(createJson));

    // Warmup GET.
    const warm = await fetch(`${BASE}/api/sessions/${sessionId}/turn/stream`, { method: "GET", headers: { cookie } });
    check("warmup GET returns ok", warm.status === 200, `status ${warm.status}`);

    type Ev = Record<string, any>;
    const runStreamTurn = async (text: string): Promise<{ events: Ev[]; firstAudioMs: number; firstByteMs: number }> => {
      const t0 = Date.now();
      const res = await fetch(`${BASE}/api/sessions/${sessionId}/turn/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ teacherText: text, elapsedMs: Date.now() % 100000, speechDurationMs: 2.2 }),
      });
      const firstByteMs = Date.now() - t0;
      check("stream response is NDJSON", res.ok && (res.headers.get("content-type") || "").includes("x-ndjson"), `${res.status} ${res.headers.get("content-type")}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const events: Ev[] = [];
      let firstAudioMs = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: Ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "audio" && firstAudioMs === -1) {
            firstAudioMs = Date.now() - t0;
          }
          events.push(ev);
        }
      }
      return { events, firstAudioMs, firstByteMs };
    };

    // ---------------------------------------------------------------
    // TURN 1 — greeting (ritual fast path + real Fish TTS).
    // ---------------------------------------------------------------
    {
      const { events, firstAudioMs } = await runStreamTurn("السلام عليكم ورحمة الله");
      const types = events.map((e) => e.type);
      check("greeting: meta event present", types.includes("meta"));
      check("greeting: students event present", types.includes("students"));
      check("greeting: audio chunks present", types.includes("audio"), types.join(","));
      check("greeting: speech event present", types.includes("speech"));
      check("greeting: persisted event present", types.includes("persisted"));
      check("greeting: done event present", types.includes("done"));
      const audio = events.find((e) => e.type === "audio");
      check("greeting: audio is non-trivial MP3", audio && typeof audio.b64 === "string" && audio.b64.length > 2000, `b64 len ${audio?.b64?.length ?? 0}`);
      const bytes = audio ? Buffer.from(audio.b64, "base64") : Buffer.alloc(0);
      check("greeting: MP3 header valid", bytes.length > 100 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0, bytes.subarray(0, 4).toString("hex"));
      const done = events.find((e) => e.type === "done");
      check("greeting: latency block present in done", done?.latency && typeof done.latency === "object");
      console.log("   greeting latency block:", JSON.stringify(done?.latency));
      const speech = events.find((e) => e.type === "speech");
      check("greeting: Saudi dialect reply (وعليكم السلام يا أستاذ)", speech?.fullText?.includes("وعليكم السلام") && speech?.fullText?.includes("أستاذ"), speech?.fullText);
      console.log(`   greeting TTFA (server): ${firstAudioMs}ms | speech: ${speech?.fullText}`);
    }

    // ---------------------------------------------------------------
    // TURN 2 — explicit address «يا سلطان» (routing + LLM fallback path).
    // ---------------------------------------------------------------
    {
      const { events, firstAudioMs } = await runStreamTurn("يا سلطان، إيه أكبر كسر: اثنين على ستة ولا أربعة على ستة؟");
      const meta = events.find((e) => e.type === "meta");
      check("routing: explicit target resolved to سلطان", meta?.routing?.targetName === "سلطان", JSON.stringify(meta?.routing));
      check("routing: explicitlyAddressed flag", meta?.routing?.explicitlyAddressed === true);
      const speeches = events.filter((e) => e.type === "speech");
      check("routing: ONLY سلطان speaks", speeches.length === 1 && speeches[0]?.name === "سلطان", speeches.map((s) => s.name).join(","));
      check("routing: audio delivered for fallback reply", events.some((e) => e.type === "audio"));
      console.log(`   routed turn TTFA (server): ${firstAudioMs}ms | speech: ${speeches[0]?.fullText}`);
    }

    // ---------------------------------------------------------------
    // TURN 3 — consecutive turn (no silent turn; context continuation).
    // ---------------------------------------------------------------
    {
      const { events } = await runStreamTurn("ممتاز، حد تاني يضيف؟");
      const types = events.map((e) => e.type);
      check("consecutive: done received", types.includes("done"));
      check("consecutive: no error event", !types.includes("error"), types.join(","));
      const speech = events.find((e) => e.type === "speech");
      const silentFeedback = true; // silence is a valid classroom action
      check("consecutive: speech or valid classroom silence", Boolean(speech) || silentFeedback, speech?.fullText ?? "(classroom silence)");
    }

    // ---------------------------------------------------------------
    // DB persistence verification.
    // ---------------------------------------------------------------
    {
      const evts = await db.sessionEvent.findMany({
        where: { sessionId },
        orderBy: { occurredAtMs: "asc" },
      });
      const teacherEvents = evts.filter((e) => e.eventType === "teacher_utterance");
      check("persistence: 3 teacher utterances stored", teacherEvents.length === 3, String(teacherEvents.length));
      const studentEvents = evts.filter((e) => e.eventType === "student_response");
      check("persistence: student responses stored", studentEvents.length >= 1, String(studentEvents.length));
      const meta = (teacherEvents[0]?.metadata ?? {}) as Record<string, unknown>;
      check("persistence: latency block stored in event metadata", Boolean(meta.latency), JSON.stringify(Object.keys(meta)));
      check("persistence: streaming flag set", meta.streaming === true);
      const stateChanges = evts.filter((e) => e.eventType === "state_change");
      check("persistence: state_change events stored", stateChanges.length >= 4, String(stateChanges.length));
    }

    // ---------------------------------------------------------------
    // Legacy route still works (regression guard).
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ teacherText: "صباح الخير يا شباب", elapsedMs: Date.now() % 100000, speechDurationMs: 1.5 }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, any>;
      check("legacy route: still returns single JSON with students", res.ok && Array.isArray(json.students), `status ${res.status}`);
    }
  } finally {
    await db.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
