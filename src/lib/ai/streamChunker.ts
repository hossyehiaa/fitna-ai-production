// =====================================================================
// Streaming turn pipeline helpers (server-only).
//
// 1. createJsonTextFieldExtractor — incrementally decodes the value of a
//    string field out of a JSON object that is being STREAMED token by
//    token (e.g. Groq json_object mode emitting `{"text": "..."` in
//    fragments). Handles backslash escapes and \uXXXX sequences; never
//    blocks waiting for the closing quote.
//
// 2. createSentenceChunker — cuts a growing text into TTS-sized sentence
//    chunks. The FIRST chunk is cut aggressively short (an interjection
//    like «أيوه يا مستر!») so the first audible audio can start playing
//    while the LLM is still generating the rest of the reply.
// =====================================================================

/**
 * Incremental extractor for one string field of a streamed JSON document.
 * push() returns the newly-decoded characters of the field value (may be
 * "" while the key has not been seen yet or an escape is pending).
 */
export function createJsonTextFieldExtractor(field = "text") {
  let raw = "";
  let started = false;
  let decoded = "";
  let complete = false;

  const keyPattern = new RegExp(`"${field}"\\s*:\\s*"`);

  return {
    push(delta: string): string {
      if (complete) return "";
      raw += delta;
      // Cap pathological output so a runaway completion can't grow memory.
      if (raw.length > 20_000) {
        complete = true;
        return "";
      }
      if (!started) {
        const m = raw.match(keyPattern);
        if (!m || m.index === undefined) return "";
        started = true;
        raw = raw.slice(m.index + m[0].length);
      }

      let out = "";
      let i = 0;
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "\\") {
          if (i + 1 >= raw.length) break; // escape split across deltas — wait
          const nxt = raw[i + 1];
          if (nxt === "n") out += "\n";
          else if (nxt === "t") out += "\t";
          else if (nxt === "r") out += "\r";
          else if (nxt === "u") {
            if (i + 5 < raw.length) {
              try {
                out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
              } catch {
                out += nxt;
              }
              i += 6;
              continue;
            }
            break; // \uXXXX split across deltas — wait
          } else out += nxt;
          i += 2;
          continue;
        }
        if (ch === '"') {
          // Unescaped closing quote — the field is complete.
          complete = true;
          raw = raw.slice(0, i);
          break;
        }
        out += ch;
        i += 1;
      }
      raw = raw.slice(i);
      decoded += out;
      return out;
    },
    get text(): string {
      return decoded;
    },
    get done(): boolean {
      return complete;
    },
  };
}

export type SentenceChunker = {
  push(delta: string): void;
  /** Emit any remaining text as the final chunk. */
  flush(): void;
  /** Number of chunks emitted so far. */
  readonly chunkCount: number;
};

/**
 * Cut streamed text into TTS chunks at Arabic sentence/clause boundaries.
 *
 * Chunk 0 policy (latency-critical): emit as soon as a sentence ender
 * (., !, ؟, …) appears with at least `firstMinChars` before it, OR at the
 * first clause comma «،» once enough characters accumulated, OR at a hard
 * character cut on a word boundary. Later chunks use more conservative
 * boundaries so mid-sentence audio joins stay natural.
 */
export function createSentenceChunker(onChunk: (text: string, index: number) => void): SentenceChunker {
  let buf = "";
  let index = 0;

  const SENTENCE_END = /[.!?؟…]+/;

  function emitUpTo(cutEnd: number) {
    const piece = buf.slice(0, cutEnd);
    buf = buf.slice(cutEnd);
    const clean = piece.trim();
    if (clean.replace(/[\s.!?؟…،,؛:]/g, "").length >= 2) {
      onChunk(clean, index);
      index += 1;
    }
  }

  function attemptCut(isFinal: boolean) {
    const t = buf;
    if (index === 0) {
      // LATENCY-CRITICAL first chunk. Ordered by speed:
      //   1. ULTRA-EARLY word-boundary cut at ≥12 chars — 2-3 Arabic words
      //      are already a natural spoken interjection; Fish synthesis of
      //      a tiny chunk is proportionally faster too.
      //   2. An early sentence ender (., !, ؟) inside the window.
      //   3. An early clause comma «،».
      //   4. Hard word-boundary cut at 40 chars.
      // A single ender sitting past the window must NOT swallow the whole
      // reply into chunk 0.
      if (t.length >= 12) {
        const sp = t.indexOf(" ", 12);
        if (sp > 12 && sp <= 26) {
          emitUpTo(sp + 1);
          return;
        }
      }
      const m = SENTENCE_END.exec(t);
      const enderPos = m ? m.index : -1;
      if (enderPos >= 4 && enderPos <= 40) {
        let end = m.index + m[0].length;
        while (end < t.length && /[.!?؟…»"']/.test(t[end])) end += 1;
        if (/\s/.test(t[end] ?? "")) end += 1;
        emitUpTo(end);
        return;
      }
      const comma = t.indexOf("،");
      if (comma >= 8 && comma <= 45) {
        emitUpTo(comma + 1);
        return;
      }
      if (enderPos >= 4 && enderPos <= 55) {
        let end = m.index + m[0].length;
        while (end < t.length && /[.!?؟…»"']/.test(t[end])) end += 1;
        if (/\s/.test(t[end] ?? "")) end += 1;
        emitUpTo(end);
        return;
      }
      if (t.length >= 40) {
        const sp = t.lastIndexOf(" ", 40);
        emitUpTo(sp > 18 ? sp : 40);
      }
      return;
    }

    const minChars = 22;
    const hardCut = 130;
    const m = SENTENCE_END.exec(t);
    if (m && m.index >= 10) {
      let end = m.index + m[0].length;
      while (end < t.length && /[.!?؟…»"']/.test(t[end])) end += 1;
      if (/\s/.test(t[end] ?? "")) end += 1;
      emitUpTo(end);
      return;
    }
    if (t.length >= hardCut) {
      const sp = t.lastIndexOf(" ", hardCut);
      emitUpTo(sp > 40 ? sp : hardCut);
      return;
    }
    if (isFinal && t.trim().length >= 2) {
      emitUpTo(t.length);
    }
  }

  return {
    push(delta: string) {
      if (!delta) return;
      buf += delta;
      attemptCut(false);
    },
    flush() {
      attemptCut(true);
      // anything left over that is too small to speak — drop silently
      buf = "";
    },
    get chunkCount() {
      return index;
    },
  };
}
