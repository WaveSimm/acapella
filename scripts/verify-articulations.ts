import { readFileSync, writeFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";
import { buildMidi } from "../src/lib/nwc/to-midi";

const path = process.argv[2];
const buf = readFileSync(path);
const parsed = parseNwc(buf);

console.log("=== Tempo changes per staff ===");
for (const s of parsed.staves) {
  if (s.tempoChanges.length > 0) {
    console.log(`  ${s.name}: ${s.tempoChanges.length} changes (first 10 shown)`);
    for (const tc of s.tempoChanges.slice(0, 10)) console.log(`    m${tc.measureNumber} bpm=${tc.bpm}`);
  } else {
    console.log(`  ${s.name}: 0 changes`);
  }
}

console.log("\n=== Text directions per staff (counts) ===");
for (const s of parsed.staves) {
  console.log(`  ${s.name}: ${s.textDirections.length} directions`);
  for (const td of s.textDirections.slice(0, 5)) {
    console.log(`    m${td.measureNumber} ${td.italic ? "[i] " : ""}"${td.text}"`);
  }
}

console.log("\n=== Fermata-marked notes ===");
let fermataCount = 0;
for (const s of parsed.staves) {
  for (let mi = 0; mi < s.measures.length; mi++) {
    for (const n of s.measures[mi].notes) {
      if (n.type === "note" && n.fermata) {
        fermataCount++;
        if (fermataCount <= 8) {
          console.log(`  ${s.name} m${mi + 1} pause=${n.fermataPause}`);
        }
      }
    }
  }
}
console.log(`  Total: ${fermataCount}`);

console.log("\n=== Articulations ===");
let artCount = 0;
for (const s of parsed.staves) {
  for (let mi = 0; mi < s.measures.length; mi++) {
    for (const n of s.measures[mi].notes) {
      if (n.type === "note" && n.articulations) {
        artCount++;
        if (artCount <= 8) {
          console.log(`  ${s.name} m${mi + 1} ${n.articulations.join(",")}`);
        }
      }
    }
  }
}
console.log(`  Total: ${artCount}`);

const xml = buildMusicXml(parsed);
writeFileSync("scripts/_out/pure-imagination.xml", xml);
console.log("\n=== MusicXML output ===");
console.log("  fermata count:", (xml.match(/<fermata\/>/g) ?? []).length);
console.log("  articulations count:", (xml.match(/<articulations>/g) ?? []).length);
console.log("  metronome count:", (xml.match(/<metronome>/g) ?? []).length);
console.log("  words count:", (xml.match(/<words/g) ?? []).length);

const mid = buildMidi(parsed);
writeFileSync("scripts/_out/pure-imagination.mid", mid);
console.log("\n=== MIDI output (first 20 meta events) ===");
import { parseMidi } from "midi-file";
const midParsed = parseMidi(mid);
let absTick = 0;
const meta = midParsed.tracks[0];
for (const ev of meta.slice(0, 30)) {
  absTick += ev.deltaTime;
  if (ev.type === "timeSignature" || ev.type === "setTempo") {
    const detail = ev.type === "timeSignature" ? `${(ev as { numerator: number }).numerator}/${(ev as { denominator: number }).denominator}` : `bpm=${Math.round(60_000_000 / (ev as { microsecondsPerBeat: number }).microsecondsPerBeat)}`;
    console.log(`  tick ${absTick}: ${ev.type} ${detail}`);
  }
}
