"use client";

import { useEffect, useRef, useState } from "react";

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

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];
type ABMode = "off" | "setA" | "setB" | "active";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MidiPlayer({ src }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    typeof window !== "undefined" && !!customElements.get("midi-player") ? "ready" : "loading",
  );
  const [errMsg, setErrMsg] = useState<string>("");

  const playerRef = useRef<HTMLElement & {
    currentTime: number;
    duration: number;
    start?: () => void;
    stop?: () => void;
    addVisualizer?: (v: HTMLElement) => void;
  } | null>(null);

  const [loop, setLoop] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2); // 1.0x
  const [abMode, setAbMode] = useState<ABMode>("off");
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);

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

  // loop 속성
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    if (loop) el.setAttribute("loop", "");
    else el.removeAttribute("loop");
  }, [loop, status]);

  // 재생 속도 (html-midi-player의 speed 속성)
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    el.setAttribute("speed", String(SPEEDS[speedIdx]));
  }, [speedIdx, status]);

  // A-B 구간 반복: 주기적으로 currentTime 체크
  useEffect(() => {
    if (abMode !== "active" || pointA === null || pointB === null) return;
    const iv = setInterval(() => {
      const el = playerRef.current;
      if (!el) return;
      if (el.currentTime >= pointB) {
        el.currentTime = pointA;
      }
    }, 80);
    return () => clearInterval(iv);
  }, [abMode, pointA, pointB]);

  function handleABClick() {
    const el = playerRef.current;
    if (!el) return;
    if (abMode === "off") {
      // 시작점 설정 모드로
      setAbMode("setA");
      setPointA(null);
      setPointB(null);
      return;
    }
    if (abMode === "setA") {
      setPointA(el.currentTime);
      setAbMode("setB");
      return;
    }
    if (abMode === "setB") {
      const t = el.currentTime;
      if (pointA !== null && t > pointA + 0.2) {
        setPointB(t);
        setAbMode("active");
        el.currentTime = pointA;
      }
      return;
    }
    // active → 해제
    setAbMode("off");
    setPointA(null);
    setPointB(null);
  }

  const abBtnClass = () => {
    switch (abMode) {
      case "off": return "bg-gray-100 text-gray-500 hover:bg-gray-200";
      case "setA": return "bg-amber-100 text-amber-700 animate-pulse";
      case "setB": return "bg-amber-200 text-amber-700 animate-pulse";
      case "active": return "bg-emerald-100 text-emerald-700";
    }
  };
  const abBtnLabel = () => {
    switch (abMode) {
      case "off": return "구간반복";
      case "setA": return "시작점 설정";
      case "setB": return "끝점 설정";
      case "active": return `${formatTime(pointA!)}~${formatTime(pointB!)}`;
    }
  };

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
            ref={playerRef}
            src={src}
            sound-font={DEFAULT_SOUND_FONT}
            style={{ width: "100%", display: "block" }}
          />
          <div className="mt-3 flex items-center justify-center gap-1">
            <button
              onClick={() => setLoop((v) => !v)}
              title={loop ? "전체 반복 해제" : "전체 반복"}
              aria-label={loop ? "전체 반복 해제" : "전체 반복"}
              aria-pressed={loop}
              className={`rounded-full p-2 transition-colors ${
                loop ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100"
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12V9a3 3 0 013-3h10l-3-3m0 0l3 3m-3-3M20 12v3a3 3 0 01-3 3H7l3 3m0 0l-3-3m3 3" />
              </svg>
            </button>
            <button
              onClick={handleABClick}
              title="구간 반복"
              aria-label={`구간 반복 — ${abBtnLabel()}`}
              aria-pressed={abMode !== "off"}
              className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${abBtnClass()}`}
            >
              {abBtnLabel()}
            </button>
            <button
              onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
              title="재생 속도"
              aria-label={`재생 속도 ${SPEEDS[speedIdx]}배`}
              className={`rounded-full px-2 py-1 text-xs font-bold transition-colors ${
                SPEEDS[speedIdx] !== 1 ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {SPEEDS[speedIdx]}x
            </button>
          </div>
          {abMode === "setA" && (
            <p className="mt-2 text-center text-[10px] text-amber-600">
              재생 중 시작점에서 다시 누르세요
            </p>
          )}
          {abMode === "setB" && (
            <p className="mt-2 text-center text-[10px] text-amber-600">
              재생 중 끝점에서 다시 누르세요
            </p>
          )}
        </>
      )}
      <p className="mt-2 text-[10px] text-gray-400">
        SoundFont(피아노)로 재생. 원본이 필요하면 악보·MIDI 섹션에서 다운로드.
      </p>
    </div>
  );
}
