import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const buf = readFileSync(process.argv[2]);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

const barStyles = new Set<string>();
for (const l of lines) {
  const m = l.match(/^\|Bar\|Style:([^|\r\n]+)/);
  if (m) barStyles.add(m[1]);
}
console.log("Bar Style 종류:", [...barStyles]);

console.log("\nBar with Style 샘플:");
for (const l of lines.filter((l) => l.startsWith("|Bar|Style:")).slice(0, 15)) console.log("  " + l);

console.log("\nEnding 라인:");
for (const l of lines.filter((l) => l.startsWith("|Ending"))) console.log("  " + l);

console.log("\nFlow / Marker / Performance / Special 라인:");
for (const l of lines) {
  if (l.startsWith("|Flow") || l.startsWith("|Marker") || l.startsWith("|PerformanceStyle") || l.startsWith("|Coda") || l.startsWith("|Segno") || l.startsWith("|DalSegno") || l.startsWith("|DaCapo")) {
    console.log("  " + l);
  }
}

// MPC / Special 컨트롤
console.log("\nText 라인 (지시문 가능성):");
for (const l of lines.filter((l) => l.startsWith("|Text|")).slice(0, 5)) console.log("  " + l);

// 모든 비표준 명령어
const knownCmds = new Set(["Note", "Chord", "Rest", "Bar", "TimeSig", "Key", "Clef", "AddStaff", "StaffProperties", "StaffInstrument", "Font", "Lyrics", "Lyric1", "Lyric2", "Tempo", "Text", "Editor", "SongInfo", "PgSetup", "PgMargins", "TempoVariance", "RestChord"]);
const otherCmds = new Set<string>();
for (const l of lines) {
  const m = l.match(/^\|(\w+)/);
  if (m && !knownCmds.has(m[1])) otherCmds.add(m[1]);
}
console.log("\n알려지지 않은 명령어:", [...otherCmds]);
for (const c of otherCmds) {
  const samples = lines.filter((l) => l.startsWith("|" + c + "|")).slice(0, 2);
  for (const s of samples) console.log("  " + s);
}
