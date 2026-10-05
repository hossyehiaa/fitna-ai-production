/**
 * Utilities for sanitizing and formatting pedagogical text (reports, feedback, evaluations).
 */

export function cleanPedagogicalText(text: string): string {
  if (!text) return "";
  let cleaned = text
    // 1. Bracketed or parenthesized event_ids / UUIDs (with or without quotes or prefixes)
    .replace(/\s*\([a-z0-9_-]*event_?[a-z0-9_-]*\s*[:=]?\s*["']?[a-f0-9-]{8,}["']?[^)]*\)/gi, "")
    .replace(/\s*\[[a-z0-9_-]*event_?[a-z0-9_-]*\s*[:=]?\s*["']?[a-f0-9-]{8,}["']?[^\]]*\]/gi, "")
    .replace(/\s*\([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[^)]*\)/gi, "")
    .replace(/\s*\(معرف الحدث[^)]*\)/gi, "")
    .replace(/\s*\(event_id[^)]*\)/gi, "")
    // 2. Inline citations: e.g. "، مثل event_id 'uuid'", "كما في event_id 'uuid'", "في event_id 'uuid'"
    .replace(/(?:،\s*|,\s*|\s+)?(?:مثل|كما\s*في|في|الحدث|لحظة)?\s*(?:event_?id|معرف\s*الحدث)\s*[:=]?\s*["']?[a-f0-9-]{8,}["']?/gi, "")
    // 3. Standalone event_id labels
    .replace(/(?:event_?id|معرف\s*الحدث)\s*[:=]?\s*["']?[a-f0-9-]{8,}["']?/gi, "")
    // 4. Raw UUIDs (enclosed in quotes or not)
    .replace(/["']?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}["']?/gi, "")
    // 5. Cleanup doubled spaces and dangling punctuation
    .replace(/\s{2,}/g, " ")
    .replace(/[،,]\s*\./g, ".")
    .replace(/[،,]\s*$/g, "")
    .trim();

  // If text ends with incomplete dangling connector like "مثل" or "كما في"
  cleaned = cleaned.replace(/(?:،\s*|,\s*|\s+)?(?:مثل|كما\s*في|في)\s*\.?$/gi, ".").trim();

  return cleaned;
}
