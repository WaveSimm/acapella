"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { loadMeasureTimes, getFirstNoteTime, type MeasureTime } from "@/lib/midi-time-map";

interface Props {
  src: string;
  highlightPart?: string | null;
  /** 재생 현재 시간 (초) */
  cursorTime?: number | null;
  /** 악보 Tempo (BPM) */
  tempoBpm?: number;
  /** OSMD 줌 배율 (기본 0.5) */
  zoom?: number;
  /** 노트 간격 배수 (기본 1.0). 1보다 크면 더 넓게, 작으면 더 좁게. 듀레이션 비례 유지. */
  noteSpacing?: number;
  /** MIDI 파일 URL — 템포/박자 변화까지 반영한 정확한 시간→마디 매핑에 사용 */
  midiSrc?: string;
  /** MIDI 재생 중 여부 — 오버레이 표시 판정에 사용 */
  isPlaying?: boolean;
  onReady?: (info: ScoreInfo) => void;
}

export interface ScoreInfo {
  title: string;
  partNames: string[];
  tempoBpm: number | null;
  duration: number | null;
  /** 커서 맵 프리컴퓨트까지 완료 여부 — false면 play 비활성 */
  playable: boolean;
}

const DEFAULT_ZOOM = 0.5;

interface MeasureBound {
  x: number;       // mount 기준 좌측 X (px)
  width: number;   // 마디 폭 (px)
  startTime: number; // 초
  endTime: number;   // 초
}

export function ScoreViewer({ src, highlightPart, cursorTime, tempoBpm, zoom = DEFAULT_ZOOM, noteSpacing = 1.0, midiSrc, isPlaying, onReady }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const cursorOverlayRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const measureBoundsRef = useRef<MeasureBound[]>([]);
  const measureTimesRef = useRef<MeasureTime[]>([]);
  const firstNoteTimeRef = useRef<number>(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  // bounds 가 준비되면 overlay 를 즉시 첫 마디 시작점에 배치해 재생 시작 점프 방지
  function positionCursorAtStart() {
    const overlay = cursorOverlayRef.current;
    const bounds = measureBoundsRef.current;
    if (!overlay || bounds.length === 0) return;
    overlay.style.transform = `translateX(${bounds[0].x}px)`;
  }

  // 마디 경계 프리컴퓨트: OSMD GraphicalMeasures 에서 정확한 각 마디 X/width 추출
  function buildMeasureBounds() {
    const mount = mountRef.current;
    const osmd = osmdRef.current;
    if (!mount || !osmd) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpm = (osmd.Sheet as any).DefaultStartTempoInBpm ?? tempoBpm ?? 120;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sm = osmd.Sheet?.SourceMeasures?.[0] as any;
    const ts = sm?.ActiveTimeSignature ?? sm?.activeTimeSignature ?? sm?.Rhythm;
    let tsNum = 4, tsDen = 4;
    if (ts) {
      tsNum = ts.Numerator ?? ts.numerator ?? ts.RealValue?.Numerator ?? 4;
      tsDen = ts.Denominator ?? ts.denominator ?? ts.RealValue?.Denominator ?? 4;
    }
    const secPerMeasure = (tsNum / tsDen) * 240 / bpm;

    // OSMD GraphicalMeasures 에서 마디별 실제 Stave 요소의 bounding rect 사용.
    // [measureIdx][staffIdx] 구조. 첫 유효 스태프의 X, width를 마디 좌표로.
    const mountRect = mount.getBoundingClientRect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gs = osmd.GraphicSheet as any;
    const pages = gs?.MusicPages ?? [];
    const bounds: MeasureBound[] = [];

    for (const page of pages) {
      for (const system of page.MusicSystems ?? []) {
        const measureRows = system.GraphicalMeasures ?? [];
        for (const row of measureRows) {
          let gm = null;
          for (const candidate of row ?? []) {
            if (candidate?.PositionAndShape) { gm = candidate; break; }
          }
          if (!gm) continue;
          const svgEl: SVGGraphicsElement | undefined = gm.Stave?.attrs?.elem || gm.Stave?.element;
          let x = 0, w = 0;
          if (svgEl && typeof svgEl.getBoundingClientRect === "function") {
            const r = svgEl.getBoundingClientRect();
            x = r.left - mountRect.left;
            w = r.width;
          } else {
            // PositionAndShape 는 OSMD 내부 단위 — zoom 반영 필요
            const unitToPx = 10 * zoom;
            x = gm.PositionAndShape.AbsolutePosition.x * unitToPx;
            w = gm.PositionAndShape.Size.width * unitToPx;
          }
          const measureIdx = bounds.length;
          const startTime = measureIdx * secPerMeasure;
          bounds.push({ x, width: w, startTime, endTime: startTime + secPerMeasure });
        }
      }
    }

    // Fallback: API 경로가 달라서 실패했을 때만 전체 너비 균등 분할
    if (bounds.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalMeasures = (osmd.Sheet?.SourceMeasures?.length as number) ?? 1;
      const staves = mount.querySelectorAll<SVGGraphicsElement>("g.vf-stave");
      let minLeft = Infinity, maxRight = -Infinity;
      for (const el of Array.from(staves)) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0) continue;
        const left = r.left - mountRect.left;
        const right = left + r.width;
        if (left < minLeft) minLeft = left;
        if (right > maxRight) maxRight = right;
      }
      if (isFinite(minLeft) && isFinite(maxRight) && totalMeasures > 0) {
        const mw = (maxRight - minLeft) / totalMeasures;
        for (let i = 0; i < totalMeasures; i++) {
          const startTime = i * secPerMeasure;
          bounds.push({ x: minLeft + i * mw, width: mw, startTime, endTime: startTime + secPerMeasure });
        }
      }
    }

    return bounds;
  }

  // 1) 로드 + 렌더 + 마디 바운드 구축
  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const mod = await import("opensheetmusicdisplay");
        if (cancelled) return;
        const osmd = new mod.OpenSheetMusicDisplay(mountRef.current!, {
          autoResize: false,
          drawingParameters: "compact",
          drawPartNames: true,
          drawMeasureNumbers: true,
          drawTitle: false,
          followCursor: false,
        });
        osmdRef.current = osmd;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules = (osmd as any).EngravingRules ?? (osmd as any).rules;
        if (rules) {
          rules.RenderSingleHorizontalStaffline = true;
          if (typeof rules.PageHeight === "number") rules.PageHeight = 2000;
          // 가사가 노트 폭을 밀어내지 않도록 모든 lyric padding/elongation 비활성
          if ("MaximumLyricsElongationFactor" in rules) rules.MaximumLyricsElongationFactor = 1.0;
          if ("LyricsUseXPaddingForLongLyrics" in rules) rules.LyricsUseXPaddingForLongLyrics = false;
          if ("LyricsXPaddingFactorForLongLyrics" in rules) rules.LyricsXPaddingFactorForLongLyrics = 0;
          if ("BetweenSyllableMinimumDistance" in rules) rules.BetweenSyllableMinimumDistance = 0;
          if ("LyricsXPaddingForLastNoteInMeasure" in rules) rules.LyricsXPaddingForLastNoteInMeasure = false;
          // 마디 폭은 항상 자동(콘텐츠 기반) — 노트 간격은 noteSpacing 배수로 조정
          if ("FixedMeasureWidth" in rules) rules.FixedMeasureWidth = false;
          // 노트 간격을 듀레이션 비례로 — OSMD 는 VexFlow 의 softmax 로 spacing 결정.
          // SoftmaxFactor 가 높을수록 긴 노트와 짧은 노트의 폭 차이가 커짐 (기본 15).
          if ("SoftmaxFactorVexFlow" in rules) rules.SoftmaxFactorVexFlow = 100;
          // noteSpacing 배수 적용 — 자동 모드에서 노트 간격을 사용자가 조정 가능
          if ("MinNoteDistance" in rules) rules.MinNoteDistance = 1.0 * noteSpacing;
          if ("VoiceSpacingMultiplierVexflow" in rules) rules.VoiceSpacingMultiplierVexflow = 1.0 * noteSpacing;
          if ("VoiceSpacingAddendVexflow" in rules) rules.VoiceSpacingAddendVexflow = 1.0 * noteSpacing;
        }
        const sep = src.includes("?") ? "&" : "?";
        const res = await fetch(`${src}${sep}t=${Date.now()}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`악보 로딩 실패 (HTTP ${res.status})`);
        const xml = await res.text();
        if (xml.length < 100 || !xml.includes("<score-partwise")) {
          throw new Error(`악보 데이터 형식 오류 (길이 ${xml.length})`);
        }
        try {
          await osmd.load(xml);
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          throw new Error(`OSMD load 실패: ${msg}`);
        }
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (osmd as any).zoom = zoom;
        osmd.render();
        const title = osmd.Sheet.Title?.text ?? "";
        const partNames: string[] = (osmd.Sheet.Instruments ?? []).map((ins) => ins.Name || "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempoBpmVal = (osmd.Sheet as any).DefaultStartTempoInBpm ?? null;
        setStatus("ready");
        // 악보 렌더 완료 → 재생 버튼 활성화. 마디 경계는 best-effort로 rAF 이후 구축.
        onReady?.({
          title,
          partNames,
          tempoBpm: tempoBpmVal,
          duration: null,
          playable: true,
        });
        requestAnimationFrame(() => {
          let bounds = buildMeasureBounds();
          if (bounds.length === 0) {
            // 두 번째 시도 — 레이아웃 지연 대비
            requestAnimationFrame(() => {
              bounds = buildMeasureBounds();
              measureBoundsRef.current = bounds;
              positionCursorAtStart();
            });
          } else {
            measureBoundsRef.current = bounds;
            positionCursorAtStart();
          }
        });
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // buildMeasureBounds는 function이라 deps에 안 넣어도 안전
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, zoom]);

  // 2) 파트 선택 → Instrument.Visible + 재렌더 + 마디 바운드 재구축
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current) return;
    const osmd = osmdRef.current;
    const instruments = osmd.Sheet.Instruments ?? [];
    let changed = false;
    instruments.forEach((inst) => {
      const shouldShow = !highlightPart || inst.Name === highlightPart;
      if (inst.Visible !== shouldShow) {
        inst.Visible = shouldShow;
        changed = true;
      }
    });
    if (!changed) return;
    try {
      osmd.render();
      requestAnimationFrame(() => {
        measureBoundsRef.current = buildMeasureBounds();
      });
    } catch (e) {
      console.warn("[ScoreViewer] render error:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPart, status]);

  // 3) zoom 또는 measureWidth 변경 시 재렌더 + 바운드 재구축
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current) return;
    const osmd = osmdRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rules = (osmd as any).EngravingRules ?? (osmd as any).rules;
    if (rules) {
      // noteSpacing 슬라이더 변경 반영
      if ("MinNoteDistance" in rules) rules.MinNoteDistance = 1.0 * noteSpacing;
      if ("VoiceSpacingMultiplierVexflow" in rules) rules.VoiceSpacingMultiplierVexflow = 1.0 * noteSpacing;
      if ("VoiceSpacingAddendVexflow" in rules) rules.VoiceSpacingAddendVexflow = 1.0 * noteSpacing;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((osmd as any).zoom !== zoom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (osmd as any).zoom = zoom;
    }
    osmd.render();
    requestAnimationFrame(() => {
      measureBoundsRef.current = buildMeasureBounds();
      positionCursorAtStart();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, noteSpacing, status]);

  // MIDI 파일에서 각 마디의 실제 시작 시간(초) 추출 — 템포 변화 반영
  useEffect(() => {
    if (!midiSrc) return;
    let cancelled = false;
    loadMeasureTimes(midiSrc)
      .then((times) => {
        if (cancelled) return;
        measureTimesRef.current = times;
      })
      .catch((e) => console.warn("[ScoreViewer] measureTimes load failed:", e));
    return () => { cancelled = true; };
  }, [midiSrc]);

  // highlightPart의 첫 노트 시작 시간 — 재생 시 커서 위치 floor로 사용
  useEffect(() => {
    if (!midiSrc) return;
    let cancelled = false;
    getFirstNoteTime(midiSrc, highlightPart ?? null)
      .then((t) => {
        if (cancelled) return;
        firstNoteTimeRef.current = t ?? 0;
      })
      .catch((e) => console.warn("[ScoreViewer] firstNoteTime load failed:", e));
    return () => { cancelled = true; };
  }, [midiSrc, highlightPart]);

  // 4) 커서 이동 — 프리컴퓨트된 마디 바운드 + CSS transform. OSMD 상호작용 없음.
  useEffect(() => {
    if (status !== "ready" || cursorTime == null) return;
    let bounds = measureBoundsRef.current;
    if (bounds.length === 0) {
      bounds = buildMeasureBounds();
      measureBoundsRef.current = bounds;
    }
    const overlay = cursorOverlayRef.current;
    if (bounds.length === 0 || !overlay) return;

    // 재생 중 엔진 warmup으로 인한 초기 지연/점프를 흡수 — 커서는 첫 노트 위치를 floor로 유지
    const effectiveTime = isPlaying
      ? Math.max(cursorTime, firstNoteTimeRef.current)
      : cursorTime;

    // measureTimes (MIDI 기반) 우선, 없으면 bounds linear fallback
    const times = measureTimesRef.current;
    let measureIdx = 0;
    let startT = 0, endT = 0;
    if (times.length > 0) {
      let lo = 0, hi = Math.min(times.length, bounds.length) - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid].startTime <= effectiveTime) lo = mid;
        else hi = mid - 1;
      }
      measureIdx = lo;
      startT = times[measureIdx].startTime;
      endT = times[measureIdx].endTime;
    } else {
      let lo = 0, hi = bounds.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (bounds[mid].startTime <= effectiveTime) lo = mid;
        else hi = mid - 1;
      }
      measureIdx = lo;
      startT = bounds[measureIdx].startTime;
      endT = bounds[measureIdx].endTime;
    }
    const m = bounds[Math.min(measureIdx, bounds.length - 1)];
    if (!m) return;
    const progress = endT > startT
      ? Math.max(0, Math.min(1, (effectiveTime - startT) / (endT - startT)))
      : 0;
    const x = m.x + progress * m.width;
    overlay.style.transform = `translateX(${x}px)`;

    // 가로 스크롤
    const viewport = viewportRef.current;
    if (viewport) {
      const relX = x - viewport.scrollLeft;
      const leftThreshold = viewport.clientWidth * 0.15;
      const rightThreshold = viewport.clientWidth * 0.85;
      if (relX < leftThreshold || relX > rightThreshold) {
        viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * 0.3);
      }
    }
  }, [cursorTime, status, isPlaying]);

  // 엔진 워밍업 감지: 재생 중인데 cursorTime 이 아직 0 에 가까우면 "준비중" 상태
  const warmingUp = !!(isPlaying && (cursorTime ?? 0) < 0.1);

  if (status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-700">악보를 불러올 수 없습니다.</p>
        <p className="mt-1 text-xs text-red-500">{errMsg}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2">
      {status === "loading" && (
        <div className="py-12 text-center text-xs text-gray-400">악보를 불러오는 중...</div>
      )}
      <div
        ref={viewportRef}
        className="relative w-full overflow-x-auto overflow-y-hidden"
      >
        <div ref={mountRef} className="relative inline-block" style={{ minWidth: "100%" }} />
        {/* 커스텀 커서 — OSMD 내장 커서 대신 가벼운 overlay 사용. 워밍업 중엔 숨김. */}
        <div
          ref={cursorOverlayRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 bottom-0 w-0.5 bg-emerald-500/70"
          style={{
            transform: "translateX(-100px)",
            willChange: "transform",
          }}
        />
        {warmingUp && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow">
              재생 준비중…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
