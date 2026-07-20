// MusicXML (score-partwise) → ParsedScore 파서.
// NWC 파서와 같은 내부 모델을 출력해 to-midi / to-musicxml 을 그대로 재사용한다.
// 지원: .musicxml / .xml (비압축), .mxl (ZIP 압축 컨테이너)
//
// 모델 제약에 따른 정규화:
//  - part 내 여러 voice/staff 는 각각 별도 Staff(레인)로 분리 (파트 믹서 대응)
//  - 못갖춘마디(pickup)는 NWC 경로와 동일하게 앞쪽 쉼표 패딩으로 정박 그리드에 맞춤
//    (to-midi / midi-time-map 이 균일 마디 길이를 가정하기 때문)
//  - backup/forward 로 생긴 시간 공백은 명시적 쉼표로 채움
import { XMLParser } from "fast-xml-parser";
import { inflateRawSync } from "zlib";
import type {
  ParsedScore,
  Staff,
  Measure,
  NoteItem,
  RestItem,
  Pitch,
  LyricSyllable,
  Articulation,
} from "../nwc/parser";
import { XML_DIVISIONS, MIDI_PPQ } from "../nwc/parser";

// ─── XML 노드 헬퍼 (fast-xml-parser preserveOrder 포맷) ───
// 요소: { tag: XNode[], ":@"?: attrs } / 텍스트: { "#text": string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XNode = Record<string, any>;

function tagName(n: XNode): string {
  for (const k of Object.keys(n)) {
    if (k !== ":@" && k !== "#text") return k;
  }
  return "";
}
function kidsOf(n: XNode): XNode[] {
  const t = tagName(n);
  return t && Array.isArray(n[t]) ? (n[t] as XNode[]) : [];
}
function childrenOf(n: XNode, name: string): XNode[] {
  return kidsOf(n).filter((c) => tagName(c) === name);
}
function childOf(n: XNode, name: string): XNode | undefined {
  return kidsOf(n).find((c) => tagName(c) === name);
}
function textOf(n: XNode | undefined): string {
  if (!n) return "";
  let out = "";
  for (const c of kidsOf(n)) {
    if ("#text" in c) out += String(c["#text"]);
  }
  return out.trim();
}
function childText(n: XNode | undefined, name: string): string {
  return n ? textOf(childOf(n, name)) : "";
}
function attrOf(n: XNode | undefined, name: string): string | undefined {
  const a = n?.[":@"];
  return a ? (a[name] !== undefined ? String(a[name]) : undefined) : undefined;
}

// ─── MXL (ZIP) 해제 ───
// 최소 ZIP 리더: End of Central Directory → central directory 순회 → 대상 파일 inflate.
// META-INF/container.xml 의 rootfile 을 우선, 없으면 META-INF 밖 첫 .xml/.musicxml.
function extractMxl(buf: Buffer): string {
  interface ZipEntry { name: string; method: number; compSize: number; localOffset: number }
  // EOCD 시그니처 0x06054b50 를 뒤에서부터 스캔 (comment 최대 64KB)
  let eocd = -1;
  const scanStart = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= scanStart; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("MXL(ZIP) 형식이 손상되었습니다 (EOCD 없음).");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }

  const readEntry = (e: ZipEntry): Buffer => {
    // local header 의 name/extra 길이는 central 과 다를 수 있어 재조회
    const lo = e.localOffset;
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error("MXL(ZIP) local header 불일치.");
    const nameLen = buf.readUInt16LE(lo + 26);
    const extraLen = buf.readUInt16LE(lo + 28);
    const dataStart = lo + 30 + nameLen + extraLen;
    const raw = buf.slice(dataStart, dataStart + e.compSize);
    if (e.method === 0) return raw;
    if (e.method === 8) return inflateRawSync(raw);
    throw new Error(`MXL(ZIP) 압축 방식 미지원 (method ${e.method}).`);
  };

  // container.xml 에서 rootfile 경로 찾기
  const container = entries.find((e) => e.name === "META-INF/container.xml");
  if (container) {
    const xml = readEntry(container).toString("utf8");
    const m = xml.match(/full-path\s*=\s*"([^"]+)"/);
    if (m) {
      const root = entries.find((e) => e.name === m[1]);
      if (root) return readEntry(root).toString("utf8");
    }
  }
  const first = entries.find(
    (e) => !e.name.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(e.name),
  );
  if (!first) throw new Error("MXL 안에서 MusicXML 파일을 찾지 못했습니다.");
  return readEntry(first).toString("utf8");
}

function bufferToXmlText(input: Buffer | string): string {
  if (typeof input === "string") return input;
  if (input.length > 4 && input[0] === 0x50 && input[1] === 0x4b) {
    return extractMxl(input); // "PK" — mxl zip
  }
  // BOM 판별 (일부 프로그램이 UTF-16 으로 저장)
  if (input[0] === 0xff && input[1] === 0xfe) return input.toString("utf16le");
  if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) return input.slice(3).toString("utf8");
  return input.toString("utf8");
}

// ─── 지속시간 헬퍼 ───
const TYPE_DIV: Array<{ type: string; div: number }> = [
  { type: "whole", div: XML_DIVISIONS * 4 },
  { type: "half", div: XML_DIVISIONS * 2 },
  { type: "quarter", div: XML_DIVISIONS },
  { type: "eighth", div: XML_DIVISIONS / 2 },
  { type: "16th", div: XML_DIVISIONS / 4 },
  { type: "32nd", div: XML_DIVISIONS / 8 },
  { type: "64th", div: XML_DIVISIONS / 16 },
];

function typeFromDivisions(div: number): string {
  // 근사 매칭 (점음표 포함 값도 가장 가까운 base type 선택)
  let best = TYPE_DIV[0];
  let bestDist = Infinity;
  for (const t of TYPE_DIV) {
    const d = Math.abs(t.div - div);
    if (d < bestDist) { best = t; bestDist = d; }
  }
  return best.type;
}

// 시간 공백(gap)을 쉼표 나열로 분해 — 큰 단위부터 탐욕적으로.
// 나머지가 최소 단위 미만이면 마지막 쉼표 하나로 묶어 타이밍 보존 (표기는 근사).
function restsForGap(gapDiv: number): RestItem[] {
  const out: RestItem[] = [];
  let remaining = gapDiv;
  for (const u of TYPE_DIV) {
    while (remaining >= u.div) {
      out.push({
        type: "rest",
        durDivisions: u.div,
        durTicks: u.div * 2, // MIDI_PPQ = XML_DIVISIONS × 2
        durType: u.type,
        dots: 0,
      });
      remaining -= u.div;
    }
  }
  if (remaining > 0) {
    out.push({
      type: "rest",
      durDivisions: remaining,
      durTicks: remaining * 2,
      durType: typeFromDivisions(remaining),
      dots: 0,
    });
  }
  return out;
}

function fifthsToKeySigMap(fifths: number): Record<string, number> {
  const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
  const FLATS = ["B", "E", "A", "D", "G", "C", "F"];
  const map: Record<string, number> = {};
  if (fifths > 0) for (let i = 0; i < Math.min(fifths, 7); i++) map[SHARPS[i]] = 1;
  if (fifths < 0) for (let i = 0; i < Math.min(-fifths, 7); i++) map[FLATS[i]] = -1;
  return map;
}

const ACCIDENTAL_MAP: Record<string, number> = {
  sharp: 1,
  flat: -1,
  natural: 0,
  "double-sharp": 2,
  "sharp-sharp": 2,
  "flat-flat": -2,
};

// 연습용 재생 음색 — NWC 곡들과 동일한 Electric Piano 1 로 통일 (GM program 5, 0-based 4)
const PRACTICE_PATCH = 4;

const ARTICULATION_MAP: Record<string, Articulation> = {
  staccato: "staccato",
  staccatissimo: "staccatissimo",
  accent: "accent",
  tenuto: "tenuto",
  "strong-accent": "marcato",
};

function clefFromXml(sign: string, line: number): string {
  if (sign === "F") return "Bass";
  if (sign === "C" && line === 3) return "Alto";
  if (sign === "C" && line === 4) return "Tenor";
  if (sign === "percussion") return "Percussion";
  return "Treble";
}

// ─── 레인 (part 내 staff×voice 조합) ───
interface LaneEvent {
  pos: number; // 마디 시작 기준 위치 (우리 divisions)
  item: NoteItem | RestItem;
}

interface Lane {
  key: string;       // "staffNum:voice"
  staffNum: number;
  order: number;     // 발견 순서
  staff: Staff;
  clefOct: number;   // clef-octave-change (treble-8 = -1) — sounding→written 픽치 보정용
  events: LaneEvent[];      // 현재 마디의 이벤트
  lastNote: NoteItem | null; // <chord/> 부착 대상
  inSlur: boolean;
}

export function parseMusicXml(input: Buffer | string): ParsedScore {
  const xmlText = bufferToXmlText(input);
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
  });
  let docNodes: XNode[];
  try {
    docNodes = parser.parse(xmlText) as XNode[];
  } catch {
    throw new Error("XML 파싱 실패 — 올바른 MusicXML 파일인지 확인해주세요.");
  }

  const rootPartwise = docNodes.find((n) => tagName(n) === "score-partwise");
  if (!rootPartwise) {
    if (docNodes.some((n) => tagName(n) === "score-timewise")) {
      throw new Error("score-timewise 형식은 지원하지 않습니다. score-partwise 로 내보내주세요.");
    }
    throw new Error("MusicXML(score-partwise) 형식이 아닙니다.");
  }

  const score: ParsedScore = {
    songTitle: "",
    composer: "",
    tempo: 120,
    timeSig: "4/4",
    fifths: 0,
    keySig: {},
    staves: [],
  };

  // 메타
  const work = childOf(rootPartwise, "work");
  score.songTitle = childText(work, "work-title") || childText(rootPartwise, "movement-title");
  const ident = childOf(rootPartwise, "identification");
  if (ident) {
    const composerNode = childrenOf(ident, "creator").find((c) => attrOf(c, "type") === "composer")
      ?? childOf(ident, "creator");
    score.composer = textOf(composerNode);
  }

  // part-list: id → 이름.
  // 원본의 <midi-instrument> (채널/프로그램) 는 의도적으로 무시 — 연습용 재생 음색을
  // NWC 곡들과 동일한 Electric Piano 로 통일 (Choir Aahs 등 지속음 샘플은
  // 마스터 게인 부스트와 겹치면 클리핑으로 틱틱거리고, 단음도 화성처럼 들림).
  // 채널은 파싱 완료 후 staff 순서대로 재배정 (10번 퍼커션 채널 회피).
  const partMeta = new Map<string, { name: string }>();
  const partList = childOf(rootPartwise, "part-list");
  if (partList) {
    for (const sp of childrenOf(partList, "score-part")) {
      const id = attrOf(sp, "id") ?? "";
      partMeta.set(id, { name: childText(sp, "part-name") });
    }
  }

  let scoreTempoFound = false;
  let scoreTimeSigFound = false;
  let scoreKeyFound = false;
  let globalFirstLane: Lane | null = null;

  // 변박은 스태프 전체가 공유해야 정렬이 맞음 (to-midi 가 staves[0] 기준으로 마디 tick 계산)
  const globalTsChanges: { measureNumber: number; sig: string }[] = [];

  const partNodes = childrenOf(rootPartwise, "part");
  if (partNodes.length === 0) throw new Error("MusicXML 에 part 가 없습니다.");

  for (let pi = 0; pi < partNodes.length; pi++) {
    const partNode = partNodes[pi];
    const partId = attrOf(partNode, "id") ?? `P${pi + 1}`;
    const meta = partMeta.get(partId) ?? { name: partId };

    // part 단위 상태
    let divisions = 1;
    let initialFifths = 0;
    let initialTimeSig = "4/4";
    let partTimeSigSet = false;
    let partKeySet = false;
    let curTsNum = 4;
    let curTsDen = 4;
    const clefByStaff = new Map<number, { clef: string; octaveShift: number }>();
    let transposeOctave = 0;

    const keyChanges: { measureNumber: number; fifths: number }[] = [];
    const tsChanges: { measureNumber: number; sig: string }[] = [];
    const tempoChanges: { measureNumber: number; noteOffset: number; bpm: number }[] = [];
    const textDirections: { measureNumber: number; text: string; italic?: boolean }[] = [];
    let lastTempo = -1;

    const lanes = new Map<string, Lane>();
    let laneOrder = 0;

    const getLane = (staffNum: number, voice: string, measureIdx: number): Lane => {
      const key = `${staffNum}:${voice}`;
      let lane = lanes.get(key);
      if (lane) return lane;
      const clefInfo = clefByStaff.get(staffNum) ?? clefByStaff.get(1) ?? { clef: "Treble", octaveShift: 0 };
      const staff: Staff = {
        name: meta.name || partId,
        label: meta.name || partId,
        partId: "P0", // parseNwc 와 동일하게 마지막에 재할당
        channel: 1,          // 파싱 완료 후 staff 순서대로 재배정
        patch: PRACTICE_PATCH,
        volume: 127,
        clef: clefInfo.clef,
        keySig: fifthsToKeySigMap(initialFifths),
        fifths: initialFifths,
        timeSig: initialTimeSig,
        octaveShift: clefInfo.octaveShift + transposeOctave,
        measures: [],
        keyChanges: [],
        timeSigChanges: [],
        tempoChanges: [],
        textDirections: [],
      };
      // 중간 마디에서 처음 등장한 레인은 앞 마디들을 빈 마디로 채움
      for (let i = 0; i < measureIdx; i++) staff.measures.push({ notes: [] });
      lane = { key, staffNum, order: laneOrder++, staff, clefOct: clefInfo.octaveShift, events: [], lastNote: null, inSlur: false };
      lanes.set(key, lane);
      return lane;
    };

    const toOur = (d: number) => Math.round((d * XML_DIVISIONS) / divisions);

    const measureNodes = childrenOf(partNode, "measure");
    for (let mi = 0; mi < measureNodes.length; mi++) {
      const measureNode = measureNodes[mi];
      const measureNumber = mi + 1; // 1-based (우리 모델 기준, XML number 속성과 무관)
      const isImplicit = attrOf(measureNode, "implicit") === "yes";

      let cursor = 0;      // XML divisions 단위, 마디 시작 기준
      let maxCursor = 0;
      let pendingStartBarStyle: string | null = null;
      let pendingEndBarStyle: string | null = null;
      let endingNumber: number | null = null;

      for (const el of kidsOf(measureNode)) {
        const tag = tagName(el);

        if (tag === "attributes") {
          const divText = childText(el, "divisions");
          if (divText) divisions = parseInt(divText, 10) || divisions;
          const keyNode = childOf(el, "key");
          if (keyNode) {
            const fifths = parseInt(childText(keyNode, "fifths"), 10) || 0;
            if (!partKeySet) {
              initialFifths = fifths;
              partKeySet = true;
              // 이미 만들어진 레인이 있으면 초기값 갱신 (보통 attributes 가 첫 노트보다 앞이라 없음)
              for (const l of lanes.values()) { l.staff.fifths = fifths; l.staff.keySig = fifthsToKeySigMap(fifths); }
              if (!scoreKeyFound) { score.fifths = fifths; score.keySig = fifthsToKeySigMap(fifths); scoreKeyFound = true; }
            } else {
              keyChanges.push({ measureNumber, fifths });
            }
          }
          const timeNode = childOf(el, "time");
          if (timeNode) {
            const beats = parseInt(childText(timeNode, "beats"), 10);
            const beatType = parseInt(childText(timeNode, "beat-type"), 10);
            if (beats && beatType) {
              const sig = `${beats}/${beatType}`;
              if (!partTimeSigSet) {
                initialTimeSig = sig;
                partTimeSigSet = true;
                curTsNum = beats; curTsDen = beatType;
                for (const l of lanes.values()) l.staff.timeSig = sig;
                if (!scoreTimeSigFound) { score.timeSig = sig; scoreTimeSigFound = true; }
              } else if (sig !== `${curTsNum}/${curTsDen}`) {
                tsChanges.push({ measureNumber, sig });
                if (pi === 0) globalTsChanges.push({ measureNumber, sig });
                curTsNum = beats; curTsDen = beatType;
              }
            }
          }
          for (const clefNode of childrenOf(el, "clef")) {
            const staffNum = parseInt(attrOf(clefNode, "number") ?? "1", 10) || 1;
            const sign = childText(clefNode, "sign");
            const line = parseInt(childText(clefNode, "line"), 10) || (sign === "F" ? 4 : 2);
            const octChange = parseInt(childText(clefNode, "clef-octave-change"), 10) || 0;
            const info = { clef: clefFromXml(sign, line), octaveShift: octChange };
            clefByStaff.set(staffNum, info);
            // 이미 존재하는 레인의 초기 clef 갱신은 첫 마디에서만 (중간 clef 변경은 모델 미지원 — 초기값 유지)
            if (mi === 0) {
              for (const l of lanes.values()) {
                if (l.staffNum === staffNum) {
                  l.staff.clef = info.clef;
                  l.staff.octaveShift = info.octaveShift + transposeOctave;
                  l.clefOct = info.octaveShift;
                }
              }
            }
          }
          const transposeNode = childOf(el, "transpose");
          if (transposeNode) {
            const oct = parseInt(childText(transposeNode, "octave-change"), 10) || 0;
            const chrom = parseInt(childText(transposeNode, "chromatic"), 10) || 0;
            transposeOctave = oct + Math.round(chrom / 12);
          }
        } else if (tag === "direction" || tag === "sound") {
          const soundNode = tag === "sound" ? el : childOf(el, "sound");
          const tempoAttr = attrOf(soundNode, "tempo");
          let bpm = tempoAttr ? Math.round(parseFloat(tempoAttr)) : 0;
          if (!bpm && tag === "direction") {
            // <metronome> per-minute fallback
            const dt = childrenOf(el, "direction-type");
            for (const d of dt) {
              const met = childOf(d, "metronome");
              if (met) {
                const pm = parseInt(childText(met, "per-minute"), 10);
                if (pm) bpm = pm;
              }
            }
          }
          if (bpm > 0) {
            if (!scoreTempoFound) {
              score.tempo = bpm;
              scoreTempoFound = true;
              lastTempo = bpm;
            } else if (bpm !== lastTempo) {
              tempoChanges.push({ measureNumber, noteOffset: 0, bpm });
              lastTempo = bpm;
            }
          }
          if (tag === "direction" && pi === 0) {
            for (const d of childrenOf(el, "direction-type")) {
              const wordsNode = childOf(d, "words");
              const words = textOf(wordsNode);
              if (words) {
                textDirections.push({
                  measureNumber,
                  text: words,
                  italic: /italic/i.test(attrOf(wordsNode, "font-style") ?? ""),
                });
              }
            }
          }
        } else if (tag === "backup") {
          cursor -= parseInt(childText(el, "duration"), 10) || 0;
          if (cursor < 0) cursor = 0;
        } else if (tag === "forward") {
          cursor += parseInt(childText(el, "duration"), 10) || 0;
          if (cursor > maxCursor) maxCursor = cursor;
        } else if (tag === "barline") {
          const location = attrOf(el, "location") ?? "right";
          const repeatDir = attrOf(childOf(el, "repeat"), "direction");
          const barStyle = childText(el, "bar-style");
          if (location === "left") {
            if (repeatDir === "forward") pendingStartBarStyle = "MasterRepeatOpen";
          } else {
            if (repeatDir === "backward") pendingEndBarStyle = "MasterRepeatClose";
            else if (barStyle === "light-light") pendingEndBarStyle = "Double";
            else if (barStyle === "light-heavy") pendingEndBarStyle = "SectionClose";
          }
          const endingNode = childOf(el, "ending");
          if (endingNode) {
            const type = attrOf(endingNode, "type");
            if (type === "start") {
              const num = parseInt((attrOf(endingNode, "number") ?? "").split(",")[0], 10);
              if (!isNaN(num)) endingNumber = num;
            }
          }
        } else if (tag === "note") {
          const isChord = !!childOf(el, "chord");
          const isGrace = !!childOf(el, "grace");
          const isCue = !!childOf(el, "cue");
          const restNode = childOf(el, "rest");
          const duration = parseInt(childText(el, "duration"), 10) || 0;
          const voice = childText(el, "voice") || "1";
          const staffNum = parseInt(childText(el, "staff"), 10) || 1;
          const lane = getLane(staffNum, voice, mi);

          const durDiv = isGrace ? 0 : toOur(duration);
          const durTicks = isGrace ? 0 : Math.round((duration * MIDI_PPQ) / divisions);
          const typeText = childText(el, "type");
          const durType = typeText || (restNode ? "whole" : typeFromDivisions(durDiv));
          const dots = childrenOf(el, "dot").length;

          // 셋잇단 마킹: time-modification 3:2 + tuplet start/stop
          const tmod = childOf(el, "time-modification");
          let tripletMark: NoteItem["tripletMark"];
          if (tmod && childText(tmod, "actual-notes") === "3" && childText(tmod, "normal-notes") === "2") {
            tripletMark = "middle";
            for (const notation of childrenOf(el, "notations")) {
              for (const tup of childrenOf(notation, "tuplet")) {
                const t = attrOf(tup, "type");
                if (t === "start") tripletMark = "first";
                else if (t === "stop") tripletMark = "end";
              }
            }
          }

          if (restNode || isCue) {
            // cue 노트는 소리 없이 시간만 차지 — 쉼표로 취급
            const isMeasureRest = attrOf(restNode, "measure") === "yes";
            const rest: RestItem = {
              type: "rest",
              durDivisions: durDiv,
              durTicks,
              durType: isMeasureRest ? "whole" : durType,
              dots,
              ...(isMeasureRest ? { isMeasureRest: true } : {}),
              ...(tripletMark ? { tripletMark } : {}),
            };
            lane.events.push({ pos: toOur(cursor), item: rest });
            lane.lastNote = null;
          } else {
            // (pitch 처리 — cursor 진행은 note 태그 말미에서 일괄)
            const pitchNode = childOf(el, "pitch") ?? childOf(el, "unpitched");
            if (pitchNode) {
              const step = childText(pitchNode, "step") || childText(pitchNode, "display-step") || "C";
              // MusicXML pitch 는 sounding — 모델은 written 픽치 + octaveShift 이므로
              // clef-octave-change 만큼 역보정 (treble-8: sounding C4 → written C5)
              const soundingOct = parseInt(childText(pitchNode, "octave") || childText(pitchNode, "display-octave"), 10) || 4;
              const octave = soundingOct - lane.clefOct;
              const alter = Math.round(parseFloat(childText(pitchNode, "alter")) || 0);
              const accText = childText(el, "accidental");
              const explicitAccidental = accText in ACCIDENTAL_MAP ? ACCIDENTAL_MAP[accText] : null;
              const pitch: Pitch = { step, octave, alter, explicitAccidental };

              const tiedStart = childrenOf(el, "tie").some((t) => attrOf(t, "type") === "start");

              if (isChord && lane.lastNote) {
                lane.lastNote.pitches.push(pitch);
                if (tiedStart) lane.lastNote.tied = true;
              } else {
                const note: NoteItem = {
                  type: "note",
                  pitches: [pitch],
                  durDivisions: durDiv,
                  durTicks,
                  durType,
                  dots,
                  tied: tiedStart,
                  slur: false,
                  ...(isGrace ? { isGrace: true } : {}),
                  ...(tripletMark ? { tripletMark } : {}),
                };

                // notations: slur / fermata / articulations
                for (const notation of childrenOf(el, "notations")) {
                  for (const slurNode of childrenOf(notation, "slur")) {
                    const t = attrOf(slurNode, "type");
                    if (t === "start" && !lane.inSlur) {
                      note.slurEvent = "start";
                      lane.inSlur = true;
                    } else if (t === "stop" && lane.inSlur) {
                      note.slurEvent = "stop";
                      lane.inSlur = false;
                    }
                  }
                  if (childOf(notation, "fermata")) note.fermata = true;
                  const artNode = childOf(notation, "articulations");
                  if (artNode) {
                    const arts: Articulation[] = [];
                    for (const a of kidsOf(artNode)) {
                      const mapped = ARTICULATION_MAP[tagName(a)];
                      if (mapped) arts.push(mapped);
                    }
                    if (arts.length > 0) note.articulations = arts;
                  }
                }
                // slur 구간 내부 → slur 플래그 (가사 멜리스마 공유와 동일 의미)
                if (lane.inSlur && note.slurEvent !== "stop") note.slur = true;

                // 가사 (1절 우선)
                const lyricNodes = childrenOf(el, "lyric");
                const lyricNode = lyricNodes.find((l) => (attrOf(l, "number") ?? "1") === "1") ?? lyricNodes[0];
                if (lyricNode) {
                  const lyricText = childText(lyricNode, "text");
                  if (lyricText) {
                    const syllabic = childText(lyricNode, "syllabic") as LyricSyllable["syllabic"];
                    note.lyric = {
                      text: lyricText,
                      syllabic: ["single", "begin", "middle", "end"].includes(syllabic) ? syllabic : "single",
                      ...(childOf(lyricNode, "extend") ? { extend: true } : {}),
                    };
                  }
                }

                lane.events.push({ pos: toOur(cursor), item: note });
                lane.lastNote = note;
              }
            }
            // pitch 없는 note 는 시간만 진행
          }
          // rest / note / pitch 없는 note 공통 — chord·grace 는 시간 미진행
          if (!isChord && !isGrace) {
            cursor += duration;
            if (cursor > maxCursor) maxCursor = cursor;
          }
        }
      }

      // ─── 마디 마감: 레인별로 gap 채워 Measure 생성 ───
      const measureDur = Math.round((XML_DIVISIONS * 4 * curTsNum) / curTsDen);
      const actualDur = toOur(maxCursor);
      // 못갖춘마디: 첫 마디 또는 implicit — 부족분을 앞쪽에 패딩 (정박 그리드 유지)
      const frontPad = (mi === 0 || isImplicit) && actualDur > 0 && actualDur < measureDur
        ? measureDur - actualDur
        : 0;

      for (const lane of lanes.values()) {
        // 이번 마디에 처음 등장 안 한 레인 → 빈 마디
        if (lane.staff.measures.length > mi) continue; // 이미 처리됨 (없어야 정상)
        const items: (NoteItem | RestItem)[] = [];
        const evs = [...lane.events].sort((a, b) => a.pos - b.pos);
        if (evs.length > 0) {
          let cur = 0;
          for (const ev of evs) {
            const target = ev.pos + frontPad;
            if (target > cur) {
              items.push(...restsForGap(target - cur));
              cur = target;
            }
            items.push(ev.item);
            cur += ev.item.durDivisions;
          }
          if (cur < measureDur) items.push(...restsForGap(measureDur - cur));
        }
        const measure: Measure = { notes: items };
        if (pendingStartBarStyle) measure.startBarStyle = pendingStartBarStyle;
        if (pendingEndBarStyle) measure.endBarStyle = pendingEndBarStyle;
        if (endingNumber !== null) measure.endingNumber = endingNumber;
        lane.staff.measures.push(measure);
        lane.events = [];
        lane.lastNote = null;
      }
    }

    // part 단위 변화 리스트를 각 레인에 복사
    const sortedLanes = [...lanes.values()].sort((a, b) => a.order - b.order);
    for (const lane of sortedLanes) {
      lane.staff.keyChanges = keyChanges.map((k) => ({ ...k }));
      lane.staff.timeSigChanges = tsChanges.map((t) => ({ ...t }));
    }
    if (sortedLanes.length > 0) {
      // 템포/텍스트는 첫 레인에만 (to-midi / to-musicxml 이 전 staff 취합 후 dedup)
      sortedLanes[0].staff.tempoChanges = tempoChanges;
      sortedLanes[0].staff.textDirections = textDirections;
      if (!globalFirstLane) globalFirstLane = sortedLanes[0];
      // 레인이 여럿이면 이름에 번호 붙여 구분 (파트 믹서에서 식별용)
      if (sortedLanes.length > 1) {
        sortedLanes.forEach((l, i) => {
          l.staff.name = `${l.staff.name} ${i + 1}`;
          l.staff.label = l.staff.name;
        });
      }
      for (const lane of sortedLanes) score.staves.push(lane.staff);
    }
  }

  if (score.staves.length === 0) throw new Error("MusicXML 에서 음표를 찾지 못했습니다.");

  // 변박을 전 staff 에 공유 (없는 staff 는 마디 패딩이 어긋남)
  if (globalTsChanges.length > 0) {
    for (const s of score.staves) {
      if (s.timeSigChanges.length === 0) {
        s.timeSigChanges = globalTsChanges.map((t) => ({ ...t }));
      }
    }
  }

  // 남자 파트 treble-8 자동 보정 (NWC 파서와 동일 관행)
  for (const s of score.staves) {
    if (s.octaveShift !== 0) continue;
    if (s.clef !== "Treble") continue;
    const n = s.name.toLowerCase();
    // 축약형 파트명 (T/B/Br/Bs, T1/B2 등) 도 남성 파트로 인식
    const isMale = /\b(bass|tenor|baritone|bariton|ten|bar)\b/.test(n)
      || /^(t|b|br|bs|tb)\.?\s*\d*$/.test(n.trim())
      || /베이스|테너|바리톤/.test(s.name);
    if (isMale) s.octaveShift = -1;
  }

  // partId + 채널 재할당 (staff 순서대로 1..16, 10번 퍼커션 채널 건너뜀)
  score.staves.forEach((s, i) => {
    s.partId = "P" + (i + 1);
    const slot = i % 15;
    s.channel = slot < 9 ? slot + 1 : slot + 2;
  });

  return score;
}
