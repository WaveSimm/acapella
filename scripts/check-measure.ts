import { readFileSync } from "fs";
import { inflateSync } from "zlib";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const staffName = process.argv[3];   // 예: "T"
const measureNum = parseInt(process.argv[4], 10);   // 1-based

const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");

// 1) NWCtxt 원본 라인 (해당 staff 의 measureNum 마디만)
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));
let curStaff = "";
let curMeasure = 0;
console.log(`=== Raw NWCtxt for staff "${staffName}" measure ${measureNum} ===`);
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    const m = l.match(/Name:([^|]+)/);
    curStaff = m ? m[1].replace(/"/g, "") : "?";
    curMeasure = 1;
    if (curStaff === staffName) console.log(`(AddStaff) ${l}`);
  } else if (l.startsWith("|Bar")) {
    if (curStaff === staffName && curMeasure === measureNum) console.log(`(Bar end) ${l}`);
    curMeasure++;
  } else if (curStaff === staffName && curMeasure === measureNum) {
    console.log(l);
  }
}

// 2) Parsed 결과
console.log(`\n=== Parsed Staff "${staffName}" measure ${measureNum} (1-based) ===`);
const parsed = parseNwc(buf);
const staff = parsed.staves.find((s) => s.name === staffName);
if (!staff) { console.log("Staff not found"); process.exit(1); }
const m = staff.measures[measureNum - 1];
if (!m) { console.log("Measure not found"); process.exit(1); }
console.log("Notes count:", m.notes.length);
for (const n of m.notes) {
  if (n.type === "rest") {
    console.log(`  REST  durType=${n.durType} dots=${n.dots} divs=${n.durDivisions}`);
  } else {
    const pitches = n.pitches.map((p) => `${p.step}${p.alter > 0 ? "#".repeat(p.alter) : p.alter < 0 ? "b".repeat(-p.alter) : ""}${p.octave}`).join(",");
    const flags: string[] = [];
    if (n.tied) flags.push("tied");
    if (n.slur) flags.push("slur");
    if (n.isGrace) flags.push("grace");
    if (n.tripletMark) flags.push("trip:" + n.tripletMark);
    if (n.lyric) flags.push(`lyric="${n.lyric.text}"(${n.lyric.syllabic})`);
    console.log(`  NOTE  ${n.durType}${".".repeat(n.dots)}  pitches=[${pitches}]  divs=${n.durDivisions} ${flags.join(" ")}`);
  }
}

// 3) timeSig at this measure
const initial = staff.timeSig;
let cur = initial;
for (const tc of staff.timeSigChanges) {
  if (tc.measureNumber <= measureNum) cur = tc.sig;
}
console.log(`\nEffective timeSig at m${measureNum}: ${cur}`);
