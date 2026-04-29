import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const buf = readFileSync(process.argv[2]);
const parsed = parseNwc(buf);
const targetStaff = process.argv[3];
const fromM = parseInt(process.argv[4] || "1", 10);
const toM = parseInt(process.argv[5] || "10", 10);

const staff = parsed.staves.find((s) => s.name === targetStaff);
if (!staff) { console.log("not found"); process.exit(1); }

console.log(`Staff "${targetStaff}" m${fromM}-${toM} parsed pitches:`);
for (let mi = fromM - 1; mi < Math.min(toM, staff.measures.length); mi++) {
  console.log(`m${mi + 1}:`);
  for (const n of staff.measures[mi].notes) {
    if (n.type !== "note") continue;
    const flags: string[] = [];
    if (n.tied) flags.push("tied^");
    if (n.isGrace) flags.push("grace");
    const ps = n.pitches.map((p) => {
      const acc = p.alter === 1 ? "#" : p.alter === -1 ? "b" : p.alter === 0 ? "♮" : "";
      const expl = p.explicitAccidental !== null ? `(expl=${p.explicitAccidental})` : "";
      return `${p.step}${acc}${p.octave}${expl}`;
    }).join(",");
    console.log(`  ${n.durType.padEnd(8)} pitches=[${ps}] ${flags.join(" ")}`);
  }
}
