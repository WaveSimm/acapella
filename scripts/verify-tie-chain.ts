import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

// 모든 곡에서 tied chain 검증: prev.tied=true 인 경우 다음 노트가 같은 step+octave 면 같은 alter 인지
const files = [
  "scripts/_out/dont-you-worry.nwc",
  "D:/Users/wave/OneDrive - 오션테크/Downloads/pure_imagination_무합수정.nwc",
  "D:/Users/wave/OneDrive - 오션테크/Downloads/Why_we_Sing_acapella.nwc",
  "D:/Users/wave/OneDrive - 오션테크/Downloads/This_is_Me.nwc",
];

for (const f of files) {
  console.log(`=== ${f.split("/").pop()} ===`);
  const buf = readFileSync(f);
  const parsed = parseNwc(buf);
  let bugs = 0;
  let chains = 0;
  for (const staff of parsed.staves) {
    let prev: { pitches: { step: string; octave: number; alter: number }[]; tied: boolean } | null = null;
    let measureNum = 0;
    for (let mi = 0; mi < staff.measures.length; mi++) {
      measureNum = mi + 1;
      for (const n of staff.measures[mi].notes) {
        if (n.type !== "note" || n.isGrace) continue;
        if (prev?.tied) {
          chains++;
          // 같은 step+octave 픽치가 있으면 alter 비교
          for (const p of n.pitches) {
            const src = prev.pitches.find((pp) => pp.step === p.step && pp.octave === p.octave);
            if (src && src.alter !== p.alter) {
              console.log(`  BUG ${staff.name} m${measureNum}: tie src=${src.step}${src.alter ? (src.alter > 0 ? "#" : "b") : "♮"}${src.octave} → tgt=${p.step}${p.alter ? (p.alter > 0 ? "#" : "b") : "♮"}${p.octave}`);
              bugs++;
            }
          }
        }
        prev = n;
      }
    }
  }
  console.log(`  chains=${chains} bugs=${bugs}\n`);
}
