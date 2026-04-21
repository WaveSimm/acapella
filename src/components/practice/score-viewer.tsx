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
  /** OSMD 줌 배율 (1.0 = 기본). 기본값 0.5 */
  zoom?: number;
  onReady?: (info: ScoreInfo) => void;
}

export interface ScoreInfo {
  title: string;
  partNames: string[];
  tempoBpm: number | null;
  duration: number | null;
}

interface SystemRect {
  y: number;
  height: number;
}

const DEFAULT_ZOOM = 0.5;

export function ScoreViewer({ src, highlightPart, cursorTime, tempoBpm, zoom = DEFAULT_ZOOM, onReady }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const systemsRef = useRef<SystemRect[]>([]);
  const [viewportHeight, setViewportHeight] = useState(260);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  // 재렌더 + 시스템 재측정 + 뷰포트 높이 갱신
  const remeasure = useCallback(() => {
    const osmd = osmdRef.current;
    const mount = mountRef.current;
    if (!osmd || !mount) return;
    // 가시 파트 개수 기준으로 시스템 그룹핑
    const instruments = osmd.Sheet.Instruments ?? [];
    const visibleCount = instruments.filter((i) => i.Visible).length || 1;
    // DOM 레이아웃 완료 후 측정
    requestAnimationFrame(() => {
      const systems = measureSystems(mount, visibleCount);
      systemsRef.current = systems;
      const maxH = systems.reduce((m, s) => Math.max(m, s.height), 0);
      const h = Math.max(140, Math.ceil(maxH + 40));
      setViewportHeight(h);
    });
  }, []);

  // 1) 최초 로드 + 렌더
  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const mod = await import("opensheetmusicdisplay");
        if (cancelled) return;
        const osmd = new mod.OpenSheetMusicDisplay(mountRef.current!, {
          autoResize: true,
          drawingParameters: "compact",
          drawPartNames: true,
          drawMeasureNumbers: true,
          drawTitle: false,
        });
        osmdRef.current = osmd;
        const res = await fetch(src);
        if (!res.ok) throw new Error(`악보 로딩 실패 (HTTP ${res.status})`);
        const xml = await res.text();
        await osmd.load(xml);
        if (cancelled) return;
        osmd.zoom = zoom;
        osmd.render();
        const title = osmd.Sheet.Title?.text ?? "";
        const partNames: string[] = (osmd.Sheet.Instruments ?? []).map((ins) => ins.Name || "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempoBpmVal = (osmd.Sheet as any).DefaultStartTempoInBpm ?? null;
        setStatus("ready");
        onReady?.({ title, partNames, tempoBpm: tempoBpmVal, duration: null });
        remeasure();
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
  }, [src, onReady, zoom, remeasure]);

  // 2) 파트 선택 → 가시성 토글 + 재렌더
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
      remeasure();
    }
  }, [highlightPart, status, remeasure]);

  // 3) zoom 변경 시 재렌더
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current) return;
    const osmd = osmdRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((osmd as any).zoom !== zoom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (osmd as any).zoom = zoom;
      osmd.render();
      remeasure();
    }
  }, [zoom, status, remeasure]);

  // 4) 커서 이동 + 시스템 단위 스크롤
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current || cursorTime == null || !tempoBpm) return;
    const osmd = osmdRef.current;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cursor = osmd.cursor as any;
      if (!cursor) return;
      cursor.show();

      const targetWhole = (cursorTime * tempoBpm) / 240;

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

      scrollToCursorSystem();
    } catch {
      // 무시
    }
  }, [cursorTime, tempoBpm, status]);

  function scrollToCursorSystem() {
    const osmd = osmdRef.current;
    const viewport = viewportRef.current;
    const mount = mountRef.current;
    if (!osmd || !viewport || !mount) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cursor = osmd.cursor as any;
    const cursorEl: HTMLElement | undefined = cursor?.cursorElement;
    if (!cursorEl) return;

    const mountRect = mount.getBoundingClientRect();
    const cursorRect = cursorEl.getBoundingClientRect();
    // cursorEl이 아직 layout되지 않은 경우 (width/height 0) 건너뜀
    if (cursorRect.height === 0 && cursorRect.width === 0) return;
    const cursorYInMount = cursorRect.top - mountRect.top + viewport.scrollTop;

    const systems = systemsRef.current;
    if (systems.length === 0) return;

    let target = systems[0];
    for (const s of systems) {
      if (cursorYInMount >= s.y - 5) target = s;
      else break;
    }

    const desiredScroll = Math.max(0, target.y - 10);
    if (Math.abs(viewport.scrollTop - desiredScroll) > 4) {
      viewport.scrollTo({ top: desiredScroll, behavior: "smooth" });
    }
  }

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
        className="relative w-full overflow-hidden"
        style={{
          height: status === "loading" ? 0 : viewportHeight,
          transition: "height 200ms ease",
        }}
      >
        <div ref={mountRef} className="w-full" />
      </div>
    </div>
  );
}

/**
 * 각 system의 Y/height 측정. 가시 instrument 수 기준으로 g.vf-stave를 그룹핑.
 */
function measureSystems(mount: HTMLDivElement, visibleInstrumentCount: number): SystemRect[] {
  const staves = mount.querySelectorAll<SVGGElement>("g.vf-stave");
  if (staves.length === 0) return [];
  const mountRect = mount.getBoundingClientRect();
  const systems: SystemRect[] = [];
  const perSys = Math.max(1, visibleInstrumentCount);
  const sysCount = Math.ceil(staves.length / perSys);
  for (let i = 0; i < sysCount; i++) {
    const firstIdx = i * perSys;
    const lastIdx = Math.min((i + 1) * perSys - 1, staves.length - 1);
    const first = staves[firstIdx];
    const last = staves[lastIdx];
    if (!first || !last) continue;
    const fr = first.getBoundingClientRect();
    const lr = last.getBoundingClientRect();
    const y = fr.top - mountRect.top;
    const height = lr.bottom - fr.top;
    systems.push({ y, height });
  }
  return systems;
}
