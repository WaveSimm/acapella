"use client";

import { useEffect, useState } from "react";

const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

// 의존성을 순차적으로 로드. 각 단계 실패 시 원인을 알 수 있음.
const DEPS: { id: string; src: string }[] = [
  { id: "midi-tone", src: "https://cdn.jsdelivr.net/npm/tone@14.7.58/build/Tone.js" },
  { id: "midi-focus", src: "https://cdn.jsdelivr.net/npm/focus-visible@5/dist/focus-visible.min.js" },
  { id: "midi-magenta", src: "https://cdn.jsdelivr.net/npm/@magenta/[email protected]/es6/core.js" },
  { id: "midi-player", src: "https://cdn.jsdelivr.net/npm/[email protected]" },
];

interface Props {
  src: string;
}

function loadOne(d: { id: string; src: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(d.id)) return resolve();
    const s = document.createElement("script");
    s.id = d.id;
    s.src = d.src;
    s.async = false; // 순서 보존
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`${d.id} (${d.src}) 로드 실패`));
    document.head.appendChild(s);
  });
}

let loadAll: Promise<void> | null = null;

async function ensureMidiPlayer(): Promise<void> {
  if (typeof window === "undefined") return;
  if (customElements.get("midi-player")) return;
  if (loadAll) return loadAll;
  loadAll = (async () => {
    for (const d of DEPS) {
      await loadOne(d);
    }
    // 웹 컴포넌트 등록 대기
    for (let i = 0; i < 100; i++) {
      if (customElements.get("midi-player")) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("midi-player custom element 등록 실패");
  })().catch((err) => {
    loadAll = null;
    throw err;
  });
  return loadAll;
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

  const visualizerId = `midi-viz-${src.replace(/[^a-z0-9]/gi, "").slice(-10)}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {status === "loading" && (
        <p className="py-6 text-center text-xs text-gray-400">MIDI 플레이어를 불러오는 중...</p>
      )}
      {status === "error" && (
        <div className="py-6 text-center">
          <p className="text-xs text-red-500">MIDI 플레이어를 불러오지 못했습니다.</p>
          {errMsg && <p className="mt-1 text-[10px] text-gray-400">{errMsg}</p>}
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
