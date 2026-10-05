import Groq from "groq-sdk";

// =====================================================================
// Groq provider — production model chain (server-only).
//
// GROQ_API_KEY stays in env — never exposed to the browser. The chain
// was verified live against this key's model lineup:
//   1. GROQ_CHAT_MODEL env override (ops control)
//   2. openai/gpt-oss-120b   — PRIMARY: strongest Arabic dialect fidelity
//      + JSON adherence (reasoning_effort low keeps turns snappy)
//   3. qwen/qwen3.8-27b      — multilingual secondary
//   4. allam-2-7b            — Arabic-native last resort
// A 404 "model not available" walks down the chain; any other failure
// (auth, network, timeout, rate limit) fails fast so the deterministic
// fallback engine in turn.ts keeps the live session alive.
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

const CHAT_MODEL_CHAIN: string[] = [
  ...(process.env.GROQ_CHAT_MODEL ? [process.env.GROQ_CHAT_MODEL] : []),
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "allam-2-7b",
];

type NonStreamChatCompletion = Extract<
  Awaited<ReturnType<typeof groq.chat.completions.create>>,
  { choices: unknown[] }
>;

function isModelUnavailable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : "";
  return status === 404 || /does not exist or you do not have access/i.test(msg);
}

/**
 * Execute a chat completion against the model chain.
 * Falls through the chain ONLY on "model unavailable" (404); every other
 * error is rethrown so callers can engage their deterministic fallback.
 */
export async function callGroqWithFallback(
  params: Parameters<typeof groq.chat.completions.create>[0]
): Promise<NonStreamChatCompletion> {
  let lastError: unknown = null;

  for (const model of CHAT_MODEL_CHAIN) {
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
        console.warn(`Groq model ${model} failed (${status}: ${msg}), trying next fallback model...`);
        continue;
      }
      // Auth / network / timeout / rate-limit — fail fast, no chain walk.
      throw err;
    }
  }

  throw lastError;
}

/**
 * STREAMING variant of callGroqWithFallback — same model chain + 404 walk,
 * but the completion is consumed as an SSE token stream. Each content delta
 * is forwarded to onDelta the instant it arrives so the caller can start
 * downstream work (TTS, transport) before the completion finishes.
 *
 * Returns the full assembled text. Caller-aborts (AbortSignal) propagate
 * immediately without walking the chain.
 */
export async function callGroqStreamWithFallback(
  params: Parameters<typeof groq.chat.completions.create>[0],
  onDelta: (textDelta: string) => void,
  options?: { signal?: AbortSignal }
): Promise<{ text: string; model: string }> {
  let lastError: unknown = null;

  for (const model of CHAT_MODEL_CHAIN) {
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
