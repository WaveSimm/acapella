import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

console.log("Lyric coverage per staff:");
for (const s of parsed.staves) {
  let total = 0, withLy = 0, melisma = 0, extCovered = 0;
  let prevShares = false; // slur/tied chain
  let inExtendRun = false; // currently in <extend> tail
  for (const m of s.measures) for (const n of m.notes) {
    if (n.type !== "note" || n.isGrace) continue;
    total++;
    if (n.lyric) {
      withLy++;
      inExtendRun = !!n.lyric.extend;
    } else if (prevShares || inExtendRun) {
      extCovered++; // either melisma chain or extend tail
    }
    prevShares = n.slur || n.tied;
  }
  const covered = withLy + extCovered + melisma;
  const gap = total - covered;
  console.log(`  ${s.name.padEnd(10)} total=${total} lyric=${withLy} ext-cov=${extCovered} gap=${gap}${gap > 0 ? "  ← MISSING" : ""}`);
}
