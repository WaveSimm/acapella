"use client";

import { useEffect, useState } from "react";

// html-midi-player 웹 컴포넌트 + 호환 Tone.js + @magenta/music core + focus-visible
// jsdelivr 공식 combine URL (html-midi-player 저자 권장, pinned versions)
const MIDI_PLAYER_SCRIPT =
  "https://cdn.jsdelivr.net/combine/npm/tone@14.7.58,npm/@magenta/[email protected]/es6/core.js,npm/focus-visible@5,npm/[email protected]";

const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

interface Props {
  src: string;
}

let scriptInjected = false;

function injectScriptOnce(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (customElements.get("midi-player")) return resolve();

    const existing = document.getElementById("midi-player-cdn") as HTMLScriptElement | null;
    if (existing) {
      // 이미 삽입되었으면 웹 컴포넌트 등록을 폴링
      const iv = setInterval(() => {
        if (customElements.get("midi-player")) { clearInterval(iv); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(iv); reject(new Error("timeout")); }, 15000);
      return;
    }

    scriptInjected = true;
    const s = document.createElement("script");
    s.id = "midi-player-cdn";
    s.src = MIDI_PLAYER_SCRIPT;
    s.async = true;
    s.onload = () => {
      // 스크립트가 로드되어도 customElements 등록은 미세하게 지연될 수 있음
      const iv = setInterval(() => {
        if (customElements.get("midi-player")) { clearInterval(iv); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(iv); reject(new Error("custom element timeout")); }, 10000);
    };
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

export function MidiPlayer({ src }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    typeof window !== "undefined" && !!customElements.get("midi-player") ? "ready" : "loading",
  );

  useEffect(() => {
    if (status !== "loading") return;
    let cancelled = false;
    injectScriptOnce()
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch((err) => {
        console.error("MIDI 플레이어 로드 실패:", err);
        if (!cancelled) setStatus("error");
      });
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
