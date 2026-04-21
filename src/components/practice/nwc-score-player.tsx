"use client";

import { useState } from "react";
import { MidiPlayer } from "./midi-player";
import { ScoreViewer, type ScoreInfo } from "./score-viewer";

interface Props {
  midiSrc: string;
  musicXmlSrc: string;
}

export function NwcScorePlayer({ midiSrc, musicXmlSrc }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [info, setInfo] = useState<ScoreInfo | null>(null);
  const [highlightPart, setHighlightPart] = useState<string | null>(null);

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

      <ScoreViewer
        src={musicXmlSrc}
        highlightPart={highlightPart}
        cursorTime={currentTime}
        tempoBpm={info?.tempoBpm ?? undefined}
        onReady={setInfo}
      />

      <MidiPlayer
        src={midiSrc}
        onTimeUpdate={(t) => setCurrentTime(t)}
      />
    </div>
  );
}
