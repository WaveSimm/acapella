---
name: unified-media-player Plan
description: acapella 프로젝트 미디어 플레이어 통합 리팩터링 Plan 작성 완료
type: project
---

Plan 문서 생성 완료: `docs/01-plan/features/unified-media-player.plan.md`

**Why:** 4개 타입(Audio/YouTube/Video/MIDI) 플레이어 UI가 파편화되어 색상·A/B 드래그 동작이 제각각. 특히 AudioPlayer·MidiPlayer에 A/B 드래그 이동이 없음.

**How to apply:** 다음 단계는 `/pdca design unified-media-player` 또는 `/pdca do unified-media-player --scope phase-1`. Phase 1이 AudioEngine + 공유 컴포넌트 시작점.

선택 아키텍처: MediaEngine 인터페이스 + 4개 어댑터 + useMediaPlayer 훅 + ProgressBar/PlayerControls 공유 컴포넌트.
