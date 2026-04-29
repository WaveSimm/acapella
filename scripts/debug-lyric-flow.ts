import { readFileSync } from "fs";
import { inflateSync } from "zlib";
import { parseNwc } from "../src/lib/nwc/parser";

const path = process.argv[2];
const targetStaff = process.argv[3];
const buf = readFileSync(path);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

let curStaff = "";
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    const m = l.match(/Name:"([^"]+)/);
    curStaff = m ? m[1] : "?";
  }
  if (curStaff === targetStaff && l.startsWith("|Lyric1|")) {
    const txt = l.replace(/^\|Lyric1\|Text:"/, "").replace(/"$/, "");
    const verses = txt.split(/\\n+/).filter((v) => v.trim().length > 0);
    console.log(`Staff "${targetStaff}" — ${verses.length} verse-lines (split by \\n+):`);
    for (let i = 0; i < verses.length; i++) {
      const v = verses[i].slice(0, 100);
      console.log(`  V${i+1}: "${v}${verses[i].length > 100 ? '...' : ''}"`);
    }
    // total tokens (after dash-as-extension fix)
    const parsed = parseNwc(buf);
    const staff = parsed.staves.find((s) => s.name === targetStaff);
    if (!staff) break;
    let tot = 0, withLy = 0, melisma = 0;
    let prevShares = false;
    for (const m of staff.measures) for (const n of m.notes) {
      if (n.type !== "note" || n.isGrace) continue;
      tot++;
      if (n.lyric) withLy++;
      if (prevShares) melisma++;
      prevShares = n.slur || n.tied;
    }
    console.log(`\nNotes: ${tot}, melisma-skip: ${melisma}, expected lyric: ${tot - melisma}, actual lyric: ${withLy}, gap: ${tot - melisma - withLy}`);
    break;
  }
}
