import { readFileSync } from "fs";
import { parseNwc, XML_DIVISIONS } from "../src/lib/nwc/parser";

const buf = readFileSync(process.argv[2]);
const p = parseNwc(buf);
const sop = p.staves.find((s) => s.name === "Soprano");
if (!sop) process.exit(1);
console.log("XML_DIVISIONS=", XML_DIVISIONS);
for (const mi of [2, 3]) {
  const m = sop.measures[mi];
  let total = 0;
  console.log(`m${mi + 1}:`);
  for (const n of m.notes) {
    if (n.type !== "note" || n.isGrace) continue;
    console.log(`  ${n.durType} tripletMark=${n.tripletMark} divs=${n.durDivisions}`);
    total += n.durDivisions;
  }
  console.log(`  TOTAL=${total} (measure should be ${XML_DIVISIONS * 4} for 2/2)`);
}
