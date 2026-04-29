import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const buf = readFileSync("scripts/_out/dont-you-worry.nwc");
const p = parseNwc(buf);
const solo = p.staves.find((s) => s.name === "Solo");
if (!solo) process.exit(1);
console.log("Solo m21 last 2 + m22 first 2 (non-grace):");
for (const mi of [20, 21]) {
  const m = solo.measures[mi];
  const notes = m.notes.filter((n) => n.type === "note" && !n.isGrace);
  const sliced = mi === 20 ? notes.slice(-2) : notes.slice(0, 2);
  for (const n of sliced) {
    if (n.type !== "note") continue;
    const ps = n.pitches.map((p) => `step=${p.step} alter=${p.alter} oct=${p.octave} explicit=${p.explicitAccidental}`).join(",");
    console.log(`  m${mi + 1} ${n.durType} tied=${n.tied} : ${ps}`);
  }
}
