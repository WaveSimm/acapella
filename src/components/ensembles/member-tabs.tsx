"use client";

import { useState } from "react";
import { MemberRepertoire } from "./member-repertoire";
import { MemberSchedule, type MemberRehearsal } from "./member-schedule";

type Tab = "schedule" | "repertoire";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
  url: string;
  sourceSite: string | null;
}

interface RepertoireItem {
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

export function MemberTabs({
  repertoire,
  rehearsals,
}: {
  repertoire: RepertoireItem[];
  rehearsals: MemberRehearsal[];
}) {
  const hasSchedule = rehearsals.length > 0;
  const [tab, setTab] = useState<Tab>(hasSchedule ? "schedule" : "repertoire");

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        <TabButton active={tab === "schedule"} onClick={() => setTab("schedule")}>
          일정{rehearsals.length > 0 ? ` (${rehearsals.length})` : ""}
        </TabButton>
        <TabButton active={tab === "repertoire"} onClick={() => setTab("repertoire")}>
          레파토리 ({repertoire.length})
        </TabButton>
      </div>

      {tab === "schedule" && <MemberSchedule rehearsals={rehearsals} />}
      {tab === "repertoire" && <MemberRepertoire items={repertoire} />}
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
