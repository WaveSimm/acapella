"use client";

import { useEffect, useId, useState } from "react";

// html-midi-player 저자 권장 combine URL
// (Tone.js + focus-visible + @magenta/music core + html-midi-player 단일 요청)
const MIDI_PLAYER_SCRIPT =
  "https://cdn.jsdelivr.net/combine/npm/tone@14.7.58,npm/@magenta/[email protected]/es6/core.js,npm/focus-visible@5,npm/[email protected]";

const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

interface Props {
  src: string;
}

let loadPromise: Promise<void> | null = null;

function ensureMidiPlayer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("midi-player")) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("midi-player-cdn") as HTMLScriptElement | null;
    if (existing) {
      pollCustomElement().then(resolve).catch(reject);
      return;
    }
    const s = document.createElement("script");
    s.id = "midi-player-cdn";
    s.src = MIDI_PLAYER_SCRIPT;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => pollCustomElement().then(resolve).catch(reject);
    s.onerror = () => reject(new Error(`스크립트 로드 실패: ${MIDI_PLAYER_SCRIPT}`));
    document.head.appendChild(s);
  }).catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

async function pollCustomElement(): Promise<void> {
  // 스크립트가 실행된 후 customElements 등록까지 수 프레임 필요할 수 있음
  for (let i = 0; i < 200; i++) {
    if (customElements.get("midi-player")) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("midi-player custom element 등록 실패 (타임아웃)");
}

export function MidiPlayer({ src }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    typeof window !== "undefined" && !!customElements.get("midi-player") ? "ready" : "loading",
  );
  const [errMsg, setErrMsg] = useState<string>("");

  useEffect(() => {
    if (status !== "loading") return;
    let cancelled = false;
    ensureMidiPlayer()
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch((err: Error) => {
        console.error("MIDI 로드 실패:", err);
        if (!cancelled) {
          setErrMsg(err.message);
          setStatus("error");
        }
      });
    return () => { cancelled = true; };
  }, [status]);

  const reactId = useId();
  const visualizerId = `midi-viz${reactId.replace(/[:]/g, "")}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {status === "loading" && (
        <p className="py-6 text-center text-xs text-gray-400">MIDI 플레이어를 불러오는 중...</p>
      )}
      {status === "error" && (
        <div className="py-6 text-center">
          <p className="text-xs text-red-500">MIDI 플레이어를 불러오지 못했습니다.</p>
          {errMsg && <p className="mt-1 text-[10px] text-gray-400 break-all">{errMsg}</p>}
          <button
            onClick={() => { setErrMsg(""); setStatus("loading"); }}
            className="mt-3 rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            다시 시도
          </button>
        </div>
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
