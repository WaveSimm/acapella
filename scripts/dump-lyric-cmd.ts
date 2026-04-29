import { readFileSync } from "fs";
import { inflateSync } from "zlib";

const buf = readFileSync(process.argv[2]);
const head = buf.slice(0, 32).toString("latin1");
const text = head.startsWith("[NWZ]") ? inflateSync(buf.slice(6)).toString("latin1") : buf.toString("latin1");
const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|"));

// Lyrics command (verse settings)
const lyricsCmds = lines.filter((l) => l.startsWith("|Lyrics|"));
console.log(`|Lyrics| commands (${lyricsCmds.length}):`);
for (const l of lyricsCmds) console.log("  " + l);

// Lyric2 ~ Lyric9 ?
console.log("\n|LyricN| variants per staff:");
let curStaff = "";
for (const l of lines) {
  if (l.startsWith("|AddStaff")) {
    const m = l.match(/Name:"([^"]+)/);
    curStaff = m ? m[1] : "?";
  }
  if (/^\|Lyric\d+\|/.test(l)) {
    const m = l.match(/^\|(Lyric\d+)\|/);
    console.log(`  staff="${curStaff}" ${m![1]} text-len=${l.length - m![0].length}`);
  }
}
