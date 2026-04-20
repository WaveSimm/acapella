"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

// html-midi-player 웹 컴포넌트 + 의존성 (Tone.js, Magenta core, focus-visible)
// jsdelivr combine으로 한 번에 로드. 한 번만 로드되면 페이지 내 여러 <midi-player> 재사용.
const MIDI_PLAYER_SCRIPT =
  "https://cdn.jsdelivr.net/combine/npm/tone@14.7.58,npm/@magenta/[email protected]/es6/core.js,npm/focus-visible@5,npm/[email protected]";

// Magenta 가 호스팅하는 공용 SoundFont (피아노 중심, 무료)
const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

interface Props {
  src: string;
}

export function MidiPlayer({ src }: Props) {
  const [ready, setReady] = useState(
    typeof window !== "undefined" && !!customElements.get("midi-player"),
  );

  useEffect(() => {
    if (ready) return;
    const check = () => {
      if (customElements.get("midi-player")) setReady(true);
    };
    // 스크립트가 이미 다른 인스턴스에 의해 로드 중일 수 있음
    const t = setInterval(check, 200);
    return () => clearInterval(t);
  }, [ready]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <Script
        id="html-midi-player"
        src={MIDI_PLAYER_SCRIPT}
        strategy="lazyOnload"
        onLoad={() => setReady(true)}
      />
      {!ready ? (
        <p className="py-6 text-center text-xs text-gray-400">
          MIDI 플레이어를 불러오는 중...
        </p>
      ) : (
        <>
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error web component */}
          <midi-player
            src={src}
            sound-font={DEFAULT_SOUND_FONT}
            visualizer={`#midi-visualizer-${btoa(src).slice(0, 8)}`}
            style={{ width: "100%", display: "block" }}
          />
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-expect-error web component */}
          <midi-visualizer
            id={`midi-visualizer-${btoa(src).slice(0, 8)}`}
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
