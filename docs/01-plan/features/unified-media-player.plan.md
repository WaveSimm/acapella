# unified-media-player Planning Document

> **Summary**: 4가지 미디어 타입(Audio, YouTube, Video, MIDI) 플레이어의 UI·동작을 통합하여 일관된 색상·레이아웃·A/B 드래그를 제공한다.
>
> **Project**: acapella (ChoirNote 연습 플레이어)
> **Author**: Wave
> **Date**: 2026-04-20
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 3개 플레이어 컴포넌트(AudioPlayer, YouTubePlayer, MidiPlayer)에 A/B 마커·진행바·컨트롤이 중복 구현되어 색상(파란/빨간), A/B 드래그 지원 여부, 버튼 라벨 등이 제각각이다. |
| **Solution** | MediaEngine 인터페이스 + 4개 어댑터 패턴으로 엔진을 추상화하고, 공유 컴포넌트(ProgressBar, PlayerControls)를 단일 소스로 통합한다. |
| **Function/UX Effect** | 모든 타입에서 동일한 색상·레이아웃·A/B 드래그가 동작하며, 코드 중복 ~300줄 제거, 신규 미디어 타입 추가 시 어댑터 1개만 작성하면 된다. |
| **Core Value** | 성가대원이 YouTube든 MP3든 MIDI든 동일한 UX로 구간 연습할 수 있어 학습 마찰을 줄인다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 파편화된 플레이어 UI가 사용자 혼란을 유발하고, A/B 드래그 미지원으로 구간 조정이 불편하다. |
| **WHO** | 성가대원(스마트폰 95%), 지휘자. 둘 다 구간반복 연습이 핵심 사용 시나리오. |
| **RISK** | YouTube iframe API의 seek 지연, MIDI html-midi-player 웹 컴포넌트의 비표준 이벤트 API가 어댑터 구현을 복잡하게 만들 수 있다. |
| **SUCCESS** | 4개 타입 모두 동일 색상·레이아웃·A/B 드래그 동작 확인 + AudioPlayer·MidiPlayer A/B 드래그 구현 완료. |
| **SCOPE** | Phase 1: 공유 컴포넌트 + AudioPlayer 어댑터. Phase 2: MIDI 어댑터. Phase 3: YouTube 어댑터 마이그레이션 + Video 어댑터. |

---

## 1. Overview

### 1.1 Purpose

현재 `song-player.tsx` 내 `AudioPlayer`, `midi-player.tsx`, `youtube-player.tsx` 세 컴포넌트에 진행바·A/B 마커·컨트롤 바가 각각 독립 구현되어 있다. 이를 공유 UI 레이어로 통합하면 버그 수정과 기능 추가가 한 곳에서 이루어진다.

### 1.2 Background

사용자 피드백 3가지:
1. 색상 불일치 — AudioPlayer/MIDI: 파란색, YouTube: 빨간색
2. A/B 드래그 미지원 — YouTube만 구현, AudioPlayer·MIDI는 클릭으로만 설정 가능
3. 버튼 레이블 차이 — "시작점" vs "시작점 선택" 등

이를 수정하려면 3개 컴포넌트를 동시에 수정해야 하므로 통합 리팩터링이 필요하다.

### 1.3 Related Documents

- 핵심 파일: `src/components/practice/song-player.tsx` (AudioPlayer + SongPlayer + PlayerShell)
- 핵심 파일: `src/components/practice/youtube-player.tsx`
- 핵심 파일: `src/components/practice/midi-player.tsx`

---

## 2. Scope

### 2.1 In Scope

- [ ] MediaEngine 인터페이스 정의 (`src/components/practice/engine/types.ts`)
- [ ] 4개 어댑터: AudioEngine, YouTubeEngine, VideoEngine, MidiEngine
- [ ] 공유 훅: `useMediaPlayer` (A/B 상태, 드래그 이벤트, seek 위임)
- [ ] 공유 컴포넌트: `ProgressBar` (A/B 마커 포함, 드래그 지원)
- [ ] 공유 컴포넌트: `PlayerControls` (재생/skip/loop/AB/speed 버튼)
- [ ] 통합 색상 팔레트 (파란계열 단일화)
- [ ] AudioPlayer, MidiPlayer A/B 드래그 이동 지원
- [ ] 키보드 접근성 (Space 재생토글, ←→ 5초 seek)

### 2.2 Out of Scope

- Video(mp4/webm) inline controls 제거 — `<video controls>` 유지 옵션 검토하지 않음 (Phase 3에서 결정)
- 파트 탭(`part-tabs.tsx`) 수정
- 새 미디어 타입 추가 (e.g. SoundCloud)
- 배속 범위 변경
- YouTube fullscreen 구현 변경

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 모든 플레이어 진행바 색상: 트랙 bg-gray-200, fill bg-blue-500, 재생 thumb bg-blue-600 | Must | Pending |
| FR-02 | A/B 마커 색상: 범위 bg-emerald-200, 핸들 border-emerald-600 bg-white (4개 타입 동일) | Must | Pending |
| FR-03 | 재생 버튼: bg-blue-600, active(재생 중) → bg-emerald-600 (또는 디자인 결정 시 변경 가능) | Should | Pending |
| FR-04 | AudioPlayer A/B 핸들 드래그 이동 (mousemove + touchmove) | Must | Pending |
| FR-05 | MidiPlayer A/B 핸들 드래그 이동 (mousemove + touchmove) | Must | Pending |
| FR-06 | YouTube: 기존 드래그 로직을 공유 구현으로 교체 (동작 동일 유지) | Should | Pending |
| FR-07 | Video(mp4/webm): 전용 컨트롤 UI 추가 (현재는 native controls만) | Could | Pending |
| FR-08 | 키보드: Space 재생토글, ArrowLeft/Right 5초 seek (플레이어 컨테이너 포커스 시) | Should | Pending |
| FR-09 | A/B 버튼 레이블 통일: off="구간반복", setA="시작점", setB="끝점", active="MM:SS~MM:SS" | Must | Pending |
| FR-10 | SPEEDS 배열 통일: [0.5, 0.75, 1.0, 1.25, 1.5] (YouTube는 현재 2.0x 포함 — 제거 여부 결정) | Should | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | A/B 드래그 시 jank 없음 (requestAnimationFrame 기반) | 육안 + Chrome DevTools |
| Compatibility | iOS Safari 16+, Android Chrome 110+ 터치 이벤트 동작 | 실기기 테스트 |
| Maintainability | 진행바/컨트롤 코드를 1개 소스에서만 관리 | 코드 중복 0개 확인 |
| Accessibility | WCAG 2.1 AA 기준 키보드 조작 가능 | 키보드 단독 조작 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] AudioPlayer, MidiPlayer에서 A/B 핸들 드래그 이동 작동
- [ ] 4개 타입에서 진행바 색상이 동일 (파란계열)
- [ ] `PlayerControls`, `ProgressBar` 공유 컴포넌트가 단일 파일로 존재
- [ ] 기존 `SongPlayer` → `PlayerShell` 인터페이스 변경 없음 (호출부 영향 없음)
- [ ] TypeScript 컴파일 에러 0개

### 4.2 Quality Criteria

- [ ] Lint 에러 없음
- [ ] 빌드 성공 (npm run build)
- [ ] 4개 미디어 타입 수동 동작 검증 완료

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| YouTube seekTo 비동기 지연으로 A/B 드래그 응답이 느릴 수 있음 | Medium | Medium | 기존 YouTube 드래그 로직(setInterval 100ms) 그대로 유지. 어댑터에서 `seekTo(t, true)` 사용. |
| MidiEl 웹 컴포넌트 `currentTime` 쓰기가 항상 즉시 반영 안 될 수 있음 | Medium | Low | 어댑터에서 set 후 `setCurrentTime(t)` 로컬 상태 동기화 병행 (현재 코드와 동일 방식 유지). |
| 리팩터링 중 기존 동작 회귀 | High | Medium | Phase별 단계 커밋 + 각 Phase 후 4개 타입 수동 테스트. |
| Video(mp4) 컨트롤 UI 추가 시 native controls와 충돌 | Low | Low | Phase 3에서 native controls 제거 + 커스텀 UI로 대체, 또는 그대로 유지 결정. |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `song-player.tsx` > `AudioPlayer` | Component | 내부 진행바·컨트롤을 공유 컴포넌트로 교체, AudioEngine 어댑터 사용 |
| `midi-player.tsx` > `MidiPlayer` | Component | 내부 진행바·컨트롤을 공유 컴포넌트로 교체, MidiEngine 어댑터 사용 |
| `youtube-player.tsx` > `YouTubePlayer` | Component | 내부 진행바·컨트롤을 공유 컴포넌트로 교체, YouTubeEngine 어댑터 사용 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `MidiPlayer` | Render | `song-player.tsx` > `PlayerShell` | None — props(`src`) 변경 없음 |
| `YouTubePlayer` | Render | `song-player.tsx` > `PlayerShell` | None — props(`url`) 변경 없음 |
| `AudioPlayer` | Internal | `song-player.tsx` 내 private 컴포넌트 | None — 외부 노출 없음 |

### 6.3 Verification

- [ ] `PlayerShell` props 인터페이스 변경 없음 확인
- [ ] `SongPlayer` export 변경 없음 확인
- [ ] 빌드 후 곡 상세 페이지 4개 타입 수동 테스트

---

## 7. Architecture Decision

### 7.1 선택 아키텍처: MediaEngine 인터페이스 + 어댑터

커스텀 훅 `useMediaPlayer` 단독 방식은 각 엔진의 초기화 방법(YT API lazy load, 웹 컴포넌트 동적 import 등)이 달라 훅 내부가 비대해진다. 대신 **MediaEngine 인터페이스**로 제어 API를 추상화하고, 공유 훅은 오직 UI 상태(A/B, 드래그, 진행바 계산)만 담당한다.

```
MediaEngine (interface)
  ├── AudioEngine    (HTMLAudioElement 래핑)
  ├── YouTubeEngine  (YT.Player 래핑)
  ├── VideoEngine    (HTMLVideoElement 래핑)
  └── MidiEngine     (MidiEl 웹 컴포넌트 래핑)

useMediaPlayer (훅)
  — engine: MediaEngine 주입받아 seek/play/pause 위임
  — A/B 상태, 드래그 이벤트 처리, 키보드 바인딩

ProgressBar (컴포넌트)
  — currentTime, duration, pointA, pointB, onSeek, onDragStart props

PlayerControls (컴포넌트)
  — playing, loop, abMode, speedIdx + 핸들러 props
```

### 7.2 MediaEngine 인터페이스 스펙

```typescript
// src/components/practice/engine/types.ts

export interface MediaEngine {
  // 제어
  play(): void;
  pause(): void;
  seek(time: number): void;
  setSpeed(rate: number): void;

  // 조회 (폴링 or 이벤트로 동기화)
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;

  // 이벤트 구독
  on(event: "play" | "pause" | "ended" | "timeupdate" | "durationchange" | "error", cb: (data?: unknown) => void): void;
  off(event: string, cb: (data?: unknown) => void): void;

  // 리소스 해제
  destroy(): void;
}
```

**엔진별 특이사항:**

| 엔진 | 특이사항 |
|------|----------|
| AudioEngine | `HTMLAudioElement` 이벤트 직접 연결. `requestAnimationFrame`으로 `timeupdate` 발행. |
| YouTubeEngine | `onStateChange` 콜백 → play/pause/ended 매핑. `setInterval(100ms)`으로 `timeupdate` 발행. `seekTo(t, true)` 사용. |
| MidiEngine | 웹 컴포넌트 `start`/`stop` 이벤트 사용. `duration`이 비동기로 설정되므로 폴링 필요. `currentTime` 직접 쓰기로 seek. |
| VideoEngine | `HTMLVideoElement` — AudioEngine과 동일 방식. `requestAnimationFrame` 사용. |

### 7.3 파일 구조

**새로 생기는 파일:**

```
src/components/practice/
├── engine/
│   ├── types.ts          — MediaEngine 인터페이스 + ABMode 타입
│   ├── audio-engine.ts   — HTMLAudioElement 어댑터
│   ├── youtube-engine.ts — YT.Player 어댑터
│   ├── video-engine.ts   — HTMLVideoElement 어댑터
│   └── midi-engine.ts    — MidiEl 웹 컴포넌트 어댑터
├── hooks/
│   └── use-media-player.ts — A/B 상태, 드래그, 키보드, 루프 로직
└── shared/
    ├── progress-bar.tsx    — 진행바 + A/B 마커 시각화
    └── player-controls.tsx — 재생/skip/loop/AB/speed 버튼
```

**슬림해지는 파일:**

| 파일 | 현재 줄 수 | 리팩터링 후 예상 |
|------|------------|-----------------|
| `song-player.tsx` | ~410줄 | ~150줄 (AudioPlayer 내부 제거) |
| `youtube-player.tsx` | ~470줄 | ~120줄 (UI 로직 공유 컴포넌트로 이관) |
| `midi-player.tsx` | ~350줄 | ~100줄 (UI 로직 공유 컴포넌트로 이관) |

---

## 8. A/B 드래그 구현 전략

### 8.1 현황

- YouTube: `handleBarDown` → `dragging` state → `window.addEventListener("mousemove")` 패턴으로 구현됨 (정상 동작)
- AudioPlayer: `onMouseDown` → 즉시 seek only, 드래그 없음
- MidiPlayer: 동일하게 드래그 없음

### 8.2 통합 전략

`useMediaPlayer` 훅이 드래그 로직을 소유한다:

```typescript
// 드래그 상태: null | "a" | "b" | "seek"
const [dragging, setDragging] = useState<"a" | "b" | "seek" | null>(null);

// handleBarDown (ProgressBar에 전달)
function handleBarDown(clientX: number) {
  const time = clientXToTime(clientX);
  if (abMode === "setA") { ... }
  if (abMode === "setB") { ... }
  if (abMode === "active") {
    const handleRadius = duration * 0.02;
    if (Math.abs(time - pointA) < handleRadius) { setDragging("a"); return; }
    if (Math.abs(time - pointB) < handleRadius) { setDragging("b"); return; }
  }
  setDragging("seek");
  engine.seek(time);
}

// window 이벤트 (dragging 활성 시만 등록)
useEffect(() => {
  if (!dragging) return;
  const onMove = (e: MouseEvent | TouchEvent) => {
    const time = clientXToTime(getClientX(e));
    if (dragging === "seek") engine.seek(time);
    else if (dragging === "a") setPointA(Math.min(time, pointB! - 0.5));
    else if (dragging === "b") setPointB(Math.max(time, pointA! + 0.5));
  };
  const onUp = () => setDragging(null);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);
  return () => { /* cleanup */ };
}, [dragging, pointA, pointB, engine]);
```

엔진별 `seek()` 구현:
- `AudioEngine.seek(t)` → `audio.currentTime = t`
- `YouTubeEngine.seek(t)` → `player.seekTo(t, true)`
- `MidiEngine.seek(t)` → `el.currentTime = t` + 로컬 상태 동기화
- `VideoEngine.seek(t)` → `video.currentTime = t`

---

## 9. 단계별 구현 순서

### Phase 1 — 공유 컴포넌트 + AudioEngine (시작 포인트)

**목표**: 기존 AudioPlayer를 공유 컴포넌트로 교체하고, A/B 드래그 추가.

1. `engine/types.ts` — MediaEngine 인터페이스 작성
2. `engine/audio-engine.ts` — HTMLAudioElement 어댑터 구현
3. `hooks/use-media-player.ts` — A/B 상태 + 드래그 로직 (YouTube 기존 로직 이식)
4. `shared/progress-bar.tsx` — 진행바 + A/B 마커 (통합 색상 적용)
5. `shared/player-controls.tsx` — 컨트롤 바 (통합 색상 적용)
6. `song-player.tsx` > `AudioPlayer` — 공유 컴포넌트로 교체

**검증**: MP3 리소스 재생 → A/B 드래그 동작 → 색상 일치 육안 확인.

---

### Phase 2 — MidiEngine 어댑터

1. `engine/midi-engine.ts` — MidiEl 웹 컴포넌트 어댑터 (duration 폴링, speed 속성 처리 포함)
2. `midi-player.tsx` — 공유 훅+컴포넌트로 교체 (엔진 초기화 로직은 유지)

**검증**: MIDI 파일 재생 → A/B 드래그 동작 → Phase 1과 색상 동일 확인.

---

### Phase 3 — YouTubeEngine + VideoEngine 마이그레이션

1. `engine/youtube-engine.ts` — YT.Player 어댑터 (기존 loadYouTubeAPI 유지)
2. `youtube-player.tsx` — 공유 훅+컴포넌트로 교체 (비디오 컨테이너 div는 유지)
3. `engine/video-engine.ts` — HTMLVideoElement 어댑터
4. `song-player.tsx` > `PlayerShell` — Video 분기에 VideoEngine + 공유 컴포넌트 적용 (또는 native controls 유지 결정)

**검증**: YouTube 기존 A/B 드래그 동작 회귀 없음 + Video mp4 재생 확인.

---

## 10. 영향 범위 및 호환성

`SongPlayer` 컴포넌트의 외부 인터페이스(`props: { resources: Resource[] }`)는 변경되지 않는다. `PlayerShell` 내부 분기 로직도 시그니처(`resource: Resource, onError: (id: string) => void`)를 유지한다. 따라서 `SongPlayer`를 사용하는 상위 페이지·컴포넌트는 수정이 필요 없다.

---

## 11. 색상 팔레트 (통합 기준)

| 요소 | Tailwind 클래스 |
|------|----------------|
| 진행바 트랙 | `bg-gray-200` |
| 진행바 fill (일반) | `bg-blue-500` |
| 재생 thumb / 재생 버튼 | `bg-blue-600` |
| AB 구간 범위 | `bg-emerald-200` (fill) |
| AB 핸들 | `border-emerald-600 bg-white` |
| AB 진행 fill (active) | `bg-emerald-400/60` |
| AB thumb (active) | `bg-emerald-600` |
| loop 활성 | `bg-blue-100 text-blue-600` |
| AB 버튼 활성 | `bg-emerald-100 text-emerald-700` |
| AB 설정 중 | `bg-amber-100/200 text-amber-700` |
| 배속 활성 | `bg-violet-100 text-violet-700` |

---

## 12. Next Steps

1. [ ] 이 Plan 문서 검토·승인
2. [ ] Phase 1 구현 시작 (`/pdca do unified-media-player --scope phase-1`)
3. [ ] Phase 1 검증 후 Phase 2, 3 순차 진행

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-20 | Initial draft | Wave |
