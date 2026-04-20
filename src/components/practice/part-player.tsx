"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PartTabs } from "./part-tabs";
import { PartBadge } from "@/components/ui/badge";
import { YouTubePlayer } from "./youtube-player";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
  url: string;
  sourceSite: string | null;
}

interface PartPlayerProps {
  resources: Resource[];
  publisherName?: string;
}

function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

// CORS 헤더가 없거나 redirect 체인에서 CORS 깨지는 외부 MP3 호스팅을
// 서버 프록시를 통해 스트리밍. cafe24처럼 CORS OK인 호스트는 그대로.
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
    // 이상한 URL은 그대로 통과
  }
  return url;
}

function isInlinePlayable(resource: { resourceType: string; url: string }): boolean {
  if (resource.resourceType === "AUDIO") return true;
  if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(resource.url)) return true;
  if (isYouTubeUrl(resource.url)) return true;
  if (/\.(mp4|webm)(\?.*)?$/i.test(resource.url)) return true;
  return false;
}

function SourceTag({
  publisherName,
  practicePageUrl,
}: {
  publisherName?: string;
  practicePageUrl?: string;
}) {
  if (!publisherName) return null;
  if (practicePageUrl) {
    return (
      <a
        href={practicePageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-xs text-blue-500 underline underline-offset-2 hover:text-blue-700"
      >
        · 출처 {publisherName} 연습실
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
  }
  return <span className="text-xs text-gray-400">· 출처 {publisherName}</span>;
}

function getYouTubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([^&?\s/]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

function getResourceLabel(url: string): string {
  const filename = url.split("/").pop() ?? "";
  if (filename.match(/\d+_(sop|alt|ten|bas)/i)) return "연습실 음원링크";
  if (filename.match(/-[12]\./)) {
    const num = filename.match(/-(\d)\./)?.[1];
    return `파트 연습 ${num}`;
  }
  return filename.replace(/\.[^.]+$/, "");
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];

type ABMode = "off" | "setA" | "setB" | "active";

function PracticePlayer({ src, id, onError }: { src: string; id: string; onError?: (id: string) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

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

  // --- 시간 업데이트 (requestAnimationFrame for smooth) ---
  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);

    // A-B 구간 반복 체크
    if (abMode === "active" && pointA !== null && pointB !== null) {
      if (audio.currentTime >= pointB) {
        audio.currentTime = pointA;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [abMode, pointA, pointB]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => { setPlaying(true); rafRef.current = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(rafRef.current); };
    const onMeta = () => setDuration(audio.duration);
    const onEnded = () => { if (!loop) setPlaying(false); };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
  }, [tick, loop]);

  // --- 프로그레스바 위치 계산 ---
  const getTimeFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const bar = barRef.current;
    if (!bar || duration === 0) return 0;
    const rect = bar.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  // --- 프로그레스바 인터랙션 ---
  const handleBarDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const time = getTimeFromEvent(e);

    if (abMode === "setA") {
      setPointA(time);
      setAbMode("setB");
      return;
    }
    if (abMode === "setB") {
      if (pointA !== null && time > pointA) {
        setPointB(time);
        setAbMode("active");
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = pointA;
          if (audio.paused) audio.play();
        }
      }
      return;
    }

    // active 모드: A/B 핸들 근처면 드래그, 아니면 seek
    if (abMode === "active" && pointA !== null && pointB !== null) {
      const handleRadius = duration * 0.02; // 2% 범위
      if (Math.abs(time - pointA) < handleRadius) {
        setDragging("a");
        return;
      }
      if (Math.abs(time - pointB) < handleRadius) {
        setDragging("b");
        return;
      }
    }

    // 일반 seek
    setDragging("seek");
    if (audioRef.current) audioRef.current.currentTime = time;
  }, [abMode, pointA, pointB, duration, getTimeFromEvent]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const time = getTimeFromEvent(e);
      if (dragging === "seek" && audioRef.current) {
        audioRef.current.currentTime = time;
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
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // A-B 활성 시 A 지점에서 시작
      if (abMode === "active" && pointA !== null) {
        audio.currentTime = pointA;
      }
      audio.play().then(() => {
        setPlaying(true);
        rafRef.current = requestAnimationFrame(tick);
      }).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    }
  };

  const skip = (sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + sec));
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    if (audioRef.current) audioRef.current.loop = next;
  };

  const toggleAB = () => {
    if (abMode === "off") {
      setAbMode("setA");
      setLoop(false);
      if (audioRef.current) audioRef.current.loop = false;
    } else {
      setAbMode("off");
      setPointA(null);
      setPointB(null);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  // --- 비율 계산 ---
  const pct = (t: number) => duration > 0 ? (t / duration) * 100 : 0;

  // --- A-B 버튼 스타일 ---
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

  return (
    <div className="select-none">
      {/* Hidden audio */}
      <audio
        ref={audioRef}
        key={id}
        src={src}
        preload="metadata"
        onError={() => onError?.(id)}
      />

      {/* 시간 표시 */}
      <div className="mb-1 flex items-center justify-between text-xs tabular-nums text-gray-500">
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
        {/* 트랙 배경 */}
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200" />

        {/* A-B 구간 하이라이트 */}
        {pointA !== null && pointB !== null && abMode === "active" && (
          <>
            {/* 구간 배경 */}
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-emerald-100"
              style={{ left: `${pct(pointA)}%`, width: `${pct(pointB) - pct(pointA)}%` }}
            />
            {/* ��간 내 진행 바 */}
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-l-full bg-emerald-400/60"
              style={{
                left: `${pct(pointA)}%`,
                width: `${Math.max(0, Math.min(pct(currentTime) - pct(pointA), pct(pointB) - pct(pointA)))}%`,
              }}
            />
          </>
        )}

        {/* 진행 바 (A-B 비활성 시만) */}
        {abMode !== "active" && (
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
            style={{ width: `${pct(currentTime)}%` }}
          />
        )}

        {/* 재생 헤드 */}
        <div
          className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ${
            abMode === "active" ? "bg-emerald-600" : "bg-blue-600"
          }`}
          style={{ left: `${pct(currentTime)}%` }}
        />

        {/* A 핸들 */}
        {pointA !== null && (abMode === "setB" || abMode === "active") && (
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white shadow-md"
            style={{ left: `${pct(pointA)}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">A</span>
          </div>
        )}

        {/* B 핸들 */}
        {pointB !== null && abMode === "active" && (
          <div
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white shadow-md"
            style={{ left: `${pct(pointB)}%` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700">B</span>
          </div>
        )}

        {/* A 설정 안내 마커 (setA 모드에서 현재 위치) */}
        {abMode === "setA" && (
          <div
            className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-amber-500 opacity-50"
            style={{ left: `${pct(currentTime)}%` }}
          />
        )}
      </div>

      {/* 안내 메시지 */}
      {abMode === "setA" && (
        <p className="mt-0.5 text-center text-xs text-amber-600">바에서 시작점을 탭하세요</p>
      )}
      {abMode === "setB" && (
        <p className="mt-0.5 text-center text-xs text-amber-600">바에서 끝점을 탭하세요</p>
      )}
      {abMode === "active" && (
        <p className="mt-0.5 text-center text-xs text-emerald-600">A/B 핸들을 드래그하여 조정</p>
      )}

      {/* 컨트롤 바 */}
      <div className="mt-3 flex items-center justify-center gap-1">
        {/* 5초 뒤로 */}
        <button
          onClick={() => skip(-5)}
          className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-200"
          title="5초 뒤로"
          aria-label="5초 뒤로"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
        </button>

        {/* 재생/일시정지 */}
        <button
          onClick={togglePlay}
          className="rounded-full bg-blue-600 p-3 text-white shadow-md transition-colors hover:bg-blue-700 active:bg-blue-800"
          title={playing ? "일시정지" : "재생"}
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* 5초 앞으로 */}
        <button
          onClick={() => skip(5)}
          className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-200"
          title="5초 앞으로"
          aria-label="5초 앞으로"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        {/* 전체 반복 */}
        <button
          onClick={toggleLoop}
          title={loop ? "전체 반복 해제" : "전체 반복"}
          aria-label={loop ? "전체 반복 해제" : "전체 반복"}
          aria-pressed={loop}
          className={`rounded-full p-2 transition-colors ${
            loop ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12V9a3 3 0 013-3h10l-3-3m0 0l3 3m-3-3M20 12v3a3 3 0 01-3 3H7l3 3m0 0l-3-3m3 3" />
          </svg>
        </button>

        {/* A-B 구간 반복 */}
        <button
          onClick={toggleAB}
          title="구간 반복"
          aria-label={`구간 반복 — ${abBtnLabel()}`}
          aria-pressed={abMode !== "off"}
          className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${abBtnClass()}`}
        >
          {abBtnLabel()}
        </button>

        {/* 배속 */}
        <button
          onClick={cycleSpeed}
          title="재생 속도"
          aria-label={`재생 속도 ${SPEEDS[speedIdx]}배`}
          className={`rounded-full px-2 py-1 text-xs font-bold transition-colors ${
            SPEEDS[speedIdx] !== 1.0
              ? "bg-violet-100 text-violet-700"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {SPEEDS[speedIdx]}x
        </button>
      </div>
    </div>
  );
}

function AudioGroup({ resources }: { resources: Resource[] }) {
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const valid = resources.filter((r) => !failedIds.has(r.id));
  const [activeIdx, setActiveIdx] = useState(0);

  const handleError = useCallback((id: string) => {
    setFailedIds((prev) => new Set(prev).add(id));
  }, []);

  if (valid.length === 0) return null;

  const safeIdx = activeIdx >= valid.length ? 0 : activeIdx;
  const active = valid[safeIdx];

  if (valid.length === 1) {
    return <PracticePlayer key={valid[0].id} src={resolveAudioSrc(valid[0].url)} id={valid[0].id} onError={handleError} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {valid.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setActiveIdx(i)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              safeIdx === i
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {getResourceLabel(r.url)}
          </button>
        ))}
      </div>
      <PracticePlayer key={active.id} src={resolveAudioSrc(active.url)} id={active.id} onError={handleError} />
    </div>
  );
}

function ResourcePlayer({ resource }: { resource: Resource }) {
  const { url, resourceType } = resource;

  if (isYouTubeUrl(url)) {
    return <YouTubePlayer url={url} />;
  }

  if (resourceType === "VIDEO" || /\.(mp4|webm)(\?.*)?$/i.test(url)) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg">
        <video controls className="h-full w-full" preload="none">
          <source src={url} />
        </video>
      </div>
    );
  }

  // 재생 불가한 외부 링크는 헤더의 '출처 … 연습실' 링크로 통합되므로 이 경로는 실제로 사용되지 않음
  return null;
}

export function PartPlayer({ resources, publisherName }: PartPlayerProps) {
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const valid = resources.filter((r) => !failedIds.has(r.id));
  const availableParts = [...new Set(valid.map((r) => r.part))];
  const [activePart, setActivePart] = useState(availableParts[0] ?? "ALL");

  const handleError = useCallback((id: string) => {
    setFailedIds((prev) => new Set(prev).add(id));
  }, []);

  if (valid.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">등록된 연습 리소스가 없습니다.</p>
      </div>
    );
  }

  const filtered = valid.filter((r) => r.part === activePart);

  // 연습실 페이지 URL: 활성 파트와 매칭되는 외부 링크 우선, 없으면 ALL/임의 외부 링크로 폴백
  const externalLinks = valid.filter((r) => !isInlinePlayable(r) && !isYouTubeUrl(r.url));
  const practicePageUrl =
    externalLinks.find((r) => r.part === activePart)?.url ??
    externalLinks.find((r) => r.part === "ALL")?.url ??
    externalLinks[0]?.url;

  // 리소스를 타입별로 그룹화 (외부 링크만인 리소스는 헤더 링크로 흡수되므로 제외)
  const audioResources = filtered.filter(
    (r) => r.resourceType === "AUDIO" || /\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(r.url)
  );
  const otherResources = filtered.filter(
    (r) =>
      r.resourceType !== "AUDIO" &&
      !/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(r.url) &&
      isInlinePlayable(r)
  );

  return (
    <div className="space-y-4">
      <PartTabs
        parts={availableParts}
        activePart={activePart}
        onPartChange={setActivePart}
      />

      <div className="space-y-3">
        {/* 오디오: 하나의 카드에 탭으로 통합 */}
        {audioResources.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <PartBadge part={activePart} />
              <span className="text-xs text-gray-400">음원링크</span>
              <SourceTag publisherName={publisherName} practicePageUrl={practicePageUrl} />
            </div>
            <AudioGroup resources={audioResources} />
          </div>
        )}

        {/* 영상, 악보, 외부링크 등 */}
        {otherResources.map((resource) => {
          const isYouTube = isYouTubeUrl(resource.url);
          const typeLabel =
            resource.resourceType === "VIDEO"
              ? isYouTube
                ? "유튜브링크"
                : "영상링크"
              : resource.resourceType === "SCORE_PREVIEW"
                ? "악보링크"
                : "외부링크";
          // YouTube 등 출판사 외 출처는 출판사명 표시하지 않음
          const showPublisher = !isYouTube;
          return (
            <div key={resource.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <PartBadge part={resource.part} />
                <span className="text-xs text-gray-400">{typeLabel}</span>
                {showPublisher && (
                  <SourceTag publisherName={publisherName} practicePageUrl={practicePageUrl} />
                )}
              </div>
              <ResourcePlayer resource={resource} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
