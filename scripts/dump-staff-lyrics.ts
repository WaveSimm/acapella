import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const targetStaff = process.argv[3];
const fromM = parseInt(process.argv[4] || "1", 10);
const toM = parseInt(process.argv[5] || "10", 10);

const buf = readFileSync(path);
const parsed = parseNwc(buf);
const staff = parsed.staves.find((s) => s.name === targetStaff);
if (!staff) { console.log("not found"); process.exit(1); }

console.log(`Staff "${targetStaff}" m${fromM}-${toM} lyrics + slur/tied/grace:`);
for (let mi = fromM - 1; mi < Math.min(toM, staff.measures.length); mi++) {
  console.log(`m${mi + 1}:`);
  let idx = 0;
  for (const n of staff.measures[mi].notes) {
    if (n.type !== "note") continue;
    idx++;
    const flags: string[] = [];
    if (n.isGrace) flags.push("GRACE");
    if (n.tied) flags.push("tied^");
    if (n.slur) flags.push("slur");
    if (n.slurEvent) flags.push(`slurEv=${n.slurEvent}`);
    const ly = n.lyric ? `"${n.lyric.text}"(${n.lyric.syllabic}${n.lyric.extend ? ",ext" : ""})` : "(no lyric)";
    console.log(`  #${idx}  ${n.durType}  ${flags.join(",").padEnd(20)}  ${ly}`);
  }
}
