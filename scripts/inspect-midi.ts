import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parseNwc, MIDI_PPQ } from "../src/lib/nwc/parser";
import { buildMidi } from "../src/lib/nwc/to-midi";
import { parseMidi } from "midi-file";

const buf = readFileSync(process.argv[2]);
const targetTrack = parseInt(process.argv[3] || "1", 10);
const fromMeasure = parseInt(process.argv[4] || "1", 10);
const toMeasure = parseInt(process.argv[5] || "5", 10);

const parsed = parseNwc(buf);
const mid = buildMidi(parsed);
mkdirSync("scripts/_out", { recursive: true });
writeFileSync("scripts/_out/dyw.mid", mid);

// 시간표·tempo 무시하고 단순 tick 기반으로 노트 출력
const m = parseMidi(mid);
const track = m.tracks[targetTrack];
console.log(`Track ${targetTrack} (${parsed.staves[targetTrack - 1]?.name})`);
const staff = parsed.staves[targetTrack - 1];
const [num, den] = (staff.timeSig || "4/4").split("/").map(Number);
const ticksPerMeasure = MIDI_PPQ * 4 * num / den;
const fromTick = (fromMeasure - 1) * ticksPerMeasure;
const toTick = toMeasure * ticksPerMeasure;

let absTick = 0;
const noteOnPending = new Map<number, number>();
for (const ev of track) {
  absTick += ev.deltaTime;
  if (absTick > toTick) break;
  if (ev.type === "noteOn" && (ev as { velocity: number }).velocity > 0) {
    noteOnPending.set((ev as { noteNumber: number }).noteNumber, absTick);
  } else if (ev.type === "noteOff" || (ev.type === "noteOn" && (ev as { velocity: number }).velocity === 0)) {
    const n = (ev as { noteNumber: number }).noteNumber;
    const start = noteOnPending.get(n);
    if (start !== undefined && start >= fromTick) {
      const measure = Math.floor(start / ticksPerMeasure) + 1;
      const beatInMeasure = ((start % ticksPerMeasure) / MIDI_PPQ).toFixed(2);
      const dur = absTick - start;
      const noteName = midiToName(n);
      console.log(`  m${measure} beat=${beatInMeasure}  ${noteName} (midi=${n})  dur=${dur} ticks`);
      noteOnPending.delete(n);
    }
  }
}

function midiToName(n: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const oct = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${oct}`;
}
