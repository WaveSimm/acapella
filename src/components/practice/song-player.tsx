"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { YouTubePlayer } from "./youtube-player";
import { MidiPlayer } from "./midi-player";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
  url: string;
  label?: string | null;
  sourceSite?: string | null;
}

interface Props {
  resources: Resource[];
}

// 레거시 enum 값 보정용. 신규 입력은 이미 자유 문자열.
const PART_ALIAS: Record<string, string> = {
  ALL: "전체",
  SOPRANO: "소프라노",
  ALTO: "알토",
  TENOR: "테너",
  BASS: "베이스",
};

function normalizePart(p: string): string {
  return PART_ALIAS[p] ?? p;
}

function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function isMidi(r: Resource): boolean {
  return r.resourceType === "MIDI" || /\.(mid|midi)(\?.*)?$/i.test(r.url);
}

function isInlinePlayable(r: Resource): boolean {
  if (r.resourceType === "SCORE_PREVIEW") return false;
  if (/\.pdf(\?.*)?$/i.test(r.url)) return false;
  if (isMidi(r)) return true; // MIDI도 재생 가능 (SoundFont 신시사이저)
  if (r.resourceType === "AUDIO") return true;
  if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(r.url)) return true;
  if (isYouTubeUrl(r.url)) return true;
  if (/\.(mp4|webm)(\?.*)?$/i.test(r.url)) return true;
  return false;
}

const PROXY_HOSTS = [
  "drive.google.com",
  "drive.usercontent.google.com",
  "dl.dropboxusercontent.com",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
];

function resolveAudioSrc(url: string): string {
  try {
    const u = new URL(url);
    if (PROXY_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
      return `/api/audio-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // relative URL 등은 그대로
  }
  return url;
}

export function SongPlayer({ resources }: Props) {
  const playable = resources.filter(isInlinePlayable);

  // 파트별 그룹 (등장 순서 유지)
  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const r of playable) {
      const key = normalizePart(r.part);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()].map(([part, items]) => ({ part, items }));
  }, [playable]);

  const [activeId, setActiveId] = useState<string | null>(playable[0]?.id ?? null);

  // 리소스가 바뀔 때 active 가 사라지면 첫 번째로 보정
  useEffect(() => {
    if (!activeId || !playable.find((r) => r.id === activeId)) {
      setActiveId(playable[0]?.id ?? null);
    }
  }, [playable, activeId]);

  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const handleError = useCallback((id: string) => {
    setFailedIds((prev) => new Set(prev).add(id));
  }, []);

  const active = playable.find((r) => r.id === activeId) ?? null;

  if (playable.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">등록된 연습 리소스가 없습니다.</p>
      </div>
    );
  }

  // 같은 파트가 2개 이상이면 파트 뒤에 인덱스 표시용
  const partCounts = new Map<string, number>();
  for (const { part, items } of grouped) {
    partCounts.set(part, items.length);
  }

  return (
    <div>
      {/* 소스 선택 버튼 (파트 라벨만) */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {grouped.flatMap(({ part, items }) =>
          items.map((r, i) => {
            const isActive = r.id === activeId;
            const failed = failedIds.has(r.id);
            const label = (partCounts.get(part) ?? 0) > 1 ? `${part} ${i + 1}` : part;
            return (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                disabled={failed}
                title={r.label ?? r.url}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  failed
                    ? "bg-gray-100 text-gray-400 line-through"
                    : isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700"
                }`}
              >
                {label}
              </button>
            );
          }),
        )}
      </div>

      {/* 플레이어 */}
      {active ? (
        <PlayerShell resource={active} onError={handleError} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400">
          재생 가능한 소스를 선택하세요.
        </div>
      )}
    </div>
  );
}

// ─── 플레이어 셸 ───
function PlayerShell({ resource, onError }: { resource: Resource; onError: (id: string) => void }) {
  if (isMidi(resource)) {
    return <MidiPlayer key={resource.id} src={resolveAudioSrc(resource.url)} />;
  }
  if (isYouTubeUrl(resource.url)) {
    return <YouTubePlayer key={resource.id} url={resource.url} />;
  }
  if (/\.(mp4|webm)(\?.*)?$/i.test(resource.url)) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video key={resource.id} controls className="h-full w-full" preload="none" onError={() => onError(resource.id)}>
          <source src={resolveAudioSrc(resource.url)} />
        </video>
      </div>
    );
  }
  return (
    <AudioPlayer
      key={resource.id}
      src={resolveAudioSrc(resource.url)}
      id={resource.id}
      onError={onError}
    />
  );
}

// ─── 오디오 플레이어 (배속 · 구간반복 · seek) ───
const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];
type ABMode = "off" | "setA" | "setB" | "active";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AudioPlayer({ src, id, onError }: { src: string; id: string; onError: (id: string) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const [dragging, setDragging] = useState<"a" | "b" | "seek" | null>(null);

  // tick이 매번 재생성되지 않도록 AB 상태를 ref에 동기화
  const abRef = useRef({ abMode, pointA, pointB, dragging });
  useEffect(() => {
    abRef.current = { abMode, pointA, pointB, dragging };
  }, [abMode, pointA, pointB, dragging]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    const s = abRef.current;
    if (s.abMode === "active" && s.pointA !== null && s.pointB !== null && !s.dragging) {
      if (audio.currentTime >= s.pointB) audio.currentTime = s.pointA;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onPlay = () => { setPlaying(true); rafRef.current = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(rafRef.current); };
    const onEnd = () => { setPlaying(false); if (loop) { audio.currentTime = 0; audio.play(); } };
    const onErr = () => onError(id);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
      cancelAnimationFrame(rafRef.current);
    };
  }, [tick, loop, id, onError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
  };

  const getTimeFromClientX = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const handleBarDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const t = getTimeFromClientX(clientX);

    if (abMode === "setA") {
      setPointA(t);
      setAbMode("setB");
      return;
    }
    if (abMode === "setB" && pointA !== null) {
      if (t > pointA) {
        setPointB(t);
        setAbMode("active");
        audio.currentTime = pointA;
        audio.play().catch(() => {});  // B 설정 직후 자동 재생
      }
      return;
    }
    // active 상태에서 A·B 핸들 근처면 드래그 시작
    if (abMode === "active" && pointA !== null && pointB !== null) {
      const handleRadius = duration * 0.02;
      if (Math.abs(t - pointA) < handleRadius) { setDragging("a"); return; }
      if (Math.abs(t - pointB) < handleRadius) { setDragging("b"); return; }
    }
    // 일반 seek (드래그 가능)
    setDragging("seek");
    audio.currentTime = t;
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
      const t = getTimeFromClientX(clientX);
      const audio = audioRef.current;
      if (dragging === "seek" && audio) {
        audio.currentTime = t;
      } else if (dragging === "a" && pointB !== null) {
        setPointA(Math.min(t, pointB - 0.5));
      } else if (dragging === "b" && pointA !== null) {
        setPointB(Math.max(t, pointA + 0.5));
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
  }, [dragging, pointA, pointB, getTimeFromClientX]);

  const toggleAB = () => {
    if (abMode === "off") { setAbMode("setA"); setPointA(null); setPointB(null); }
    else if (abMode === "active") { setAbMode("off"); setPointA(null); setPointB(null); }
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div
        ref={barRef}
        onMouseDown={handleBarDown}
        onTouchStart={handleBarDown}
        className="relative mb-4 h-8 cursor-pointer touch-none select-none"
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
          className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ${
            abMode === "active" ? "bg-emerald-600" : "bg-blue-600"
          }`}
          style={{ left: `${pct(currentTime)}%` }}
        />
        {pointA !== null && (abMode === "setB" || abMode === "active") && (
          <div
            className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white shadow"
            style={{ left: `${pct(pointA)}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">A</span>
          </div>
        )}
        {pointB !== null && abMode === "active" && (
          <div
            className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white shadow"
            style={{ left: `${pct(pointB)}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">B</span>
          </div>
        )}
        {abMode === "setA" && (
          <div
            className="pointer-events-none absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-amber-500 opacity-70"
            style={{ left: `${pct(currentTime)}%` }}
          />
        )}
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
      {abMode === "setA" && <p className="mt-2 text-center text-[10px] text-amber-600">바에서 시작점을 탭하세요</p>}
      {abMode === "setB" && <p className="mt-2 text-center text-[10px] text-amber-600">바에서 끝점을 탭하세요</p>}
    </div>
  );
}
