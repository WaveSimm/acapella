// Design Ref: §4.5 — Korean part name standardization
// 양쪽 프로젝트(choirnote ↔ acapella)에 동일 파일로 복사 유지.
// 변경 시 양쪽 동시 수정 필수. drift는 pre-commit hook으로 감지.

const PART_ALIAS: Record<string, string> = {
  // 영문 (legacy ChoirNote enum 출신)
  all: "전체",
  soprano: "소프라노",
  alto: "알토",
  tenor: "테너",
  bass: "베이스",
  // 영문 약어
  s: "소프라노",
  sop: "소프라노",
  a: "알토",
  alt: "알토",
  t: "테너",
  ten: "테너",
  b: "베이스",
  // 분할
  s1: "소프라노1",
  s2: "소프라노2",
  sop1: "소프라노1",
  sop2: "소프라노2",
  a1: "알토1",
  a2: "알토2",
  alto1: "알토1",
  alto2: "알토2",
  t1: "테너1",
  t2: "테너2",
  ten1: "테너1",
  ten2: "테너2",
  b1: "베이스1",
  b2: "베이스2",
  bass1: "베이스1",
  bass2: "베이스2",
  // 바리톤
  bari: "바리톤",
  baritone: "바리톤",
  br: "바리톤",
  // 솔로
  solo: "솔로",
  // 전체/기타
  mix: "전체",
  full: "전체",
  // 반주/MR
  piano: "반주",
  inst: "반주",
  instrumental: "반주",
  mr: "MR",
  // 한글 패스스루 (이미 표준값인 경우)
  소프라노: "소프라노",
  알토: "알토",
  테너: "테너",
  베이스: "베이스",
  바리톤: "바리톤",
  솔로: "솔로",
  전체: "전체",
  반주: "반주",
  소프라노1: "소프라노1",
  소프라노2: "소프라노2",
  알토1: "알토1",
  알토2: "알토2",
  테너1: "테너1",
  테너2: "테너2",
  베이스1: "베이스1",
  베이스2: "베이스2",
};

export function normalizePart(raw: string | null | undefined): string {
  if (!raw) return "전체";
  const key = raw.trim().toLowerCase();
  return PART_ALIAS[key] ?? raw.trim();
}

/**
 * 토큰이 인식 가능한 파트명 표기인지 체크.
 * 파일명 파싱(드라이브 동기화 등)에서 토큰이 파트인지 제목인지 판별할 때 사용.
 */
export function isPartToken(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const key = raw.trim().toLowerCase();
  return PART_ALIAS[key] !== undefined;
}

const SORT_ORDER: Record<string, number> = {
  전체: 0,
  소프라노: 1,
  소프라노1: 2,
  소프라노2: 3,
  알토: 4,
  알토1: 5,
  알토2: 6,
  테너: 7,
  테너1: 8,
  테너2: 9,
  바리톤: 10,
  베이스: 11,
  베이스1: 12,
  베이스2: 13,
  솔로: 14,
  반주: 15,
  MR: 16,
};

export function partSortKey(part: string): number {
  return SORT_ORDER[part] ?? 99;
}

const PART_COLORS: Record<string, string> = {
  전체: "bg-purple-100 text-purple-800",
  소프라노: "bg-pink-100 text-pink-800",
  소프라노1: "bg-pink-100 text-pink-800",
  소프라노2: "bg-pink-100 text-pink-800",
  알토: "bg-rose-100 text-rose-800",
  알토1: "bg-rose-100 text-rose-800",
  알토2: "bg-rose-100 text-rose-800",
  테너: "bg-sky-100 text-sky-800",
  테너1: "bg-sky-100 text-sky-800",
  테너2: "bg-sky-100 text-sky-800",
  바리톤: "bg-blue-100 text-blue-800",
  베이스: "bg-indigo-100 text-indigo-800",
  베이스1: "bg-indigo-100 text-indigo-800",
  베이스2: "bg-indigo-100 text-indigo-800",
  솔로: "bg-amber-100 text-amber-800",
  반주: "bg-emerald-100 text-emerald-800",
  MR: "bg-emerald-100 text-emerald-800",
};

export function partColorClass(part: string): string {
  return PART_COLORS[part] ?? "bg-gray-100 text-gray-800";
}
