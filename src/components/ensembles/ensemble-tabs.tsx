"use client";

import { useState } from "react";
import { RepertoireManager } from "./repertoire-manager";
import { ScheduleManager, type Rehearsal } from "./schedule-manager";

type Tab = "repertoire" | "schedule";

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
  repertoire: RepertoireItem[];
  rehearsals: Rehearsal[];
}

export function EnsembleTabs({ ensembleId, repertoire, rehearsals }: Props) {
  const [tab, setTab] = useState<Tab>("repertoire");

  const availableSongs = repertoire.map((r) => ({
    id: r.song.id,
    titleKo: r.song.titleKo,
    composer: r.song.composer,
  }));

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        <TabButton active={tab === "repertoire"} onClick={() => setTab("repertoire")}>
          레파토리 ({repertoire.length})
        </TabButton>
        <TabButton active={tab === "schedule"} onClick={() => setTab("schedule")}>
          일정 ({rehearsals.length})
        </TabButton>
      </div>

      {tab === "repertoire" && (
        <RepertoireManager ensembleId={ensembleId} songs={repertoire} />
      )}
      {tab === "schedule" && (
        <ScheduleManager
          ensembleId={ensembleId}
          rehearsals={rehearsals}
          availableSongs={availableSongs}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
