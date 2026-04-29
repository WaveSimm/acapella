import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const targetStaff = process.argv[3];
const buf = readFileSync(path);
const parsed = parseNwc(buf);
const staff = parsed.staves.find((s) => s.name === targetStaff);
if (!staff) { console.log("not found"); process.exit(1); }

console.log(`Staff "${targetStaff}" — gap measures (covered = lyric + extend-tail + melisma):`);
// inExtRun / prevShares 는 마디를 가로질러 유지
let inExtRun = false;
let prevShares = false;
for (let mi = 0; mi < staff.measures.length; mi++) {
  const m = staff.measures[mi];
  let total = 0, withLy = 0, covered = 0;
  for (const n of m.notes) {
    if (n.type !== "note" || n.isGrace) continue;
    total++;
    if (n.lyric) {
      withLy++;
      covered++;
      inExtRun = !!n.lyric.extend;
    } else if (prevShares || inExtRun) {
      covered++;
    }
    prevShares = n.slur || n.tied;
  }
  const gap = total - covered;
  if (gap > 0) console.log(`  m${mi+1}: total=${total} lyric=${withLy} covered=${covered} gap=${gap}`);
}
