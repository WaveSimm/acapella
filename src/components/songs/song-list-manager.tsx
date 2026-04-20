"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface SongItem {
  id: string;
  titleKo: string;
  titleEn: string | null;
  composer: string | null;
  pageNumber: number | null;
  audio: number;
  video: number;
  score: number;
  totalResources: number;
  myEnsembles: { id: string; name: string }[];
  totalEnsembles: number;
}

type Filter = "all" | "audio" | "video" | "score" | "empty";

export function SongListManager({ items }: { items: SongItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      if (q) {
        const hit =
          s.titleKo.toLowerCase().includes(q) ||
          (s.titleEn?.toLowerCase().includes(q) ?? false) ||
          (s.composer?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      switch (filter) {
        case "audio": return s.audio > 0;
        case "video": return s.video > 0;
        case "score": return s.score > 0;
        case "empty": return s.totalResources === 0;
        default: return true;
      }
    });
  }, [items, query, filter]);

  return (
    <div>
      {/* 검색 + 필터 + 신규 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="곡명 / 작곡가 검색"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:max-w-sm"
          />
          <div className="flex gap-1">
            {([
              ["all", "전체"],
              ["audio", "음원"],
              ["video", "영상"],
              ["score", "악보"],
              ["empty", "미등록"],
            ] as [Filter, string][]).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {!showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 새 곡
          </button>
        )}
      </div>

      {showNew && (
        <NewSongForm
          onDone={(id) => {
            toast.success("곡이 생성되었습니다.");
            setShowNew(false);
            if (id) router.push(`/songs/${id}`);
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      <p className="mb-2 text-xs text-gray-400">총 {filtered.length}곡</p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          일치하는 곡이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">곡명</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">작곡</th>
                <th className="px-3 py-2 text-center font-medium">음원</th>
                <th className="px-3 py-2 text-center font-medium">영상</th>
                <th className="px-3 py-2 text-center font-medium">악보</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">내 합창단</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/songs/${s.id}`)}
                  className="cursor-pointer hover:bg-blue-50/30"
                >
                  <td className="px-3 py-2">
                    <Link href={`/songs/${s.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {s.titleKo}
                    </Link>
                    {s.titleEn && <p className="text-xs text-gray-400">{s.titleEn}</p>}
                    {s.pageNumber != null && (
                      <p className="text-[10px] text-gray-400">p.{s.pageNumber}</p>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-gray-600 sm:table-cell">
                    {s.composer ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Count n={s.audio} color="emerald" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Count n={s.video} color="red" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Count n={s.score} color="amber" />
                  </td>
                  <td className="hidden px-3 py-2 text-xs sm:table-cell">
                    {s.myEnsembles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.myEnsembles.map((e) => (
                          <span
                            key={e.id}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700"
                          >
                            {e.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
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

function Count({ n, color }: { n: number; color: "emerald" | "red" | "amber" }) {
  if (n === 0) return <span className="text-gray-300">-</span>;
  const cls = {
    emerald: "text-emerald-600",
    red: "text-red-500",
    amber: "text-amber-600",
  }[color];
  return <span className={`text-xs font-semibold ${cls}`}>{n}</span>;
}

function NewSongForm({
  onDone,
  onCancel,
}: {
  onDone: (id: string | null) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [titleKo, setTitleKo] = useState("");
  const [composer, setComposer] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titleKo.trim()) return;
    setSaving(true);
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titleKo: titleKo.trim(),
        composer: composer.trim() || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const song = await res.json();
      onDone(song.id);
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "생성에 실패했습니다.");
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={titleKo}
          onChange={(e) => setTitleKo(e.target.value)}
          placeholder="곡명 (필수)"
          required
          autoFocus
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="작곡 (선택)"
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-48"
        />
        <button
          type="submit"
          disabled={saving || !titleKo.trim()}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "생성 중..." : "생성"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
        >
          취소
        </button>
      </div>
    </form>
  );
}
