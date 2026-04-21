const EXT_RE = /\.(mp3|mp4|m4a|wav|mid|midi|mov)$/i;

// 파트 표기 정규화. 입력: 토큰. 출력: 저장용 한글 파트명.
const PART_ALIAS: Record<string, string> = {
  // 소프라노
  s: "소프라노",
  sop: "소프라노",
  soprano: "소프라노",
  소프라노: "소프라노",
  s1: "소프라노1",
  s2: "소프라노2",
  sop1: "소프라노1",
  sop2: "소프라노2",
  // 알토
  a: "알토",
  alt: "알토",
  alto: "알토",
  알토: "알토",
  a1: "알토1",
  a2: "알토2",
  alto1: "알토1",
  alto2: "알토2",
  // 테너
  t: "테너",
  ten: "테너",
  tenor: "테너",
  테너: "테너",
  t1: "테너1",
  t2: "테너2",
  ten1: "테너1",
  ten2: "테너2",
  // 바리톤
  bari: "바리톤",
  baritone: "바리톤",
  br: "바리톤",
  바리톤: "바리톤",
  // 베이스
  b: "베이스",
  bass: "베이스",
  베이스: "베이스",
  b1: "베이스1",
  b2: "베이스2",
  bass1: "베이스1",
  bass2: "베이스2",
  // 솔로
  solo: "솔로",
  솔로: "솔로",
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

function isPartToken(token: string): boolean {
  return !!PART_ALIAS[token.trim().toLowerCase()];
}

/**
 * 파일명 파싱. 지원하는 패턴:
 *   - {제목}.ext                           → part="전체"
 *   - {제목}_{파트}.ext                    → 파트 뒤
 *   - {파트}_{제목}.ext                    → 파트 앞
 *   - {토큰1}_{토큰2}_..._{제목}.ext       → 제목 내 언더스코어는 공백으로
 */
export function parseFileName(fileName: string): ParsedFile | null {
  const base = fileName.replace(EXT_RE, "").trim();
  if (!base) return null;

  const tokens = base.split(/_+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  if (tokens.length === 1) {
    return { title: tokens[0], part: "전체" };
  }

  // 맨 뒤 토큰이 파트면 { title, part } = { 앞쪽 토큰, 뒤 토큰 }
  const last = tokens[tokens.length - 1];
  if (isPartToken(last)) {
    return { title: tokens.slice(0, -1).join(" "), part: normalizePart(last) };
  }
  // 맨 앞 토큰이 파트면 { title, part } = { 뒤쪽 토큰, 앞 토큰 }
  const first = tokens[0];
  if (isPartToken(first)) {
    return { title: tokens.slice(1).join(" "), part: normalizePart(first) };
  }
  // 파트 미포함 → 전체 제목
  return { title: tokens.join(" "), part: "전체" };
}

/**
 * 매칭용 제목 정규화:
 *   - 언더스코어 → 공백
 *   - 아포스트로피/특수문자 제거
 *   - 연속 공백 → 단일 공백
 *   - 소문자
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFC")
    .replace(/[_]+/g, " ")
    .replace(/['\u2018\u2019\u201C\u201D".,!?()\[\]/\\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Song 매칭. 우선순위:
 *   1. 정확일치 (normalized)
 *   2. 파일 제목이 곡 제목을 포함
 *   3. 곡 제목이 파일 제목을 포함 (여러 곡 매칭 시 더 긴 곡 제목 우선)
 */
export function matchSong<T extends { id: string; titleKo: string; titleEn?: string | null }>(
  songs: T[],
  title: string,
): T | null {
  const needle = normalizeTitle(title);
  if (!needle) return null;

  // 1. 정확일치
  for (const s of songs) {
    if (normalizeTitle(s.titleKo) === needle) return s;
    if (s.titleEn && normalizeTitle(s.titleEn) === needle) return s;
  }

  // 2. 파일 제목이 곡 제목 포함 (파일명이 더 길 때)
  const candidates: { song: T; songTitle: string }[] = [];
  for (const s of songs) {
    const a = normalizeTitle(s.titleKo);
    const b = s.titleEn ? normalizeTitle(s.titleEn) : "";
    if (a && needle.includes(a)) candidates.push({ song: s, songTitle: a });
    else if (b && needle.includes(b)) candidates.push({ song: s, songTitle: b });
  }
  if (candidates.length > 0) {
    candidates.sort((x, y) => y.songTitle.length - x.songTitle.length);
    return candidates[0].song;
  }

  // 3. 곡 제목이 파일 제목 포함 (파일명이 더 짧을 때)
  const candidates2: { song: T; songTitle: string }[] = [];
  for (const s of songs) {
    const a = normalizeTitle(s.titleKo);
    const b = s.titleEn ? normalizeTitle(s.titleEn) : "";
    if (a && a.includes(needle) && needle.length >= 3) candidates2.push({ song: s, songTitle: a });
    else if (b && b.includes(needle) && needle.length >= 3) candidates2.push({ song: s, songTitle: b });
  }
  if (candidates2.length > 0) {
    candidates2.sort((x, y) => x.songTitle.length - y.songTitle.length);
    return candidates2[0].song;
  }

  // 4. 앞쪽 단어 3개 이상 일치 (제목 정확도 오차 보정)
  const needleWords = needle.split(" ").filter(Boolean);
  const candidates3: { song: T; common: number }[] = [];
  for (const s of songs) {
    const a = normalizeTitle(s.titleKo).split(" ").filter(Boolean);
    const b = s.titleEn ? normalizeTitle(s.titleEn).split(" ").filter(Boolean) : [];
    const commonA = leadingWordOverlap(needleWords, a);
    const commonB = leadingWordOverlap(needleWords, b);
    const best = Math.max(commonA, commonB);
    if (best >= 3) candidates3.push({ song: s, common: best });
  }
  if (candidates3.length > 0) {
    candidates3.sort((x, y) => y.common - x.common);
    return candidates3[0].song;
  }

  return null;
}

function leadingWordOverlap(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
