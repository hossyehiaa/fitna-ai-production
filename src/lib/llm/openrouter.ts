// =====================================================================
// OpenRouter provider — PAID-TIER production LLM chain (server-only).
//
// THE DREAM TEAM (master prompt v4.0 — IDs verified live against
// https://openrouter.ai/api/v1/models on 2026-10-07):
//   Live student roleplay      anthropic/claude-sonnet-4.5
//   Roleplay fallback 1        google/gemini-2.5-pro
//   Roleplay fallback 2        google/gemini-2.5-flash
//   Pedagogical report writer  anthropic/claude-opus-4.5
//   Question classifier        anthropic/claude-haiku-4.5
//   Teacher tone analysis      google/gemini-2.5-pro  (direct Gemini API — lib/analysis/tone.ts)
//   Speech-to-Text             groq whisper-large-v3-turbo (UNCHANGED — lib/ai/stt.ts)
//
// OPENROUTER_API_KEY stays in env — never exposed to the browser.
//
// RESILIENCE — TWO INDEPENDENT LAYERS (verified live in scripts/smoke_openrouter.mjs):
//   LAYER 1 (provider-side): every request carries the FULL chain in the
//     OpenRouter-native `models` array — OpenRouter itself reroutes to the
//     next model when a primary is unavailable (observed: geo-blocked
//     claude-sonnet-4.5 transparently bypassed → deepseek served, HTTP 200).
//   LAYER 2 (client-side): this module also WALKS the chain locally on
//     403/404/408/429/5xx, "not available in your region", "No endpoints
//     found", timeouts and mid-stream transport failures — so a model that
//     OpenRouter's router can't sidestep (or a non-HTTP failure mode) is
//     still survived without a code deploy.
//
// REGION NOTE: some hosting regions are geo-blocked for Anthropic/Google/
// OpenAI models on OpenRouter (HTTP 403 "not available in your region" —
// observed in this repo's sandbox). The per-role env pins
// (OPENROUTER_ROLEPLAY_MODEL / _REPORT_MODEL / _CLASSIFIER_MODEL) always
// sit at the HEAD of the chain, so ops can point any role at a
// region-available model without touching code. Production (Vercel US)
// serves the Dream Team defaults.
// =====================================================================

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  model: string;
  fallbacks?: string[];
  messages: OpenRouterMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Caller-owned abort (barge-in). Composed with the per-attempt timeout. */
  signal?: AbortSignal;
  /** Per-attempt wall clock. Default 30s (non-stream) / 45s (stream). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------
// Model registry — the master-prompt Dream Team with env-pin override.
// ---------------------------------------------------------------------
export const ROLEPLAY_MODEL = process.env.OPENROUTER_ROLEPLAY_MODEL || "anthropic/claude-sonnet-4.5";
export const ROLEPLAY_FALLBACKS: string[] = ["google/gemini-2.5-pro", "google/gemini-2.5-flash"];
export const REPORT_MODEL = process.env.OPENROUTER_REPORT_MODEL || "anthropic/claude-opus-4.5";
export const REPORT_FALLBACKS: string[] = ["anthropic/claude-sonnet-4.5", "google/gemini-2.5-pro"];
export const CLASSIFIER_MODEL = process.env.OPENROUTER_CLASSIFIER_MODEL || "anthropic/claude-haiku-4.5";
export const CLASSIFIER_FALLBACKS: string[] = ["google/gemini-2.5-flash"];

/** Ops extension: comma-separated extra models appended to every chain. */
function extraFallbacks(): string[] {
  const raw = process.env.OPENROUTER_EXTRA_FALLBACKS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve the full walk order for a call: primary → fallbacks → env extras. */
export function resolveChain(model: string, fallbacks: string[] = []): string[] {
  const chain = [model, ...fallbacks, ...extraFallbacks()];
  return [...new Set(chain.filter(Boolean))];
}

const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 45_000;

function headers(): Record<string, string> {
  const key = process.env.OPENROUTER_API_KEY || "";
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://fitna-ai.vercel.app",
    "X-Title": "Fitna AI",
  };
}

/** Fail-fast errors: bad key / no credit — walking the chain cannot help. */
function isFatalAuth(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 402) return true;
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? "");
  return /invalid api key|no auth|insufficient credit|quota exceeded/i.test(msg);
}

/** Walkable errors: the NEXT model in the chain may still serve. */
function isModelUnavailable(err: unknown): boolean {
  if (isFatalAuth(err)) return false;
  const status = (err as { status?: number })?.status;
  if (status === 404 || status === 403 || status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? "");
  return (
    /not available in your region|no endpoints found|not a valid model|model .* was not found|decommissioned|sunset|no longer (?:available|supported)|provider returned error|rate limit/i.test(
      msg
    ) ||
    // Mid-stream transport failures — safe to retry on the next model when
    // the caller supplies an onAttemptReset hook (same semantics as groq.ts).
    /terminated|other side closed|socket hang up|ECONNRESET|EPIPE|fetch failed|network error|timeout|aborted due to timeout/i.test(msg)
  );
}

/** Short, secret-free error signature for latency/dev instrumentation. */
export function openrouterErrorSignature(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const msg = String((err as { message?: string })?.message ?? err ?? "").replace(/\s+/g, " ").slice(0, 90);
  return `${status ?? "?"}:${msg}`;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------
// Non-streaming completion with the two-layer fallback.
// ---------------------------------------------------------------------
export async function openrouterChat(opts: ChatOpts): Promise<{ text: string; model: string }> {
  const chain = resolveChain(opts.model, opts.fallbacks);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < chain.length; attempt += 1) {
    const model = chain[attempt];
    // LAYER 1 payload: only THIS model and the ones after it — a model
    // that already failed must not poison OpenRouter's native routing
    // (an invalid/unavailable member can 400 the whole request).
    const nativeChain = chain.slice(attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          // LAYER 1: native `models` routing — OpenRouter reroutes
          // provider-side when this model is unavailable (live-verified).
          models: nativeChain,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 150,
          temperature: opts.temperature ?? 0.8,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(res.status, `${model} -> HTTP ${res.status}: ${body.slice(0, 180)}`);
      }
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return { text, model: data.model || model };
    } catch (err: unknown) {
      // Caller-owned abort (barge-in) — propagate immediately, never walk.
      if (opts.signal?.aborted) throw err;
      lastError = err;
      if (isModelUnavailable(err)) {
        console.warn(
          `OpenRouter model ${model} unavailable (${openrouterErrorSignature(err).slice(0, 110)}), trying next fallback model...`
        );
        continue;
      }
      throw err; // auth / bad request — fail fast, engage deterministic fallback.
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onCallerAbort);
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------
// STREAMING completion — same two-layer semantics; content deltas are
// forwarded to onDelta the instant they arrive (SSE), so the caller can
// start downstream work (chunker → TTS → transport) before the completion
// finishes. Returns the full assembled text plus the serving model.
// ---------------------------------------------------------------------
export async function openrouterChatStream(
  opts: ChatOpts,
  onDelta: (textDelta: string) => void,
  options?: { signal?: AbortSignal; onAttemptReset?: () => void }
): Promise<{ text: string; model: string; attempts?: string[]; restarts?: number }> {
  const chain = resolveChain(opts.model, opts.fallbacks);
  const timeoutMs = opts.timeoutMs ?? STREAM_TIMEOUT_MS;
  let lastError: unknown = null;
  const attempts: string[] = [];
  let restarts = 0;

  for (let attempt = 0; attempt < chain.length; attempt += 1) {
    const model = chain[attempt];
    const nativeChain = chain.slice(attempt); // never re-offer a failed model
    let forwardedDeltas = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          models: nativeChain,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 150,
          temperature: opts.temperature ?? 0.8,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(res.status, `${model} -> HTTP ${res.status}: ${body.slice(0, 180)}`);
      }
      if (!res.body) throw new HttpError(res.status, `${model} -> empty stream body`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuf = "";
      let text = "";
      let resolvedModel = model;
      let sawDone = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const lines = sseBuf.split("\n");
        sseBuf = lines.pop() ?? ""; // keep the trailing partial line
        for (const line of lines) {
          const trimmed = line.trim();
          // OpenRouter keep-alive comment lines (": OPENROUTER PROCESSING").
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed === "data: [DONE]") {
            sawDone = true;
            continue;
          }
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(trimmed.slice(6)) as {
              model?: string;
              error?: { message?: string };
              choices?: Array<{ delta?: { content?: string | null } }>;
            };
            if (evt.error?.message) throw new HttpError(500, `${model} stream error: ${evt.error.message.slice(0, 160)}`);
            if (evt.model) resolvedModel = evt.model;
            const delta = evt.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              text += delta;
              forwardedDeltas += 1;
              onDelta(delta);
            }
          } catch (parseErr) {
            if (parseErr instanceof HttpError) throw parseErr;
            // Malformed SSE line — skip it, the stream usually recovers.
          }
        }
        if (options?.signal?.aborted) {
          try {
            await reader.cancel();
          } catch {}
          throw new DOMException("Aborted", "AbortError");
        }
        if (sawDone) break;
      }
      if (text.length === 0 && !sawDone && !options?.signal?.aborted) {
        // Stream ended without content and without [DONE] — likely a dead
        // provider connection; walk to the next model.
        throw new HttpError(502, `${model} -> empty completion (no content, no DONE)`);
      }
      return { text, model: resolvedModel, attempts, restarts };
    } catch (err: unknown) {
      if (options?.signal?.aborted) throw err;
      lastError = err;
      if (isModelUnavailable(err)) {
        // WALK SAFETY (same contract as groq.ts): if tokens were already
        // forwarded the caller holds user-visible state; with an
        // onAttemptReset hook the pipeline restarts cleanly, without it we
        // must fail rather than duplicate text.
        if (forwardedDeltas > 0) {
          if (options?.onAttemptReset) {
            options.onAttemptReset();
            restarts += 1;
          } else {
            throw err;
          }
        }
        attempts.push(`${model}→${openrouterErrorSignature(err).slice(0, 70)}`);
        console.warn(
          `OpenRouter stream model ${model} failed (${openrouterErrorSignature(err).slice(0, 110)}), trying next fallback model...`
        );
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onCallerAbort);
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------
// Instance-boot warmup + health probe. Fire-and-forget safe: primes the
// TLS/TCP connection to OpenRouter so the first real turn never pays the
// handshake on the critical path (replaces preloadGroqModels).
// ---------------------------------------------------------------------
let warmPromise: Promise<void> | null = null;
export function warmOpenRouter(): Promise<void> {
  if (warmPromise) return warmPromise;
  warmPromise = (async () => {
    if (!process.env.OPENROUTER_API_KEY) return;
    try {
      await fetch(`${BASE_URL}/models`, { headers: headers(), method: "GET" }).catch(() => {});
    } catch {
      // warmup is best-effort only
    }
  })();
  return warmPromise;
}

/** One-token liveness probe for the health endpoint. */
export async function pingOpenRouter(): Promise<{ ok: boolean; model?: string; error?: string; latencyMs?: number }> {
  if (!process.env.OPENROUTER_API_KEY) return { ok: false, error: "OPENROUTER_API_KEY not set" };
  const t0 = Date.now();
  try {
    const r = await openrouterChat({
      model: CLASSIFIER_MODEL,
      fallbacks: CLASSIFIER_FALLBACKS,
      messages: [{ role: "user", content: "قل: تمام" }],
      maxTokens: 10,
      temperature: 0,
      timeoutMs: 25_000, // cold-start diagnosis budget (provider + TLS warmup)
    });
    return { ok: true, model: r.model, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: openrouterErrorSignature(err), latencyMs: Date.now() - t0 };
  }
}
