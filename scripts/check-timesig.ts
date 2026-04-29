import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const path = process.argv[2];
const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
let text: string;
if (head.startsWith("[NWZ]") || head.includes("ArtWare")) {
  text = inflateSync(buf.slice(6)).toString("latin1");
} else {
  text = buf.toString("latin1");
}
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

let staffIdx = -1;
let measure = 0;
let staffName = "";

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.startsWith("|AddStaff")) {
    staffIdx++;
    measure = 1;
    const m = l.match(/Name:([^|]+)/);
    staffName = m ? m[1] : "?";
    console.log(`--- AddStaff #${staffIdx} ${staffName}`);
  } else if (l.startsWith("|Bar")) {
    measure++;
  } else if (l.startsWith("|TimeSig")) {
    const sig = l.match(/Signature:(\S+)/)?.[1];
    console.log(`  staff#${staffIdx} measure ${measure} TimeSig=${sig}`);
  }
}
