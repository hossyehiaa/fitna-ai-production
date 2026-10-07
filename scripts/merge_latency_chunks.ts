/** Merge chunk latency reports + compute the final p95 acceptance verdict. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = "/home/z/my-project/download/latency";
const files = readdirSync(DIR).filter((f) => /^latency_report_chunk\d+\.json$/.test(f)).sort((a, b) => {
  const n = (s: string) => parseInt(s.match(/chunk(\d+)/)![1], 10);
  return n(a) - n(b);
});
if (files.length === 0) {
  console.error("no chunk reports found");
  process.exit(1);
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return -1;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const merged: Record<string, unknown> = { base: "merged", chunks: files.length, partA: [], partB: [] };
for (const f of files) {
  const r = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
  (merged.partA as unknown[]).push(...(r.partA ?? []));
  (merged.partB as unknown[]).push(...(r.partB ?? []));
}

const aTtfa = (merged.partA as Record<string, unknown>[]).map((r) => r.firstAudioMs as number).filter((n) => n > 0).sort((a, b) => a - b);
const bTtfa = (merged.partB as Record<string, unknown>[]).map((r) => r.ttfaClientMs as number).filter((n) => typeof n === "number" && n > 0).sort((a, b) => a - b);
const silentA = (merged.partA as Record<string, unknown>[]).filter((r) => r.silent).length;
const classroomSilentB = (merged.partB as Record<string, unknown>[]).filter((r) => r.classroomSilence === true).length;
const silentB = (merged.partB as Record<string, unknown>[]).filter((r) => !r.audio && !r.error && r.classroomSilence !== true).length;
const routingFails = (merged.partA as Record<string, unknown>[]).filter((r) => r.routingOk === false).length;
const totalTurns = (merged.partA as unknown[]).length;

merged.summary = {
  partA: { n: aTtfa.length, p50: pct(aTtfa, 50), p90: pct(aTtfa, 90), p95: pct(aTtfa, 95), max: aTtfa[aTtfa.length - 1] ?? -1, silentTurns: silentA },
  partB: { n: bTtfa.length, p50: pct(bTtfa, 50), p90: pct(bTtfa, 90), p95: pct(bTtfa, 95), max: bTtfa[bTtfa.length - 1] ?? -1, silentTurns: silentB, classroomSilenceTurns: classroomSilentB },
  routingFails,
  acceptance: {
    criterion: "p95 time-to-first-audio (browser, real voice pipeline) ≤ 2000ms, no silent turns",
    browserP95: pct(bTtfa, 95),
    passed: pct(bTtfa, 95) <= 2000 && silentA === 0 && silentB === 0 && routingFails === 0 && bTtfa.length + classroomSilentB === totalTurns,
  },
};

writeFileSync(`${DIR}/latency_report_merged.json`, JSON.stringify(merged, null, 2));
console.log(`merged ${files.length} chunks: ${totalTurns} turns`);
console.log(`Part A: n=${aTtfa.length} p50=${pct(aTtfa, 50)}ms p90=${pct(aTtfa, 90)}ms p95=${pct(aTtfa, 95)}ms silent=${silentA}`);
console.log(`Part B: n=${bTtfa.length} p50=${pct(bTtfa, 50)}ms p90=${pct(bTtfa, 90)}ms p95=${pct(bTtfa, 95)}ms silent=${silentB} classroomSilence=${classroomSilentB}`);
console.log(`Routing mismatches: ${routingFails}`);
console.log(`ACCEPTANCE: ${(merged.summary as Record<string, Record<string, unknown>>).acceptance.passed ? "PASS ✅" : "FAIL ❌"}`);
