"use client";

import { useEffect, useState } from "react";
import { MidiPlayer } from "./midi-player";
import { ScoreViewer, type ScoreInfo } from "./score-viewer";

interface Props {
  midiSrc: string;
  musicXmlSrc: string;
}

const DEFAULT_MEASURE_WIDTH = 20;
const MIN_MW = 8;
const MAX_MW = 60;

function storageKey(src: string): string {
  return `acapella:measureWidth:${src}`;
}

export function NwcScorePlayer({ midiSrc, musicXmlSrc }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [info, setInfo] = useState<ScoreInfo | null>(null);
  const [highlightPart, setHighlightPart] = useState<string | null>(null);
  const [measureWidth, setMeasureWidth] = useState<number>(DEFAULT_MEASURE_WIDTH);
  // 드래그 중 표시용 (실제 OSMD 반영은 release 시). 초기엔 measureWidth 와 동일.
  const [pendingWidth, setPendingWidth] = useState<number>(DEFAULT_MEASURE_WIDTH);
  const [isPlaying, setIsPlaying] = useState(false);

  // 곡별 마디 폭 저장/복원 — localStorage 키 = musicXmlSrc
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey(musicXmlSrc));
    if (saved) {
      const v = parseInt(saved, 10);
      if (!isNaN(v) && v >= MIN_MW && v <= MAX_MW) {
        setMeasureWidth(v);
        setPendingWidth(v);
      }
    }
  }, [musicXmlSrc]);

  // 드래그/클릭 release 시점에만 실제 OSMD에 반영
  const commitMeasureWidth = () => {
    if (pendingWidth === measureWidth) return;
    setMeasureWidth(pendingWidth);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey(musicXmlSrc), String(pendingWidth));
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
        <label htmlFor="mw" className="shrink-0">마디 폭</label>
        <input
          id="mw"
          type="range"
          min={MIN_MW}
          max={MAX_MW}
          step={1}
          value={pendingWidth}
          onChange={(e) => setPendingWidth(parseInt(e.target.value, 10))}
          onPointerUp={commitMeasureWidth}
          onTouchEnd={commitMeasureWidth}
          onMouseUp={commitMeasureWidth}
          onKeyUp={commitMeasureWidth}
          disabled={isPlaying}
          className="flex-1 disabled:cursor-not-allowed"
          title={isPlaying ? "재생 중에는 변경 불가" : ""}
        />
        <span className="w-8 shrink-0 text-right tabular-nums text-gray-700">{pendingWidth}</span>
      </div>

      <ScoreViewer
        src={musicXmlSrc}
        highlightPart={highlightPart}
        cursorTime={currentTime}
        tempoBpm={info?.tempoBpm ?? undefined}
        measureWidth={measureWidth}
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
      />
      {!info?.playable && (
        <p className="text-center text-[11px] text-gray-400">
          악보 데이터 준비 중... 잠시만 기다려주세요.
        </p>
      )}
    </div>
  );
}
