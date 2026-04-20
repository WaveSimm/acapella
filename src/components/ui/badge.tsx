import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, PART_LABELS } from "@/lib/utils";

export function DifficultyBadge({ difficulty }: { difficulty: string | null }) {
  if (!difficulty) return null;
  const label = DIFFICULTY_LABELS[difficulty] ?? difficulty;
  const color = DIFFICULTY_COLORS[difficulty] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export function PartBadge({ part }: { part: string }) {
  const label = PART_LABELS[part] ?? part;
  const colors: Record<string, string> = {
    ALL: "bg-purple-100 text-purple-800",
    SOPRANO: "bg-pink-100 text-pink-800",
    ALTO: "bg-rose-100 text-rose-800",
    TENOR: "bg-sky-100 text-sky-800",
    BASS: "bg-indigo-100 text-indigo-800",
  };
  const color = colors[part] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export function ResourceCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
      연습 {count}
    </span>
  );
}
