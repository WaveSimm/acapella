import type { ParsedScore, Staff, MeasureItem } from "./parser";
import { MIDI_PPQ } from "./parser";
import { writeMidi } from "midi-file";

// midi-file 타입 시스템이 엄격해서 유연한 내부 표현 사용
type MidiEvent = {
  deltaTime: number;
  meta?: boolean;
  type: string;
  [key: string]: unknown;
};

export function buildMidi(parsed: ParsedScore): Buffer {
  const tracks: MidiEvent[][] = [];

  // Track 0: 메타 (템포, 박자)
  const meta: MidiEvent[] = [];
  meta.push({ deltaTime: 0, meta: true, type: "trackName", text: parsed.songTitle || "Untitled" });
  const [num, denom] = parsed.timeSig.split("/").map(Number);
  if (num && denom) {
    // midi-file 라이브러리가 내부적으로 log2(denom) 변환을 하므로, 실제 denom 값을 전달한다.
    meta.push({
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: num,
      denominator: denom,
      metronome: 24,
      thirtyseconds: 8,
    });
  }
  const microPerQuarter = Math.round(60_000_000 / parsed.tempo);
  meta.push({ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: microPerQuarter });

  // mid-score 변박 + 템포 이벤트 — staves[0] 기준 (모든 스태프 동일 가정).
  // 1) 각 마디 시작의 절대 tick 위치를 미리 계산
  const tsChanges = parsed.staves[0]?.timeSigChanges ?? [];
  // 템포 변화는 NWC 가 아무 staff 에나 저장 가능 (예: VP percussion staff). 전 staff 에서 모아 dedup.
  const tempoChanges: { measureNumber: number; bpm: number }[] = [];
  {
    const seen = new Set<string>();
    const all = parsed.staves.flatMap((s) => s.tempoChanges ?? []);
    all.sort((a, b) => a.measureNumber - b.measureNumber);
    let lastBpm = parsed.tempo;
    for (const tc of all) {
      const key = `${tc.measureNumber}:${tc.bpm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (tc.bpm !== lastBpm) {
        tempoChanges.push({ measureNumber: tc.measureNumber, bpm: tc.bpm });
        lastBpm = tc.bpm;
      }
    }
  }
  const totalMeasures = parsed.staves[0]?.measures.length ?? 0;
  const measureStartTicks: number[] = [];
  {
    let curNum = num || 4;
    let curDen = denom || 4;
    let cumTick = 0;
    for (let mi = 0; mi < totalMeasures + 1; mi++) {
      measureStartTicks[mi] = cumTick;
      const measureNum = mi + 1;
      const tc = tsChanges.find((c) => c.measureNumber === measureNum);
      if (tc) {
        const [n, d] = tc.sig.split("/").map(Number);
        if (n && d) { curNum = n; curDen = d; }
      }
      cumTick += Math.round(MIDI_PPQ * 4 * curNum / curDen);
    }
  }

  // 2) 변박/템포 이벤트를 절대 tick 순으로 병합
  type MetaEv = { tick: number; kind: "ts" | "tempo"; payload: { num?: number; den?: number; bpm?: number } };
  const events: MetaEv[] = [];
  for (const ts of tsChanges) {
    const [n, d] = ts.sig.split("/").map(Number);
    if (n && d) events.push({ tick: measureStartTicks[ts.measureNumber - 1] ?? 0, kind: "ts", payload: { num: n, den: d } });
  }
  for (const tc of tempoChanges) {
    events.push({ tick: measureStartTicks[tc.measureNumber - 1] ?? 0, kind: "tempo", payload: { bpm: tc.bpm } });
  }
  events.sort((a, b) => a.tick - b.tick || (a.kind === "ts" ? -1 : 1)); // 같은 tick 이면 ts 먼저

  // 3) 누적 deltaTime 으로 emit
  let lastEventTick = 0;
  for (const ev of events) {
    const dt = ev.tick - lastEventTick;
    if (ev.kind === "ts") {
      meta.push({
        deltaTime: dt,
        meta: true,
        type: "timeSignature",
        numerator: ev.payload.num,
        denominator: ev.payload.den,
        metronome: 24,
        thirtyseconds: 8,
      });
    } else {
      meta.push({
        deltaTime: dt,
        meta: true,
        type: "setTempo",
        microsecondsPerBeat: Math.round(60_000_000 / (ev.payload.bpm || 120)),
      });
    }
    lastEventTick = ev.tick;
  }

  meta.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  tracks.push(meta);

  for (const staff of parsed.staves) {
    tracks.push(buildStaffTrack(staff));
  }

  const data = {
    header: { format: 1 as const, numTracks: tracks.length, ticksPerBeat: MIDI_PPQ },
    tracks,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(writeMidi(data as any));
}

function buildStaffTrack(staff: Staff): MidiEvent[] {
  const events: MidiEvent[] = [];
  const midiCh = Math.max(0, Math.min(15, staff.channel - 1));
  events.push({ deltaTime: 0, meta: true, type: "trackName", text: staff.name });
  events.push({ deltaTime: 0, type: "programChange", channel: midiCh, programNumber: staff.patch });

  // 부분 마디 앞쪽 쉼표 패딩 — to-musicxml.ts 와 정렬 일치 (예: Alto m2 첫 2분쉼표)
  // 변박 시 마디별로 ticksPerMeasure 가 바뀌므로 동적 계산
  const initialTs = (staff.timeSig ?? "4/4").split("/").map(Number);
  let curTsNum = initialTs[0] || 4;
  let curTsDen = initialTs[1] || 4;

  const flatItems: MeasureItem[] = [];
  for (let mi = 0; mi < staff.measures.length; mi++) {
    const measureNumber = mi + 1;
    const tsChange = staff.timeSigChanges?.find((tc) => tc.measureNumber === measureNumber);
    if (tsChange) {
      const [n, d] = tsChange.sig.split("/").map(Number);
      if (n && d) { curTsNum = n; curTsDen = d; }
    }
    const ticksPerMeasure = Math.round(MIDI_PPQ * 4 * curTsNum / curTsDen);
    const m = staff.measures[mi];
    if (m.notes.length === 0) {
      // 빈 마디 — 전체 마디 쉼표로 MIDI 타이밍 정렬 (MusicXML <rest measure="yes"/> 와 일치)
      flatItems.push({
        type: "rest",
        durDivisions: 0,
        durTicks: ticksPerMeasure,
        durType: "",
        dots: 0,
      });
      continue;
    }
    const content = m.notes.reduce((s, n) => s + n.durTicks, 0);
    if (content > 0 && content < ticksPerMeasure) {
      flatItems.push({
        type: "rest",
        durDivisions: 0,
        durTicks: ticksPerMeasure - content,
        durType: "",
        dots: 0,
      });
    }
    // 장식음은 MIDI 타이밍/재생에서 제외 (악보에만 표시)
    for (const n of m.notes) {
      if (n.type === "note" && n.isGrace) continue;
      flatItems.push(n);
    }
  }

  // 페르마타로 인한 노트 길이 확장 (NWC Pause 단위 → 추가 ticks).
  // Pause:4 ≈ 1 박자(=1 quarter) 추가로 보수적으로 잡음. 후속 노트가 그만큼 밀림.
  for (const it of flatItems) {
    if (it.type === "note" && it.fermata && typeof it.fermataPause === "number") {
      const extra = Math.round((it.fermataPause / 4) * MIDI_PPQ);
      if (extra > 0) it.durTicks += extra;
    }
  }

  // 타이 노트 병합: 이전 노트가 tied이고 같은 pitches면 duration 합치기
  const merged: typeof flatItems = [];
  for (const it of flatItems) {
    if (it.type === "note" && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.type === "note" && prev.tied &&
          JSON.stringify(prev.pitches.map((p) => ({ s: p.step, o: p.octave, a: p.alter }))) ===
          JSON.stringify(it.pitches.map((p) => ({ s: p.step, o: p.octave, a: p.alter })))) {
        prev.durTicks += it.durTicks;
        prev.tied = it.tied;
        continue;
      }
    }
    merged.push({ ...it, ...(it.type === "note" ? { pitches: [...it.pitches] } : {}) });
  }

  let pendingDelta = 0;
  for (const it of merged) {
    if (it.type === "rest") {
      pendingDelta += it.durTicks;
    } else {
      const pitches = it.pitches.map((p) => pitchToMidi(p));
      for (let i = 0; i < pitches.length; i++) {
        events.push({
          deltaTime: i === 0 ? pendingDelta : 0,
          type: "noteOn",
          channel: midiCh,
          noteNumber: pitches[i],
          velocity: 80,
        });
      }
      pendingDelta = 0;
      for (let i = 0; i < pitches.length; i++) {
        events.push({
          deltaTime: i === 0 ? it.durTicks : 0,
          type: "noteOff",
          channel: midiCh,
          noteNumber: pitches[i],
          velocity: 0,
        });
      }
    }
  }

  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return events;
}

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchToMidi(pitch: { step: string; octave: number; alter: number }): number {
  return (pitch.octave + 1) * 12 + PITCH_CLASS[pitch.step] + pitch.alter;
}
