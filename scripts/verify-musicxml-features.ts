// 외부 MusicXML 기능 검증: 못갖춘마디(pickup), 한 보표 2성부(backup), 화음(chord),
// treble-8(clef-octave-change), 가사, .mxl 자동 판별.
// 실행: npx tsx scripts/verify-musicxml-features.ts [path-to-mxl]
import { readFileSync } from "fs";
import { parseMusicXml } from "../src/lib/musicxml/parse-musicxml";
import { parseScoreFile } from "../src/lib/parse-score";
import { buildMidi } from "../src/lib/nwc/to-midi";
import { buildMusicXml } from "../src/lib/nwc/to-musicxml";
import { XML_DIVISIONS } from "../src/lib/nwc/parser";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Feature Test</work-title></work>
  <identification><creator type="composer">Tester</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Soprano</part-name></score-part>
    <score-part id="P2"><part-name>Men</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type>
        <sound tempo="90"/>
      </direction>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><type>quarter</type>
        <lyric number="1"><syllabic>single</syllabic><text>Oh</text></lyric>
      </note>
    </measure>
    <measure number="1">
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>8</duration><voice>1</voice><type>half</type>
        <tie type="start"/><notations><tied type="start"/></notations>
        <lyric number="1"><syllabic>begin</syllabic><text>sing</text></lyric>
      </note>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>5</octave></pitch>
        <duration>8</duration><voice>1</voice><type>half</type><chord-placeholder/>
      </note>
      <note><chord/><pitch><step>A</step><octave>5</octave></pitch>
        <duration>8</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>16</duration><voice>1</voice><type>whole</type>
        <tie type="stop"/><notations><tied type="stop"/><fermata/></notations>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>
      </attributes>
      <note><rest/><duration>2</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="1">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>whole</type>
      </note>
      <backup><duration>8</duration></backup>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>4</duration><voice>2</voice><type>half</type>
      </note>
      <note><rest/><duration>4</duration><voice>2</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>whole</type>
      </note>
      <backup><duration>8</duration></backup>
      <note>
        <pitch><step>G</step><octave>2</octave></pitch>
        <duration>8</duration><voice>2</voice><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

function main() {
  const parsed = parseMusicXml(Buffer.from(XML, "utf8"));

  check("메타", parsed.songTitle === "Feature Test" && parsed.composer === "Tester" && parsed.tempo === 90 && parsed.fifths === 2,
    JSON.stringify({ t: parsed.songTitle, c: parsed.composer, bpm: parsed.tempo, f: parsed.fifths }));

  check("레인 분리 (Sop + Men×2성부 = 3 staves)", parsed.staves.length === 3,
    `staves=${parsed.staves.map((s) => s.name).join(",")}`);

  const sop = parsed.staves[0];
  const men1 = parsed.staves[1];
  const men2 = parsed.staves[2];

  check("전 staff 마디 수 일치 (3)", parsed.staves.every((s) => s.measures.length === 3),
    parsed.staves.map((s) => s.measures.length).join(","));

  // 못갖춘마디: 1박 내용 → 3박 앞쪽 쉼표 패딩 + 노트가 마지막에
  const m1 = sop.measures[0].notes;
  const m1Rests = m1.filter((x) => x.type === "rest");
  const m1Notes = m1.filter((x) => x.type === "note");
  const restDur = m1Rests.reduce((s, r) => s + r.durDivisions, 0);
  check("픽업 마디 앞쪽 패딩 (3박 쉼표 + 마지막 4분음표)",
    m1Notes.length === 1 && restDur === XML_DIVISIONS * 3 && m1[m1.length - 1].type === "note",
    JSON.stringify({ rests: restDur, notes: m1Notes.length, last: m1[m1.length - 1]?.type }));

  // 화음
  const m2Notes = sop.measures[1].notes.filter((x) => x.type === "note");
  check("화음 병합 (2번째 노트 pitches=2)",
    m2Notes.length === 2 && (m2Notes[1] as { pitches: unknown[] }).pitches.length === 2,
    JSON.stringify(m2Notes.map((x) => (x as { pitches: unknown[] }).pitches.length)));

  // 타이 + 페르마타
  const sopLast = sop.measures[2].notes.find((x) => x.type === "note") as { fermata?: boolean } | undefined;
  const sopTieStart = m2Notes[0] as { tied: boolean };
  check("타이 시작 + 페르마타", sopTieStart.tied === true && sopLast?.fermata === true);

  // 가사
  const sopWithLyric = sop.measures.flatMap((m) => m.notes).filter((x) => x.type === "note" && (x as { lyric?: unknown }).lyric);
  check("가사 매핑 (2개)", sopWithLyric.length === 2, `${sopWithLyric.length}`);

  // treble-8: sounding C4 → written C5, octaveShift -1
  const men1Note = men1.measures[1].notes.find((x) => x.type === "note") as { pitches: { step: string; octave: number }[] };
  check("treble-8 sounding→written 보정 (C4→written C5, shift -1)",
    men1.octaveShift === -1 && men1Note.pitches[0].step === "C" && men1Note.pitches[0].octave === 5,
    JSON.stringify({ shift: men1.octaveShift, p: men1Note.pitches[0] }));

  // 2성부: voice2 는 half + rest half
  const men2M1 = men2.measures[1].notes;
  const men2Note = men2M1.find((x) => x.type === "note") as { durDivisions: number };
  check("backup 2성부 분리 (voice2 half + 쉼표 패딩)",
    men2Note?.durDivisions === XML_DIVISIONS * 2 &&
    men2M1.reduce((s, x) => s + x.durDivisions, 0) === XML_DIVISIONS * 4,
    JSON.stringify(men2M1.map((x) => `${x.type}:${x.durDivisions}`)));

  // divisions 가 파트마다 달라도 (4 vs 2) 우리 단위로 정규화되는지
  const men1Whole = men1.measures[2].notes.find((x) => x.type === "note") as { durDivisions: number };
  check("파트별 divisions 정규화 (whole=384)", men1Whole?.durDivisions === XML_DIVISIONS * 4, `${men1Whole?.durDivisions}`);

  // MIDI/MusicXML 재생성
  const midi = buildMidi(parsed);
  const xml2 = buildMusicXml(parsed);
  check("MIDI 빌드 (>100B)", midi.length > 100, `${midi.length}B`);
  check("MusicXML 재생성 (<score-partwise 포함)", xml2.includes("<score-partwise"));

  // .mxl / 확장자 판별 (인자로 mxl 경로가 주어지면)
  const mxlPath = process.argv[2];
  if (mxlPath) {
    const mxlBuf = readFileSync(mxlPath);
    const { parsed: fromMxl, format } = parseScoreFile(mxlBuf, mxlPath);
    check(".mxl 판별 + 파싱", format === "musicxml" && fromMxl.staves.length === 3,
      JSON.stringify({ format, staves: fromMxl.staves.length }));
  }

  console.log(failures === 0 ? "\n전체 통과" : `\n실패 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
