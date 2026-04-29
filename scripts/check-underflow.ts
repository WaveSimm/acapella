import { readFileSync } from "fs";
import { parseNwc, XML_DIVISIONS } from "../src/lib/nwc/parser";

const buf = readFileSync(process.argv[2]);
const p = parseNwc(buf);

for (const staff of p.staves) {
  let cur = staff.timeSig;
  for (let i = 0; i < staff.measures.length; i++) {
    const measureNum = i + 1;
    const tc = staff.timeSigChanges.find((c) => c.measureNumber === measureNum);
    if (tc) cur = tc.sig;
    const [n, d] = cur.split("/").map(Number);
    if (!n || !d) continue;
    const expected = Math.round(XML_DIVISIONS * 4 * n / d);
    const m = staff.measures[i];
    let total = 0;
    // include rests too
    for (const note of m.notes) {
      if (note.type === "note" && note.isGrace) continue;
      total += note.durDivisions;
    }
    if (total > 0 && total !== expected) {
      console.log(`  ${staff.name.padEnd(10)} m${measureNum} sig=${cur}: actual=${total} expected=${expected} diff=${expected - total}`);
    }
  }
}
console.log("Done.");
