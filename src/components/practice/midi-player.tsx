"use client";

import { useEffect, useId, useState } from "react";

// html-midi-player 저자 권장 combine URL. 일부 네트워크/광고차단기가 "combine" 경로를 막을 수 있어
// 실패 시 개별 스크립트로 폴백.
const MIDI_PLAYER_COMBINED =
  "https://cdn.jsdelivr.net/combine/npm/tone@14.7.58,npm/@magenta/[email protected]/es6/core.js,npm/focus-visible@5,npm/[email protected]";

const MIDI_PLAYER_FALLBACK_SCRIPTS = [
  "https://unpkg.com/tone@14.7.58/build/Tone.js",
  "https://unpkg.com/focus-visible@5/dist/focus-visible.min.js",
  "https://unpkg.com/@magenta/[email protected]/es6/core.js",
  "https://unpkg.com/[email protected]",
];

const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

interface Props {
  src: string;
}

let loadPromise: Promise<void> | null = null;

function injectOne(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = false; // 순서 보존
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureMidiPlayer(): Promise<void> {
  if (typeof window === "undefined") return;
  if (customElements.get("midi-player")) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // 1차: jsdelivr combine URL (가장 빠름, 한 번 요청)
    try {
      await injectOne(MIDI_PLAYER_COMBINED, "midi-player-combined");
      await pollCustomElement();
      return;
    } catch (err) {
      console.warn("combine URL 실패, unpkg 폴백 시도:", err);
    }

    // 2차: unpkg 개별 스크립트
    for (let i = 0; i < MIDI_PLAYER_FALLBACK_SCRIPTS.length; i++) {
      await injectOne(MIDI_PLAYER_FALLBACK_SCRIPTS[i], `midi-player-fallback-${i}`);
    }
    await pollCustomElement();
  })().catch((err) => {
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
