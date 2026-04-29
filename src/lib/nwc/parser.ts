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
  extend?: boolean; // 다음 노트(들)로 멜리스마 연장 — MusicXML <extend/> emit
}

export type Articulation = "staccato" | "accent" | "tenuto" | "marcato" | "staccatissimo";

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
  isGrace?: boolean; // 장식음 — 악보에만 표시, MIDI 미출력, 마디 duration 미차지
  fermata?: boolean;                 // 페르마타 (NWC TempoVariance|Style:Fermata)
  fermataPause?: number;             // 페르마타 추가 지속 (NWC Pause 단위 — MIDI 길이 확장에 사용)
  articulations?: Articulation[];    // 스타카토/액센트/테뉴토 등
}

export interface RestItem {
  // NWC: |Rest|Dur:Whole 은 "마디 전체 쉼" 관습 (실제 4박 길이가 아님).
  // 6/8, 5/4 등에서도 Dur:Whole 로 표기하므로 시간표 기반 측정 길이로 확장.
  isMeasureRest?: boolean;
  type: "rest";
  durDivisions: number;
  durTicks: number;
  durType: string;
  dots: number;
}

export type MeasureItem = NoteItem | RestItem;

export interface Measure {
  notes: MeasureItem[];
  // Barline / repeat / volta ending 표기 (MusicXML <barline>, <ending> 출력용)
  startBarStyle?: string; // "MasterRepeatOpen" 등 — 마디 좌측 barline
  endBarStyle?: string;   // "Double" / "MasterRepeatClose" — 마디 우측 barline
  endingNumber?: number;  // volta 1번/2번 etc.
}

export interface KeyChange {
  measureNumber: number; // 변경이 적용될 마디 번호 (1-based)
  fifths: number;
}

export interface TimeSigChange {
  measureNumber: number; // 변경이 적용될 마디 번호 (1-based)
  sig: string;           // 정규화된 박자 (예: "6/8", "4/4")
}

export interface TempoChange {
  measureNumber: number; // 1-based
  noteOffset: number;    // 마디 시작부터 몇 번째 노트(0=첫 노트 위치) — 출력 단순화 위해 마디 시작에 배치
  bpm: number;           // 분당 4분음표 비트 수 (NWC base 변환 후)
}

export interface TextDirection {
  measureNumber: number; // 1-based
  text: string;          // 표시할 문구
  italic?: boolean;      // StaffItalic 여부
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
  timeSig: string;                 // 초기 박자 (한 번만 설정)
  octaveShift: number;
  measures: Measure[];
  keyChanges: KeyChange[];         // mid-score 조성 변화
  timeSigChanges: TimeSigChange[]; // mid-score 변박
  tempoChanges: TempoChange[];     // mid-score 템포 변화
  textDirections: TextDirection[]; // 무대 지시문 (예: "slow with rubato")
  lyricRaw?: string;
  hidden?: boolean;
  _initialKeySet?: boolean;
  _initialTimeSigSet?: boolean;
}

function normalizeTimeSig(sig: string): string {
  if (sig === "AllaBreve") return "2/2";
  if (sig === "Common") return "4/4";
  return sig;
}

// NWC Note/Chord 의 Opts 필드(콤마 구분)에서 articulation 추출.
// 예: "Stem=Down,Beam=First,Staccato" → ["staccato"]. 알 수 없는 토큰은 무시.
function applyArticulationsFromOpts(note: NoteItem, optsRaw: string | undefined | true): void {
  if (typeof optsRaw !== "string") return;
  const map: Record<string, Articulation> = {
    Staccato: "staccato",
    Staccatissimo: "staccatissimo",
    Accent: "accent",
    Tenuto: "tenuto",
    Marcato: "marcato",
  };
  const acc: Articulation[] = [];
  for (const tok of optsRaw.split(",")) {
    const t = tok.trim();
    if (map[t]) acc.push(map[t]);
  }
  if (acc.length > 0) note.articulations = acc;
}

// 노트 경계에서 깔끔히 분할 가능한 overflow 마디를 분할.
// 케이스: 작성자가 |Bar| 마커를 빠뜨려 한 마디에 두 마디분 노트가 들어간 경우.
// keyChanges/timeSigChanges 의 measureNumber 도 시프트.
function splitOverflowingMeasures(staff: Staff): void {
  // 1) 분할 전 각 마디의 effective time sig 미리 계산
  const sigs: string[] = [];
  let cur = staff.timeSig;
  for (let i = 0; i < staff.measures.length; i++) {
    const measureNum = i + 1;
    const tc = staff.timeSigChanges.find((c) => c.measureNumber === measureNum);
    if (tc) cur = tc.sig;
    sigs.push(cur);
  }

  // 2) 새 마디 배열 생성 + remap 테이블 (oldIdx → newStartMeasureNum 1-based)
  const newMeasures: Measure[] = [];
  const remap: number[] = [];

  for (let oldIdx = 0; oldIdx < staff.measures.length; oldIdx++) {
    remap[oldIdx] = newMeasures.length + 1;
    const m = staff.measures[oldIdx];
    const [n, d] = sigs[oldIdx].split("/").map(Number);
    if (!n || !d) {
      newMeasures.push(m);
      continue;
    }
    const measureDur = Math.round(XML_DIVISIONS * 4 * n / d);

    // 장식음(grace)은 시간 차지 안 함 — 합산 대상 제외
    let total = 0;
    for (const note of m.notes) {
      if (note.type === "note" && note.isGrace) continue;
      total += note.durDivisions;
    }

    if (total <= measureDur) {
      newMeasures.push(m);
      continue;
    }

    // 3) 노트 경계에서 splits 시도 — 노트가 경계를 가로지르면 분할 불가 (원본 유지)
    const splits: MeasureItem[][] = [[]];
    let bucketDur = 0;
    let cleanSplit = true;
    for (const note of m.notes) {
      const dur = (note.type === "note" && note.isGrace) ? 0 : note.durDivisions;
      const remaining = measureDur - bucketDur;
      if (dur === 0 || dur <= remaining) {
        splits[splits.length - 1].push(note);
        bucketDur += dur;
        if (bucketDur === measureDur) {
          splits.push([]);
          bucketDur = 0;
        }
      } else {
        cleanSplit = false;
        break;
      }
    }
    if (!cleanSplit) {
      newMeasures.push(m);
      continue;
    }
    // 마지막 빈 버킷 정리
    if (splits[splits.length - 1].length === 0) splits.pop();
    if (splits.length === 1) {
      newMeasures.push(m);
      continue;
    }
    // bar style / ending 전파: 첫 분할에 startBarStyle, 마지막 분할에 endBarStyle, 모든 분할에 endingNumber
    splits.forEach((bucket, idx) => {
      const sub: Measure = { notes: bucket };
      if (idx === 0 && m.startBarStyle) sub.startBarStyle = m.startBarStyle;
      if (idx === splits.length - 1 && m.endBarStyle) sub.endBarStyle = m.endBarStyle;
      if (m.endingNumber) sub.endingNumber = m.endingNumber;
      newMeasures.push(sub);
    });
  }

  // 4) keyChanges / timeSigChanges / tempoChanges / textDirections measureNumber 재맵핑
  staff.measures = newMeasures;
  staff.keyChanges = staff.keyChanges.map((kc) => ({
    ...kc,
    measureNumber: remap[kc.measureNumber - 1] ?? kc.measureNumber,
  }));
  staff.timeSigChanges = staff.timeSigChanges.map((tc) => ({
    ...tc,
    measureNumber: remap[tc.measureNumber - 1] ?? tc.measureNumber,
  }));
  staff.tempoChanges = staff.tempoChanges.map((tc) => ({
    ...tc,
    measureNumber: remap[tc.measureNumber - 1] ?? tc.measureNumber,
  }));
  staff.textDirections = staff.textDirections.map((td) => ({
    ...td,
    measureNumber: remap[td.measureNumber - 1] ?? td.measureNumber,
  }));
}

// 현재 작성 중인 마디의 effective time signature 계산.
// staff.measures.length 가 1-based 현재 마디 번호와 같음 (AddStaff 시 빈 마디 1개 push 후 시작).
function effectiveTimeSig(staff: { timeSig: string; timeSigChanges: { measureNumber: number; sig: string }[]; measures: { notes: unknown[] }[] }): { num: number; den: number } {
  let sig = staff.timeSig;
  const curMeasureNum = staff.measures.length;
  for (const tc of staff.timeSigChanges) {
    if (tc.measureNumber <= curMeasureNum) sig = tc.sig;
  }
  const [n, d] = sig.split("/").map(Number);
  return { num: n || 4, den: d || 4 };
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

// 주의: octaveShift 는 여기서 적용하지 않음 (visual=written 픽치 유지).
// MIDI 출력 시점에만 octaveShift * 12 를 더해 sounding 픽치 계산. MusicXML 은
// <clef-octave-change> 로 표현해 OSMD 가 written 위치에 그림 (treble-8 관행).
function posToStepOctave(pos: number, center: ClefCenter) {
  const total = center.step + pos;
  const stepInOctave = ((total % 7) + 7) % 7;
  const octaveDelta = Math.floor(total / 7);
  return {
    step: NOTE_NAMES[stepInOctave],
    octave: center.octave + octaveDelta,
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
  let isGrace = false;
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
    } else if (opt === "Grace") {
      isGrace = true;
    }
  }
  // 장식음은 마디 시간/MIDI 에서 제외
  if (isGrace) {
    midiTicks = 0;
    divisions = 0;
  }
  return {
    durTicks: midiTicks,
    durDivisions: divisions,
    durType: DUR_XML_TYPE[base] || "quarter",
    dots,
    tied,
    slur,
    isGrace,
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
  // 페르마타 with Placement:AtNextNote → 다음 노트가 들어올 때 적용
  let pendingFermata: { pause: number } | null = null;
  // Bar Style 이 MasterRepeatOpen 이면 다음 마디의 startBarStyle 로 기록
  let pendingStartBarStyle: string | null = null;
  // |Ending| 명령은 다음 마디에 endingNumber 적용. 다음 Ending 또는 MasterRepeatClose 까지 유지.
  let pendingEndingNumber: number | null = null;

  for (const { cmd, props } of lines) {
    const p = props as Record<string, string>;
    if (cmd === "SongInfo") {
      score.songTitle = decodeKorean(p.Title || "");
      score.composer = decodeKorean(p.Author || "");
    } else if (cmd === "Tempo") {
      const rawTempo = parseInt(p.Tempo, 10) || 120;
      const bpm = Math.round(resolveTempo(p.Base, rawTempo));
      if (!tempoFound) {
        score.tempo = bpm;
        tempoFound = true;
      }
      if (current) {
        // 직전 효과 템포와 다를 때만 기록 (NWC 가 staff 헤더에 초기 템포 재선언하는 경우 dedup)
        const lastBpm = current.tempoChanges.length > 0
          ? current.tempoChanges[current.tempoChanges.length - 1].bpm
          : score.tempo;
        if (bpm !== lastBpm) {
          current.tempoChanges.push({
            measureNumber: current.measures.length,
            noteOffset: currentMeasure?.notes.length ?? 0,
            bpm,
          });
        }
      }
    } else if (cmd === "TempoVariance" && current && currentMeasure) {
      // 페르마타: NWC 관습상 디폴트가 "다음 노트" 에 적용 (Placement 없거나 AtNextNote).
      // BeforeNote 같은 명시적 placement 만 직전 노트에 적용.
      if (p.Style === "Fermata") {
        const pause = parseFloat(p.Pause as string) || 0;
        if (p.Placement === "BeforeNote") {
          // 직전 노트에 명시적 적용
          const last = [...currentMeasure.notes].reverse().find((n) => n.type === "note");
          if (last && last.type === "note") {
            last.fermata = true;
            last.fermataPause = pause;
          }
        } else {
          // 디폴트 / AtNextNote — 이후 첫 노트에 적용
          pendingFermata = { pause };
        }
      }
    } else if (cmd === "Text" && current) {
      const txt = decodeKorean(p.Text || "").replace(/^"|"$/g, "");
      if (txt) {
        current.textDirections.push({
          measureNumber: current.measures.length,
          text: txt,
          italic: typeof p.Font === "string" && /Italic/i.test(p.Font),
        });
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
      if (current) {
        if (!current._initialTimeSigSet) {
          current.timeSig = norm;
          current._initialTimeSigSet = true;
        } else {
          // mid-score 변박 — 직전 유효 박자와 다를 때만 기록 (NWC 가 같은 박자를
          // 섹션 경계마다 재선언하는 경우 무의미한 <time> 중복 출력 방지)
          const lastEffective = current.timeSigChanges.length > 0
            ? current.timeSigChanges[current.timeSigChanges.length - 1].sig
            : current.timeSig;
          if (norm !== lastEffective) {
            current.timeSigChanges.push({
              measureNumber: current.measures.length,
              sig: norm,
            });
          }
        }
      }
    } else if (cmd === "AddStaff") {
      // 이전 staff 의 pending 상태가 새 staff 로 leak 되지 않도록 리셋
      pendingFermata = null;
      pendingStartBarStyle = null;
      pendingEndingNumber = null;
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
        timeSigChanges: [],
        tempoChanges: [],
        textDirections: [],
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
      const style = typeof p.Style === "string" ? p.Style : undefined;
      // 끝 barStyle: 현재 마디 우측에 그려질 barline (현재 마디 닫히기 전 기록)
      if (currentMeasure && (style === "Double" || style === "MasterRepeatClose" || style === "SectionOpen" || style === "SectionClose" || style === "LocalRepeatClose")) {
        currentMeasure.endBarStyle = style;
      }
      // MasterRepeatClose 는 ending 종료도 함께
      if (style === "MasterRepeatClose") {
        pendingEndingNumber = null;
      }
      // 새 마디 생성
      currentMeasure = { notes: [] };
      current.measures.push(currentMeasure);
      // 시작 barStyle: 새 마디 좌측 barline
      if (style === "MasterRepeatOpen" || style === "LocalRepeatOpen") {
        currentMeasure.startBarStyle = style;
      }
      if (pendingStartBarStyle && !currentMeasure.startBarStyle) {
        currentMeasure.startBarStyle = pendingStartBarStyle;
        pendingStartBarStyle = null;
      }
      // 활성 ending 이 있으면 새 마디에도 적용
      if (pendingEndingNumber !== null) {
        currentMeasure.endingNumber = pendingEndingNumber;
      }
    } else if (cmd === "Ending" && current) {
      // |Ending|Endings:1 또는 Endings:1,2 — 첫 번째 숫자만 사용
      const raw = typeof p.Endings === "string" ? p.Endings : "";
      const num = parseInt(raw.split(",")[0], 10);
      if (!isNaN(num)) {
        pendingEndingNumber = num;
        // 현재 마디가 비어있으면 거기에 적용 (Ending 이 Bar 직후 등장하는 경우)
        if (currentMeasure && currentMeasure.notes.length === 0) {
          currentMeasure.endingNumber = num;
        }
      }
    } else if (cmd === "Note" && current && currentMeasure) {
      const pp = parsePos(p.Pos);
      if (!pp) continue;
      const d = durToData(p.Dur);
      const so = posToStepOctave(pp.pos, clefCenter(current.clef));
      let alter = pp.alter;
      if (alter === null && current.keySig[so.step] !== undefined) alter = current.keySig[so.step];
      const note: NoteItem = {
        type: "note",
        pitches: [{ step: so.step, octave: so.octave, alter: alter ?? 0, explicitAccidental: pp.alter }],
        durDivisions: d.durDivisions,
        durTicks: d.durTicks,
        durType: d.durType,
        dots: d.dots,
        tied: d.tied || pp.tied,
        slur: d.slur,
        isGrace: d.isGrace,
        tripletMark: d.tripletMark ?? undefined,
      };
      applyArticulationsFromOpts(note, p.Opts);
      if (pendingFermata && !note.isGrace) {
        note.fermata = true;
        note.fermataPause = pendingFermata.pause;
        pendingFermata = null;
      }
      currentMeasure.notes.push(note);
    } else if (cmd === "Chord" && current && currentMeasure) {
      const pps = (p.Pos || "").split(",").map(parsePos).filter((x): x is ParsedPos => !!x);
      if (pps.length === 0) continue;
      const d = durToData(p.Dur);
      const center = clefCenter(current.clef);
      const staff = current;
      const pitches: Pitch[] = pps.map((pp) => {
        const so = posToStepOctave(pp.pos, center);
        let alter = pp.alter;
        if (alter === null && staff.keySig[so.step] !== undefined) alter = staff.keySig[so.step];
        return { step: so.step, octave: so.octave, alter: alter ?? 0, explicitAccidental: pp.alter };
      });
      const anyTied = pps.some((pp) => pp.tied);
      const note: NoteItem = {
        type: "note",
        pitches,
        durDivisions: d.durDivisions,
        durTicks: d.durTicks,
        durType: d.durType,
        dots: d.dots,
        tied: d.tied || anyTied,
        slur: d.slur,
        isGrace: d.isGrace,
        tripletMark: d.tripletMark ?? undefined,
      };
      applyArticulationsFromOpts(note, p.Opts);
      if (pendingFermata && !note.isGrace) {
        note.fermata = true;
        note.fermataPause = pendingFermata.pause;
        pendingFermata = null;
      }
      currentMeasure.notes.push(note);
    } else if (cmd === "Rest" && current && currentMeasure) {
      const d = durToData(p.Dur);
      // NWC: |Rest|Dur:Whole 은 박자 무관 "마디 전체 쉼". 6/8, 5/4 등에서도 사용.
      // 실제 길이를 시간표 기반 마디 길이로 보정.
      if (p.Dur === "Whole") {
        const { num, den } = effectiveTimeSig(current);
        const measureDiv = Math.round(XML_DIVISIONS * 4 * num / den);
        const measureTicks = Math.round(MIDI_PPQ * 4 * num / den);
        currentMeasure.notes.push({
          type: "rest",
          durDivisions: measureDiv,
          durTicks: measureTicks,
          durType: "whole",
          dots: 0,
          isMeasureRest: true,
        });
      } else {
        currentMeasure.notes.push({
          type: "rest",
          durDivisions: d.durDivisions,
          durTicks: d.durTicks,
          durType: d.durType,
          dots: d.dots,
        });
      }
    }
  }

  // Bar 마커 누락으로 측정값을 초과한 마디 자동 분할 (예: NWC 작성자가 두 마디를 한 마디로 묶어 적은 경우).
  // 깔끔하게 노트 경계에서 분할 가능할 때만 수행하고, keyChanges/timeSigChanges measureNumber 도 같이 재배치.
  for (const staff of score.staves) {
    splitOverflowingMeasures(staff);
  }

  // 임시표 propagation:
  //  1) 마디 내 sticking — 같은 step×octave 에 명시적 임시표가 한 번 붙으면 마디 끝까지 유지
  //  2) 마디 경계 타이 inherit — `^` 로 묶인 노트는 다음 마디 첫 노트가 explicit accidental 없을 때 source 의 alter 를 상속
  for (const staff of score.staves) {
    let prev: NoteItem | null = null;
    for (const measure of staff.measures) {
      const sticky = new Map<string, number>(); // "step+octave" -> alter
      for (const n of measure.notes) {
        if (n.type !== "note") continue;
        if (n.isGrace) continue; // 장식음은 propagation 체인에 미참여
        for (const p of n.pitches) {
          const key = `${p.step}${p.octave}`;
          if (p.explicitAccidental !== null && p.explicitAccidental !== undefined) {
            // 명시적 임시표 — sticky 갱신
            sticky.set(key, p.explicitAccidental);
          } else if (sticky.has(key)) {
            // 같은 마디 내 sticky 적용
            p.alter = sticky.get(key)!;
          } else if (prev?.tied) {
            // 마디 경계 — 직전 노트가 타이였으면 같은 step+octave 픽치 alter 상속
            const src = prev.pitches.find((pp) => pp.step === p.step && pp.octave === p.octave);
            if (src) {
              p.alter = src.alter;
              sticky.set(key, src.alter); // 이후 같은 노트도 같이
            }
          }
        }
        prev = n;
      }
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
        if (n.isGrace) continue; // 장식음은 슬러 체인에 참여 안 함
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
    // 남은 열린 슬러는 마지막 noㅏ장식음 노트에 stop 붙여 닫기
    if (inSlur) {
      const allNotes = staff.measures.flatMap((m) => m.notes).filter((n) => n.type === "note" && !n.isGrace);
      const last = allNotes[allNotes.length - 1];
      if (last && last.type === "note" && !last.slurEvent) last.slurEvent = "stop";
    }
  }

  // 남자 파트(베이스/테너/바리톤) + Treble clef + OctaveShift 없음 → treble-8 자동 적용.
  // 합창 관행상 treble 위에 적힌 남자 파트는 한 옥타브 낮게 읽음. NWC 가 명시 안 했더라도 보정.
  for (const s of score.staves) {
    if (s.octaveShift !== 0) continue;
    if (s.clef !== "Treble") continue;
    const n = s.name.toLowerCase();
    const isMale = /\b(bass|tenor|baritone|bariton|ten|bar)\b/.test(n)
      || /베이스|테너|바리톤/.test(s.name);
    if (isMale) s.octaveShift = -1;
  }

  // 숨김 스태프의 score-wide 메타 (템포 변화) 를 첫 번째 visible staff 에 이전 — drop 전에.
  // 예: NWC 파일이 Vocal Percussion (hidden) staff 에 |Tempo| 모두 모아둔 경우.
  const firstVisible = score.staves.find((s) => !s.hidden);
  if (firstVisible) {
    for (const s of score.staves) {
      if (!s.hidden) continue;
      for (const tc of s.tempoChanges) firstVisible.tempoChanges.push(tc);
    }
    firstVisible.tempoChanges.sort((a, b) => a.measureNumber - b.measureNumber);
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
    else if (c === "-") {
      // 부착 대시 (예: "stand-in") → 음절 연결 표시 (continuation=true)
      // 독립 대시 (예: "out - - - -") → 앞 음절을 다음 음표로 연장 (extension)
      if (buf.length > 0) {
        flush(true);
      } else {
        tokens.push({ text: "-", continuation: false, extension: true });
      }
    }
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
  // 가사 공유 규칙:
  // - 붙임줄(tied, ^) / 이음줄(slur): 다음 노트는 가사 없이 멜리스마로 공유
  // - 장식음(grace): 가사 슬롯 차지 안 함, 체인에도 참여 안 함
  let prevSharesToNext = false;
  let lastLyricNote: NoteItem | null = null;
  for (const m of staff.measures) {
    for (const n of m.notes) {
      if (n.type !== "note") continue;
      if (n.isGrace) continue; // 장식음은 가사 분배에서 제외
      if (prevSharesToNext) {
        // 타이/슬러 연속 노트 — 가사 없음, 직전 lyric 노트에 extend 표시 (멜리스마 라인)
        if (lastLyricNote?.lyric) lastLyricNote.lyric.extend = true;
        prevSharesToNext = n.tied || n.slur;
        continue;
      }
      if (si >= syllables.length) return;
      const syl = syllables[si];
      if (syl.extension) {
        // 연장 마커(- 또는 _) — 현재 노트는 가사 없이 통과, 직전 lyric 노트에 extend 표시
        if (lastLyricNote?.lyric) lastLyricNote.lyric.extend = true;
        si++;
        prevSharesToNext = n.tied || n.slur;
        continue;
      }
      let syllabic: LyricSyllable["syllabic"];
      if (prevContinuation && syl.continuation) syllabic = "middle";
      else if (prevContinuation && !syl.continuation) syllabic = "end";
      else if (!prevContinuation && syl.continuation) syllabic = "begin";
      else syllabic = "single";
      n.lyric = { text: syl.text, syllabic };
      lastLyricNote = n;
      prevContinuation = syl.continuation;
      prevSharesToNext = n.tied || n.slur;
      si++;
    }
  }
}
