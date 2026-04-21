# 아카펠라 연습 사이트 프로젝트 플랜

> NWC 파일 기반 웹 플랫폼 — 파트별 독립 재생 및 악보 뷰어

---

## 1. 프로젝트 개요

### 1.1 목적
아카펠라 연습자가 **NWC 파일 하나만 올리면, 자기 파트를 강조해 들으며 악보 따라 연습할 수 있는 웹 서비스**를 제공한다.

### 1.2 핵심 가치 제안
기존 연습 방식의 한계를 해소한다.

- **PDF 악보 + MP3 연습본**: 파트별 볼륨 조절 불가
- **NWC 뷰어**: Windows 전용, 모바일 불가, UX 낙후
- **MIDI 플레이어**: 악보 동기화 없음, 편집·조옮김 불가

→ 본 서비스는 **브라우저에서 NWC를 직접 해석**하여, 악보·MIDI·파트 제어를 한 화면에 통합한다.

### 1.3 타깃 사용자
- 아카펠라 그룹 구성원 (4~12인 규모)
- 교회/학교 성가대원
- 합창 지도자 (파트 연습 자료 배포자)

---

## 2. MVP 범위 정의

### 2.1 MVP 핵심 기능 (반드시 포함)
| 기능 | 설명 | 우선순위 |
|---|---|---|
| `.nwc` 파일 업로드 | 바이너리 파일 수용, 서버 파싱 | P0 |
| 악보 렌더링 | MusicXML → SVG 화면 표시 | P0 |
| 기본 재생/정지 | MIDI 기반 전체 재생 | P0 |
| **파트별 볼륨 믹서** | S/A/T/B 각 독립 슬라이더 | **P0 (킬러 기능)** |
| 내 파트 강조 모드 | 선택 파트 보이스 + 나머지 피아노 약하게 | P0 |

### 2.2 MVP 제외 항목 (의도적 보류)
- 사용자 계정/로그인
- 곡 공유·포크 기능
- 연습 기록/통계
- 소셜 기능
- 결제·구독

→ **"파트별 볼륨 조절하며 재생" 하나가 실제로 가치 있는지 검증**이 MVP의 목적.

---

## 3. 기술 아키텍처

### 3.1 전체 파이프라인
```
[.nwc 업로드]
      │
      ▼
[Next.js API Route — 서버]
  ├─ NWC 파서 (zz85/nwc-viewer 기반)
  │   ├─ MusicXML 추출 (악보용)
  │   └─ MIDI + 파트 메타데이터 (재생용)
  └─ Supabase Storage 저장
      ├─ original.nwc
      ├─ score.musicxml
      └─ tracks.mid
      │
      ▼
[연습 페이지 — 클라이언트]
  ├─ OpenSheetMusicDisplay: MusicXML → SVG
  └─ Tone.js + SoundFont
      ├─ 파트별 Sampler 인스턴스
      ├─ 볼륨 믹서 (파트별 Gain Node)
      └─ 재생 Transport 제어
```

### 3.2 기술 스택

**프론트엔드**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- OpenSheetMusicDisplay (악보)
- Tone.js + @tonejs/midi (재생)

**백엔드**
- Next.js API Routes
- NWC 파서: zz85/nwc-viewer 파서 포팅
- MusicXML 변환 로직

**인프라**
- Supabase Storage (파일)
- Supabase DB (곡 메타데이터)
- Vercel (배포)

### 3.3 데이터 모델 (초안)

```sql
-- songs 테이블
id              uuid PK
title           text
composer        text
nwc_path        text    -- Storage 경로
musicxml_path   text
midi_path       text
parts           jsonb   -- [{name:"S", channel:1}, ...]
tempo_bpm       int
key_signature   text
created_at      timestamp

-- (MVP 이후) practice_sessions 테이블
id              uuid PK
song_id         uuid FK
user_id         uuid FK
part_focused    text    -- "S" | "A" | "T" | "B"
duration_sec    int
last_position   int
```

---

## 4. 개발 로드맵

### 4.1 MVP 단계 (6주)

**Week 1–2 — 서버 파이프라인**
- [ ] zz85/nwc-viewer 파서 Next.js 서버 포팅
- [ ] .nwc → MusicXML 변환 검증 (테스트 파일 10개)
- [ ] .nwc → MIDI 변환 + 파트 메타 추출
- [ ] Supabase Storage 업로드 라우트

**Week 3 — 기본 재생 & 악보**
- [ ] OSMD 컴포넌트 (클라이언트 전용)
- [ ] Tone.js MIDI 로더
- [ ] 재생/정지/시크 기본 컨트롤

**Week 4 — 🔥 파트별 볼륨 믹서**
- [ ] 파트별 독립 Sampler 인스턴스
- [ ] 파트별 Gain Node + 볼륨 슬라이더 UI
- [ ] SoundFont 로딩 (Voice Aahs + Piano)
- [ ] 즉각적 볼륨 반응 검증

**Week 5 — "내 파트 강조" 모드**
- [ ] 파트 선택 UI
- [ ] 원클릭 프리셋: 내 파트 100% Voice, 나머지 30% Piano
- [ ] 모바일 반응형 레이아웃

**Week 6 — 배포 & 검증**
- [ ] 10명 테스터 모집
- [ ] 피드백 수집
- [ ] 버그 픽스

### 4.2 MVP 검증 지표
- 업로드된 고유 .nwc 수
- 세션 평균 재생 시간 (> 5분이면 "실제로 연습에 사용")
- 파트 믹서 조작 횟수/세션
- 재방문율

### 4.3 MVP 이후 기능 (검증 성공 시)

**Phase 2 — 연습 편의 기능**
- 템포 조절 (50%~120%)
- 조옮김 (반음 단위)
- 파트별 시작음 버튼
- A-B 구간 반복
- 재생 커서 ↔ 악보 동기화

**Phase 3 — 사용자/공유 기능**
- 사용자 계정
- 그룹·성가대 단위 곡 공유
- 연습 기록 / 통계
- 댓글·피드백

**Phase 4 — 차별화**
- 마이크 녹음 및 본인 파트 덮어쓰기
- 음정 정확도 피드백 (pitch detection)
- AI 음성합성 파트 생성

---

## 5. 주요 기술 이슈

### 5.1 NWC 파일 버전 호환성
- NWC V1.5 / V1.7 / V2.75 포맷 상이
- 파싱 실패 케이스 대비 fallback UX 필요
- 실패 시 "NWC Viewer에서 열기" 링크 제공

### 5.2 SoundFont 용량 관리
- FluidR3_GM 전체 약 140MB → 사용자 이탈 원인
- 필요한 프로그램만 추출 (Voice Aahs, Voice Oohs, Piano)
- 백그라운드 청크 프리로드로 초기 로딩 체감 감소

### 5.3 재생 지연(latency)
- Tone.js 룩어헤드 스케줄링 기본값 사용
- 모바일 Safari 오디오 정책 대응 (사용자 제스처 필요)

### 5.4 악보 ↔ 재생 동기화
- MVP에서는 단순 재생만, Phase 2에서 OSMD cursor API 연동
- tempo map 추출이 핵심 — NWC 파싱 시 함께 추출 필요

---

## 6. 저작권 및 법적 고려

### 6.1 NWC 파서 관련
- zz85/nwc-viewer는 오픈소스, 사용 가능
- NWC 공식 SDK 리버스 엔지니어링은 불가
- `.nwc` 파일 자체의 변환·표시는 기술적으로 문제 없음

### 6.2 편곡 저작권 (더 중요)
- 아카펠라 편곡은 2차 저작물 → 원곡 + 편곡자 양쪽 권리
- **MVP에서는 "본인이 편곡한 .nwc만 업로드" 정책 명시**
- Phase 3에서 CCLI 등 라이선스 체계 도입 검토

### 6.3 서비스 약관 필수 조항
- 업로드 콘텐츠에 대한 책임은 업로더
- 저작권 침해 신고 시스템 (DMCA 유사)
- 저장 파일 비공개 기본 정책

---

## 7. 리스크 및 대응

| 리스크 | 영향도 | 대응 |
|---|---|---|
| NWC 파싱 실패율 높음 | 높음 | 테스트 파일 다수 확보, 실패 시 수동 재처리 큐 |
| SoundFont 품질 부족 | 중간 | 상용 SoundFont 라이선스 검토 |
| 모바일 오디오 지연 | 중간 | Phase 2에서 WebAudioWorklet 도입 검토 |
| 저작권 이슈 | 높음 | MVP는 본인 업로드만, 공개 배포 시 법무 검토 |
| 사용자 확보 실패 | 높음 | 기존 아카펠라 커뮤니티(카페, 동호회) 초기 홍보 |

---

## 8. 의사결정이 필요한 항목

MVP 시작 전에 확정할 것들:

- [ ] 서비스 이름 / 도메인
- [ ] SoundFont 라이브러리 선택 (무료 FluidR3_GM vs 유료)
- [ ] 무료/유료 정책 (MVP는 전체 무료 권장)
- [ ] 베타 테스터 확보 채널
- [ ] ChoirNote와의 관계 설정 (독립 프로젝트 vs 서브 기능)

---

## 9. 성공 기준

MVP 출시 8주 후 다음 중 **2개 이상** 달성 시 Phase 2 진행:

- 월간 활성 사용자 50명 이상
- 업로드된 고유 곡 30곡 이상
- 세션 평균 재생 시간 10분 이상
- 파트 볼륨 믹서 조작률 70% 이상 (세션당)
- 사용자 NPS 설문 긍정 응답 60% 이상

달성 실패 시 → 피드백 기반 피벗 검토 (타깃 변경, 기능 재정의)

---

**문서 버전**: v1.0
**최종 수정**: 2026-04-21
