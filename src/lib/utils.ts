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
