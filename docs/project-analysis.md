# ChoirNote (acapella) 프로젝트 분석

> 분석 일자: 2026-04-23
> 저장소: https://github.com/WaveSimm/acapella
> 배포: Vercel Production

---

## 📊 기술 스택

| 계층 | 기술 |
|---|---|
| Frontend | Next.js 14.2 (App Router), React 18, TypeScript 5, Tailwind CSS |
| ORM/DB | Prisma 5.22 + PostgreSQL (Supabase) |
| 인증 | NextAuth 4.24 (Google + Kakao OAuth) |
| 악보 엔진 | OpenSheetMusicDisplay 1.9.7 |
| MIDI 재생 | html-midi-player + @magenta/music + Tone.js |
| 호스팅 | Vercel (frontend) + Supabase (DB) |

---

## 📁 코드 규모

| 항목 | 수치 |
|---|---|
| 총 소스 | **9,645 줄** TS/TSX |
| 파일 수 | 75개 |
| 디렉토리 | 56개 |
| API 라우트 | **26개** |
| 페이지 라우트 | 15개 |

### API 영역 (13개)

admin · auth · ensembles · files · log · manifest · nwc-upload · profile · rehearsals · resources · songs · specs · audio-proxy

### 가장 큰 파일 Top 6

| 파일 | 줄 수 | 역할 |
|---|---|---|
| `lib/nwc/parser.ts` | 616 | NWC 파일 파싱 (V2.75 바이너리 + nwctxt) |
| `components/practice/midi-player.tsx` | 536 | MIDI 재생 (배속, 구간반복, A-B 루프) |
| `components/practice/song-player.tsx` | 477 | 파트별 연습 소스 통합 플레이어 |
| `components/practice/youtube-player.tsx` | 469 | YouTube 임베드 플레이어 |
| `components/songs/resource-editor.tsx` | 440 | 관리자용 리소스 편집 UI |
| `components/practice/score-viewer.tsx` | 413 | 악보 렌더링 + 커서 동기화 |

---

## 🗄️ DB 구조

### 테이블 및 현재 행 수 (12개 테이블)

**핵심 도메인**
| 테이블 | 행 수 | 비고 |
|---|---|---|
| `songs` | 10 | 곡 마스터 |
| `practice_resources` | 30 | 파트별 연습 자원 (MIDI/AUDIO/VIDEO/SCORE_PREVIEW) |
| `uploaded_files` | 9 | 바이너리 저장 (Bytes) |
| `conductors` | 1 | 지휘자 |
| `conductor_specs` | 0 | 곡별 사양 / fork |
| `ensembles` | 1 | 합창단 |
| `ensemble_songs` | 10 | 레파토리 |
| `rehearsals` | 1 | 주간 배정 상위 |
| `rehearsal_songs` | 5 | 배정 곡 |

**인증 (NextAuth)**
| 테이블 | 행 수 |
|---|---|
| `accounts` | 1 |
| `sessions` | 0 |
| `verification_tokens` | 0 |

**로그**
| 테이블 | 행 수 | 내용 |
|---|---|---|
| `access_logs` | 212 | share_code 페이지 접근 기록 |

### 리소스 분포 (PracticeResource 30건)

| 타입 | 출처 | 개수 |
|---|---|---|
| AUDIO | Google Drive | 6 |
| AUDIO | user (수동) | 6 |
| VIDEO | user | 2 |
| MIDI | Google Drive | 9 |
| MIDI | 업로드 | 1 |
| MIDI | NWC 변환 | 2 |
| SCORE_PREVIEW | NWC 변환 | 2 (MusicXML) |
| SCORE_PREVIEW | user | 2 (PDF) |

---

## 💾 저장소 현황

**UploadedFile 총 1.52 MB** (9개 파일)

| MIME | 개수 | 용량 |
|---|---|---|
| `application/vnd.recordare.musicxml+xml` | 4 | **1.42 MB** |
| `audio/midi` | 5 | 64 KB |

> 💡 MusicXML이 MIDI보다 **22배** 큼 — OSMD 초기 로딩 시 네트워크 비용의 주 원인.

---

## 🔁 개발 활동

| 지표 | 값 |
|---|---|
| 총 커밋 | 121개 |
| 최근 7일 커밋 | **121개 (100%)** |
| 브랜치 | master 단일 운영 |
| 배포 도구 | `vercel --prod` |

> 🚀 신규 프로젝트 집중 개발 단계 (1주간 121회 커밋 = 하루 평균 17회)

---

## 🌐 대역폭 / 성능 포인트

### 서버 대역폭 실측
- `access_logs` 스키마에 `bytesOut` 없음 → **실측 불가**
- Vercel/Supabase 대시보드 확인 필요

### 페이지당 네트워크 부하 추정 (`/c/[shareCode]` 레파토리 뷰)

| 자원 | 크기 |
|---|---|
| Next.js JS 번들 | ~300 KB |
| html-midi-player (esm.sh CDN) | ~2 MB |
| SoundFont (sgm_plus, CDN) | ~5 MB |
| MusicXML (곡당) | ~350 KB |
| MIDI (곡당) | ~15 KB |

### 실사용 체감 포인트
- **첫 재생 AudioContext warmup ~2.5초** (Tone.js 초기화 지연)
- MusicXML DB fetch 후 OSMD 파싱 — 107마디 기준 ~500ms
- 모바일에선 rAF setInterval 스로틀링 주의 (이미 조치됨)

---

## 🎯 주요 기능 모듈

1. **NWC 파이프라인** — 업로드 → 파싱 → MIDI + MusicXML 생성 → DB 저장 (가장 고밀도 개발 영역)
2. **Score-Player 동기화** — 커서 매핑, 마디 폭 조절, 파트 하이라이트, 볼륨 믹서
3. **MIDI 플레이어** — 배속 (0.5x~1.5x), A-B 루프, 전체 반복, SoundFont 사전 로딩
4. **합창단원 뷰** — share_code URL 기반, 로그인 불필요
5. **Drive Sync** — Google Drive 폴더 자동 스캔 → PracticeResource 등록
6. **주간 배정 + 레파토리 관리** — 지휘자 대시보드

---

## ⚠️ 기술적 리스크

| 리스크 | 영향 |
|---|---|
| **MusicXML 크기** — 1.4MB가 DB Bytes로 저장 | Supabase 1MB row limit 근접, 큰 악보 시 실패 |
| **NWC 파서 복잡도** — 616줄, 에지 케이스 많음 | Grace, Triplet, Tied, mid-score key change 등 — 유닛 테스트 없음 |
| **OAuth 토큰 DB 평문 저장** | 백업 시 GitHub push protection이 차단 (이미 발생) |
| **html-midi-player 버전 의존** | speed 기능 미지원 → Magenta Player 내부 접근 hack, 버전 업 시 깨질 가능성 |
| **AccessLog bytesOut 미기록** | 실사용 대역폭 측정 불가 |

---

## 💡 권장 개선 사항

1. **MusicXML gzip 저장** — row 크기 약 75% 감소 예상
2. **AccessLog 확장** — `bytesOut`, `method`, `statusCode` 컬럼 추가
3. **NWC 파서 유닛 테스트** — 현재 수동 검증만
4. **Backup 민감 필드 마스킹** — accounts.access_token 등
5. **Drive Sync NWC 자동 포팅** — 현재 수동 업로드만 가능

---

## 📚 지원 출판사 (MVP 기준)

- 유빌라테 (17집 31곡, 상세 사양 완비)
- 선민성가 (42집 26+곡)
- 피스(Peace) (개별 곡)
- 신상우 찬편곡2

---

*작성: Claude Code 분석 자동 생성 (scripts/project-stats.ts 기반)*
