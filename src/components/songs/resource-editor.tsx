"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";

const PART_LABELS: Record<string, string> = {
  ALL: "전체",
  SOPRANO: "소프",
  ALTO: "알토",
  TENOR: "테너",
  BASS: "베이스",
};

interface Resource {
  id: string;
  part: string;
  url: string;
  label: string | null;
  conductorId: string | null;
  sourceSite: string | null;
}

interface Props {
  songId: string;
  resources: Resource[];
  conductorId: string;
}

export function ResourceEditor({ songId, resources, conductorId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [part, setPart] = useState("ALL");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const mine = resources.filter((r) => r.conductorId === conductorId);
  const others = resources.filter((r) => r.conductorId !== conductorId);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setAdding(true);
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, part, url, label: label || undefined }),
    });
    setAdding(false);
    if (res.ok) {
      setUrl(""); setLabel(""); setPart("ALL"); setShowForm(false);
      toast.success("리소스가 추가되었습니다.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "추가에 실패했습니다.");
    }
  }

  async function handleDelete(r: Resource) {
    const ok = await confirm({ message: "이 리소스를 삭제하시겠습니까?", confirmLabel: "삭제", danger: true });
    if (!ok) return;
    setDeleting(r.id);
    const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) {
      toast.success("삭제되었습니다.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "삭제에 실패했습니다.");
    }
  }

  function typeLabel(url: string) {
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
    if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(url)) return "음원";
    if (url.includes("drive.google.com")) return "Drive";
    return "외부";
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">전체 {resources.length}건</span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            + 추가
          </button>
        )}
      </div>

      {mine.length > 0 && (
        <div className="space-y-1">
          {mine.map((r) => (
            <ResourceRow key={r.id} r={r} typeLabel={typeLabel(r.url)} onDelete={() => handleDelete(r)} deleting={deleting === r.id} />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <p className="text-[10px] text-gray-400">다른 지휘자가 추가</p>
          {others.map((r) => (
            <ResourceRow key={r.id} r={r} typeLabel={typeLabel(r.url)} readOnly />
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="mt-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={part}
              onChange={(e) => setPart(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">전체</option>
              <option value="SOPRANO">소프라노</option>
              <option value="ALTO">알토</option>
              <option value="TENOR">테너</option>
              <option value="BASS">베이스</option>
            </select>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="YouTube / MP3 / Drive URL"
              required
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="라벨 (선택)"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none sm:w-40"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={adding || !url}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? "추가 중..." : "추가"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setUrl(""); setLabel(""); }}
              className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              취소
            </button>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            Google Drive 공유 URL은 자동으로 재생 가능한 주소로 변환됩니다. (파일 공유 설정: &quot;링크 있는 모든 사용자&quot;)
          </p>
        </form>
      )}
    </div>
  );
}

function ResourceRow({ r, typeLabel, onDelete, deleting, readOnly }: {
  r: Resource;
  typeLabel: string;
  onDelete?: () => void;
  deleting?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-600">
        {PART_LABELS[r.part] ?? r.part}
      </span>
      <span className="text-gray-400">{typeLabel}</span>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-blue-500 hover:underline"
      >
        {r.label || r.url}
      </a>
      {!readOnly && onDelete && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 text-red-400 hover:text-red-600 disabled:opacity-50"
        >
          {deleting ? "..." : "삭제"}
        </button>
      )}
    </div>
  );
}
