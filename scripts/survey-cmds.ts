import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const path = process.argv[2];
const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

const cmds = new Map<string, number>();
for (const l of lines) {
  const m = l.match(/^\|(\w+)/);
  if (m) cmds.set(m[1], (cmds.get(m[1]) || 0) + 1);
}
console.log("=== Command frequency ===");
for (const [k, v] of [...cmds.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("  " + k.padEnd(20) + v);
}

console.log("\n=== Sample lines for non-obvious commands ===");
const interesting = ["Dynamic", "DynamicVariance", "Decoration", "Marker", "PerformanceStyle", "Tempo", "Text", "TempoVariance", "Flow", "Ending", "Sustain", "Fermata", "Accent"];
for (const cmd of interesting) {
  const samples = lines.filter((l) => l.startsWith("|" + cmd + "|")).slice(0, 3);
  if (samples.length > 0) {
    console.log(`-- ${cmd}:`);
    for (const s of samples) console.log("  " + s);
  }
}

console.log("\n=== Unique Note Opts (max 30) ===");
const optsSet = new Set<string>();
for (const l of lines) {
  const m = l.match(/Opts:([^|]+)/);
  if (m) optsSet.add(m[1]);
}
for (const o of [...optsSet].slice(0, 30)) console.log("  " + o);

console.log("\n=== Note Dur tokens (after duration name) ===");
const durSet = new Set<string>();
for (const l of lines) {
  const m = l.match(/Dur:([^|]+)/);
  if (m) durSet.add(m[1]);
}
for (const d of [...durSet].sort()) console.log("  " + d);
