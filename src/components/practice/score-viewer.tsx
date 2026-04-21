"use client";

import { useEffect, useRef, useState } from "react";
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

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
        // 모든 마디를 한 줄로 (줄 바꿈 없음) + 음표 간격 우선
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules = (osmd as any).EngravingRules ?? (osmd as any).rules;
        if (rules) {
          rules.RenderSingleHorizontalStaffline = true;
          if (typeof rules.PageHeight === "number") rules.PageHeight = 2000;
          // 음표 간격: 8분음표 이하(16th/32nd)는 8분음표와 동일한 최소 간격.
          // 더 긴 음표일수록 넉넉하게. [32nd..whole] 이 아닌 duration index 기반이지만
          // OSMD 내부 해석을 그대로 사용 — 앞 3개를 동일값으로 만들어 "8분 최소" 구현.
          rules.NoteDistances = [1.0, 1.0, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0];
          rules.NoteDistancesScalingFactor = 0.6;
          // 가사가 음표 간격을 늘리지 않도록 — 겹쳐도 OK
          rules.LyricsXPadding = 0.0;
          rules.BetweenSyllabSpace = 0.0;
          rules.MinimumDistanceBetweenDashes = 0.0;
          if ("LyricsExtraRequiredSpaceInMeasureBetweenLyricsAndBarline" in rules) {
            rules.LyricsExtraRequiredSpaceInMeasureBetweenLyricsAndBarline = 0;
          }
          if ("LyricsMinimumSpaceBetweenLyricsInMeasure" in rules) {
            rules.LyricsMinimumSpaceBetweenLyricsInMeasure = 0;
          }
        }
        // 캐시 버스트: 업로드 직후 stale 캐시 방지
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
        onReady?.({ title, partNames, tempoBpm: tempoBpmVal, duration: null });
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
  }, [src, onReady, zoom]);

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
    }
  }, [highlightPart, status]);

  // 3) zoom 변경 시 재렌더
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current) return;
    const osmd = osmdRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((osmd as any).zoom !== zoom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (osmd as any).zoom = zoom;
      osmd.render();
    }
  }, [zoom, status]);

  // 4) 커서 이동 + 가로 스크롤
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
        // OSMD Fraction = WholeValue + Numerator/Denominator. RealValue getter가 있으면 우선 사용.
        if (typeof ts.RealValue === "number") return ts.RealValue;
        const whole = typeof ts.WholeValue === "number" ? ts.WholeValue : 0;
        const num = typeof ts.Numerator === "number" ? ts.Numerator : 0;
        const den = typeof ts.Denominator === "number" ? ts.Denominator : 1;
        return whole + num / den;
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

      scrollCursorIntoView();
    } catch (e) {
      console.warn("[ScoreViewer] cursor sync error:", e);
    }
  }, [cursorTime, tempoBpm, status]);

  // 커서가 뷰포트 중앙 좌측 (30%) 지점에 오도록 가로 스크롤
  function scrollCursorIntoView() {
    const osmd = osmdRef.current;
    const viewport = viewportRef.current;
    if (!osmd || !viewport) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cursor = osmd.cursor as any;
    const cursorEl: HTMLElement | undefined = cursor?.cursorElement;
    if (!cursorEl) return;
    const cursorRect = cursorEl.getBoundingClientRect();
    if (cursorRect.height === 0 && cursorRect.width === 0) return;
    const viewportRect = viewport.getBoundingClientRect();
    const cursorXInContent = cursorRect.left - viewportRect.left + viewport.scrollLeft;

    // 커서가 뷰포트 가시 영역의 20%~80% 범위 밖으로 벗어났을 때만 스크롤
    const relativeX = cursorXInContent - viewport.scrollLeft;
    const leftThreshold = viewportRect.width * 0.2;
    const rightThreshold = viewportRect.width * 0.8;
    if (relativeX >= leftThreshold && relativeX <= rightThreshold) return;

    // 커서를 좌측 30% 위치에 배치
    const targetScroll = Math.max(0, cursorXInContent - viewportRect.width * 0.3);
    if (Math.abs(viewport.scrollLeft - targetScroll) > 10) {
      viewport.scrollTo({ left: targetScroll, behavior: "smooth" });
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
        className="relative w-full overflow-x-auto overflow-y-hidden"
      >
        <div ref={mountRef} className="inline-block" style={{ minWidth: "100%" }} />
      </div>
    </div>
  );
}
