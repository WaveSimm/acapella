"use client";

import { useState } from "react";
import { SongPlayer } from "@/components/practice/song-player";
import { NwcScorePlayer } from "@/components/practice/nwc-score-player";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
  url: string;
  sourceSite: string | null;
}

interface Item {
  id: string;
  note: string | null;
  song: {
    id: string;
    titleKo: string;
    titleEn: string | null;
    composer: string | null;
    pageNumber: number | null;
    resources: Resource[];
  };
}

export function MemberRepertoire({ items }: { items: Item[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-400">등록된 연습곡이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const isOpen = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <button
              onClick={() => setExpandedId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="shrink-0 text-xs text-gray-400">{idx + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-900">
                    {item.song.titleKo}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[
                      item.song.composer,
                      item.song.pageNumber != null ? `p.${item.song.pageNumber}` : null,
                    ].filter(Boolean).join(" · ") || " "}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-gray-300">{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4">
                {item.note && (
                  <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {item.note}
                  </div>
                )}
                {item.song.resources.length > 0 ? (
                  <div className="space-y-4">
                    {(() => {
                      const nwcMidi = item.song.resources.find(
                        (r) => r.sourceSite === "NWC 변환" && r.resourceType === "MIDI",
                      );
                      const nwcScore = item.song.resources.find(
                        (r) => r.sourceSite === "NWC 변환" && r.resourceType === "SCORE_PREVIEW",
                      );
                      if (nwcMidi && nwcScore) {
                        return <NwcScorePlayer midiSrc={nwcMidi.url} musicXmlSrc={nwcScore.url} />;
                      }
                      return null;
                    })()}
                    <SongPlayer resources={item.song.resources} />
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
                    등록된 연습 리소스가 없습니다.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
