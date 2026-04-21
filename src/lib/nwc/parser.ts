// NWC V2.75 파서 - pipe-delimited 커맨드를 AST로 변환
import { inflateSync } from "zlib";

// NWC는 편집 환경에 따라 한글을 UTF-8 또는 CP949(EUC-KR) 로 저장한다.
// 파서는 latin1으로 바이트를 보존하고, quoted 텍스트 필드에 한해 아래 함수로 디코딩.
// UTF-8로 먼저 시도 (유효하면 그대로), 실패 시 CP949 fallback. ASCII는 short circuit.
const EUCKR = new TextDecoder("euc-kr");
const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true });
function decodeKorean(latin1: string): string {
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
    return UTF8_STRICT.decode(bytes);
  } catch {
    try {
      return EUCKR.decode(bytes);
    } catch {
      return latin1;
    }
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
  slur: boolean; // 다음 노트와 syllable 공유 (멜리스마)
  slurEvent?: "start" | "stop"; // MusicXML <slur> 태그용
  tripletMark?: "first" | "middle" | "end"; // 3연음 경계 표시
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

export interface KeyChange {
  measureNumber: number; // 변경이 적용될 마디 번호 (1-based)
  fifths: number;
}

export interface Staff {
  name: string;
  label: string;
  partId: string;
  channel: number;
  patch: number;
  volume: number;
  clef: string;
  keySig: Record<string, number>;  // 현재(pitch 계산용) - 중간 전조로 갱신됨
  fifths: number;                  // 초기 조성 (MusicXML 첫 마디 표시용) - 한 번만 설정
  timeSig: string;
  octaveShift: number;
  measures: Measure[];
  keyChanges: KeyChange[];         // mid-score 조성 변화
  lyricRaw?: string;
  hidden?: boolean;
  _initialKeySet?: boolean;
}

function normalizeTimeSig(sig: string): string {
  if (sig === "AllaBreve") return "2/2";
  if (sig === "Common") return "4/4";
  return sig;
}

// NWC Tempo: "Base:Half|Tempo:63" 이면 half note = 63 BPM → quarter-note BPM = 126
function resolveTempo(base: string | undefined, tempo: number): number {
  const mult: Record<string, number> = {
    Whole: 4,
    Half: 2,
    "4th": 1,
    Quarter: 1,
    "8th": 0.5,
    "16th": 0.25,
    "Dotted Whole": 6,
    "Dotted Half": 3,
    "Dotted 4th": 1.5,
    "Dotted 8th": 0.75,
  };
  const m = mult[base ?? "4th"] ?? 1;
  return tempo * m;
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
  tied: boolean;
}

/**
 * NWC Pos 표기법:
 *   [accidental]<number>[tie]
 *   accidental (접두): # (sharp), b (flat), n (natural), x (double sharp), v (double flat)
 *   tie (접미): ^ = 다음 노트와 tied (같은 pitch 연결)
 * 예: "#-3" = F# (pos -3, sharp), "-3^" = pos -3, tied to next
 */
function parsePos(posStr: string): ParsedPos | null {
  const m = posStr.match(/^([#bnxv]{1,2})?(-?\d+)(\^)?$/);
  if (!m) return null;
  const prefix = m[1] || "";
  const pos = parseInt(m[2], 10);
  const tied = m[3] === "^";
  let alter: number | null = null;
  if (prefix === "#") alter = 1;
  else if (prefix === "b") alter = -1;
  else if (prefix === "n") alter = 0;
  else if (prefix === "x") alter = 2;
  else if (prefix === "bb" || prefix === "v") alter = -2;
  return { pos, alter, tied };
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
  let slur = false;
  let tripletMark: "first" | "middle" | "end" | null = null;
  const applyTriplet = () => {
    midiTicks = Math.floor(midiTicks * 2 / 3);
    divisions = Math.floor(divisions * 2 / 3);
  };
  for (const opt of tokens.slice(1)) {
    if (opt === "Dotted") {
      midiTicks = Math.floor(midiTicks * 1.5);
      divisions = Math.floor(divisions * 1.5);
      dots = 1;
    } else if (opt === "DblDotted") {
      midiTicks = Math.floor(midiTicks * 1.75);
      divisions = Math.floor(divisions * 1.75);
      dots = 2;
    } else if (opt === "Triplet=First") {
      applyTriplet();
      tripletMark = "first";
    } else if (opt === "Triplet=End") {
      applyTriplet();
      tripletMark = "end";
    } else if (opt === "Triplet") {
      applyTriplet();
      tripletMark = "middle";
    } else if (opt === "Tied") {
      tied = true;
    } else if (opt === "Slur") {
      slur = true;
    }
  }
  return {
    durTicks: midiTicks,
    durDivisions: divisions,
    durType: DUR_XML_TYPE[base] || "quarter",
    dots,
    tied,
    slur,
    tripletMark,
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
 * NWC 파일을 파싱해 ParsedScore로 변환.
 * 지원 포맷:
 *   - NWZ binary (zlib 압축, [NWZ] 헤더): .nwc 파일
 *   - NWCtxt plain text (!NoteWorthyComposer 헤더): .nwctxt 파일
 * @param input Buffer 또는 이미 디코딩된 문자열
 */
export function parseNwc(input: Buffer | string): ParsedScore {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    const head = input.toString("ascii", 0, Math.min(32, input.length));
    if (head.startsWith("[NWZ]")) {
      // Binary NWZ: zlib 해제 후 latin1 (바이트 보존)
      text = inflateSync(input.slice(6)).toString("latin1");
    } else if (head.startsWith("!NoteWorthyComposer")) {
      // NWCtxt plain text: latin1로 바이트 보존. 한글 필드는 decodeKorean이 UTF-8/CP949 자동 판별.
      // (전체를 UTF-8로 미리 decode하면 한글 바이트 시퀀스가 먼저 unicode chars로 변환되어
      // decodeKorean이 이중 decode를 시도하면서 \uFFFD 로 깨진다.)
      text = input.toString("latin1");
    } else {
      throw new Error("NWC V2 (NWZ) 또는 NWCtxt 형식이 아닙니다.");
    }
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
        const rawTempo = parseInt(p.Tempo, 10) || 120;
        score.tempo = Math.round(resolveTempo(p.Base, rawTempo));
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
        if (!current._initialKeySet) {
          current.fifths = parsed.fifths;
          current._initialKeySet = true;
        } else {
          // mid-score 조성 변화 — 현재 작성 중인 마디 번호 기록 (1-based)
          current.keyChanges.push({
            measureNumber: current.measures.length,
            fifths: parsed.fifths,
          });
        }
        current.keySig = parsed.ksMap;
      }
    } else if (cmd === "TimeSig") {
      const norm = normalizeTimeSig(p.Signature);
      if (!timeSigFound) {
        score.timeSig = norm;
        timeSigFound = true;
      }
      if (current) current.timeSig = norm;
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
        keyChanges: [],
      };
      score.staves.push(current);
      currentMeasure = { notes: [] };
      current.measures.push(currentMeasure);
    } else if (cmd === "StaffProperties" && current) {
      if (p.Channel) current.channel = parseInt(p.Channel, 10) || 1;
      if (p.Volume) current.volume = parseInt(p.Volume, 10) || 127;
      // 숨김 스태프는 나중에 필터링
      if (p.Visible === "N") current.hidden = true;
    } else if (cmd === "StaffInstrument" && current) {
      if (p.Patch !== undefined) current.patch = parseInt(p.Patch, 10) || 0;
      if (p.Trans) current.octaveShift = Math.round((parseInt(p.Trans, 10) || 0) / 12);
    } else if (cmd === "Clef" && current) {
      current.clef = p.Type || "Treble";
      // OctaveShift 적용 (초기 및 중간 변경 모두)
      // "Octave Down" → -1, "Octave Up" → +1
      if (p.OctaveShift === "Octave Down") current.octaveShift = -1;
      else if (p.OctaveShift === "Octave Up") current.octaveShift = 1;
      else if (p.OctaveShift === undefined) current.octaveShift = 0;
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
        tied: d.tied || pp.tied,
        slur: d.slur,
        tripletMark: d.tripletMark ?? undefined,
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
      const anyTied = pps.some((pp) => pp.tied);
      currentMeasure.notes.push({
        type: "note",
        pitches,
        durDivisions: d.durDivisions,
        durTicks: d.durTicks,
        durType: d.durType,
        dots: d.dots,
        tied: d.tied || anyTied,
        slur: d.slur,
        tripletMark: d.tripletMark ?? undefined,
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

  // slur 이벤트 계산: 연속된 Slur 플래그 구간을 첫 노트 start + 끝 노트 stop으로
  for (const staff of score.staves) {
    let inSlur = false;
    for (const m of staff.measures) {
      for (const n of m.notes) {
        if (n.type !== "note") continue;
        if (!inSlur && n.slur) {
          n.slurEvent = "start";
          inSlur = true;
        } else if (inSlur && !n.slur) {
          n.slurEvent = "stop";
          inSlur = false;
        }
        // 중간 노트 또는 밖 노트: 이벤트 없음
      }
    }
    // 남은 열린 슬러는 마지막 노트에 stop 붙여 닫기
    if (inSlur) {
      const allNotes = staff.measures.flatMap((m) => m.notes).filter((n) => n.type === "note");
      const last = allNotes[allNotes.length - 1];
      if (last && last.type === "note" && !last.slurEvent) last.slurEvent = "stop";
    }
  }

  // 숨김(Visible:N) 스태프 제외
  score.staves = score.staves.filter((s) => !s.hidden);
  // partId 재할당 (인덱스 기반)
  score.staves.forEach((s, i) => { s.partId = "P" + (i + 1); });

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
  let prevNoteSharesToNext = false; // 이전 노트의 slur/tied → 현재 노트는 이전과 같은 syllable (melisma)
  for (const m of staff.measures) {
    for (const n of m.notes) {
      if (n.type !== "note") continue;
      if (prevNoteSharesToNext) {
        // 현재 노트는 이전 syllable 유지. lyric 할당 없음.
        prevNoteSharesToNext = n.slur || n.tied;
        continue;
      }
      if (si >= syllables.length) return;
      const syl = syllables[si];
      if (syl.extension) {
        si++;
        prevNoteSharesToNext = n.slur || n.tied;
        continue;
      }
      let syllabic: LyricSyllable["syllabic"];
      if (prevContinuation && syl.continuation) syllabic = "middle";
      else if (prevContinuation && !syl.continuation) syllabic = "end";
      else if (!prevContinuation && syl.continuation) syllabic = "begin";
      else syllabic = "single";
      n.lyric = { text: syl.text, syllabic };
      prevContinuation = syl.continuation;
      prevNoteSharesToNext = n.slur || n.tied;
      si++;
    }
  }
}
