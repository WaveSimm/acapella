import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

for (const staff of parsed.staves) {
  console.log(`=== ${staff.name} ===`);
  console.log("  measures total:", staff.measures.length);
  console.log("  keyChanges:", JSON.stringify(staff.keyChanges));
  console.log("  timeSigChanges:", JSON.stringify(staff.timeSigChanges));
}
