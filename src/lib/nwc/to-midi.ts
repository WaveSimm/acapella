import type { ParsedScore, Staff } from "./parser";
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

  // 타이 노트 병합: 이전 노트가 tied이고 같은 pitches면 duration 합치기
  const flatItems = staff.measures.flatMap((m) => m.notes);
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
