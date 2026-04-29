import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";

const buf = readFileSync(process.argv[2]);
const parsed = parseNwc(buf);
const xml = buildMusicXml(parsed);
mkdirSync("scripts/_out", { recursive: true });
writeFileSync("scripts/_out/misty.xml", xml);

// Soprano P1 m4 raw XML
const partMatch = xml.match(/<part id="P1">[\s\S]*?<\/part>/);
if (!partMatch) process.exit(1);
const m4 = partMatch[0].match(/<measure number="4">[\s\S]*?<\/measure>/);
if (!m4) process.exit(1);
console.log(m4[0]);
