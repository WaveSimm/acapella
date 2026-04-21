---
name: drive-folder-sync Plan
description: Google Drive 연습곡 폴더 자동 동기화 Plan 완료. DB 필드 이미 반영, 3개 Phase로 구성.
type: project
---

Drive 폴더 자동 동기화 Plan 완료 (2026-04-21).

**Why:** 수동 URL 입력 방식의 유지 비용 제거.

**How to apply:** Design/Do 단계에서 `src/lib/drive-api.ts`, `src/lib/drive-sync.ts`, `src/app/api/ensembles/[ensembleId]/drive-sync/route.ts` 를 신규 생성하고, `ensemble-tabs.tsx` 에 UI 통합하면 됨.

주요 결정:
- API 키 인증 (OAuth 아님), `GOOGLE_DRIVE_API_KEY` 환경변수 신규 추가 필요
- PracticeResource upsert 중복 기준: Drive 파일 URL (`drive.google.com/uc?export=download&id={fileId}`)
- Ensemble.driveFolderUrl / driveFolderId 필드는 prisma db push 완료 상태
