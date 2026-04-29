import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const path = process.argv[2];
const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

const lyricCmds = lines.filter((l) => l.startsWith("|Lyric"));
const types = new Set<string>();
for (const l of lyricCmds) {
  const m = l.match(/^\|(\w+)/);
  if (m) types.add(m[1]);
}
console.log("Lyric command types:", [...types]);
for (const t of types) {
  const count = lyricCmds.filter((l) => l.startsWith("|" + t + "|")).length;
  console.log(`  ${t}: ${count}`);
}

console.log("\nRepeat/Ending markers:");
const repeats = lines.filter((l) =>
  l.includes("Style:LocalRepeat") ||
  l.includes("Style:MasterRepeat") ||
  l.startsWith("|Ending") ||
  l.includes("Repeat:") ||
  l.startsWith("|Flow")
);
for (const l of repeats.slice(0, 30)) console.log("  " + l);

console.log("\nFirst Lyric1 of each staff (truncated 200 chars):");
let staffN = -1;
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    staffN++;
    const m = l.match(/Name:([^|]+)/);
    console.log(`\n--- staff#${staffN} ${m ? m[1] : "?"}`);
  } else if (l.startsWith("|Lyric1")) {
    console.log("  ", l.slice(0, 200));
  }
}
