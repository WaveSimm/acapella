"use client";

import { useEffect, useState } from "react";

// Magenta 가 호스팅하는 공용 SoundFont (피아노 중심, 무료)
const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

interface Props {
  src: string;
}

// 모듈 로드는 한 번만 수행
let loadPromise: Promise<void> | null = null;

function loadMidiPlayer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("midi-player")) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = import("html-midi-player")
    .then(() => {})
    .catch((err) => {
      loadPromise = null;
      console.error("html-midi-player 로드 실패:", err);
      throw err;
    });
  return loadPromise;
}

export function MidiPlayer({ src }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    typeof window !== "undefined" && !!customElements.get("midi-player") ? "ready" : "loading",
  );

  useEffect(() => {
    if (status !== "loading") return;
    let cancelled = false;
    loadMidiPlayer()
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [status]);

  const visualizerId = `midi-viz-${src.replace(/[^a-z0-9]/gi, "").slice(-10)}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {status === "loading" && (
        <p className="py-6 text-center text-xs text-gray-400">MIDI 플레이어를 불러오는 중...</p>
      )}
      {status === "error" && (
        <p className="py-6 text-center text-xs text-red-500">
          MIDI 플레이어를 불러오지 못했습니다. 새로고침 해주세요.
        </p>
      )}
      {status === "ready" && (
        <>
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error web component */}
          <midi-player
            src={src}
            sound-font={DEFAULT_SOUND_FONT}
            visualizer={`#${visualizerId}`}
            style={{ width: "100%", display: "block" }}
          />
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error web component */}
          <midi-visualizer
            id={visualizerId}
            src={src}
            type="piano-roll"
            style={{ width: "100%", height: 120, marginTop: 8 }}
          />
        </>
      )}
      <p className="mt-2 text-[10px] text-gray-400">
        SoundFont(피아노)로 재생. 원본이 필요하면 악보·MIDI 섹션에서 다운로드.
      </p>
    </div>
  );
}
