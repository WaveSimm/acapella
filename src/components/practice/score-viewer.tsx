"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface Props {
  src: string;
  highlightPart?: string | null; // 파트 이름 (예: "Sop"). null이면 전체 기본 표시
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

export function ScoreViewer({ src, highlightPart, cursorTime, tempoBpm, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  // 초기 로드 + 렌더
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const mod = await import("opensheetmusicdisplay");
        if (cancelled) return;
        const osmd = new mod.OpenSheetMusicDisplay(containerRef.current!, {
          autoResize: true,
          drawingParameters: "compact",
          drawPartNames: true,
          drawMeasureNumbers: true,
          drawTitle: true,
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

  // 커서 제어: cursorTime(초) + tempoBpm을 이용해 악보 내 현재 위치로 이동
  // OSMD 커서 iterator.currentTimeStamp 는 Fraction(whole notes 단위)
  // time(초) × BPM / 60 = quarter notes = timeStamp × 4
  // 즉 timeStamp = time × BPM / 240
  useEffect(() => {
    if (status !== "ready" || !osmdRef.current || cursorTime == null || !tempoBpm) return;
    const osmd = osmdRef.current;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cursor = osmd.cursor as any;
      if (!cursor) return;
      cursor.show();

      const targetWhole = (cursorTime * tempoBpm) / 240;

      // 현재 위치 평가
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getCurrent = (): number => {
        const ts = cursor.Iterator?.currentTimeStamp;
        if (!ts) return 0;
        const num = typeof ts.Numerator === "number" ? ts.Numerator : ts.numerator;
        const den = typeof ts.Denominator === "number" ? ts.Denominator : ts.denominator;
        return num / den;
      };

      let curr = getCurrent();
      if (targetWhole < curr) {
        // 역방향 시크: reset 후 앞으로 진행
        cursor.reset();
        curr = getCurrent();
      }
      // 목표 위치까지 진행 (한계 있는 루프)
      let safety = 10000;
      while (curr < targetWhole && safety-- > 0) {
        const ended = cursor.Iterator?.EndReached;
        if (ended) break;
        cursor.next();
        curr = getCurrent();
      }
    } catch {
      // OSMD 내부 오류는 조용히 무시
    }
  }, [cursorTime, tempoBpm, status]);

  // 파트 하이라이트: 선택된 파트 외에는 opacity 낮춤 (DOM 조작)
  useEffect(() => {
    if (status !== "ready" || !containerRef.current || !osmdRef.current) return;
    const osmd = osmdRef.current;
    const container = containerRef.current;
    const instruments = osmd.Sheet.Instruments ?? [];
    // OSMD는 각 instrument의 voice를 svg의 g 요소에 부여하는데 속성이 버전마다 다름.
    // 우회: 각 스태프 라인(SVG g.vf-stave)에 순서대로 data 속성을 붙여 CSS 제어.
    const staves = container.querySelectorAll<SVGGElement>("g.vf-stave");
    if (staves.length === 0) return;

    // 마디별로 instrument 개수만큼 반복되는 구조 가정. 한 system(줄)에서 staves 순서 = instruments 순서
    const numInstruments = instruments.length || 1;
    staves.forEach((s, idx) => {
      const instIdx = idx % numInstruments;
      const name = instruments[instIdx]?.Name || `Part${instIdx}`;
      s.setAttribute("data-part", name);
    });

    // 하이라이트 적용: 선택된 파트만 정상, 나머지는 회색
    if (!highlightPart) {
      staves.forEach((s) => {
        s.style.opacity = "1";
        s.style.filter = "";
      });
      // 노트 헤드 색상 복원
      container.querySelectorAll<SVGElement>("[data-part]").forEach((el) => (el.style.color = ""));
    } else {
      staves.forEach((s) => {
        const isHighlight = s.getAttribute("data-part") === highlightPart;
        s.style.opacity = isHighlight ? "1" : "0.35";
      });
    }
  }, [highlightPart, status]);

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
        ref={containerRef}
        className="w-full overflow-x-auto"
        style={{ minHeight: status === "loading" ? 0 : 200 }}
      />
    </div>
  );
}
