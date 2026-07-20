// 라운드트립 검증: DB의 NWC → (기존) buildMusicXml → (신규) parseMusicXml → 비교.
// 실행: npx tsx --env-file=.env.local scripts/verify-musicxml-roundtrip.ts
import { PrismaClient } from "@prisma/client";
import { parseNwc } from "../src/lib/nwc/parser";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";
import { buildMidi } from "../src/lib/nwc/to-midi";
import { parseMusicXml } from "../src/lib/musicxml/parse-musicxml";

const prisma = new PrismaClient();

async function main() {
  const songs = await prisma.song.findMany({
    where: { nwcFileId: { not: null } },
    select: { id: true, titleKo: true, nwcFile: { select: { fileName: true, data: true } } },
  });
  console.log(`NWC 보유 곡: ${songs.length}개`);
  let ok = 0, fail = 0;

  for (const song of songs) {
    if (!song.nwcFile) continue;
    const label = `${song.titleKo} (${song.nwcFile.fileName})`;
    try {
      const nwcParsed = parseNwc(Buffer.from(song.nwcFile.data));
      const xml = buildMusicXml(nwcParsed);
      const xmlParsed = parseMusicXml(Buffer.from(xml, "utf8"));

      const issues: string[] = [];
      if (xmlParsed.staves.length !== nwcParsed.staves.length) {
        issues.push(`staff 수 ${nwcParsed.staves.length} → ${xmlParsed.staves.length}`);
      }
      if (xmlParsed.timeSig !== nwcParsed.timeSig) issues.push(`timeSig ${nwcParsed.timeSig} → ${xmlParsed.timeSig}`);
      if (xmlParsed.fifths !== nwcParsed.fifths) issues.push(`fifths ${nwcParsed.fifths} → ${xmlParsed.fifths}`);
      if (xmlParsed.tempo !== nwcParsed.tempo) issues.push(`tempo ${nwcParsed.tempo} → ${xmlParsed.tempo}`);

      const n = Math.min(nwcParsed.staves.length, xmlParsed.staves.length);
      for (let i = 0; i < n; i++) {
        const a = nwcParsed.staves[i];
        const b = xmlParsed.staves[i];
        // 노트(음표) 수 비교 — 쉼표는 패딩 정규화로 달라질 수 있어 제외
        const notesA = a.measures.flatMap((m) => m.notes).filter((x) => x.type === "note");
        const notesB = b.measures.flatMap((m) => m.notes).filter((x) => x.type === "note");
        if (notesA.length !== notesB.length) {
          issues.push(`[${a.name}] 음표 수 ${notesA.length} → ${notesB.length}`);
        } else {
          for (let k = 0; k < notesA.length; k++) {
            const na = notesA[k] as { pitches: { step: string; octave: number; alter: number }[]; durDivisions: number };
            const nb = notesB[k] as { pitches: { step: string; octave: number; alter: number }[]; durDivisions: number };
            const pa = na.pitches.map((p) => `${p.step}${p.alter}${p.octave}`).sort().join(",");
            const pb = nb.pitches.map((p) => `${p.step}${p.alter}${p.octave}`).sort().join(",");
            if (pa !== pb) { issues.push(`[${a.name}] note#${k} pitch ${pa} → ${pb}`); break; }
            if (na.durDivisions !== nb.durDivisions) { issues.push(`[${a.name}] note#${k} dur ${na.durDivisions} → ${nb.durDivisions}`); break; }
          }
        }
        if (a.octaveShift !== b.octaveShift) issues.push(`[${a.name}] octaveShift ${a.octaveShift} → ${b.octaveShift}`);
        const lyrA = notesA.filter((x) => (x as { lyric?: unknown }).lyric).length;
        const lyrB = notesB.filter((x) => (x as { lyric?: unknown }).lyric).length;
        if (lyrA !== lyrB) issues.push(`[${a.name}] 가사 수 ${lyrA} → ${lyrB}`);
      }

      const midiA = buildMidi(nwcParsed);
      const midiB = buildMidi(xmlParsed);
      const sizeRatio = midiB.length / midiA.length;
      if (sizeRatio < 0.8 || sizeRatio > 1.25) issues.push(`MIDI 크기 편차 ${midiA.length}B → ${midiB.length}B`);

      buildMusicXml(xmlParsed); // 재생성도 성공해야 함

      if (issues.length === 0) {
        ok++;
        console.log(`OK   ${label}`);
      } else {
        fail++;
        console.log(`DIFF ${label}`);
        for (const is of issues.slice(0, 5)) console.log(`     - ${is}`);
      }
    } catch (e) {
      fail++;
      console.log(`ERR  ${label}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n결과: OK ${ok} / DIFF·ERR ${fail}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
