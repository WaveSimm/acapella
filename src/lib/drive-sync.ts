const EXT_RE = /\.(mp3|mp4|m4a|wav|mid|midi|mov)$/i;

// 파트 표기 정규화. 입력: 파일명에서 _ 뒤 토큰. 출력: 저장용 한글 파트명.
const PART_ALIAS: Record<string, string> = {
  // 소프라노
  s: "소프라노",
  소프라노: "소프라노",
  sop: "소프라노",
  soprano: "소프라노",
  s1: "소프라노1",
  s2: "소프라노2",
  소프라노1: "소프라노1",
  소프라노2: "소프라노2",
  // 알토
  a: "알토",
  알토: "알토",
  alto: "알토",
  a1: "알토1",
  a2: "알토2",
  알토1: "알토1",
  알토2: "알토2",
  // 테너
  t: "테너",
  테너: "테너",
  ten: "테너",
  tenor: "테너",
  t1: "테너1",
  t2: "테너2",
  테너1: "테너1",
  테너2: "테너2",
  // 베이스
  b: "베이스",
  베이스: "베이스",
  bass: "베이스",
  b1: "베이스1",
  b2: "베이스2",
  베이스1: "베이스1",
  베이스2: "베이스2",
  // 전체/기타
  all: "전체",
  전체: "전체",
  mix: "전체",
  full: "전체",
  piano: "반주",
  반주: "반주",
  mr: "MR",
  inst: "반주",
  instrumental: "반주",
};

export interface ParsedFile {
  title: string;
  part: string;
}

export function normalizePart(raw: string): string {
  const key = raw.trim().toLowerCase();
  return PART_ALIAS[key] ?? raw.trim();
}

export function parseFileName(fileName: string): ParsedFile | null {
  const base = fileName.replace(EXT_RE, "").trim();
  if (!base) return null;

  // 마지막 _ 뒤가 파트 표기로 해석 가능하면 분리
  const underscoreIdx = base.lastIndexOf("_");
  if (underscoreIdx > 0 && underscoreIdx < base.length - 1) {
    const titlePart = base.slice(0, underscoreIdx).trim();
    const partPart = base.slice(underscoreIdx + 1).trim();
    if (titlePart) {
      return { title: titlePart, part: normalizePart(partPart) };
    }
  }
  return { title: base, part: "전체" };
}

export function normalizeTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function matchSong<T extends { id: string; titleKo: string; titleEn?: string | null }>(
  songs: T[],
  title: string,
): T | null {
  const needle = normalizeTitle(title);
  if (!needle) return null;
  for (const s of songs) {
    if (normalizeTitle(s.titleKo) === needle) return s;
    if (s.titleEn && normalizeTitle(s.titleEn) === needle) return s;
  }
  return null;
}
