import { Midi } from "@tonejs/midi";

export interface MeasureTime {
  measureIdx: number; // 0-based
  startTime: number;  // 초
  endTime: number;    // 초
  startTick: number;
  endTick: number;
}

/**
 * MIDI 파일을 파싱해 각 마디의 시작/끝 시간을 반환.
 * 템포 변화는 midi.header.ticksToSeconds 가 자동 반영.
 * 박자 변화는 timeSignatures 배열 순회로 처리.
 */
export async function loadMeasureTimes(url: string): Promise<MeasureTime[]> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`MIDI fetch 실패 (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  const midi = new Midi(buf);
  const ppq = midi.header.ppq;
  const totalTicks = midi.durationTicks;

  // timeSignatures: [{ ticks, timeSignature: [num, den], measures }]
  const tsList = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures
    : [{ ticks: 0, timeSignature: [4, 4] as [number, number], measures: 0 }];

  const measures: MeasureTime[] = [];
  let currentTick = 0;
  let measureIdx = 0;
  let tsIdx = 0;
  // 안전 한계 — 무한루프 방지
  const MAX_MEASURES = 10000;

  while (currentTick < totalTicks && measureIdx < MAX_MEASURES) {
    // 현재 tick 에서 유효한 TimeSignature 찾기
    while (tsIdx < tsList.length - 1 && tsList[tsIdx + 1].ticks <= currentTick) {
      tsIdx++;
    }
    const ts = tsList[tsIdx]?.timeSignature ?? [4, 4];
    const num = ts[0];
    // 과거 업로드 호환: denominator 가 비음악적 값 (0, 1) 이면 raw log2 byte로 해석해 복원
    let den = ts[1];
    if (den < 2) den = Math.pow(2, ts[1]);
    // 마디당 tick = PPQ × numerator × (4/denominator)
    const ticksPerMeasure = Math.round(ppq * num * 4 / den);
    if (ticksPerMeasure <= 0) break;

    const nextTick = Math.min(currentTick + ticksPerMeasure, totalTicks);
    const startTime = midi.header.ticksToSeconds(currentTick);
    const endTime = midi.header.ticksToSeconds(nextTick);
    measures.push({
      measureIdx,
      startTime,
      endTime,
      startTick: currentTick,
      endTick: nextTick,
    });
    measureIdx++;
    currentTick = nextTick;
  }

  return measures;
}

/**
 * MIDI 파일에서 첫 노트 시작 시간(초)을 반환.
 * 우선순위:
 *   1. partName 매칭 (case-insensitive + trim)
 *   2. "Alto" 우선 (choir 연습 기본 타깃)
 *   3. 전 트랙 earliest
 */
export async function getFirstNoteTime(url: string, partName?: string | null): Promise<number | null> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const midi = new Midi(buf);
  const norm = (s: string | undefined | null) => (s ?? "").trim().toLowerCase();
  const target = norm(partName);

  const findByName = (name: string): number | null => {
    for (const track of midi.tracks) {
      if (norm(track.name) !== name) continue;
      const firstNote = track.notes[0];
      if (firstNote) return firstNote.time;
    }
    return null;
  };

  if (target) {
    const t = findByName(target);
    if (t !== null) return t;
  }

  // Alto 우선 (choir 연습 기본 타깃)
  const alto = findByName("alto");
  if (alto !== null) return alto;

  // 전 트랙 earliest fallback
  let earliest = Infinity;
  for (const track of midi.tracks) {
    const firstNote = track.notes[0];
    if (firstNote && firstNote.time < earliest) earliest = firstNote.time;
  }
  return isFinite(earliest) ? earliest : null;
}
