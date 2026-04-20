"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";

interface RepertoireItem {
  id: string;
  orderIdx: number;
  note: string | null;
  addedAt: string;
  song: {
    id: string;
    titleKo: string;
    titleEn: string | null;
    composer: string | null;
    resourceCount: number;
  };
}

interface Props {
  ensembleId: string;
  songs: RepertoireItem[];
}

export function RepertoireManager({ ensembleId, songs }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);

  async function handleRemove(item: RepertoireItem) {
    const ok = await confirm({
      message: `"${item.song.titleKo}"을(를) 레파토리에서 제거하시겠습니까?`,
      confirmLabel: "제거",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/ensembles/${ensembleId}/songs/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("제거되었습니다.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "제거에 실패했습니다.");
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">레파토리 ({songs.length}곡)</h2>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 곡 추가
          </button>
        )}
      </div>

      {showAdd && (
        <AddSongForm
          ensembleId={ensembleId}
          existingSongIds={songs.map((s) => s.song.id)}
          onDone={() => { setShowAdd(false); router.refresh(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {songs.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          등록된 곡이 없습니다. 위에서 곡을 추가해보세요.
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="w-10 px-3 py-2 text-center font-medium">#</th>
                <th className="px-3 py-2 font-medium">곡명</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">작곡</th>
                <th className="hidden px-3 py-2 text-center font-medium sm:table-cell">리소스</th>
                <th className="px-3 py-2 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {songs.map((item, idx) => (
                <tr key={item.id} className="hover:bg-blue-50/30">
                  <td className="px-3 py-2 text-center text-xs text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/songs/${item.song.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {item.song.titleKo}
                    </Link>
                    {item.song.titleEn && (
                      <p className="text-xs text-gray-400">{item.song.titleEn}</p>
                    )}
                    {item.note && (
                      <p className="mt-1 text-xs text-amber-700">메모: {item.note}</p>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-gray-600 sm:table-cell">{item.song.composer ?? "-"}</td>
                  <td className="hidden px-3 py-2 text-center text-xs text-gray-500 sm:table-cell">{item.song.resourceCount}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Link
                      href={`/songs/${item.song.id}`}
                      className="mr-2 text-xs text-blue-500 hover:text-blue-700"
                    >
                      편집
                    </Link>
                    <button
                      onClick={() => handleRemove(item)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      제거
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 곡 추가 폼: 검색 + 새 곡 생성 ───
function AddSongForm({
  ensembleId,
  existingSongIds,
  onDone,
  onCancel,
}: {
  ensembleId: string;
  existingSongIds: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; titleKo: string; titleEn: string | null; composer: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitleKo, setNewTitleKo] = useState("");
  const [newComposer, setNewComposer] = useState("");

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/songs?q=${encodeURIComponent(q)}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.songs ?? []);
      }
    } finally { setSearching(false); }
  }

  async function handleAdd(songId: string) {
    const res = await fetch(`/api/ensembles/${ensembleId}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    if (res.ok) {
      toast.success("곡이 추가되었습니다.");
      onDone();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "추가에 실패했습니다.");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitleKo.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleKo: newTitleKo.trim(),
          composer: newComposer.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "곡 생성에 실패했습니다.");
        return;
      }
      const song = await res.json();
      await handleAdd(song.id);
    } finally { setCreating(false); }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          {showCreate ? "새 곡 만들기" : "곡 추가"}
        </h3>
        <button
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          취소
        </button>
      </div>

      {!showCreate ? (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="기존 곡 검색 (곡명 / 작곡가)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />

          <div className="mt-2 max-h-64 overflow-y-auto rounded-md bg-white">
            {searching && <p className="p-3 text-xs text-gray-400">검색 중...</p>}
            {!searching && query && results.length === 0 && (
              <p className="p-3 text-xs text-gray-400">일치하는 곡이 없습니다.</p>
            )}
            {results.map((r) => {
              const already = existingSongIds.includes(r.id);
              return (
                <div key={r.id} className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{r.titleKo}</p>
                    {r.composer && <p className="text-xs text-gray-400">{r.composer}</p>}
                  </div>
                  {already ? (
                    <span className="text-xs text-gray-400">이미 있음</span>
                  ) : (
                    <button
                      onClick={() => handleAdd(r.id)}
                      className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      추가
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-xs text-blue-600 hover:text-blue-700"
          >
            + 찾는 곡이 없나요? 새 곡 만들기
          </button>
        </>
      ) : (
        <form onSubmit={handleCreate} className="space-y-2">
          <input
            type="text"
            value={newTitleKo}
            onChange={(e) => setNewTitleKo(e.target.value)}
            placeholder="곡명 (필수)"
            autoFocus
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={newComposer}
            onChange={(e) => setNewComposer(e.target.value)}
            placeholder="작곡 (선택)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newTitleKo.trim()}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "만드는 중..." : "만들고 추가하기"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              뒤로
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
