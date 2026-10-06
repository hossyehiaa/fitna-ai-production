import Groq from "groq-sdk";

// =====================================================================
// Groq provider — production model chain (server-only).
//
// GROQ_API_KEY stays in env — never exposed to the browser.
//
// RESILIENT MODEL RESOLUTION (added after the 2026-10 outage where every
// hardcoded chat model had been decommissioned and ALL student turns
// silently fell back to the deterministic reply bank):
//   1. GROQ_CHAT_MODEL env pin (ops control — always first)
//   2. RUNTIME DISCOVERY — GET /openai/v1/models, cached per instance
//      (10 min TTL), intersected with the preference list below. This is
//      the primary path: the chain auto-migrates whenever Groq deprecates
//      or renames models, without a code deploy.
//   3. STATIC fallback chain — only when discovery itself fails.
//
// The chain WALKS (tries the next model) on 404/403/429/503 and on
// "does not exist / decommissioned" messages; it fails fast on 401
// (bad key), 400 (bad request) and timeouts so callers can engage
// their deterministic fallback quickly.
// =====================================================================

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  // Optional endpoint override (ops/proxy/testing — e.g. GROQ_API_BASE for
  // routing through a reachable region). Undefined => default api.groq.com.
  ...(process.env.GROQ_API_BASE ? { baseURL: process.env.GROQ_API_BASE } : {}),
  timeout: 20000,
  maxRetries: 1,
});

export const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";
export const WHISPER_MODEL = "whisper-large-v3-turbo";

/** Static fallback chain — last resort when /models discovery fails. */
const STATIC_CHAIN: string[] = [
  ...(process.env.GROQ_CHAT_MODEL ? [process.env.GROQ_CHAT_MODEL] : []),
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3.8-27b",
  "llama-3.3-70b-versatile",
  "allam-2-7b",
  "llama-3.1-8b-instant",
];

/**
 * Preference order (best Arabic dialect fidelity + JSON adherence first).
 * Only entries that actually appear in /models are used; the list may
 * therefore contain ids that no longer exist — discovery filters them.
 */
const MODEL_PREFERENCE: string[] = [
  "openai/gpt-oss-120b", // PRIMARY: strongest Arabic dialect + JSON
  "openai/gpt-oss-20b", // same family, lighter
  "moonshotai/kimi-k2-instruct", // strong multilingual/Arabic
  "qwen/qwen3-235b-a22b-tput-8k", // big Qwen MoE
  "qwen/qwen3-235b-a22b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3.8-27b",
  "qwen/qwen3-32b",
  "qwen/qwen3-30b-a3b-instruct",
  "deepseek-r1-distill-llama-70b",
  "llama-3.3-70b-versatile",
  "allam-2-7b", // Arabic-native
  "llama-3.1-8b-instant", // fast last resort
];

/** Non-chat ids we never want in a resolved chain (whisper/tts/guard/embed). */
const NON_CHAT_MODEL_RE = /whisper|tts|guard|embed|playground|distil-whisper/i;

// ---------------------------------------------------------------------
// Runtime discovery cache (per serverless instance).
// ---------------------------------------------------------------------
const DISCOVERY_TTL_MS = 10 * 60_000;
let discoveredModels: { at: number; ids: Set<string> } | null = null;
let discoveryInflight: Promise<Set<string> | null> | null = null;

async function fetchModelIds(): Promise<Set<string> | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const list = await groq.models.list();
    const ids = new Set<string>();
    for (const m of (list as unknown as { data?: Array<{ id?: string }> }).data ?? []) {
      if (typeof m?.id === "string") ids.add(m.id);
    }
    return ids.size > 0 ? ids : null;
  } catch {
    return null;
  }
}

/**
 * Prime the discovery cache (fire-and-forget safe). The live-room warmup
 * GET and module boot call this so the first real turn never pays the
 * /models round trip on the critical path.
 */
export async function preloadGroqModels(): Promise<void> {
  if (discoveredModels && Date.now() - discoveredModels.at < DISCOVERY_TTL_MS) return;
  if (discoveryInflight) {
    await discoveryInflight.catch(() => {});
    return;
  }
  const p = fetchModelIds()
    .then((ids) => {
      if (ids) discoveredModels = { at: Date.now(), ids };
      return ids;
    })
    .catch(() => null)
    .finally(() => {
      discoveryInflight = null;
    });
  discoveryInflight = p;
  await p.catch(() => {});
}

/** The model ids discovered for this key (diagnostics/health probe). */
export function discoveredModelIds(): string[] | null {
  return discoveredModels ? [...discoveredModels.ids] : null;
}

/** Resolve the chat-model chain: env pin → discovered preference → static. */
async function resolveChatChain(): Promise<string[]> {
  const envModel = process.env.GROQ_CHAT_MODEL;
  if (!discoveredModels || Date.now() - discoveredModels.at >= DISCOVERY_TTL_MS) {
    await preloadGroqModels();
  }
  const ids = discoveredModels?.ids ?? null;

  const chain: string[] = [];
  if (envModel) chain.push(envModel); // ops pin always first (still walks on 404)
  if (!ids) {
    // Discovery unavailable — legacy behavior: the static chain.
    for (const m of STATIC_CHAIN) chain.push(m);
    return [...new Set(chain)];
  }
  for (const m of MODEL_PREFERENCE) {
    if (ids.has(m)) chain.push(m);
  }
  if (chain.length === (envModel ? 1 : 0)) {
    // Preference list entirely absent from the current lineup — degrade
    // gracefully to ANY usable chat model the account exposes.
    for (const id of ids) {
      if (!NON_CHAT_MODEL_RE.test(id)) chain.push(id);
    }
  }
  return [...new Set(chain)];
}

type NonStreamChatCompletion = Extract<
  Awaited<ReturnType<typeof groq.chat.completions.create>>,
  { choices: unknown[] }
>;

/** Chat params WITHOUT the required model — the resolved chain supplies it. */
type ChatParams = Omit<Parameters<typeof groq.chat.completions.create>[0], "model"> & {
  model?: string;
};

function isModelUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 404 || status === 403 || status === 429 || status === 503) return true;
  const msg = err instanceof Error ? err.message : "";
  return /does not exist|not found|decommissioned|sunset|no longer (?:available|supported)|you do not have access/i.test(
    msg
  );
}

/** Short, secret-free error signature for latency/dev instrumentation. */
export function groqErrorSignature(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const msg = String((err as { message?: string })?.message ?? err ?? "").replace(/\s+/g, " ").slice(0, 90);
  return `${status ?? "?"}:${msg}`;
}

/**
 * Execute a chat completion against the resolved model chain.
 * Falls through the chain on "model unavailable/throttled" (404/403/429/
 * 503); auth (401) and bad-request (400) fail fast so callers can engage
 * their deterministic fallback.
 */
export async function callGroqWithFallback(
  params: ChatParams
): Promise<NonStreamChatCompletion> {
  const chain = await resolveChatChain();
  let lastError: unknown = null;

  for (const model of chain) {
    try {
      const completion = (await groq.chat.completions.create({
        ...params,
        model,
        // gpt-oss family accepts reasoning_effort; low keeps turns snappy.
        // Other models ignore/reject it safely via the SDK passthrough.
        ...(model.startsWith("openai/gpt-oss")
          ? { reasoning_effort: "low" as const }
          : {}),
      })) as NonStreamChatCompletion;
      return completion;
    } catch (err: unknown) {
      lastError = err;
      if (isModelUnavailable(err)) {
        const status = (err as { status?: number })?.status;
        const msg = String((err as { message?: string })?.message ?? "");
        console.warn(`Groq model ${model} failed (${status}: ${msg.slice(0, 120)}), trying next fallback model...`);
        continue;
      }
      // Auth / bad request / timeout — fail fast, no chain walk.
      throw err;
    }
  }

  throw lastError;
}

/**
 * STREAMING variant — same resolved chain + walk semantics, but the
 * completion is consumed as an SSE token stream. Each content delta is
 * forwarded to onDelta the instant it arrives so the caller can start
 * downstream work (TTS, transport) before the completion finishes.
 *
 * Returns the full assembled text plus the model that served it.
 * Caller-aborts (AbortSignal) propagate immediately without walking.
 */
export async function callGroqStreamWithFallback(
  params: ChatParams,
  onDelta: (textDelta: string) => void,
  options?: { signal?: AbortSignal }
): Promise<{ text: string; model: string }> {
  const chain = await resolveChatChain();
  let lastError: unknown = null;

  for (const model of chain) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream: any = await groq.chat.completions.create(
        {
          ...params,
          model,
          stream: true,
          ...(model.startsWith("openai/gpt-oss")
            ? { reasoning_effort: "low" as const }
            : {}),
        },
        options?.signal ? { signal: options.signal } : undefined
      );

      let text = "";
      for await (const chunk of stream) {
        // gpt-oss models emit a separate `reasoning` delta first — we only
        // forward real content tokens.
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          text += delta;
          onDelta(delta);
        }
        if (options?.signal?.aborted) {
          try { await stream.controller?.abort?.(); } catch {}
          throw new DOMException("Aborted", "AbortError");
        }
      }
      return { text, model };
    } catch (err: unknown) {
      lastError = err;
      if (options?.signal?.aborted) throw err;
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) throw err;
      if (isModelUnavailable(err)) {
        const status = (err as { status?: number })?.status;
        const msg = String((err as { message?: string })?.message ?? "");
        console.warn(`Groq stream model ${model} failed (${status}: ${msg.slice(0, 120)}), trying next fallback model...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
