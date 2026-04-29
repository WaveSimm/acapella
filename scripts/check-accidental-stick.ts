import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

console.log("=== Real bugs: non-explicit note differs from sticky-expected alter ===");
let bugs = 0;
for (const staff of parsed.staves) {
  for (let mi = 0; mi < staff.measures.length; mi++) {
    const m = staff.measures[mi];
    const sticky = new Map<string, number>();
    for (const n of m.notes) {
      if (n.type !== "note" || n.isGrace) continue;
      for (const p of n.pitches) {
        const k = `${p.step}${p.octave}`;
        if (p.explicitAccidental !== null && p.explicitAccidental !== undefined) {
          sticky.set(k, p.explicitAccidental);
        } else {
          if (sticky.has(k) && sticky.get(k) !== p.alter) {
            console.log(`  ${staff.name} m${mi + 1} ${k}: alter=${p.alter} expected=${sticky.get(k)} (sticky)`);
            bugs++;
          }
        }
      }
    }
  }
}
console.log(`\nTotal real bugs: ${bugs}`);
