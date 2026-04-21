"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface Props {
  src: string;
  /** 파트 이름 (예: "Sop"). null이면 전체. 선택 시 해당 스태프만 표시 */
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
}

const DEFAULT_ZOOM = 0.5;

export function ScoreViewer({ src, highlightPart, cursorTime, tempoBpm, zoom = DEFAULT_ZOOM, onReady }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [viewportHeight, setViewportHeight] = useState(180);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  // 렌더 후 가시 스태프들의 상하 경계 측정 → 뷰포트 높이 갱신
  const resizeViewport = useCallback(() => {
    const mount = mountRef.current;
    if (!mount) return;
    requestAnimationFrame(() => {
      const staves = mount.querySelectorAll<SVGGElement>("g.vf-stave");
      if (staves.length === 0) return;
      const mountRect = mount.getBoundingClientRect();
      let minTop = Infinity;
      let maxBottom = -Infinity;
      // 한 줄 렌더링이므로 모든 stave가 동일 시스템.
      // 가시 stave들의 Y 범위 전체를 커버하도록.
      staves.forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top < minTop) minTop = r.top;
        if (r.bottom > maxBottom) maxBottom = r.bottom;
      });
      if (!isFinite(minTop) || !isFinite(maxBottom)) return;
      const h = Math.max(80, Math.ceil(maxBottom - minTop + 40));
      // title/label 영역 상단 패딩을 위해 추가 여유
      setViewportHeight(h + 30);
      mountRect; // unused
    });
  }, []);

  // 1) 최초 로드 + 단일 horizontal line 렌더
  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const mod = await import("opensheetmusicdisplay");
        if (cancelled) return;
        const osmd = new mod.OpenSheetMusicDisplay(mountRef.current!, {
          autoResize: false, // 가로 폭을 고정하지 않고 길게 (우리가 수동 관리)
          drawingParameters: "compact",
          drawPartNames: true,
          drawMeasureNumbers: true,
          drawTitle: false,
          followCursor: false,
        });
        osmdRef.current = osmd;
        // 모든 마디를 한 줄로 (줄 바꿈 없음)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules = (osmd as any).EngravingRules ?? (osmd as any).rules;
        if (rules) {
          rules.RenderSingleHorizontalStaffline = true;
          // 페이지 너비를 크게 (measure가 모두 펼쳐지도록)
          if (typeof rules.PageHeight === "number") rules.PageHeight = 2000;
        }
        const res = await fetch(src);
        if (!res.ok) throw new Error(`악보 로딩 실패 (HTTP ${res.status})`);
        const xml = await res.text();
        await osmd.load(xml);
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (osmd as any).zoom = zoom;
        osmd.render();
        const title = osmd.Sheet.Title?.text ?? "";
        const partNames: string[] = (osmd.Sheet.Instruments ?? []).map((ins) => ins.Name || "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempoBpmVal = (osmd.Sheet as any).DefaultStartTempoInBpm ?? null;
        setStatus("ready");
        onReady?.({ title, partNames, tempoBpm: tempoBpmVal, duration: null });
        resizeViewport();
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
  }, [src, onReady, zoom, resizeViewport]);

  // 2) 파트 선택 → 가시성 토글 + 재렌더 + 뷰포트 리사이즈
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
    if (changed) {
      osmd.render();
      resizeViewport();
    }
  }, [highlightPart, status, resizeViewport]);

  // 3) zoom 변경 시 재렌더
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current) return;
    const osmd = osmdRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((osmd as any).zoom !== zoom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (osmd as any).zoom = zoom;
      osmd.render();
      resizeViewport();
    }
  }, [zoom, status]);

  // 4) 커서 이동 (스크롤은 추후 구현)
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current || cursorTime == null) return;
    const osmd = osmdRef.current;
    const bpm = tempoBpm && tempoBpm > 0 ? tempoBpm : 120;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cursor = osmd.cursor as any;
      if (!cursor) return;
      cursor.show();

      const targetWhole = (cursorTime * bpm) / 240;
      const getCurrent = (): number => {
        const ts = cursor.Iterator?.currentTimeStamp;
        if (!ts) return 0;
        const num = typeof ts.Numerator === "number" ? ts.Numerator : ts.numerator;
        const den = typeof ts.Denominator === "number" ? ts.Denominator : ts.denominator;
        return num / den;
      };
      let curr = getCurrent();
      if (targetWhole < curr - 0.001) {
        cursor.reset();
        curr = getCurrent();
      }
      let safety = 10000;
      while (curr < targetWhole && safety-- > 0) {
        if (cursor.Iterator?.EndReached) break;
        cursor.next();
        curr = getCurrent();
      }
      try { cursor.update?.(); } catch { /* noop */ }
    } catch (e) {
      console.warn("[ScoreViewer] cursor sync error:", e);
    }
  }, [cursorTime, tempoBpm, status]);

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
        style={{
          height: status === "loading" ? 0 : viewportHeight,
          transition: "height 200ms ease",
        }}
      >
        <div ref={mountRef} className="inline-block" style={{ minWidth: "100%" }} />
      </div>
    </div>
  );
}
