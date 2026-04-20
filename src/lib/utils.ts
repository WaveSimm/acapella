// ─── 난이도 한국어 매핑 ───
export const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "하",
  BELOW_MID: "중하",
  MEDIUM: "중",
  ABOVE_MID: "중상",
  HARD: "상",
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: "bg-green-100 text-green-800",
  BELOW_MID: "bg-blue-100 text-blue-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  ABOVE_MID: "bg-orange-100 text-orange-800",
  HARD: "bg-red-100 text-red-800",
};

// ─── 파트 한국어 매핑 (레거시 enum 값 대비) ───
export const PART_LABELS: Record<string, string> = {
  ALL: "전체",
  SOPRANO: "소프라노",
  ALTO: "알토",
  TENOR: "테너",
  BASS: "베이스",
};

// ─── 파트 입력 추천 리스트 (아카펠라 공통) ───
export const COMMON_PARTS = [
  "전체",
  "소프라노", "알토", "테너", "베이스",
  "S1", "S2", "A1", "A2", "T1", "T2", "B1", "B2",
  "솔로", "비트박스",
];

// ─── 빠르기 파싱 ───
export function parseTempo(raw: string): string {
  if (!raw) return "";
  // New format: "♩=90, ♪=98" → 그대로 표시
  if (raw.includes("=")) return raw;
  // Legacy: "점사-96" → "♩.=96"
  if (raw.startsWith("점사-")) return `♩.=${raw.replace("점사-", "")}`;
  // Legacy: "2-92" → "𝅗𝅥=92"
  if (raw.match(/^2-\d+/)) return `𝅗𝅥=${raw.replace("2-", "")}`;
  // Legacy: "이-46" → "𝅗𝅥=46"
  if (raw.startsWith("이-")) return `𝅗𝅥=${raw.replace("이-", "")}`;
  // Legacy: "66,72,54,78" → 구간별 BPM
  return `♩=${raw}`;
}

// ─── 조성 파싱 ───
export function parseKeySignatures(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

// ─── 공유코드 생성 ───
export function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 문자 제외 (0/O, 1/I/L)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── 날짜 포맷 ───
export function formatWorshipDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

// ─── 시트 날짜 파싱 ("4일" → 4) ───
export function parseDayFromSheet(raw: string): number {
  const match = raw.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

// ─── 난이도 문자열 → enum 변환 ───
export function parseDifficulty(
  raw: string
): "EASY" | "BELOW_MID" | "MEDIUM" | "ABOVE_MID" | "HARD" | null {
  const map: Record<string, "EASY" | "BELOW_MID" | "MEDIUM" | "ABOVE_MID" | "HARD"> = {
    하: "EASY",
    중하: "BELOW_MID",
    중: "MEDIUM",
    중상: "ABOVE_MID",
    상: "HARD",
  };
  return map[raw?.trim()] ?? null;
}
