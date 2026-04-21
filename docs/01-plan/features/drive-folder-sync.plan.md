# drive-folder-sync Planning Document

> **Summary**: 지휘자가 공개 공유한 Google Drive 폴더를 스캔해 파일명 규칙으로 Song을 자동 매칭하고 PracticeResource를 생성/갱신한다.
>
> **Project**: acapella (ChoirNote 연습 플레이어)
> **Author**: Wave
> **Date**: 2026-04-21
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 지휘자가 연습 파일을 Drive에 올려도 앱에 수동으로 URL을 하나씩 입력해야 해서 진입 장벽이 높고 누락이 잦다. |
| **Solution** | 합창단(Ensemble)에 Drive 폴더 URL을 연결하고, "동기화" 버튼 한 번으로 폴더 내 파일을 일괄 스캔해 PracticeResource로 자동 등록한다. |
| **Function/UX Effect** | 파일을 Drive에 올리고 동기화 버튼만 누르면 신규/스킵/매칭실패 건수가 리포트로 표시된다. 재동기화도 멱등(idempotent)하게 동작한다. |
| **Core Value** | 연습 파일 관리 마찰을 최소화해 지휘자가 콘텐츠에 집중할 수 있게 한다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 수동 URL 입력 방식은 파일이 늘어날수록 유지 비용이 커져 연습 리소스가 누락되는 문제가 발생한다. |
| **WHO** | 지휘자 (합창단 상세 페이지 사용자). 성가대원은 동기화 후 결과물인 PracticeResource를 소비한다. |
| **RISK** | Drive API 할당량(1000 req/100sec/user), 파일명-곡명 불일치(띄어쓰기·대소문자·괄호), Drive 공유 설정 변경으로 인한 런타임 오류. |
| **SUCCESS** | 동기화 1회로 Drive 폴더 내 파일이 Song과 매칭되어 PracticeResource가 생성되고, 결과 리포트가 표시된다. 중복 실행 시 이미 등록된 파일은 스킵된다. |
| **SCOPE** | Phase 1: Drive API 스캔 + 폴더 URL 저장. Phase 2: 파일명 파싱/매칭 + PracticeResource upsert. Phase 3: UI 결과 리포트 + 동기화 이력. |

---

## 1. Overview

### 1.1 Purpose

`Ensemble.driveFolderUrl` / `driveFolderId` 필드(이미 DB 반영 완료)를 활용해, Drive API v3 `files.list`로 폴더 내 파일을 가져오고 파일명 규칙(`{곡제목}.mp3`, `{곡제목}_{파트}.mp3`)으로 Song을 매칭해 `PracticeResource`를 생성한다. 인증은 API 키(`GOOGLE_DRIVE_API_KEY`)만 사용하므로 서비스 계정·OAuth 불필요.

### 1.2 재생 URL 형식

Drive 파일 재생에는 이미 프로젝트에서 사용 중인 형식을 그대로 사용한다.

```
https://drive.google.com/uc?export=download&id={fileId}
```

`resources/route.ts`의 `detectType()` 함수가 이 패턴을 `AUDIO`로 인식하도록 이미 처리되어 있다.

### 1.3 Related Documents

- `prisma/schema.prisma` — Ensemble.driveFolderUrl, driveFolderId, PracticeResource 스키마
- `src/app/api/resources/route.ts` — 기존 리소스 생성 로직 (detectType, rewriteDriveShareUrl)
- `src/app/dashboard/ensembles/[ensembleId]/page.tsx` — UI 삽입 위치
- `src/components/ensembles/ensemble-tabs.tsx` — 탭 구조

---

## 2. Scope

### 2.1 In Scope

- [ ] 합창단 설정 탭에 Drive 폴더 URL 입력 + 저장 UI
- [ ] `PATCH /api/ensembles/[id]` — driveFolderUrl, driveFolderId 업데이트
- [ ] `POST /api/ensembles/[id]/drive-sync` — Drive 스캔 + 매칭 + upsert
- [ ] Drive API v3 `files.list` 호출 (API 키 인증)
- [ ] 파일명 파싱: `{곡제목}.{ext}` → part="전체", `{곡제목}_{파트}.{ext}` → part 정규화
- [ ] Song 매칭: titleKo 정규화 후 정확히 일치, 대소문자·앞뒤공백 무시
- [ ] PracticeResource upsert (driveFileId 기준 중복 방지, sourceSite="Google Drive")
- [ ] 동기화 결과 리포트 표시 (신규 N개, 스킵 M개, 매칭실패 K개 + 실패 파일명 목록)
- [ ] 지원 확장자: mp3, mp4, m4a, wav, mid, midi

### 2.2 Out of Scope

- Drive OAuth — 비공개 폴더 접근 (API 키는 공개 공유 폴더만 지원)
- 하위 폴더 재귀 스캔 (1-depth만)
- 동기화 이력 DB 저장 (세션 리포트만, 영속 이력 없음)
- 삭제된 Drive 파일의 PracticeResource 자동 삭제
- Song 자동 생성 (미매칭 시 등록만 안 되고 리포트에 표시)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | 합창단 설정 탭에서 Drive 폴더 URL 입력 후 저장 | Must |
| FR-02 | URL 저장 시 폴더 ID 자동 추출 (정규식: `/folders/([^/?]+)`) | Must |
| FR-03 | "동기화" 버튼 클릭 → `POST /api/ensembles/[id]/drive-sync` 호출 | Must |
| FR-04 | Drive API `files.list`로 폴더 내 파일 목록 조회 (pageToken 반복으로 전체 수집) | Must |
| FR-05 | 파일명에서 곡제목·파트 파싱, 파트 정규화 (S/소프라노→소프라노, All→전체 등) | Must |
| FR-06 | Song.titleKo 정규화(trim, 연속공백 제거) 후 파일명 곡제목과 매칭 | Must |
| FR-07 | PracticeResource가 없으면 create, 이미 동일 driveFileId 존재하면 스킵 | Must |
| FR-08 | 동기화 완료 후 { created, skipped, failed, failedFiles } 응답 반환 | Must |
| FR-09 | UI에서 결과를 인라인 알림으로 표시 (3초 toast 또는 인라인 텍스트) | Should |
| FR-10 | Drive 폴더 접근 실패(권한 오류 등)는 명확한 에러 메시지 표시 | Must |

### 3.2 Non-Functional Requirements

| Category | Criteria |
|----------|----------|
| Security | 세션 인증 필수, 본인 Ensemble만 동기화 가능 |
| Quota | Drive API 단일 폴더 스캔 1회 = 소수 요청, 일반 사용 범위 내 |
| Idempotency | 동일 파일 중복 동기화 시 PracticeResource 중복 생성 없음 |
| Latency | 50파일 기준 동기화 3초 이내 (Drive API + DB write) |

---

## 4. Success Criteria

- [ ] Drive 공개 폴더 URL 저장 후 폴더 ID 자동 파싱 확인
- [ ] 동기화 후 Song과 매칭된 파일이 PracticeResource로 생성되고 곡 상세 페이지 플레이어에서 재생 가능
- [ ] 동일 파일 재동기화 시 스킵 카운트 증가, 중복 레코드 없음
- [ ] 미매칭 파일명이 failedFiles 목록에 표시됨
- [ ] TypeScript 컴파일 에러 0, 빌드 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Drive 폴더가 비공개로 변경되어 API 호출 실패 | High | Medium | 403/404 응답 시 "폴더 공개 설정을 확인하세요" 에러 메시지 |
| 파일명 불일치 (곡명 띄어쓰기 차이) | Medium | High | 정규화(trim + 연속공백→단일공백) + 실패 목록 제공으로 지휘자가 파일명 수정 가능하게 안내 |
| Drive API 키 미설정 환경(로컬 등) | Low | Medium | `GOOGLE_DRIVE_API_KEY` 없으면 500 + 명확한 에러 메시지, .env.example에 키 추가 |
| pageToken 누락으로 100개 이상 폴더 파일 미수집 | Medium | Low | `files.list` 반복 호출로 nextPageToken 소진 |

---

## 6. Architecture Decision

Drive API 호출은 서버 측 Route Handler에서만 실행한다. API 키가 클라이언트에 노출되지 않아야 하므로 클라이언트는 `POST /api/ensembles/[id]/drive-sync`만 호출하고, 실제 Drive 요청은 서버에서 처리한다.

```
Client (ensemble-tabs.tsx)
  → POST /api/ensembles/[id]/drive-sync
      → Drive API v3 files.list (서버에서 API 키로 호출)
      → 파일명 파싱 / Song 매칭 (DB songs 조회)
      → PracticeResource upsert (Prisma)
      → { created, skipped, failed, failedFiles } 반환
  ← UI 결과 표시
```

---

## 7. Implementation Phases

### Phase 1 — Drive 폴더 URL 저장 + API 연결

**목표**: Drive 폴더 URL을 Ensemble에 저장하고 서버에서 폴더 파일 목록을 조회할 수 있음을 검증한다.

1. **`src/app/api/ensembles/[ensembleId]/route.ts`** (신규 또는 기존 확장)
   - `PATCH` 핸들러: `{ driveFolderUrl }` 수신 → 폴더 ID 추출 정규식 적용 → `prisma.ensemble.update()`
   - 폴더 ID 추출 함수: `extractFolderId(url: string): string | null`

2. **`src/lib/drive-api.ts`** (신규)
   - `listDriveFiles(folderId: string): Promise<DriveFile[]>`
   - Drive API endpoint: `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${KEY}&fields=files(id,name,mimeType)&pageSize=100`
   - pageToken 반복 처리
   - 지원 MIME 타입 필터: `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/midi`, `video/mp4`

3. **`.env.example`** 업데이트: `GOOGLE_DRIVE_API_KEY=` 항목 추가

**검증**: Prisma Studio에서 `driveFolderId` 저장 확인, `listDriveFiles()` 단독 실행으로 파일 목록 반환 확인.

---

### Phase 2 — 파일명 파싱 + Song 매칭 + PracticeResource upsert

**목표**: 파일 목록에서 곡제목과 파트를 파싱하고, Song DB와 매칭 후 PracticeResource를 생성한다.

1. **`src/lib/drive-sync.ts`** (신규)
   - `parseFileName(name: string): { title: string; part: string } | null`
     - 확장자 제거: `/\.(mp3|mp4|m4a|wav|mid|midi)$/i`
     - 언더스코어로 분리: `{title}_{part}` 또는 `{title}`
     - 파트 정규화 `normalizePart(raw: string): string`: S→소프라노, A→알토, T→테너, B→베이스, S1/S2 유지, All/all→전체
   - `normalizeTitle(title: string): string`: trim + 연속공백→단일공백 + toLowerCase
   - `matchSong(songs: Song[], title: string): Song | null`: normalizeTitle 비교

2. **`src/app/api/ensembles/[ensembleId]/drive-sync/route.ts`** (신규)
   - `POST` 핸들러
   - 세션 확인 + Ensemble 소유자 검증
   - `listDriveFiles(ensemble.driveFolderId)` 호출
   - 전체 Song 목록 조회 (`prisma.song.findMany({ select: { id, titleKo } })`)
   - 파일마다: `parseFileName()` → `matchSong()` → `prisma.practiceResource.upsert()` (where: `sourceSite="Google Drive" + url` 기준)
   - 응답: `{ created: number, skipped: number, failed: number, failedFiles: string[] }`

**검증**: 테스트용 Drive 폴더로 동기화 실행 → Prisma Studio에서 PracticeResource 생성 확인, 재실행 시 스킵 확인.

---

### Phase 3 — UI 통합 + 결과 리포트

**목표**: 합창단 상세 페이지에 Drive 동기화 UI를 추가하고 결과를 표시한다.

1. **`src/components/ensembles/ensemble-tabs.tsx`** (수정)
   - 설정 탭(또는 기존 탭 내) Drive 폴더 URL 입력 필드 + "저장" 버튼
   - "동기화" 버튼 → `POST /api/ensembles/[id]/drive-sync` fetch → 로딩 스피너 → 결과 표시
   - 결과 표시 컴포넌트: `DriveSyncResult` (인라인, 신규 N개 / 스킵 M개 / 실패 K개 + 실패 파일명 목록)

2. **`src/components/ensembles/drive-sync-result.tsx`** (신규)
   - props: `{ created, skipped, failed, failedFiles }`
   - 실패 파일명은 접이식 목록(collapsed by default)

**검증**: 전체 동기화 플로우 수동 테스트 (Drive 폴더 URL 입력 → 저장 → 동기화 → 결과 확인 → 곡 상세 페이지 재생 가능 확인).

---

## 8. Test Plan

| 시나리오 | 기대 결과 |
|----------|-----------|
| `이 세상 끝 날까지.mp3` → Song "이 세상 끝 날까지" | created:1, part="전체" |
| `주의 기도_소프라노.mp3` → Song "주의 기도" | created:1, part="소프라노" |
| `주의 기도_S.mp3` → Song "주의 기도" | created:1, part="소프라노" (정규화) |
| 동일 파일 재동기화 | skipped:1, created:0, 중복 레코드 없음 |
| `알수없는곡.mp3` → 미매칭 | failed:1, failedFiles=["알수없는곡.mp3"] |
| 비공개 폴더 URL | HTTP 403 에러 메시지 표시 |
| `GOOGLE_DRIVE_API_KEY` 미설정 | 500 + "API 키가 설정되지 않았습니다" |

---

## 9. Next Steps

1. [ ] 이 Plan 문서 검토·승인
2. [ ] `/pdca design drive-folder-sync` 실행 (상세 API 스펙 + 컴포넌트 설계)
3. [ ] Phase 1부터 순차 구현

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-21 | Initial draft | Wave |
