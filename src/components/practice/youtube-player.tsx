"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

type ABMode = "off" | "setA" | "setB" | "active";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// YouTube IFrame API 로드 (한 번만)
let apiLoaded = false;
let apiReady = false;
const apiCallbacks: (() => void)[] = [];

function loadYouTubeAPI(cb: () => void) {
  if (apiReady) {
    cb();
    return;
  }
  apiCallbacks.push(cb);
  if (apiLoaded) return;
  apiLoaded = true;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    apiCallbacks.forEach((fn) => fn());
    apiCallbacks.length = 0;
  };
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([^&?\s/]+)/);
  return match ? match[1] : null;
}

interface Props {
  url: string;
}

export function YouTubePlayer({ url }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(0 as any);
  const barRef = useRef<HTMLDivElement>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loop, setLoop] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2); // 1.0x

  // A-B 구간 반복
  const [abMode, setAbMode] = useState<ABMode>("off");
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [dragging, setDragging] = useState<"a" | "b" | "seek" | null>(null);

  const videoId = getYouTubeId(url);

  // YouTube Player 초기화
  useEffect(() => {
    if (!videoId || !containerRef.current) return;

    const divId = `yt-player-${videoId}-${Date.now()}`;
    const el = document.createElement("div");
    el.id = divId;
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(el);

    loadYouTubeAPI(() => {
      playerRef.current = new window.YT.Player(divId, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          fs: 1,
        },
        events: {
          onReady: (e: any) => {
            setDuration(e.target.getDuration());
            setReady(true);
          },
          onStateChange: (e: any) => {
            const state = e.data;
            // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0
            if (state === 1) {
              setPlaying(true);
              setDuration(e.target.getDuration());
            } else if (state === 2) {
              setPlaying(false);
            } else if (state === 0) {
              setPlaying(false);
            }
          },
        },
      });
    });

    return () => {
      clearInterval(timerRef.current);
      playerRef.current?.destroy?.();
    };
  }, [videoId]);

  // 시간 업데이트 타이머
  useEffect(() => {
    if (!ready) return;
    clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      const t = p.getCurrentTime();
      setCurrentTime(t);

      // A-B 구간 반복
      if (abMode === "active" && pointA !== null && pointB !== null) {
        if (t >= pointB) {
          p.seekTo(pointA, true);
        }
      }

      // 전체 반복
      if (loop && p.getPlayerState() === 0) {
        p.seekTo(0, true);
        p.playVideo();
      }
    }, 100);

    return () => clearInterval(timerRef.current);
  }, [ready, abMode, pointA, pointB, loop]);

  // --- 프로그레스바 위치 계산 ---
  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
      const bar = barRef.current;
      if (!bar || duration === 0) return 0;
      const rect = bar.getBoundingClientRect();
      const clientX =
        "touches" in e
          ? e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches[0]?.clientX ?? 0
          : (e as MouseEvent).clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  // --- 프로그레스바 인터랙션 ---
  const handleBarDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const time = getTimeFromEvent(e);
      const p = playerRef.current;

      if (abMode === "setA") {
        setPointA(time);
        setAbMode("setB");
        return;
      }
      if (abMode === "setB") {
        if (pointA !== null && time > pointA) {
          setPointB(time);
          setAbMode("active");
          if (p) {
            p.seekTo(pointA, true);
            p.playVideo();
          }
        }
        return;
      }

      if (abMode === "active" && pointA !== null && pointB !== null) {
        const handleRadius = duration * 0.02;
        if (Math.abs(time - pointA) < handleRadius) {
          setDragging("a");
          return;
        }
        if (Math.abs(time - pointB) < handleRadius) {
          setDragging("b");
          return;
        }
      }

      setDragging("seek");
      if (p) p.seekTo(time, true);
    },
    [abMode, pointA, pointB, duration, getTimeFromEvent]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const time = getTimeFromEvent(e);
      if (dragging === "seek" && playerRef.current) {
        playerRef.current.seekTo(time, true);
      } else if (dragging === "a" && pointB !== null) {
        setPointA(Math.min(time, pointB - 0.5));
      } else if (dragging === "b" && pointA !== null) {
        setPointB(Math.max(time, pointA + 0.5));
      }
    };
    const onUp = () => setDragging(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, pointA, pointB, getTimeFromEvent]);

  // --- 컨트롤 핸들러 ---
  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    const state = p.getPlayerState();
    if (state === 1) {
      p.pauseVideo();
    } else {
      if (abMode === "active" && pointA !== null) {
        p.seekTo(pointA, true);
      }
      p.playVideo();
    }
  };

  const skip = (sec: number) => {
    const p = playerRef.current;
    if (!p) return;
    const t = p.getCurrentTime();
    p.seekTo(Math.max(0, Math.min(duration, t + sec)), true);
  };

  const toggleLoop = () => setLoop((l) => !l);

  const toggleAB = () => {
    if (abMode === "off") {
      setAbMode("setA");
      setLoop(false);
    } else {
      setAbMode("off");
      setPointA(null);
      setPointB(null);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    playerRef.current?.setPlaybackRate(SPEEDS[next]);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    const iframe = el.querySelector("iframe");
    if (!iframe) return;

    type FSDoc = Document & {
      webkitFullscreenElement?: Element | null;
      mozFullScreenElement?: Element | null;
      msFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
      mozCancelFullScreen?: () => Promise<void> | void;
      msExitFullscreen?: () => Promise<void> | void;
    };
    type FSEl = HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      mozRequestFullScreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    const d = document as FSDoc;
    const fsEl =
      document.fullscreenElement ??
      d.webkitFullscreenElement ??
      d.mozFullScreenElement ??
      d.msFullscreenElement ??
      null;

    if (fsEl) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      else if (d.mozCancelFullScreen) d.mozCancelFullScreen();
      else if (d.msExitFullscreen) d.msExitFullscreen();
    } else {
      const f = iframe as unknown as FSEl;
      if (f.requestFullscreen) f.requestFullscreen();
      else if (f.webkitRequestFullscreen) f.webkitRequestFullscreen();
      else if (f.mozRequestFullScreen) f.mozRequestFullScreen();
      else if (f.msRequestFullscreen) f.msRequestFullscreen();
    }
  };

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

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
      case "setA": return "시작점 선택";
      case "setB": return "끝점 선택";
      case "active": return `${formatTime(pointA!)}~${formatTime(pointB!)}`;
    }
  };

  if (!videoId) return <p className="text-sm text-red-500">유효하지 않은 YouTube URL입니다.</p>;

  return (
    <div className="select-none">
      {/* YouTube 영상 */}
      <div ref={containerRef} className="aspect-video mx-auto w-full max-w-3xl overflow-hidden rounded-lg bg-black [&_iframe]:h-full [&_iframe]:w-full" />

      {/* 시간 표시 */}
      <div className="mt-3 mb-1 flex items-center justify-between text-xs tabular-nums text-gray-500">
        <span>{formatTime(currentTime)}</span>
        <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
      </div>

      {/* 프로그레스바 */}
      <div
        ref={barRef}
        className="relative h-11 cursor-pointer touch-none"
        onMouseDown={handleBarDown}
        onTouchStart={handleBarDown}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200" />

        {pointA !== null && pointB !== null && abMode === "active" && (
          <>
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-emerald-100"
              style={{ left: `${pct(pointA)}%`, width: `${pct(pointB) - pct(pointA)}%` }}
            />
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-l-full bg-emerald-400/60"
              style={{
                left: `${pct(pointA)}%`,
                width: `${Math.max(0, Math.min(pct(currentTime) - pct(pointA), pct(pointB) - pct(pointA)))}%`,
              }}
            />
          </>
        )}

        {abMode !== "active" && (
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
            style={{ width: `${pct(currentTime)}%` }}
          />
        )}

        <div
          className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ${
            abMode === "active" ? "bg-emerald-600" : "bg-blue-600"
          }`}
          style={{ left: `${pct(currentTime)}%` }}
        />

        {pointA !== null && (abMode === "setB" || abMode === "active") && (
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white shadow-md"
            style={{ left: `${pct(pointA)}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">A</span>
          </div>
        )}

        {pointB !== null && abMode === "active" && (
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white shadow-md"
            style={{ left: `${pct(pointB)}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">B</span>
          </div>
        )}

        {abMode === "setA" && (
          <div
            className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-amber-500 opacity-50"
            style={{ left: `${pct(currentTime)}%` }}
          />
        )}
      </div>

      {abMode === "setA" && <p className="mt-0.5 text-center text-xs text-amber-600">바에서 시작점을 탭하세요</p>}
      {abMode === "setB" && <p className="mt-0.5 text-center text-xs text-amber-600">바에서 끝점을 탭하세요</p>}
      {abMode === "active" && <p className="mt-0.5 text-center text-xs text-emerald-600">A/B 핸들을 드래그하여 조정</p>}

      {/* 컨트롤 바 */}
      <div className="mt-3 flex items-center justify-center gap-1">
        <button onClick={() => skip(-5)} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100" title="5초 뒤로" aria-label="5초 뒤로">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
        </button>

        <button onClick={togglePlay} className="rounded-full bg-blue-600 p-3 text-white shadow-md transition-colors hover:bg-blue-700" title={playing ? "일시정지" : "재생"} aria-label={playing ? "일시정지" : "재생"}>
          {playing ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          ) : (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        <button onClick={() => skip(5)} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100" title="5초 앞으로" aria-label="5초 앞으로">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        <button onClick={toggleLoop} title={loop ? "전체 반복 해제" : "전체 반복"} aria-label={loop ? "전체 반복 해제" : "전체 반복"} aria-pressed={loop} className={`rounded-full p-2 transition-colors ${loop ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12V9a3 3 0 013-3h10l-3-3m0 0l3 3m-3-3M20 12v3a3 3 0 01-3 3H7l3 3m0 0l-3-3m3 3" />
          </svg>
        </button>

        <button onClick={toggleAB} title="구간 반복" aria-label={`구간 반복 — ${abBtnLabel()}`} aria-pressed={abMode !== "off"} className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${abBtnClass()}`}>
          {abBtnLabel()}
        </button>

        <button onClick={cycleSpeed} title="재생 속도" aria-label={`재생 속도 ${SPEEDS[speedIdx]}배`} className={`rounded-full px-2 py-1 text-xs font-bold transition-colors ${SPEEDS[speedIdx] !== 1.0 ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
          {SPEEDS[speedIdx]}x
        </button>

        <button onClick={toggleFullscreen} title="전체화면" aria-label="전체화면" className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
