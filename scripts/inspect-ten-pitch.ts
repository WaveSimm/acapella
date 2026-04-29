import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";

const buf = readFileSync("D:/Users/wave/OneDrive - 오션테크/Downloads/Why_we_Sing_acapella.nwc");
const p = parseNwc(buf);
const ten = p.staves.find((s) => s.name === "Ten");
if (!ten) { console.log("Ten not found"); process.exit(1); }

console.log(`Ten clef=${ten.clef} octaveShift=${ten.octaveShift}`);
console.log("First 10 notes pitches (written):");
let count = 0;
for (const m of ten.measures) {
  for (const n of m.notes) {
    if (n.type !== "note" || n.isGrace) continue;
    for (const pit of n.pitches) {
      console.log(`  ${pit.step}${pit.alter > 0 ? '#'.repeat(pit.alter) : pit.alter < 0 ? 'b'.repeat(-pit.alter) : ''}${pit.octave}`);
    }
    count++;
    if (count >= 10) break;
  }
  if (count >= 10) break;
}

mkdirSync("scripts/_out", { recursive: true });
const xml = buildMusicXml(p);
writeFileSync("scripts/_out/why-we-sing.xml", xml);
// Ten part XML 추출
const tenPart = xml.match(/<part id="P4">[\s\S]*?<\/part>/);
if (tenPart) {
  // 첫 마디만
  const m1 = tenPart[0].match(/<measure number="\d+">[\s\S]*?<\/measure>/);
  if (m1) console.log("\nTen part measure 1 XML:\n" + m1[0]);
}
