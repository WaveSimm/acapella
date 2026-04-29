"use client";

import { useEffect, useState } from "react";
import { MidiPlayer } from "./midi-player";
import { ScoreViewer, type ScoreInfo } from "./score-viewer";

interface Props {
  midiSrc: string;
  musicXmlSrc: string;
}

const DEFAULT_NOTE_SPACING = 1.0;
const MIN_NS = 0.3;
const MAX_NS = 3.0;

function storageKeyNs(src: string): string {
  return `acapella:noteSpacing:${src}`;
}

export function NwcScorePlayer({ midiSrc, musicXmlSrc }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [info, setInfo] = useState<ScoreInfo | null>(null);
  const [highlightPart, setHighlightPart] = useState<string | null>(null);
  const [noteSpacing, setNoteSpacing] = useState<number>(DEFAULT_NOTE_SPACING);
  const [pendingSpacing, setPendingSpacing] = useState<number>(DEFAULT_NOTE_SPACING);
  const [isPlaying, setIsPlaying] = useState(false);

  // 곡별 노트 간격 저장·복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedNs = window.localStorage.getItem(storageKeyNs(musicXmlSrc));
    if (savedNs) {
      const v = parseFloat(savedNs);
      if (!isNaN(v) && v >= MIN_NS && v <= MAX_NS) {
        setNoteSpacing(v);
        setPendingSpacing(v);
      }
    }
  }, [musicXmlSrc]);

  const commitNoteSpacing = () => {
    if (pendingSpacing === noteSpacing) return;
    setNoteSpacing(pendingSpacing);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKeyNs(musicXmlSrc), String(pendingSpacing));
    }
  };

  return (
    <div className="space-y-3">
      {info?.partNames && info.partNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-400">파트 강조:</span>
          <button
            onClick={() => setHighlightPart(null)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              highlightPart === null
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            전체
          </button>
          {info.partNames.map((name) => (
            <button
              key={name}
              onClick={() => setHighlightPart(name)}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                highlightPart === name
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-3 text-xs text-gray-500 ${isPlaying ? "opacity-50" : ""}`}>
        <label htmlFor="ns" className="shrink-0">노트 간격</label>
        <input
          id="ns"
          type="range"
          min={MIN_NS}
          max={MAX_NS}
          step={0.1}
          value={pendingSpacing}
          onChange={(e) => setPendingSpacing(parseFloat(e.target.value))}
          onPointerUp={commitNoteSpacing}
          onTouchEnd={commitNoteSpacing}
          onMouseUp={commitNoteSpacing}
          onKeyUp={commitNoteSpacing}
          disabled={isPlaying}
          className="flex-1 disabled:cursor-not-allowed"
          title={isPlaying ? "재생 중에는 변경 불가" : "노트 간격 배수 (1.0 = 기본). 듀레이션 비례 유지."}
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-gray-700">{pendingSpacing.toFixed(1)}x</span>
      </div>

      <ScoreViewer
        src={musicXmlSrc}
        highlightPart={highlightPart}
        cursorTime={currentTime}
        tempoBpm={info?.tempoBpm ?? undefined}
        noteSpacing={noteSpacing}
        midiSrc={midiSrc}
        isPlaying={isPlaying}
        onReady={setInfo}
      />

      <MidiPlayer
        src={midiSrc}
        onTimeUpdate={(t, _d, playing) => {
          setCurrentTime(t);
          setIsPlaying(playing);
        }}
        disabled={!info?.playable}
        mixPart={highlightPart}
        partNames={info?.partNames}
      />
      {!info?.playable && (
        <p className="text-center text-[11px] text-gray-400">
          악보 데이터 준비 중... 잠시만 기다려주세요.
        </p>
      )}
    </div>
  );
}
