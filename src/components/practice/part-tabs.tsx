"use client";

import { PART_LABELS } from "@/lib/utils";

interface PartTabsProps {
  parts: string[];
  activePart: string;
  onPartChange: (part: string) => void;
}

export function PartTabs({ parts, activePart, onPartChange }: PartTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
      {parts.map((part) => (
        <button
          key={part}
          onClick={() => onPartChange(part)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activePart === part
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {PART_LABELS[part] ?? part}
        </button>
      ))}
    </div>
  );
}
