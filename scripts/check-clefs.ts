import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const files = ["This_is_Me", "pure_imagination_무합수정", "Why_we_Sing_acapella", "Dont_you_worry_bout_a_thing"];
for (const f of files) {
  console.log(`=== ${f} ===`);
  const buf = readFileSync(f.startsWith("Dont") ? `scripts/_out/dont-you-worry.nwc` : `D:/Users/wave/OneDrive - 오션테크/Downloads/${f}.nwc`);
  const head = buf.slice(0, 32).toString("latin1");
  const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
  const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));
  let staff = "";
  for (const l of lines) {
    if (l.startsWith("|AddStaff")) {
      const m = l.match(/Name:"([^"]+)/);
      staff = m ? m[1] : "?";
    } else if (l.startsWith("|Clef|")) {
      const t = l.match(/Type:(\w+)/);
      const o = l.match(/OctaveShift:([^|]+)/);
      console.log(`  ${staff.padEnd(12)} Clef=${t ? t[1] : "?"}${o ? ` OctaveShift=${o[1]}` : ""}`);
    }
  }
}
