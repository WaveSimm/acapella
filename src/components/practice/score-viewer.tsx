"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface Props {
  src: string;
  highlightPart?: string | null;
  /** 재생 현재 시간 (초). 값이 변하면 OSMD 커서를 해당 위치로 이동. */
  cursorTime?: number | null;
  /** 악보 Tempo (BPM). 커서를 시간 → 마디 위치 매핑할 때 사용. */
  tempoBpm?: number;
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

export function ScoreViewer({ src, highlightPart, cursorTime, tempoBpm, onReady }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);  // 고정 높이 스크롤 컨테이너
  const mountRef = useRef<HTMLDivElement>(null);     // OSMD 가 그리는 전체 악보
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const systemsRef = useRef<SystemRect[]>([]);
  const viewportHeightRef = useRef<number>(260);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  // 1) 로드 + 렌더
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
        osmd.render();
        const title = osmd.Sheet.Title?.text ?? "";
        const partNames: string[] = (osmd.Sheet.Instruments ?? []).map((ins) => ins.Name || "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempoBpm = (osmd.Sheet as any).DefaultStartTempoInBpm ?? null;

        // 시스템 경계 측정 (첫 번째 렌더 직후)
        const systems = measureSystems(mountRef.current!, partNames.length || 1);
        systemsRef.current = systems;
        // 가장 큰 시스템 높이에 맞춰 뷰포트 높이 결정 (+여백)
        const maxH = systems.reduce((m, s) => Math.max(m, s.height), 0);
        viewportHeightRef.current = Math.max(200, Math.ceil(maxH + 24));
        if (viewportRef.current) viewportRef.current.style.height = viewportHeightRef.current + "px";

        setStatus("ready");
        onReady?.({ title, partNames, tempoBpm, duration: null });
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
  }, [src, onReady]);

  // 2) 커서 이동 + 시스템 단위 스크롤
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
      if (targetWhole < curr) {
        cursor.reset();
        curr = getCurrent();
      }
      let safety = 10000;
      while (curr < targetWhole && safety-- > 0) {
        if (cursor.Iterator?.EndReached) break;
        cursor.next();
        curr = getCurrent();
      }

      // 시스템 단위 스크롤: 현재 커서 Y에 해당하는 시스템을 뷰포트 상단에 배치
      scrollToCursorSystem();
    } catch {
      // 조용히 무시
    }
  }, [cursorTime, tempoBpm, status]);

  // 3) 파트 하이라이트
  useEffect(() => {
    if (status !== "ready" || !mountRef.current || !osmdRef.current) return;
    const osmd = osmdRef.current;
    const container = mountRef.current;
    const instruments = osmd.Sheet.Instruments ?? [];
    const staves = container.querySelectorAll<SVGGElement>("g.vf-stave");
    if (staves.length === 0) return;
    const numInstruments = instruments.length || 1;
    staves.forEach((s, idx) => {
      const instIdx = idx % numInstruments;
      const name = instruments[instIdx]?.Name || `Part${instIdx}`;
      s.setAttribute("data-part", name);
    });

    if (!highlightPart) {
      staves.forEach((s) => {
        s.style.opacity = "1";
      });
    } else {
      staves.forEach((s) => {
        s.style.opacity = s.getAttribute("data-part") === highlightPart ? "1" : "0.35";
      });
    }
  }, [highlightPart, status]);

  function scrollToCursorSystem() {
    const osmd = osmdRef.current;
    const viewport = viewportRef.current;
    const mount = mountRef.current;
    if (!osmd || !viewport || !mount) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cursor = (osmd.cursor as any);
    const cursorEl: HTMLElement | SVGElement | undefined = cursor?.cursorElement;
    if (!cursorEl) return;

    // 커서의 Y 좌표 (mount 컨테이너 기준)
    const mountRect = mount.getBoundingClientRect();
    const cursorRect = (cursorEl as HTMLElement).getBoundingClientRect();
    const cursorYInMount = cursorRect.top - mountRect.top;

    // 커서가 속한 시스템 찾기
    const systems = systemsRef.current;
    let target: SystemRect | null = null;
    for (const s of systems) {
      if (cursorYInMount >= s.y && cursorYInMount < s.y + s.height) {
        target = s;
        break;
      }
    }
    if (!target && systems.length > 0) {
      // 마지막 시스템 넘어간 경우 마지막 시스템 유지
      target = systems[systems.length - 1];
    }
    if (!target) return;

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
          height: status === "loading" ? 0 : viewportHeightRef.current,
          transition: "height 200ms ease",
        }}
      >
        <div ref={mountRef} className="w-full" />
      </div>
    </div>
  );
}

/**
 * DOM에서 system 경계를 측정.
 * OSMD는 각 staff line을 <g class="vf-stave"> 로 렌더. 순서대로 instrument 수만큼이 한 시스템.
 */
function measureSystems(mount: HTMLDivElement, numInstruments: number): SystemRect[] {
  const staves = mount.querySelectorAll<SVGGElement>("g.vf-stave");
  if (staves.length === 0) return [];
  const mountRect = mount.getBoundingClientRect();
  const systems: SystemRect[] = [];
  const sysCount = Math.ceil(staves.length / numInstruments);
  for (let i = 0; i < sysCount; i++) {
    const firstIdx = i * numInstruments;
    const lastIdx = Math.min((i + 1) * numInstruments - 1, staves.length - 1);
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
