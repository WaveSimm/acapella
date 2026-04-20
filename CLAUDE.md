# Acapella

합창단 연습곡 레파토리 관리 플랫폼.
ChoirNote에서 포크, **주간 예배 선곡이 아닌 고정 연습곡 리스트**에 특화.

## 핵심 개념

- **합창단 (Ensemble)**: 지휘자가 운영하는 단체. 공유코드로 단원에게 링크.
- **연습곡 (EnsembleSong)**: 합창단에 등록된 연습곡 리스트 (날짜 없음, 순서만).
- **곡 (Song)**: 제목·작곡가 등 메타. 여러 합창단이 공유 가능.
- **리소스 (PracticeResource)**: 곡당 파트별 음원·영상 URL.
- **사양 (ConductorSpec)**: 지휘자별 조성/박자/빠르기 등 분석.

## ChoirNote와의 차이

| ChoirNote | Acapella |
|-----------|----------|
| 교회 성가대 지휘자 | 아카펠라·합창단 지휘자 |
| 출판사·곡집 계층 강제 | 곡 단독 존재 |
| 주간 예배 배정 (날짜별) | 고정 레파토리 (순서만) |
| 크롤링 기반 곡집 | 수동 입력 |

## 기술 스택

- Next.js 14 App Router, TypeScript, Tailwind
- Prisma + Supabase (PostgreSQL)
- NextAuth (Google / Kakao)
- Vercel 호스팅 — `acapella.vercel.app`

## 현재 진행 상황 (초기 포크)

- [x] ChoirNote 포크 + 스키마 재작성
- [x] 불필요한 모델/페이지 제거 (Publisher/Collection/WeeklyAssignment/CrawlRequest/Choir)
- [x] 기본 랜딩·대시보드 스켈레톤
- [ ] GitHub 레포 생성 + Vercel 프로젝트 연결
- [ ] Supabase 새 프로젝트 + DATABASE_URL 설정
- [ ] `/api/ensembles` + Ensemble CRUD UI
- [ ] `/api/songs` + Song CRUD UI
- [ ] `/c/[shareCode]` 레파토리 뷰 (단원용)
- [ ] ResourceEditor·SpecInlineEdit 재연결

## 디렉토리

```
acapella/
├── CLAUDE.md
├── prisma/schema.prisma         # 단순화된 스키마
├── src/
│   ├── app/                     # Next.js 페이지
│   ├── components/
│   │   ├── practice/            # 플레이어 (ChoirNote와 동일)
│   │   ├── providers/
│   │   └── ui/                  # toast, confirm, badge, site-shell, auth-nav
│   └── lib/                     # prisma, auth, access-log, utils
```

## 환경변수

```
DATABASE_URL=postgresql://...    # Supabase
DIRECT_URL=postgresql://...      # Supabase Direct

NEXTAUTH_URL=https://acapella.vercel.app
NEXTAUTH_SECRET=...              # openssl rand -base64 32

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
KAKAO_CLIENT_ID=...              # (선택)
KAKAO_CLIENT_SECRET=...

ALLOWED_EMAILS=...               # 프로덕션 화이트리스트 (OAuth 미설정 시)
```
