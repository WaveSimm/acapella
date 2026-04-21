"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  songId: string;
}

interface UploadResult {
  parsed: {
    title: string;
    composer: string;
    tempo: number;
    timeSig: string;
    fifths: number;
    staves: { name: string; clef: string; measures: number }[];
  };
}

export function NwcUploader({ songId }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("songId", songId);
      const res = await fetch("/api/nwc-upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "업로드 실패");
      setResult(data);
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-900">NWC 악보 업로드</h3>
      <p className="mb-3 text-xs text-gray-500">
        NoteWorthy Composer(.nwc) 파일을 업로드하면 서버에서 자동으로 MIDI + 악보(MusicXML)로 변환되어 이 곡에 등록됩니다.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept=".nwc"
          onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }}
          className="flex-1 text-sm"
        />
        <button
          onClick={upload}
          disabled={!file || uploading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
        >
          {uploading ? "변환중..." : "업로드 + 변환"}
        </button>
      </div>

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
