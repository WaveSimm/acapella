"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { YouTubePlayer } from "./youtube-player";

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

const PART_ORDER = ["ALL", "SOPRANO", "ALTO", "TENOR", "BASS"] as const;
const PART_LABELS: Record<string, string> = {
  ALL: "전체",
  SOPRANO: "소프",
  ALTO: "알토",
  TENOR: "테너",
  BASS: "베이스",
};

function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function isInlinePlayable(r: Resource): boolean {
  if (r.resourceType === "MIDI" || r.resourceType === "SCORE_PREVIEW") return false;
  if (/\.(mid|midi)(\?.*)?$/i.test(r.url)) return false;
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

function sourceTitle(r: Resource): string {
  if (r.label) return r.label;
  if (r.url.startsWith("/api/files/")) return "업로드 파일";
  if (isYouTubeUrl(r.url)) return "YouTube";
  try {
    const u = new URL(r.url);
    const file = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    if (file && !/^\s*$/.test(file)) return file;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return r.url;
  }
}

function sourceTypeBadge(r: Resource): string {
  if (isYouTubeUrl(r.url)) return "▶";
  if (r.resourceType === "AUDIO" || /\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(r.url)) return "🎵";
  return "🎬";
}

export function SongPlayer({ resources }: Props) {
  const playable = resources.filter(isInlinePlayable);

  // 파트별 그룹
  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const r of playable) {
      const arr = map.get(r.part) ?? [];
      arr.push(r);
      map.set(r.part, arr);
    }
    const ordered: { part: string; items: Resource[] }[] = [];
    for (const p of PART_ORDER) {
      const items = map.get(p);
      if (items && items.length > 0) ordered.push({ part: p, items });
    }
    for (const [p, items] of map) {
      if (!PART_ORDER.includes(p as typeof PART_ORDER[number])) {
        ordered.push({ part: p, items });
      }
    }
    return ordered;
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

  return (
    <div>
      {/* 파트별 소스 리스트 */}
      <ul className="mb-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {grouped.map(({ part, items }) => (
          <li key={part} className="flex items-start gap-3 px-3 py-2">
            <span className="w-10 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-center text-[11px] font-medium text-blue-600">
              {PART_LABELS[part] ?? part}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {items.map((r) => {
                const isActive = r.id === activeId;
                const failed = failedIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => { setActiveId(r.id); }}
                    disabled={failed}
                    className={`inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
                      failed
                        ? "bg-gray-100 text-gray-400 line-through"
                        : isActive
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700"
                    }`}
                    title={r.url}
                  >
                    <span>{sourceTypeBadge(r)}</span>
                    <span className="truncate">{sourceTitle(r)}</span>
                    {failed && <span className="ml-1 text-[9px]">불가</span>}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

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

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (abMode === "active" && pointA !== null && pointB !== null) {
      if (audio.currentTime >= pointB) audio.currentTime = pointA;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [abMode, pointA, pointB]);

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

  const seekFromEvent = (clientX: number) => {
    const bar = barRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    if (abMode === "setA") {
      setPointA(t);
      setAbMode("setB");
    } else if (abMode === "setB" && pointA !== null) {
      if (t > pointA) { setPointB(t); setAbMode("active"); audio.currentTime = pointA; }
    } else {
      audio.currentTime = t;
    }
  };

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
