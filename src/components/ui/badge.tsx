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

// 자유 문자열 파트 라벨 표시 (레거시 enum 값은 한국어로 변환)
export function PartBadge({ part }: { part: string }) {
  const label = PART_LABELS[part] ?? part;
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
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
