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

  // 마디 경계 프리컴퓨트: 각 마디의 X좌표·폭·시간 범위를 DOM에서 1회 측정
  function buildMeasureBounds() {
    const mount = mountRef.current;
    const osmd = osmdRef.current;
    if (!mount || !osmd) return [];
    const instruments = osmd.Sheet.Instruments ?? [];
    const numInst = Math.max(1, instruments.filter((i) => i.Visible).length);
    // 다양한 셀렉터 fallback — OSMD 버전별 DOM 구조 차이 대응
    let staves: NodeListOf<SVGGraphicsElement> = mount.querySelectorAll<SVGGraphicsElement>("g.vf-stave");
    if (staves.length === 0) staves = mount.querySelectorAll<SVGGraphicsElement>("g.staffline g.vf-stave");
    if (staves.length === 0) staves = mount.querySelectorAll<SVGGraphicsElement>("[class*='stave']");
    if (staves.length === 0) {
      console.warn("[ScoreViewer] no stave elements found");
      return [];
    }
    const mountRect = mount.getBoundingClientRect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpm = (osmd.Sheet as any).DefaultStartTempoInBpm ?? tempoBpm ?? 120;
    // TimeSig 추출 — OSMD 내부 API 변경 대비 여러 경로 시도
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sm = osmd.Sheet?.SourceMeasures?.[0] as any;
    const ts = sm?.ActiveTimeSignature ?? sm?.activeTimeSignature ?? sm?.Rhythm;
    let tsNum = 4, tsDen = 4;
    if (ts) {
      tsNum = ts.Numerator ?? ts.numerator ?? ts.RealValue?.Numerator ?? 4;
      tsDen = ts.Denominator ?? ts.denominator ?? ts.RealValue?.Denominator ?? 4;
    }
    const secPerMeasure = (tsNum / tsDen) * 240 / bpm;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalMeasures = (osmd.Sheet?.SourceMeasures?.length as number) ?? 1;

    // stave 들의 X 위치 수집 + 소트. OSMD subpixel 노이즈 필터링.
    const xs: { x: number; right: number }[] = [];
    for (const el of Array.from(staves)) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      const x = r.left - mountRect.left;
      xs.push({ x, right: x + r.width });
    }
    if (xs.length === 0 || totalMeasures < 1) {
      console.warn("[ScoreViewer] bounds: insufficient stave data");
      return [];
    }
    xs.sort((a, b) => a.x - b.x);
    const minLeft = xs[0].x;
    const maxRight = Math.max(...xs.map((e) => e.right));
    const totalWidth = maxRight - minLeft;
    // 최소 간격 = 평균 마디 폭의 절반. 이보다 가까우면 같은 마디의 subpixel artifact 로 간주.
    const avgMeasureWidth = totalWidth / totalMeasures;
    const minGap = avgMeasureWidth * 0.5;

    const measureXs: number[] = [xs[0].x];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i].x - measureXs[measureXs.length - 1] >= minGap) {
        measureXs.push(xs[i].x);
      }
    }

    const bounds: MeasureBound[] = [];
    for (let i = 0; i < measureXs.length; i++) {
      const x = measureXs[i];
      const nextX = i < measureXs.length - 1 ? measureXs[i + 1] : maxRight;
      const width = nextX - x;
      const startTime = i * secPerMeasure;
      bounds.push({ x, width, startTime, endTime: startTime + secPerMeasure });
    }
    console.log(
      "[ScoreViewer] bounds built:", bounds.length,
      "sourceMeasures:", totalMeasures,
      "firstWidth:", (bounds[0]?.width ?? 0).toFixed(1),
      "avgWidth:", avgMeasureWidth.toFixed(1),
      "bpm:", bpm, "ts:", tsNum + "/" + tsDen, "secPerMeasure:", secPerMeasure.toFixed(2),
    );
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
          const bounds = buildMeasureBounds();
          measureBoundsRef.current = bounds;
          if (bounds.length === 0) {
            // 두 번째 시도 — 레이아웃 지연 대비
            requestAnimationFrame(() => {
              measureBoundsRef.current = buildMeasureBounds();
              console.log("[ScoreViewer] measureBounds built:", measureBoundsRef.current.length);
            });
          } else {
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
  useEffect(() => {
    if (status !== "ready" || cursorTime == null) return;
    let bounds = measureBoundsRef.current;
    // 아직 빌드 안됐으면 즉석에서 재시도 (유저가 play 눌렀을 때 복구)
    if (bounds.length === 0) {
      bounds = buildMeasureBounds();
      measureBoundsRef.current = bounds;
    }
    const overlay = cursorOverlayRef.current;
    if (bounds.length === 0 || !overlay) return;

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
          style={{ transform: "translateX(-10px)", willChange: "transform" }}
        />
      </div>
    </div>
  );
}
