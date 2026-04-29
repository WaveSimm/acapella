import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const path = process.argv[2];
const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

let curStaff = "(header)";
const counts = new Map<string, number>();
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    const m = l.match(/Name:"([^"]+)/);
    curStaff = m ? m[1] : "?";
  }
  if (l.startsWith("|Tempo|")) {
    counts.set(curStaff, (counts.get(curStaff) || 0) + 1);
  }
}
console.log("Tempo cmds per staff:");
for (const [k, v] of counts) console.log(`  ${k.padEnd(15)} ${v}`);

// Show first few Tempo commands per staff
console.log("\nSample Tempo per staff:");
const samples = new Map<string, string[]>();
curStaff = "(header)";
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    const m = l.match(/Name:"([^"]+)/);
    curStaff = m ? m[1] : "?";
  }
  if (l.startsWith("|Tempo|")) {
    if (!samples.has(curStaff)) samples.set(curStaff, []);
    const arr = samples.get(curStaff)!;
    if (arr.length < 5) arr.push(l);
  }
}
for (const [k, arr] of samples) {
  console.log(`  ${k}:`);
  for (const s of arr) console.log(`    ${s}`);
}
