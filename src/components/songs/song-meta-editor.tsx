"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Props {
  song: {
    id: string;
    titleKo: string;
    titleEn: string | null;
    composer: string | null;
    arranger: string | null;
    pageNumber: number | null;
  };
}

export function SongMetaEditor({ song }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    titleKo: song.titleKo,
    titleEn: song.titleEn ?? "",
    composer: song.composer ?? "",
    arranger: song.arranger ?? "",
    pageNumber: song.pageNumber != null ? String(song.pageNumber) : "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titleKo.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/songs/${song.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titleKo: form.titleKo.trim(),
        titleEn: form.titleEn.trim() || null,
        composer: form.composer.trim() || null,
        arranger: form.arranger.trim() || null,
        pageNumber: form.pageNumber ? parseInt(form.pageNumber) : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("저장되었습니다.");
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "저장에 실패했습니다.");
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-400">곡명 (한)</dt>
            <dd className="font-medium text-gray-900">{song.titleKo}</dd>
          </div>
          {song.titleEn && (
            <div>
              <dt className="text-xs text-gray-400">곡명 (영)</dt>
              <dd className="text-gray-700">{song.titleEn}</dd>
            </div>
          )}
          {song.composer && (
            <div>
              <dt className="text-xs text-gray-400">작곡</dt>
              <dd className="text-gray-700">{song.composer}</dd>
            </div>
          )}
          {song.arranger && (
            <div>
              <dt className="text-xs text-gray-400">편곡</dt>
              <dd className="text-gray-700">{song.arranger}</dd>
            </div>
          )}
          {song.pageNumber != null && (
            <div>
              <dt className="text-xs text-gray-400">시작 페이지</dt>
              <dd className="text-gray-700">p.{song.pageNumber}</dd>
            </div>
          )}
        </dl>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 text-xs text-blue-500 hover:text-blue-700"
        >
          편집
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="곡명 (한)" value={form.titleKo} onChange={(v) => setForm({ ...form, titleKo: v })} required />
        <Field label="곡명 (영, 선택)" value={form.titleEn} onChange={(v) => setForm({ ...form, titleEn: v })} />
        <Field label="작곡 (선택)" value={form.composer} onChange={(v) => setForm({ ...form, composer: v })} />
        <Field label="편곡 (선택)" value={form.arranger} onChange={(v) => setForm({ ...form, arranger: v })} />
        <Field
          label="시작 페이지 (선택)"
          value={form.pageNumber}
          onChange={(v) => setForm({ ...form, pageNumber: v.replace(/[^0-9]/g, "") })}
          placeholder="예: 9"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !form.titleKo.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function Field({
  label, value, onChange, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-xs text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
