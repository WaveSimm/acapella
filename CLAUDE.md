# Acapella

합창단 연습곡 레파토리 관리 플랫폼.
ChoirNote에서 포크, **주간 예배 선곡이 아닌 고정 연습곡 리스트**에 특화.

- 배포: https://acapella.vercel.app (Vercel Production)
- 레포: https://github.com/WaveSimm/acapella
- DB: **ChoirNote Supabase에 통합됨** — 두 프로젝트가 하나의 PostgreSQL을 공유

## 핵심 개념

- **합창단 (Ensemble)**: 지휘자가 운영하는 단체. 공유코드(`/c/[shareCode]`)로 단원에게 링크.
- **연습곡 (EnsembleSong)**: 합창단에 등록된 연습곡 리스트 (날짜 없음, 순서만).
- **연습 일정 (Rehearsal / RehearsalSong)**: 날짜·장소별 연습 세션과 그날 연습할 곡.
- **곡 (Song)**: 제목·작곡가 등 메타. 여러 합창단이 공유 가능. NWC 원본 파일 연결 가능.
- **리소스 (PracticeResource)**: 곡당 파트별 음원·영상·MIDI. URL 또는 업로드 파일(`UploadedFile`, DB에 Bytes 저장).
- **사양 (ConductorSpec)**: 지휘자별 조성/박자/빠르기 등 분석.

## 스키마 공유 규칙 (중요)

`prisma/schema.prisma`는 **ChoirNote가 마스터**이며 Acapella는 byte-identical 복사본이다.
스키마 변경 시 반드시 양쪽 레포에 동일하게 반영할 것 (ChoirNote의 `scripts/check-schema-sync.sh`로 검증).
그래서 스키마에는 ChoirNote 전용 모델(Publisher/Collection/WeeklyAssignment/Choir/Crawl*)도 포함되어 있다 —
Acapella 코드에서는 사용하지 않지만 삭제하면 안 된다.

## 기술 스택

- Next.js 14 App Router, TypeScript, Tailwind
- Prisma 5 + Supabase (PostgreSQL) — 파일도 DB에 Bytes로 저장 (별도 스토리지 없음)
- NextAuth (Google / Kakao) — 가입 후 관리자 승인제 (Role: PENDING → CONDUCTOR / ADMIN)
- 악보: OpenSheetMusicDisplay (MusicXML 렌더) / MIDI 재생: html-midi-player + Magenta
- Vercel 호스팅 — `acapella.vercel.app`

## 주요 기능 모듈

### 악보 변환 파이프라인 (`src/lib/nwc/`, `src/lib/musicxml/`)
NWC(.nwc/.nwctxt) 또는 MusicXML(.musicxml/.xml/.mxl) 업로드 → 내부 모델(`ParsedScore`) → MusicXML(악보) + MIDI(재생) 생성.
- `nwc/parser.ts` — NWC 파싱 (임시표 전파, 박자 변경, 가사 규칙, 이음줄, 셋잇단음표 등)
- `musicxml/parse-musicxml.ts` — MusicXML → 내부 모델 (voice/staff 별 레인 분리, 못갖춘마디 앞쪽 패딩, treble-8 sounding↔written 보정, .mxl ZIP 해제)
- `parse-score.ts` — 파일 내용 기반 형식 자동 판별 디스패처
- `nwc/to-musicxml.ts` / `nwc/to-midi.ts` — 공용 변환기. `XML_DIVISIONS`/`MIDI_PPQ`는 3의 배수 (셋잇단 반올림 방지)
- API: `/api/nwc-upload`, `/api/nwc-convert` (재변환 버튼 지원, 원본 파일은 `Song.nwcFileId`로 보관)
- 변환 산출 리소스의 `sourceSite` 마커는 형식 무관 `"NWC 변환"` 고정 (기존 데이터·필터 호환)
- 검증: `scripts/verify-musicxml-roundtrip.ts` (DB 실데이터 라운드트립), `scripts/verify-musicxml-features.ts` (합성 케이스)
- 재생 UI: `nwc-score-player.tsx` (OSMD 악보 + 커서 동기화), `midi-player.tsx` (속도·파트 믹서, 마스터 게인 +12dB)
- 커서 동기화는 MIDI 유래 마디 타이밍 기반 — 이 부분 수정 시 과거 커밋 이력(드리프트 이슈 다수) 참고

### Google Drive 동기화 (`src/lib/drive-sync.ts`, `drive-api.ts`)
합창단에 Drive 폴더 URL을 연결하면 폴더 내 파일을 스캔해 곡 생성·리소스 매칭.
API: `/api/ensembles/[id]/drive-sync`, `.../drive-sync/create-song`

### 페이지
- `/dashboard` — 지휘자용: 합창단·곡 관리
- `/dashboard/ensembles/[ensembleId]` — 레파토리·일정·Drive 동기화 탭
- `/songs/[songId]` — 곡 상세 (리소스, 사양, NWC 업로드)
- `/c/[shareCode]` — 단원용 공유 뷰 (레파토리 + 일정 + 플레이어, 로그인 불필요)
- `/admin` — 사용자 승인, 접속 로그
- `/onboarding`, `/pending`, `/profile` — 가입 흐름

## 디렉토리

```
acapella/
├── CLAUDE.md
├── prisma/schema.prisma         # ChoirNote와 공유 (byte-identical, 위 규칙 참고)
├── docs/                        # 계획·세션 리포트·프로젝트 분석
├── scripts/                     # tsx 유틸 (tsconfig에서 제외됨 — Vercel 빌드 이슈)
│   ├── db-backup.ts / db-restore.ts   # 백업 파일은 gitignore
│   └── check-*.ts / verify-*.ts ...   # NWC 변환 디버깅·검증 단발 스크립트 다수
├── src/
│   ├── app/                     # 페이지 + API 라우트 (~27개)
│   ├── components/
│   │   ├── ensembles/           # 레파토리·일정·Drive 동기화·단원 뷰
│   │   ├── songs/               # 곡 리스트·메타·리소스 에디터
│   │   ├── practice/            # song-player, nwc-score-player, midi-player, score-viewer
│   │   ├── providers/
│   │   └── ui/                  # toast, confirm, site-shell, auth-nav
│   └── lib/                     # prisma, auth, nwc/, drive-sync, midi-time-map, normalize-part
```

## 환경변수

```
DATABASE_URL=postgresql://...    # ChoirNote Supabase (공유), pgbouncer
DIRECT_URL=postgresql://...      # Supabase Direct

NEXTAUTH_URL=https://acapella.vercel.app
NEXTAUTH_SECRET=...              # openssl rand -base64 32

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
KAKAO_CLIENT_ID=...              # (선택)
KAKAO_CLIENT_SECRET=...

GOOGLE_DRIVE_API_KEY=...         # Drive 폴더 동기화 (Drive API 활성화 필요)
GOOGLE_SHEETS_SPREADSHEET_ID=... # 데이터 임포트용 (선택)
ALLOWED_EMAILS=...               # 프로덕션 화이트리스트 (OAuth 미설정 시)
```

로컬 환경변수는 `vercel env pull`로 받은 `.env.local` 사용.

## 진행 상황

- [x] ChoirNote 포크 + GitHub/Vercel/Supabase 연결 (프로덕션 운영 중)
- [x] Ensemble/Song CRUD + `/c/[shareCode]` 공유 뷰
- [x] 연습 일정 (Rehearsal), ResourceEditor, ConductorSpec
- [x] NWC 업로드 → MusicXML/MIDI 변환 + 악보·MIDI 플레이어
- [x] Google Drive 폴더 동기화
- [x] DB를 ChoirNote Supabase로 통합 (스키마 공유 체제)
- 최근 작업 축: NWC 파서 정확도 (임시표·셋잇단·가사·마디 처리) 및 재생 커서 동기화 튜닝
