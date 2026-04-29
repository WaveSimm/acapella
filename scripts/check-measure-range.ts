import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const path = process.argv[2];
const staffName = process.argv[3];
const fromM = parseInt(process.argv[4], 10);
const toM = parseInt(process.argv[5], 10);

const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

let curStaff = "";
let curMeasure = 0;
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    const m = l.match(/Name:([^|]+)/);
    curStaff = m ? m[1].replace(/"/g, "") : "?";
    curMeasure = 1;
  } else if (curStaff === staffName) {
    if (curMeasure >= fromM && curMeasure <= toM) {
      console.log(`[m${curMeasure}] ${l}`);
    }
    if (l.startsWith("|Bar")) curMeasure++;
  }
}
