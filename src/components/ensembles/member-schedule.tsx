"use client";

import { useState } from "react";
import { PartPlayer } from "@/components/practice/part-player";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
  url: string;
  sourceSite: string | null;
}

interface RehearsalSongItem {
  id: string;
  note: string | null;
  song: {
    id: string;
    titleKo: string;
    composer: string | null;
    pageNumber: number | null;
    resources: Resource[];
  };
}

export interface MemberRehearsal {
  id: string;
  date: string | null;
  startTime: string | null;
  location: string | null;
  note: string | null;
  songs: RehearsalSongItem[];
}

export function MemberSchedule({ rehearsals }: { rehearsals: MemberRehearsal[] }) {
  if (rehearsals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-400">예정된 연습일이 없습니다.</p>
      </div>
    );
  }

  const dated = rehearsals.filter((r) => r.date);
  const undated = rehearsals.filter((r) => !r.date);

  return (
    <div className="space-y-4">
      {dated.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium text-gray-500">다가오는 연습</h3>
          <div className="space-y-2">
            {dated.map((r) => <RehearsalCard key={r.id} rehearsal={r} />)}
          </div>
        </section>
      )}
      {undated.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium text-gray-500">날짜 미정</h3>
          <div className="space-y-2">
            {undated.map((r) => <RehearsalCard key={r.id} rehearsal={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function RehearsalCard({ rehearsal }: { rehearsal: MemberRehearsal }) {
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-3">
        <p className="text-base font-bold text-gray-900">
          {formatDateLabel(rehearsal.date)}
          {rehearsal.startTime && <span className="ml-2 text-gray-500">{rehearsal.startTime}</span>}
        </p>
        {rehearsal.location && (
          <p className="text-sm text-gray-500">{rehearsal.location}</p>
        )}
        {rehearsal.note && (
          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {rehearsal.note}
          </div>
        )}
      </div>

      {rehearsal.songs.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {rehearsal.songs.map((rs, idx) => {
            const isOpen = expandedSongId === rs.id;
            return (
              <div key={rs.id}>
                <button
                  onClick={() => setExpandedSongId(isOpen ? null : rs.id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
                >
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="shrink-0 text-xs text-gray-400">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{rs.song.titleKo}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[
                          rs.song.composer,
                          rs.song.pageNumber != null ? `p.${rs.song.pageNumber}` : null,
                        ].filter(Boolean).join(" · ") || " "}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-300">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-4">
                    {rs.note && (
                      <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {rs.note}
                      </div>
                    )}
                    {rs.song.resources.length > 0 ? (
                      <PartPlayer resources={rs.song.resources} />
                    ) : (
                      <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
                        연습 리소스 없음
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-5 py-3 text-xs text-gray-400">배정된 곡이 없습니다.</p>
      )}
    </div>
  );
}

function formatDateLabel(date: string | null): string {
  if (!date) return "날짜 미정";
  const d = new Date(date);
  const m = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${m}/${dd} (${weekday})`;
}
