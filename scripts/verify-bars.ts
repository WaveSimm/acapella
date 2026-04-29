import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

console.log("=== Bar styles + endings per staff (first found) ===");
for (const s of parsed.staves) {
  console.log(`\n--- ${s.name} ---`);
  for (let mi = 0; mi < s.measures.length; mi++) {
    const m = s.measures[mi];
    const flags: string[] = [];
    if (m.startBarStyle) flags.push(`L:${m.startBarStyle}`);
    if (m.endBarStyle) flags.push(`R:${m.endBarStyle}`);
    if (m.endingNumber) flags.push(`ending=${m.endingNumber}`);
    if (flags.length > 0) console.log(`  m${mi + 1}: ${flags.join(" ")}`);
  }
}

mkdirSync("scripts/_out", { recursive: true });
const xml = buildMusicXml(parsed);
writeFileSync("scripts/_out/this-is-me.xml", xml);
console.log("\nWrote scripts/_out/this-is-me.xml");
console.log("MusicXML <barline> count:", (xml.match(/<barline/g) ?? []).length);
console.log("MusicXML <repeat> count:", (xml.match(/<repeat/g) ?? []).length);
console.log("MusicXML <ending> count:", (xml.match(/<ending/g) ?? []).length);
