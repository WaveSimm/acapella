import { readFileSync } from "fs";
import { parseNwc } from "../src/lib/nwc/parser";

for (const f of ["This_is_Me", "pure_imagination_무합수정", "Why_we_Sing_acapella"]) {
  console.log(`=== ${f} ===`);
  const buf = readFileSync(`D:/Users/wave/OneDrive - 오션테크/Downloads/${f}.nwc`);
  const p = parseNwc(buf);
  for (const s of p.staves) {
    console.log(`  ${s.name.padEnd(12)} clef=${s.clef.padEnd(8)} octaveShift=${s.octaveShift}`);
  }
}
