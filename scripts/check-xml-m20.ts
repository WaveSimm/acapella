import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";

const buf = readFileSync(process.argv[2]);
const parsed = parseNwc(buf);
const xml = buildMusicXml(parsed);
mkdirSync("scripts/_out", { recursive: true });
writeFileSync("scripts/_out/dyw.xml", xml);

// 각 staff 의 m20 + m21 첫 부분 추출
for (let i = 0; i < parsed.staves.length; i++) {
  const partId = `P${i + 1}`;
  const re = new RegExp(`<part id="${partId}">[\\s\\S]*?</part>`);
  const partMatch = xml.match(re);
  if (!partMatch) continue;
  const m20 = partMatch[0].match(/<measure number="20">[\s\S]*?<\/measure>/);
  if (!m20) continue;
  console.log(`=== ${parsed.staves[i].name} (${partId}) m20 ===`);
  // 노트만 출력
  const notes = m20[0].match(/<note>[\s\S]*?<\/note>/g) ?? [];
  for (const note of notes) {
    const step = note.match(/<step>(\w)<\/step>/)?.[1];
    const alter = note.match(/<alter>(-?\d+)<\/alter>/)?.[1];
    const octave = note.match(/<octave>(\d+)<\/octave>/)?.[1];
    const accidental = note.match(/<accidental>([^<]+)<\/accidental>/)?.[1];
    const grace = note.includes("<grace/>");
    if (!step) continue;
    console.log(`  ${grace ? "(grace) " : ""}${step}${alter ? ` alter=${alter}` : ""} oct=${octave}${accidental ? ` accidental=${accidental}` : ""}`);
  }
}
