"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIDI_PLAYER_MODULE = "https://esm.sh/html-midi-player";

const DEFAULT_SOUND_FONT =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];
type ABMode = "off" | "setA" | "setB" | "active";

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
    await import(/* webpackIgnore: true */ MIDI_PLAYER_MODULE);
    await pollCustomElement();
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// <midi-player> 웹 컴포넌트가 노출하는 인터페이스
interface MidiEl extends HTMLElement {
  currentTime: number;
  duration: number;
  playing: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

export function MidiPlayer({ src }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    typeof window !== "undefined" && !!customElements.get("midi-player") ? "ready" : "loading",
  );
  const [errMsg, setErrMsg] = useState<string>("");

  const elRef = useRef<MidiEl | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loop, setLoop] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2);

  const [abMode, setAbMode] = useState<ABMode>("off");
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);

  // 스크립트 로드
  useEffect(() => {
    if (status !== "loading") return;
    let cancelled = false;
    ensureMidiPlayer()
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch((err: Error) => {
        if (!cancelled) { setErrMsg(err.message ?? String(err)); setStatus("error"); }
      });
    return () => { cancelled = true; };
  }, [status]);

  // rAF로 currentTime 추적 + AB 점프
  const tick = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const t = typeof el.currentTime === "number" ? el.currentTime : 0;
    setCurrentTime(t);
    if (abMode === "active" && pointA !== null && pointB !== null) {
      if (t >= pointB) el.currentTime = pointA;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [abMode, pointA, pointB]);

  // 이벤트 바인딩 + duration 읽기
  useEffect(() => {
    if (status !== "ready") return;
    const el = elRef.current;
    if (!el) return;

    const syncDuration = () => {
      const d = typeof el.duration === "number" && !isNaN(el.duration) ? el.duration : 0;
      if (d > 0) setDuration(d);
    };
    const onStart = () => { setPlaying(true); rafRef.current = requestAnimationFrame(tick); };
    const onStop = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      const t = typeof el.currentTime === "number" ? el.currentTime : 0;
      const d = typeof el.duration === "number" ? el.duration : 0;
      // 끝까지 재생되어 stop된 경우 loop 처리
      if (loop && d > 0 && t >= d - 0.1) {
        el.currentTime = 0;
        el.start();
      }
    };
    const onLoad = () => syncDuration();

    el.addEventListener("start", onStart);
    el.addEventListener("stop", onStop);
    el.addEventListener("load", onLoad);

    // src 로드 후 일정 시점에 duration이 설정되므로 몇 번 체크
    syncDuration();
    const iv = setInterval(() => {
      syncDuration();
      if (el.duration && el.duration > 0) clearInterval(iv);
    }, 200);
    setTimeout(() => clearInterval(iv), 5000);

    return () => {
      el.removeEventListener("start", onStart);
      el.removeEventListener("stop", onStop);
      el.removeEventListener("load", onLoad);
      cancelAnimationFrame(rafRef.current);
      clearInterval(iv);
    };
  }, [status, tick, loop]);

  // src 바뀌면 duration 초기화
  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
  }, [src]);

  // speed 속성
  useEffect(() => {
    const el = elRef.current;
    if (!el || status !== "ready") return;
    el.setAttribute("speed", String(SPEEDS[speedIdx]));
  }, [speedIdx, status]);

  const togglePlay = () => {
    const el = elRef.current;
    if (!el) return;
    if (el.playing) el.stop();
    else el.start();
  };

  const skip = (delta: number) => {
    const el = elRef.current;
    if (!el) return;
    const t = typeof el.currentTime === "number" ? el.currentTime : 0;
    const d = typeof el.duration === "number" ? el.duration : duration;
    el.currentTime = Math.max(0, Math.min(d || 0, t + delta));
    setCurrentTime(el.currentTime);
  };

  const seekFromEvent = (clientX: number) => {
    const bar = barRef.current;
    const el = elRef.current;
    if (!bar || !el || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    if (abMode === "setA") {
      setPointA(t);
      setAbMode("setB");
    } else if (abMode === "setB" && pointA !== null) {
      if (t > pointA) { setPointB(t); setAbMode("active"); el.currentTime = pointA; setCurrentTime(pointA); return; }
    } else {
      el.currentTime = t;
      setCurrentTime(t);
    }
  };

  const toggleAB = () => {
    if (abMode === "off") { setAbMode("setA"); setPointA(null); setPointB(null); }
    else { setAbMode("off"); setPointA(null); setPointB(null); }
  };

  const abBtnClass = () => {
    switch (abMode) {
      case "off": return "bg-gray-100 text-gray-500 hover:bg-gray-200";
      case "setA": return "bg-amber-100 text-amber-700 animate-pulse";
      case "setB": return "bg-amber-200 text-amber-700";
      case "active": return "bg-emerald-100 text-emerald-700";
    }
  };
  const abBtnLabel = () => {
    switch (abMode) {
      case "off": return "구간반복";
      case "setA": return "시작점";
      case "setB": return "끝점";
      case "active": return `${formatTime(pointA!)}~${formatTime(pointB!)}`;
    }
  };

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="py-6 text-center text-xs text-gray-400">MIDI 플레이어를 불러오는 중...</p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
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
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {/* 내장 midi-player는 오디오 엔진으로만 사용 — 시각적으로 숨김 */}
      <div style={{ position: "absolute", left: -99999, top: 0, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-expect-error web component */}
        <midi-player ref={elRef} src={src} sound-font={DEFAULT_SOUND_FONT} />
      </div>

      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div
        ref={barRef}
        onMouseDown={(e) => seekFromEvent(e.clientX)}
        onTouchStart={(e) => seekFromEvent(e.touches[0].clientX)}
        className="relative mb-4 h-8 cursor-pointer"
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
          style={{ width: `${pct(currentTime)}%` }}
        />
        {abMode === "active" && pointA !== null && pointB !== null && (
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-emerald-200"
            style={{ left: `${pct(pointA)}%`, width: `${pct(pointB) - pct(pointA)}%` }}
          />
        )}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 shadow"
          style={{ left: `${pct(currentTime)}%` }}
        />
      </div>

      <div className="flex items-center justify-center gap-1">
        <button onClick={() => skip(-5)} title="5초 뒤로" aria-label="5초 뒤로" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
        </button>
        <button onClick={togglePlay} title={playing ? "일시정지" : "재생"} aria-label={playing ? "일시정지" : "재생"} className="rounded-full bg-blue-600 p-3 text-white shadow hover:bg-blue-700">
          {playing ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          ) : (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button onClick={() => skip(5)} title="5초 앞으로" aria-label="5초 앞으로" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" /></svg>
        </button>
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <button
          onClick={() => setLoop((v) => !v)}
          title={loop ? "전체 반복 해제" : "전체 반복"}
          aria-label={loop ? "전체 반복 해제" : "전체 반복"}
          aria-pressed={loop}
          className={`rounded-full p-2 transition-colors ${loop ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12V9a3 3 0 013-3h10l-3-3m0 0l3 3m-3-3M20 12v3a3 3 0 01-3 3H7l3 3m0 0l-3-3m3 3" /></svg>
        </button>
        <button
          onClick={toggleAB}
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
    </div>
  );
}
