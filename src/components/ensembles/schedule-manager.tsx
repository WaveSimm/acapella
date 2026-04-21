"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";

interface RehearsalSongItem {
  id: string;
  orderIdx: number;
  note: string | null;
  song: { id: string; titleKo: string; composer: string | null };
}

export interface Rehearsal {
  id: string;
  date: string | null;   // ISO yyyy-mm-dd or null
  startTime: string | null;
  location: string | null;
  note: string | null;
  songs: RehearsalSongItem[];
}

interface AllSong {
  id: string;
  titleKo: string;
  composer: string | null;
}

interface Props {
  ensembleId: string;
  rehearsals: Rehearsal[];
  availableSongs: AllSong[]; // 레파토리 안의 곡들
}

export function ScheduleManager({ ensembleId, rehearsals, availableSongs }: Props) {
  const [showNew, setShowNew] = useState(false);
  const dated = rehearsals.filter((r) => r.date).sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const undated = rehearsals.filter((r) => !r.date);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">연습 일정</h2>
        {!showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 연습일 추가
          </button>
        )}
      </div>

      {showNew && (
        <div className="mb-4">
          <RehearsalForm
            ensembleId={ensembleId}
            onDone={() => setShowNew(false)}
            onCancel={() => setShowNew(false)}
          />
        </div>
      )}

      {dated.length === 0 && undated.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          등록된 연습일이 없습니다.
        </div>
      )}

      {dated.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-medium text-gray-500">날짜 확정</h3>
          <div className="space-y-2">
            {dated.map((r) => (
              <RehearsalCard key={r.id} rehearsal={r} availableSongs={availableSongs} />
            ))}
          </div>
        </section>
      )}

      {undated.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium text-gray-500">날짜 미정</h3>
          <div className="space-y-2">
            {undated.map((r) => (
              <RehearsalCard key={r.id} rehearsal={r} availableSongs={availableSongs} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── 연습일 카드 ───
function RehearsalCard({
  rehearsal,
  availableSongs,
}: {
  rehearsal: Rehearsal;
  availableSongs: AllSong[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [addingSong, setAddingSong] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      message: "이 연습일을 삭제하시겠습니까?",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/rehearsals/${rehearsal.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("삭제되었습니다.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "삭제에 실패했습니다.");
    }
  }

  async function handleAddSong(songId: string) {
    const res = await fetch(`/api/rehearsals/${rehearsal.id}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    if (res.ok) {
      toast.success("곡이 추가되었습니다.");
      setAddingSong(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "추가에 실패했습니다.");
    }
  }

  async function handleRemoveSong(rsId: string) {
    const res = await fetch(`/api/rehearsals/${rehearsal.id}/songs/${rsId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("제거되었습니다.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "제거에 실패했습니다.");
    }
  }

  const existingSongIds = rehearsal.songs.map((s) => s.song.id);
  const candidates = availableSongs.filter((s) => !existingSongIds.includes(s.id));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {editing ? (
        <RehearsalForm
          ensembleId=""
          rehearsal={rehearsal}
          onDone={() => { setEditing(false); router.refresh(); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-gray-900">
                {formatDateLabel(rehearsal.date)}
                {rehearsal.startTime && <span className="ml-2 text-gray-500">{rehearsal.startTime}</span>}
              </p>
              {rehearsal.location && (
                <p className="text-sm text-gray-500">{rehearsal.location}</p>
              )}
              {rehearsal.note && (
                <p className="mt-1 text-sm text-amber-700">{rehearsal.note}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => setEditing(true)} className="text-blue-500 hover:text-blue-700">편집</button>
              <button onClick={handleDelete} className="text-red-500 hover:text-red-700">삭제</button>
            </div>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            {rehearsal.songs.length > 0 ? (
              <ol className="space-y-1 text-sm">
                {rehearsal.songs.map((rs, idx) => (
                  <li key={rs.id} className="flex items-center justify-between">
                    <span>
                      <span className="mr-2 text-xs text-gray-400">{idx + 1}</span>
                      <span className="font-medium text-gray-800">{rs.song.titleKo}</span>
                      {rs.song.composer && <span className="ml-1 text-xs text-gray-400">{rs.song.composer}</span>}
                      {rs.note && <span className="ml-2 text-xs text-amber-700">· {rs.note}</span>}
                    </span>
                    <button
                      onClick={() => handleRemoveSong(rs.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-gray-400">이 연습일에 배정된 곡이 없습니다.</p>
            )}

            {addingSong ? (
              <div className="mt-3 rounded-md border border-blue-200 bg-blue-50/30 p-2">
                {candidates.length === 0 ? (
                  <p className="text-xs text-gray-500">추가할 곡이 없습니다. 레파토리 탭에서 먼저 곡을 등록하세요.</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {candidates.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-white">
                        <span>
                          <span className="font-medium text-gray-800">{s.titleKo}</span>
                          {s.composer && <span className="ml-1 text-xs text-gray-400">{s.composer}</span>}
                        </span>
                        <button
                          onClick={() => handleAddSong(s.id)}
                          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700"
                        >
                          추가
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setAddingSong(false)}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  닫기
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSong(true)}
                className="mt-2 text-xs text-blue-500 hover:text-blue-700"
              >
                + 곡 추가
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 연습일 생성/편집 폼 ───
function RehearsalForm({
  ensembleId,
  rehearsal,
  onDone,
  onCancel,
}: {
  ensembleId: string;
  rehearsal?: Rehearsal;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(rehearsal?.date ?? "");
  const [startTime, setStartTime] = useState(rehearsal?.startTime ?? "");
  const [location, setLocation] = useState(rehearsal?.location ?? "");
  const [note, setNote] = useState(rehearsal?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      date: date || null,
      startTime: startTime.trim() || null,
      location: location.trim() || null,
      note: note.trim() || null,
    };
    const url = rehearsal
      ? `/api/rehearsals/${rehearsal.id}`
      : `/api/ensembles/${ensembleId}/rehearsals`;
    const method = rehearsal ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(rehearsal ? "저장되었습니다." : "연습일이 추가되었습니다.");
      router.refresh();
      onDone();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "저장에 실패했습니다.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-xs text-gray-400">날짜 (비워두면 미정)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-gray-400">시작 시간</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-xs text-gray-400">장소</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 합주실 A"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-xs text-gray-400">메모 (선택)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function formatDateLabel(date: string | null): string {
  if (!date) return "날짜 미정";
  // 서버는 YYYY-MM-DD 문자열로 넘겨주므로 UTC로 안전 파싱 후 UTC getter 사용 (TZ 이동 방지)
  const d = new Date(`${date}T00:00:00Z`);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${yyyy}.${mm}.${dd} (${weekday})`;
}
