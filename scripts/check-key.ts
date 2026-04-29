import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const buf = readFileSync(process.argv[2]);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));
for (const l of lines.filter((l) => l.startsWith("|Key|"))) console.log(l);
