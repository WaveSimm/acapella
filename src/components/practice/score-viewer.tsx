"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface Props {
  src: string;
  highlightPart?: string | null;
  /** 재생 현재 시간 (초) */
  cursorTime?: number | null;
  /** 악보 Tempo (BPM) */
  tempoBpm?: number;
  /** OSMD 줌 배율 (기본 0.5) */
  zoom?: number;
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

export function ScoreViewer({ src, highlightPart, cursorTime, tempoBpm, zoom = DEFAULT_ZOOM, onReady }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const cursorOverlayRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const measureBoundsRef = useRef<MeasureBound[]>([]);
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

    // OSMD 내부 GraphicalMeasure 에서 좌표 획득.
    // 경로: GraphicSheet.MusicPages[0].MusicSystems[*].GraphicalMeasures[staffIdx][measureInSystemIdx]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gs = osmd.GraphicSheet as any;
    const pages = gs?.MusicPages;
    const mountRect = mount.getBoundingClientRect();
    const bounds: MeasureBound[] = [];

    if (pages && pages.length > 0) {
      // GraphicalMeasures 구조는 [measureIdx][staffIdx]. outer를 순회해 각 마디의 첫 스태프 좌표 사용.
      for (const page of pages) {
        for (const system of page.MusicSystems ?? []) {
          const measureRows = system.GraphicalMeasures ?? [];
          for (const row of measureRows) {
            // 가시 스태프 우선으로 첫 유효 GraphicalMeasure 찾기
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
              const unitToPx = 10;
              x = gm.PositionAndShape.AbsolutePosition.x * unitToPx;
              w = gm.PositionAndShape.Size.width * unitToPx;
            }
            const measureIdx = bounds.length;
            const startTime = measureIdx * secPerMeasure;
            bounds.push({ x, width: w, startTime, endTime: startTime + secPerMeasure });
          }
        }
      }
    }

    // Fallback: GraphicSheet API 경로가 달라 데이터를 못 얻으면 전체 너비 균등 분할
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
        const avg = (maxRight - minLeft) / totalMeasures;
        for (let i = 0; i < totalMeasures; i++) {
          const startTime = i * secPerMeasure;
          bounds.push({
            x: minLeft + i * avg,
            width: avg,
            startTime,
            endTime: startTime + secPerMeasure,
          });
        }
      }
    }

    console.log("[ScoreViewer] bounds built:", bounds.length, "bpm:", bpm, "ts:", tsNum + "/" + tsDen, "secPerMeasure:", secPerMeasure.toFixed(2), "firstWidth:", (bounds[0]?.width ?? 0).toFixed(1), "firstX:", (bounds[0]?.x ?? 0).toFixed(1));
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
          if ("MaximumLyricsElongationFactor" in rules) rules.MaximumLyricsElongationFactor = 1.0;
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
              console.log("[ScoreViewer] measureBounds built:", bounds.length);
            });
          } else {
            measureBoundsRef.current = bounds;
            positionCursorAtStart();
            console.log("[ScoreViewer] measureBounds built:", bounds.length);
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

  // 3) zoom 변경 시 재렌더 + 마디 바운드 재구축
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current) return;
    const osmd = osmdRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((osmd as any).zoom !== zoom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (osmd as any).zoom = zoom;
      osmd.render();
      requestAnimationFrame(() => {
        measureBoundsRef.current = buildMeasureBounds();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, status]);

  // 4) 커서 이동 — 프리컴퓨트된 마디 바운드 + CSS transform만 사용. OSMD 상호작용 없음.
  const prevCursorTimeRef = useRef(0);
  useEffect(() => {
    if (status !== "ready" || cursorTime == null) return;
    let bounds = measureBoundsRef.current;
    if (bounds.length === 0) {
      bounds = buildMeasureBounds();
      measureBoundsRef.current = bounds;
    }
    const overlay = cursorOverlayRef.current;
    if (bounds.length === 0 || !overlay) return;

    // 점프 필터: 정상 재생은 100ms 간격이라 delta ≈ 0.1s. delta > 1s면 engine 버퍼/워밍업 글리치로 간주.
    // 첫 sample이 큰 값이면 0으로 스냅, 이후 tick부터 자연스럽게 따라감.
    const prev = prevCursorTimeRef.current;
    const delta = cursorTime - prev;
    if (delta > 1.0) {
      prevCursorTimeRef.current = cursorTime;
      // overlay는 이전 위치(또는 첫 마디) 유지
      if (prev < 0.1) overlay.style.transform = `translateX(${bounds[0].x}px)`;
      return;
    }
    prevCursorTimeRef.current = cursorTime;

    // binary search로 cursorTime 이 속한 마디 찾기
    let lo = 0, hi = bounds.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bounds[mid].startTime <= cursorTime) lo = mid;
      else hi = mid - 1;
    }
    const m = bounds[lo];
    if (!m) return;
    const progress = Math.max(0, Math.min(1, (cursorTime - m.startTime) / (m.endTime - m.startTime)));
    const x = m.x + progress * m.width;
    overlay.style.transform = `translateX(${x}px)`;

    // 가로 스크롤 (경량): smooth behavior 는 모바일에서 메인스레드 블록 유발 → 즉시 스크롤
    const viewport = viewportRef.current;
    if (viewport) {
      const relX = x - viewport.scrollLeft;
      const leftThreshold = viewport.clientWidth * 0.15;
      const rightThreshold = viewport.clientWidth * 0.85;
      if (relX < leftThreshold || relX > rightThreshold) {
        const target = Math.max(0, x - viewport.clientWidth * 0.3);
        // scrollLeft 직접 대입 = instant, 모바일에서 훨씬 가벼움
        viewport.scrollLeft = target;
      }
    }
  }, [cursorTime, status]);

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
        {/* 커스텀 커서 — OSMD 내장 커서 대신 가벼운 overlay 사용 */}
        <div
          ref={cursorOverlayRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 bottom-0 w-0.5 bg-emerald-500/70"
          style={{ transform: "translateX(-100px)", willChange: "transform" }}
        />
      </div>
    </div>
  );
}
