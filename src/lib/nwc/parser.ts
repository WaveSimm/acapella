// NWC V2.75 파서 - pipe-delimited 커맨드를 AST로 변환
import { inflateSync } from "zlib";

// NWC 파일은 한글을 CP949(EUC-KR)로 저장한다. 파서는 latin1으로 바이트를 보존한 뒤
// quoted 텍스트 필드에 한해 이 함수로 디코딩한다. ASCII는 그대로 통과, 한글은 복원.
const EUCKR = new TextDecoder("euc-kr");
function decodeKorean(latin1: string): string {
  // 모든 바이트가 ASCII 범위면 그대로 (디코딩 비용 생략)
  let asciiOnly = true;
  for (let i = 0; i < latin1.length; i++) {
    if (latin1.charCodeAt(i) > 0x7f) {
      asciiOnly = false;
      break;
    }
  }
  if (asciiOnly) return latin1;
  const bytes = Buffer.from(latin1, "latin1");
  try {
    return EUCKR.decode(bytes);
  } catch {
    return latin1;
  }
}

export interface Pitch {
  step: string;
  octave: number;
  alter: number;
  explicitAccidental: number | null;
}

export interface LyricSyllable {
  text: string;
  syllabic: "single" | "begin" | "middle" | "end";
}

export interface NoteItem {
  type: "note";
  pitches: Pitch[];
  durDivisions: number;
  durTicks: number;
  durType: string;
  dots: number;
  tied: boolean;
  lyric?: LyricSyllable;
}

export interface RestItem {
  type: "rest";
  durDivisions: number;
  durTicks: number;
  durType: string;
  dots: number;
}

export type MeasureItem = NoteItem | RestItem;

export interface Measure {
  notes: MeasureItem[];
}

export interface Staff {
  name: string;
  label: string;
  partId: string;
  channel: number;
  patch: number;
  volume: number;
  clef: string;
  keySig: Record<string, number>;
  fifths: number;
  timeSig: string;
  octaveShift: number;
  measures: Measure[];
  lyricRaw?: string; // 원본 Lyric1 텍스트
}

export interface ParsedScore {
  songTitle: string;
  composer: string;
  tempo: number;
  timeSig: string;
  fifths: number;
  keySig: Record<string, number>;
  staves: Staff[];
}

// 1 quarter = 128 MIDI ticks = 32 MusicXML divisions (8분할 = 64th note 단위)
export const MIDI_PPQ = 128;
export const XML_DIVISIONS = 32;

const NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];

const DUR_MIDI: Record<string, number> = {
  Whole: MIDI_PPQ * 4,
  Half: MIDI_PPQ * 2,
  Quarter: MIDI_PPQ,
  "8th": MIDI_PPQ / 2,
  "16th": MIDI_PPQ / 4,
  "32nd": MIDI_PPQ / 8,
  "64th": MIDI_PPQ / 16,
};

const DUR_DIV: Record<string, number> = {
  Whole: XML_DIVISIONS * 4,
  Half: XML_DIVISIONS * 2,
  Quarter: XML_DIVISIONS,
  "8th": XML_DIVISIONS / 2,
  "16th": XML_DIVISIONS / 4,
  "32nd": XML_DIVISIONS / 8,
  "64th": XML_DIVISIONS / 16,
};

const DUR_XML_TYPE: Record<string, string> = {
  Whole: "whole",
  Half: "half",
  Quarter: "quarter",
  "8th": "eighth",
  "16th": "16th",
  "32nd": "32nd",
  "64th": "64th",
};

export interface ClefCenter {
  step: number;
  octave: number;
}

export function clefCenter(clefType: string): ClefCenter {
  switch (clefType) {
    case "Bass":       return { step: 1, octave: 3 };
    case "Alto":       return { step: 0, octave: 4 };
    case "Tenor":      return { step: 5, octave: 3 };
    case "Percussion": return { step: 6, octave: 4 };
    case "Treble":
    default:           return { step: 6, octave: 4 };
  }
}

export function clefXml(clefType: string): { sign: string; line: number } {
  switch (clefType) {
    case "Bass":       return { sign: "F", line: 4 };
    case "Alto":       return { sign: "C", line: 3 };
    case "Tenor":      return { sign: "C", line: 4 };
    case "Percussion": return { sign: "percussion", line: 2 };
    case "Treble":
    default:           return { sign: "G", line: 2 };
  }
}

export function parseKeySig(sig: string): { ksMap: Record<string, number>; fifths: number } {
  const ksMap: Record<string, number> = {};
  let fifths = 0;
  if (!sig || sig === "N/A") return { ksMap, fifths };
  for (const tok of sig.split(",")) {
    const m = tok.match(/^([A-G])(b|#)?$/);
    if (m) {
      const alter = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
      ksMap[m[1]] = alter;
      fifths += alter;
    }
  }
  return { ksMap, fifths };
}

interface ParsedPos {
  pos: number;
  alter: number | null;
}

function parsePos(posStr: string): ParsedPos | null {
  const m = posStr.match(/^(-?\d+)([\^_vxb]{1,2})?$/);
  if (!m) return null;
  const pos = parseInt(m[1], 10);
  const acc = m[2] || "";
  let alter: number | null = null;
  if (acc === "^") alter = 1;
  else if (acc === "_") alter = -1;
  else if (acc === "v") alter = 0;
  else if (acc === "x") alter = 2;
  else if (acc === "bb") alter = -2;
  return { pos, alter };
}

function posToStepOctave(pos: number, center: ClefCenter, octaveShift: number) {
  const total = center.step + pos;
  const stepInOctave = ((total % 7) + 7) % 7;
  const octaveDelta = Math.floor(total / 7);
  return {
    step: NOTE_NAMES[stepInOctave],
    octave: center.octave + octaveDelta + octaveShift,
  };
}

function durToData(durStr: string) {
  const tokens = durStr.split(",");
  const base = tokens[0];
  let midiTicks = DUR_MIDI[base] ?? MIDI_PPQ;
  let divisions = DUR_DIV[base] ?? XML_DIVISIONS;
  let dots = 0;
  let tied = false;
  for (const opt of tokens.slice(1)) {
    if (opt === "Dotted") {
      midiTicks = Math.floor(midiTicks * 1.5);
      divisions = Math.floor(divisions * 1.5);
      dots = 1;
    } else if (opt === "DblDotted") {
      midiTicks = Math.floor(midiTicks * 1.75);
      divisions = Math.floor(divisions * 1.75);
      dots = 2;
    } else if (opt === "Triplet") {
      midiTicks = Math.floor(midiTicks * 2 / 3);
      divisions = Math.floor(divisions * 2 / 3);
    } else if (opt === "Tied") {
      tied = true;
    }
  }
  return {
    durTicks: midiTicks,
    durDivisions: divisions,
    durType: DUR_XML_TYPE[base] || "quarter",
    dots,
    tied,
  };
}

function parseCommand(line: string): { cmd: string; props: Record<string, string | true> } {
  const tokens: string[] = [];
  let i = 1;
  let buf = "";
  let inQuote = false;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    if (c === "|" && !inQuote) {
      tokens.push(buf);
      buf = "";
    } else {
      buf += c;
    }
    i++;
  }
  tokens.push(buf);
  const cmd = tokens[0];
  const props: Record<string, string | true> = {};
  for (const t of tokens.slice(1)) {
    const ci = t.indexOf(":");
    if (ci < 0) {
      props[t] = true;
      continue;
    }
    const k = t.slice(0, ci);
    let v = t.slice(ci + 1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    props[k] = v;
  }
  return { cmd, props };
}

/**
 * NWZ 압축 NWC 파일을 파싱해 ParsedScore로 변환.
 * @param input Buffer (NWZ) 또는 latin1 문자열 (이미 압축 해제된 텍스트)
 */
export function parseNwc(input: Buffer | string): ParsedScore {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    if (input.toString("ascii", 0, 5) !== "[NWZ]") {
      throw new Error("NWC V2 (NWZ) 형식이 아닙니다.");
    }
    text = inflateSync(input.slice(6)).toString("latin1");
  }

  const lines = text.split(/[\r\n]+/).filter((l) => l.startsWith("|")).map(parseCommand);

  const score: ParsedScore = {
    songTitle: "",
    composer: "",
    tempo: 120,
    timeSig: "4/4",
    fifths: 0,
    keySig: {},
    staves: [],
  };
  let tempoFound = false;
  let keySigFound = false;
  let timeSigFound = false;
  let current: Staff | null = null;
  let currentMeasure: Measure | null = null;

  for (const { cmd, props } of lines) {
    const p = props as Record<string, string>;
    if (cmd === "SongInfo") {
      score.songTitle = decodeKorean(p.Title || "");
      score.composer = decodeKorean(p.Author || "");
    } else if (cmd === "Tempo") {
      if (!tempoFound) {
        score.tempo = parseInt(p.Tempo, 10) || 120;
        tempoFound = true;
      }
    } else if (cmd === "Key") {
      const parsed = parseKeySig(p.Signature);
      if (!keySigFound) {
        score.keySig = parsed.ksMap;
        score.fifths = parsed.fifths;
        keySigFound = true;
      }
      if (current) {
        current.keySig = parsed.ksMap;
        current.fifths = parsed.fifths;
      }
    } else if (cmd === "TimeSig") {
      if (!timeSigFound) {
        score.timeSig = p.Signature;
        timeSigFound = true;
      }
      if (current) current.timeSig = p.Signature;
    } else if (cmd === "AddStaff") {
      current = {
        name: decodeKorean(p.Name || "Staff" + score.staves.length),
        label: decodeKorean(p.Label || p.Name || ""),
        partId: "P" + (score.staves.length + 1),
        channel: 1,
        patch: 0,
        volume: 127,
        clef: "Treble",
        keySig: { ...score.keySig },
        fifths: score.fifths,
        timeSig: score.timeSig,
        octaveShift: 0,
        measures: [],
      };
      score.staves.push(current);
      currentMeasure = { notes: [] };
      current.measures.push(currentMeasure);
    } else if (cmd === "StaffProperties" && current) {
      if (p.Channel) current.channel = parseInt(p.Channel, 10) || 1;
      if (p.Volume) current.volume = parseInt(p.Volume, 10) || 127;
    } else if (cmd === "StaffInstrument" && current) {
      if (p.Patch !== undefined) current.patch = parseInt(p.Patch, 10) || 0;
      if (p.Trans) current.octaveShift = Math.round((parseInt(p.Trans, 10) || 0) / 12);
    } else if (cmd === "Clef" && current) {
      current.clef = p.Type || "Treble";
    } else if (cmd === "Lyric1" && current && typeof p.Text === "string") {
      // 첫 번째 verse만 사용 (MVP). 여러 verse는 차후 number 속성으로.
      current.lyricRaw = decodeKorean(p.Text);
    } else if (cmd === "Bar" && current) {
      currentMeasure = { notes: [] };
      current.measures.push(currentMeasure);
    } else if (cmd === "Note" && current && currentMeasure) {
      const pp = parsePos(p.Pos);
      if (!pp) continue;
      const d = durToData(p.Dur);
      const so = posToStepOctave(pp.pos, clefCenter(current.clef), current.octaveShift);
      let alter = pp.alter;
      if (alter === null && current.keySig[so.step] !== undefined) alter = current.keySig[so.step];
      currentMeasure.notes.push({
        type: "note",
        pitches: [{ step: so.step, octave: so.octave, alter: alter ?? 0, explicitAccidental: pp.alter }],
        durDivisions: d.durDivisions,
        durTicks: d.durTicks,
        durType: d.durType,
        dots: d.dots,
        tied: d.tied,
      });
    } else if (cmd === "Chord" && current && currentMeasure) {
      const pps = (p.Pos || "").split(",").map(parsePos).filter((x): x is ParsedPos => !!x);
      if (pps.length === 0) continue;
      const d = durToData(p.Dur);
      const center = clefCenter(current.clef);
      const staff = current;
      const pitches: Pitch[] = pps.map((pp) => {
        const so = posToStepOctave(pp.pos, center, staff.octaveShift);
        let alter = pp.alter;
        if (alter === null && staff.keySig[so.step] !== undefined) alter = staff.keySig[so.step];
        return { step: so.step, octave: so.octave, alter: alter ?? 0, explicitAccidental: pp.alter };
      });
      currentMeasure.notes.push({
        type: "note",
        pitches,
        durDivisions: d.durDivisions,
        durTicks: d.durTicks,
        durType: d.durType,
        dots: d.dots,
        tied: d.tied,
      });
    } else if (cmd === "Rest" && current && currentMeasure) {
      const d = durToData(p.Dur);
      currentMeasure.notes.push({
        type: "rest",
        durDivisions: d.durDivisions,
        durTicks: d.durTicks,
        durType: d.durType,
        dots: d.dots,
      });
    }
  }

  // 각 스태프의 가사를 노트에 매핑 (파싱이 끝난 후)
  for (const staff of score.staves) {
    if (!staff.lyricRaw) continue;
    const syllables = tokenizeLyrics(staff.lyricRaw);
    assignLyricsToNotes(staff, syllables);
  }

  return score;
}

interface SyllableToken {
  text: string;
  continuation: boolean; // 다음 음절과 이어짐 (하이픈 뒤)
  extension: boolean;    // '_' 확장 마커 (melisma)
}

function tokenizeLyrics(raw: string): SyllableToken[] {
  // NWC 이스케이프: \' → '  ,  \\ → \  ,  \n 은 verse 구분자 (literal 2-char)
  // 긴 곡은 여러 verse가 \n 으로 구분되어 전체 멜로디를 커버한다. 모두 연결해 사용.
  const joined = raw.split("\\n").filter((v) => v.trim().length > 0).join(" ");
  const unescaped = joined.replace(/\\'/g, "'").replace(/\\"/g, '"');

  const tokens: SyllableToken[] = [];
  let buf = "";
  const flush = (continuation: boolean) => {
    if (buf.length > 0) {
      tokens.push({ text: buf, continuation, extension: false });
      buf = "";
    }
  };
  for (let i = 0; i < unescaped.length; i++) {
    const c = unescaped[i];
    if (c === " " || c === "\t") flush(false);
    else if (c === "-") flush(true);
    else if (c === "_") {
      flush(false);
      tokens.push({ text: "_", continuation: false, extension: true });
    } else {
      buf += c;
    }
  }
  flush(false);
  return tokens;
}

function assignLyricsToNotes(staff: Staff, syllables: SyllableToken[]) {
  let si = 0;
  let prevContinuation = false;
  for (const m of staff.measures) {
    for (const n of m.notes) {
      if (n.type !== "note") continue;
      if (si >= syllables.length) return;
      const syl = syllables[si];
      if (syl.extension) {
        // 확장: 이전 음절을 유지 (현재 노트에 가사 없음)
        si++;
        continue;
      }
      let syllabic: LyricSyllable["syllabic"];
      if (prevContinuation && syl.continuation) syllabic = "middle";
      else if (prevContinuation && !syl.continuation) syllabic = "end";
      else if (!prevContinuation && syl.continuation) syllabic = "begin";
      else syllabic = "single";
      n.lyric = { text: syl.text, syllabic };
      prevContinuation = syl.continuation;
      si++;
    }
  }
}
