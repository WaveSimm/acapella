"use client";

interface Resource {
  id: string;
  part: string;
  resourceType: string;
  url: string;
  label: string | null;
  sourceSite: string | null;
}

const PART_ORDER = ["ALL", "SOPRANO", "ALTO", "TENOR", "BASS"] as const;
const PART_LABELS: Record<string, string> = {
  ALL: "전체",
  SOPRANO: "소프",
  ALTO: "알토",
  TENOR: "테너",
  BASS: "베이스",
};

function typeMeta(r: Resource): { label: string; color: string } {
  if (r.resourceType === "MIDI") return { label: "MIDI", color: "bg-violet-50 text-violet-700" };
  if (r.resourceType === "SCORE_PREVIEW") return { label: "악보", color: "bg-amber-50 text-amber-700" };
  if (r.resourceType === "AUDIO" || /\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(r.url)) {
    return { label: "음원", color: "bg-emerald-50 text-emerald-700" };
  }
  if (r.url.includes("youtube.com") || r.url.includes("youtu.be")) {
    return { label: "YouTube", color: "bg-red-50 text-red-600" };
  }
  return { label: "영상", color: "bg-gray-100 text-gray-600" };
}

function shortLabel(r: Resource): string {
  if (r.label) return r.label;
  if (r.url.startsWith("/api/files/")) return "업로드 파일";
  try {
    const u = new URL(r.url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return r.url;
  }
}

export function SourceInventory({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) return null;

  // 파트별 그룹 (고정 순서)
  const byPart = new Map<string, Resource[]>();
  for (const r of resources) {
    const arr = byPart.get(r.part) ?? [];
    arr.push(r);
    byPart.set(r.part, arr);
  }

  const rows = PART_ORDER
    .map((p) => ({ part: p, items: byPart.get(p) ?? [] }))
    .filter((r) => r.items.length > 0);

  // PART_ORDER 에 없는 part 값이 있다면 맨 아래 추가
  for (const [part, items] of byPart) {
    if (!PART_ORDER.includes(part as typeof PART_ORDER[number])) {
      rows.push({ part: part as typeof PART_ORDER[number], items });
    }
  }

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-medium text-gray-500">
        파트별 연습 소스 ({resources.length}건)
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map(({ part, items }) => (
          <li key={part} className="flex items-start gap-3 px-3 py-2">
            <span className="w-10 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-center text-[10px] font-medium text-blue-600">
              {PART_LABELS[part] ?? part}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {items.map((r) => {
                const meta = typeMeta(r);
                return (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${meta.color} hover:underline`}
                    title={r.url}
                  >
                    <span className="font-medium">{meta.label}</span>
                    <span className="truncate text-gray-600 group-hover:text-gray-900">
                      {shortLabel(r)}
                    </span>
                  </a>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
