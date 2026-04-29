import { readFileSync, writeFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";
import { buildMidi } from "../src/lib/nwc/to-midi";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

console.log("=== ParsedScore.staves[0].timeSigChanges ===");
console.log(parsed.staves[0]?.timeSigChanges);

console.log("\n=== MusicXML <time> elements per measure ===");
const xml = buildMusicXml(parsed);
writeFileSync("scripts/_out/pure-imagination.xml", xml);
console.log("Wrote scripts/_out/pure-imagination.xml");

// Sop1 part 만 추출해 <measure number="N"> 직후 <time> 등장 여부 확인
const sop1Match = xml.match(/<part id="P1">[\s\S]*?<\/part>/);
if (sop1Match) {
  const sop1Xml = sop1Match[0];
  const measureRegex = /<measure number="(\d+)">([\s\S]*?)<\/measure>/g;
  let m;
  while ((m = measureRegex.exec(sop1Xml)) !== null) {
    const measureNum = parseInt(m[1], 10);
    const body = m[2];
    const timeMatch = body.match(/<time><beats>(\d+)<\/beats><beat-type>(\d+)<\/beat-type><\/time>/);
    if (timeMatch) {
      console.log(`  measure ${measureNum}: <time>${timeMatch[1]}/${timeMatch[2]}</time>`);
    }
  }
}

console.log("\n=== MIDI meta track timeSignature events ===");
const mid = buildMidi(parsed);
writeFileSync("scripts/_out/pure-imagination.mid", mid);
console.log("Wrote scripts/_out/pure-imagination.mid (" + mid.length + " bytes)");

// midi-file 로 다시 파싱해서 timeSignature 이벤트 + 절대 tick 출력
import { parseMidi } from "midi-file";
const midParsed = parseMidi(mid);
const meta = midParsed.tracks[0];
let absTick = 0;
for (const ev of meta) {
  absTick += ev.deltaTime;
  if (ev.type === "timeSignature") {
    console.log(`  tick ${absTick}: ${ev.numerator}/${ev.denominator}`);
  }
}

console.log("\nDone.");
