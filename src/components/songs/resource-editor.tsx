"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { COMMON_PARTS, PART_LABELS } from "@/lib/utils";

type ResType = "AUTO" | "VIDEO" | "AUDIO" | "SCORE_PREVIEW" | "MIDI";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
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
  const [part, setPart] = useState("전체");
  const [label, setLabel] = useState("");
  const [resType, setResType] = useState<ResType>("AUTO");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 이 곡에 이미 쓰인 파트 + 공통 파트 추천 (중복 제거)
  const partSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of resources) {
      const p = PART_LABELS[r.part] ?? r.part;
      if (!seen.has(p)) { seen.add(p); out.push(p); }
    }
    for (const p of COMMON_PARTS) {
      if (!seen.has(p)) { seen.add(p); out.push(p); }
    }
    return out;
  }, [resources]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/files", { method: "POST", body: fd });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => null);
        toast.error(data?.error ?? "업로드에 실패했습니다.");
        return;
      }
      const uploaded = await uploadRes.json() as { id: string; url: string; fileName: string };
      const resRes = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId,
          part,
          url: uploaded.url,
          fileId: uploaded.id,
          label: label || uploaded.fileName,
          ...(resType !== "AUTO" && { resourceType: resType }),
        }),
      });
      if (!resRes.ok) {
        const data = await resRes.json().catch(() => null);
        toast.error(data?.error ?? "리소스 생성에 실패했습니다.");
        return;
      }
      toast.success(`${file.name} 업로드 완료`);
      setUrl(""); setLabel(""); setPart("전체"); setResType("AUTO"); setShowForm(false);
      router.refresh();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const mine = resources.filter((r) => r.conductorId === conductorId);
  const others = resources.filter((r) => r.conductorId !== conductorId);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setAdding(true);
    const body: Record<string, unknown> = { songId, part, url, label: label || undefined };
    if (resType !== "AUTO") body.resourceType = resType;
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (res.ok) {
      setUrl(""); setLabel(""); setPart("전체"); setResType("AUTO"); setShowForm(false);
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

  function typeLabel(r: Resource) {
    if (r.resourceType === "MIDI") return "MIDI";
    if (r.resourceType === "SCORE_PREVIEW") return "악보";
    if (r.resourceType === "AUDIO") return "음원";
    if (r.resourceType === "VIDEO" && (r.url.includes("youtube.com") || r.url.includes("youtu.be"))) return "YouTube";
    if (/\.(mid|midi)(\?.*)?$/i.test(r.url)) return "MIDI";
    if (/\.pdf(\?.*)?$/i.test(r.url)) return "악보";
    return r.resourceType === "VIDEO" ? "영상" : "외부";
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
            <ResourceRow
              key={r.id}
              r={r}
              typeLabel={typeLabel(r)}
              onDelete={() => handleDelete(r)}
              deleting={deleting === r.id}
            />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <p className="text-[10px] text-gray-400">다른 지휘자가 추가</p>
          {others.map((r) => (
            <ResourceRow key={r.id} r={r} typeLabel={typeLabel(r)} readOnly />
          ))}
        </div>
      )}

      {showForm && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">유형</label>
              <select
                value={resType}
                onChange={(e) => setResType(e.target.value as ResType)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="AUTO">자동 감지</option>
                <option value="AUDIO">음원 (MP3 등)</option>
                <option value="VIDEO">영상</option>
                <option value="MIDI">MIDI</option>
                <option value="SCORE_PREVIEW">악보 (PDF)</option>
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">파트</label>
              <input
                type="text"
                value={part}
                onChange={(e) => setPart(e.target.value)}
                list="part-suggestions"
                placeholder="예: 전체, S1, A2, 솔로..."
                required
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <datalist id="part-suggestions">
                {partSuggestions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="라벨 (선택)"
            className="mt-2 w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />

          {/* URL 추가 */}
          <form onSubmit={handleAdd} className="mt-2 flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL (YouTube / MP3 / Drive / PDF)"
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={adding || !url || uploading}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? "추가 중..." : "URL 추가"}
            </button>
          </form>

          {/* 파일 업로드 */}
          <div className="mt-3 flex items-center gap-2 border-t border-blue-100 pt-3">
            <label
              className={`inline-flex cursor-pointer items-center gap-1 rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 ${
                uploading || adding ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {uploading ? "업로드 중..." : "📁 파일 업로드"}
              <input
                type="file"
                accept="audio/*,.mid,.midi,.mp3,.wav,.m4a,.ogg,application/pdf,.pdf"
                onChange={handleFileUpload}
                disabled={uploading || adding}
                className="hidden"
              />
            </label>
            <span className="text-[10px] text-gray-400">MIDI · MP3 · WAV · PDF (최대 4MB)</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setUrl(""); setLabel(""); }}
              className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              닫기
            </button>
          </div>

          <p className="mt-2 text-[10px] text-gray-400">
            Google Drive 공유 URL은 자동으로 재생/다운로드 가능한 주소로 변환됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  r,
  typeLabel,
  onDelete,
  deleting,
  readOnly,
}: {
  r: Resource;
  typeLabel: string;
  onDelete?: () => void;
  deleting?: boolean;
  readOnly?: boolean;
}) {
  const typeColor =
    typeLabel === "음원" ? "bg-emerald-50 text-emerald-700"
    : typeLabel === "악보" ? "bg-amber-50 text-amber-700"
    : typeLabel === "MIDI" ? "bg-violet-50 text-violet-700"
    : typeLabel === "YouTube" || typeLabel === "영상" ? "bg-red-50 text-red-600"
    : "bg-gray-50 text-gray-600";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-600">
        {PART_LABELS[r.part] ?? r.part}
      </span>{" "}
      <span className={`rounded px-1.5 py-0.5 font-medium ${typeColor}`}>{typeLabel}</span>
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
