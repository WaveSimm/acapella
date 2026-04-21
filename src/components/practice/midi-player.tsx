"use client";

import { useEffect, useState } from "react";

// esm.sh가 Tone.js·@magenta/music 의존성까지 자동 번들해서 단일 ES module로 제공.
// CDN별 subpath 불일치·combine 필터링 이슈를 전부 회피.
const MIDI_PLAYER_MODULE = "https://esm.sh/html-midi-player";

const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

interface Props {
  src: string;
}

let loadPromise: Promise<void> | null = null;

async function pollCustomElement(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (customElements.get("midi-player")) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("midi-player custom element 등록 실패 (타임아웃)");
}

function ensureMidiPlayer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("midi-player")) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // webpackIgnore: 런타임 URL 그대로 import 하도록 번들러에 지시
    await import(/* webpackIgnore: true */ MIDI_PLAYER_MODULE);
    await pollCustomElement();
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
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
          setErrMsg(err.message ?? String(err));
          setStatus("error");
        }
      });
    return () => { cancelled = true; };
  }, [status]);

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
        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-expect-error web component */
        <midi-player
          src={src}
          sound-font={DEFAULT_SOUND_FONT}
          style={{ width: "100%", display: "block" }}
        />
      )}
      <p className="mt-2 text-[10px] text-gray-400">
        SoundFont(피아노)로 재생. 원본이 필요하면 악보·MIDI 섹션에서 다운로드.
      </p>
    </div>
  );
}
