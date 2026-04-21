"use client";

import { useState } from "react";

interface SyncResult {
  totalFiles: number;
  created: number;
  skipped: number;
  failed: number;
  failedFiles: string[];
  createdItems: { name: string; song: string; part: string }[];
}

interface Props {
  ensembleId: string;
  initialDriveFolderUrl: string | null;
}

export function DriveSyncPanel({ ensembleId, initialDriveFolderUrl }: Props) {
  const [url, setUrl] = useState(initialDriveFolderUrl ?? "");
  const [savedUrl, setSavedUrl] = useState(initialDriveFolderUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [showFailed, setShowFailed] = useState(false);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/ensembles/${ensembleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFolderUrl: url || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "저장 실패" }));
        throw new Error(typeof data.error === "string" ? data.error : "저장 실패");
      }
      setSavedUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setError(null);
    setResult(null);
    setSyncing(true);
    try {
      const res = await fetch(`/api/ensembles/${ensembleId}/drive-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "동기화 실패");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  const dirty = url !== savedUrl;
  const canSync = !!savedUrl && !dirty;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Google Drive 폴더 연결</h3>
        {savedUrl && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">연결됨</span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        공개 공유된 Drive 폴더의 MP3/MP4/MIDI 파일을 자동으로 리소스로 등록합니다. 파일명 규칙:{" "}
        <code className="rounded bg-gray-100 px-1">곡제목.mp3</code> 또는{" "}
        <code className="rounded bg-gray-100 px-1">곡제목_소프라노.mp3</code>
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 disabled:bg-gray-300"
        >
          {saving ? "저장중..." : "저장"}
        </button>
        <button
          onClick={sync}
          disabled={syncing || !canSync}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
          title={dirty ? "URL을 먼저 저장하세요" : !savedUrl ? "폴더 URL을 먼저 설정하세요" : ""}
        >
          {syncing ? "동기화중..." : "동기화"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="mt-3 rounded-md bg-gray-50 px-3 py-3 text-sm">
          <div className="mb-1 flex flex-wrap gap-3 text-xs">
            <span className="text-gray-500">전체 <strong className="text-gray-900">{result.totalFiles}</strong></span>
            <span className="text-emerald-700">신규 <strong>{result.created}</strong></span>
            <span className="text-gray-500">스킵 <strong>{result.skipped}</strong></span>
            {result.failed > 0 && (
              <span className="text-amber-700">
                매칭실패{" "}
                <button
                  onClick={() => setShowFailed((v) => !v)}
                  className="font-bold underline hover:text-amber-900"
                >
                  {result.failed}
                </button>
              </span>
            )}
          </div>
          {result.createdItems.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-700">
              {result.createdItems.map((it, i) => (
                <li key={i} className="truncate">
                  + <strong>{it.song}</strong> · {it.part} <span className="text-gray-400">({it.name})</span>
                </li>
              ))}
            </ul>
          )}
          {showFailed && result.failedFiles.length > 0 && (
            <div className="mt-2 border-t border-gray-200 pt-2">
              <p className="mb-1 text-[10px] text-gray-500">매칭 안 된 파일 (곡제목을 확인해주세요):</p>
              <ul className="max-h-32 overflow-y-auto text-xs text-amber-700">
                {result.failedFiles.map((name, i) => (
                  <li key={i} className="truncate">— {name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
