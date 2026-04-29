"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  songId: string;
  /** 이미 저장된 NWC 원본 파일이 있으면 재변환 모드로 동작 */
  hasStoredNwc?: boolean;
  storedNwcName?: string | null;
}

interface ConvertResult {
  parsed: {
    title: string;
    composer: string;
    tempo: number;
    timeSig: string;
    fifths: number;
    staves: { name: string; clef: string; measures: number }[];
  };
}

export function NwcUploader({ songId, hasStoredNwc = false, storedNwcName }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  // 저장된 NWC 가 있어도 "새 파일로 교체" 모드로 전환 가능
  const [replaceMode, setReplaceMode] = useState(false);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("songId", songId);
      const res = await fetch("/api/nwc-upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "업로드 실패");
      setResult(data);
      setFile(null);
      setReplaceMode(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const reconvert = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/nwc-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "재변환 실패");
      setResult(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "재변환 실패");
    } finally {
      setBusy(false);
    }
  };

  const showReconvert = hasStoredNwc && !replaceMode;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-900">NWC 악보 {showReconvert ? "재변환" : "업로드"}</h3>
      <p className="mb-3 text-xs text-gray-500">
        {showReconvert
          ? "저장된 NWC 원본을 최신 변환 로직으로 다시 변환합니다 (변환 코드가 업데이트되었을 때 사용)."
          : "NoteWorthy Composer(.nwc) 파일을 업로드하면 서버에서 자동으로 MIDI + 악보(MusicXML)로 변환되어 이 곡에 등록됩니다."}
      </p>

      {showReconvert ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1 truncate text-sm text-gray-700">
            저장된 원본: <span className="font-mono text-xs text-gray-500">{storedNwcName ?? "(파일명 없음)"}</span>
          </div>
          <button
            onClick={reconvert}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
          >
            {busy ? "변환중..." : "변환"}
          </button>
          <button
            onClick={() => setReplaceMode(true)}
            disabled={busy}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            새 파일로 교체
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".nwc,.nwctxt"
            onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }}
            className="flex-1 text-sm"
          />
          <button
            onClick={upload}
            disabled={!file || busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
          >
            {busy ? "변환중..." : "업로드 + 변환"}
          </button>
          {hasStoredNwc && replaceMode && (
            <button
              onClick={() => { setReplaceMode(false); setFile(null); setError(null); }}
              disabled={busy}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="mt-3 rounded-md bg-emerald-50 px-3 py-3 text-sm">
          <p className="font-semibold text-emerald-900">변환 완료: {result.parsed.title}</p>
          {result.parsed.composer && <p className="text-xs text-emerald-700">작곡: {result.parsed.composer}</p>}
          <p className="mt-1 text-xs text-emerald-700">
            Tempo {result.parsed.tempo} · {result.parsed.timeSig} · 파트 {result.parsed.staves.length}개
          </p>
          <ul className="mt-1 text-[11px] text-emerald-700">
            {result.parsed.staves.map((s, i) => (
              <li key={i}>
                · {s.name} ({s.clef}, {s.measures}마디)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
