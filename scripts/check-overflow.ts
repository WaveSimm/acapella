import { readFileSync } from "fs";
import { parseNwc, XML_DIVISIONS } from "../src/lib/nwc/parser";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

for (const staff of parsed.staves) {
  let cur = staff.timeSig;
  for (let i = 0; i < staff.measures.length; i++) {
    const measureNum = i + 1;
    const tc = staff.timeSigChanges.find((c) => c.measureNumber === measureNum);
    if (tc) cur = tc.sig;
    const [n, d] = cur.split("/").map(Number);
    if (!n || !d) continue;
    const measureDur = Math.round(XML_DIVISIONS * 4 * n / d);
    const m = staff.measures[i];
    let total = 0;
    for (const note of m.notes) total += note.durDivisions;
    if (total > measureDur) {
      console.log(`OVERFLOW  ${staff.name.padEnd(8)} m${measureNum} sig=${cur}  measureDur=${measureDur}  actual=${total}  ratio=${(total / measureDur).toFixed(2)}x`);
    }
  }
}
console.log("Done.");
