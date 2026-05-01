---
name: Engineering Team Profile
description: 엔지니어링팀 8명(CTO, PO, Planner, Lead1, Lead2, Dev1, Dev2, QA1) 행동 시그널 집계
type: team
---

> **Last Updated**: 2026-04-08 | **Observation Range**: 2026-04-07 ~ 2026-04-08 | **Context Mode**: q2_initial_observation (첫 관찰 — 4채널 × 12건 메시지, 8 에이전트 프로파일링)

## 팀 구조

```
CTO (router)
├── PO (spec owner)
│   └── Planner (requirements)
├── Lead 1 (squad 1 scope/review)
│   ├── Developer 1 (implementation)
│   └── QA 1 (verification)
└── Lead 2 (squad 2 scope/review)
    ├── Developer 2 (implementation)
    └── QA 2 (verification)
```

**도메인 분할**: Squad 1 → attendance/organization, Squad 2 → reporting/communication

## 팀 공통 패턴

- **역할 분리 문화**: 각 역할 엄격 분리 — Lead는 구현 안 함, PO는 코드 안 씀, CTO는 라우팅만 함
- **구조화된 커뮤니케이션**: 모든 멤버 numbered list + 증거 기반 보고
- **빠른 사이클**: 이슈 생성 → 분석 → 구현 → 리뷰 → QA → 완결 단일 메시지 체인
- **정량화 문화**: 성능 개선 시 반드시 수치 제시 (1500→3 queries, 5.2s→0.4s)
- **컴플라이언스 기반 스펙**: 근로기준법 조항 직접 인용 (제56조 등)

## ✅ 초기 관찰 (2026-04-08 — 4채널 × 12건 메시지)

### CTO — Issue Router

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 이슈 트리아지 + 도메인 태깅 — night-shift bug → 'work + schdul domain', dashboard perf → 'reporting domain'. 정확한 도메인 라우팅 | 0.90 |
| communication_patterns | 트리아지 메시지 3문장 이내. 코드 논의 없음, 순수 라우팅. instructions_hint 완벽 준수 | 0.85 |

**요약**: CTO는 이슈당 1개 메시지로 트리아지 완결. 도메인 분류 → PO/Lead 배분 → 완료.

### PO — Spec Authority

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 스펙 컴파일 워크플로우: 이슈 수신 → Planner에 모듈 분석 위임 → 수락 기준 포함 최종 스펙 컴파일. 3메시지 사이클 | 0.88 |
| decision_patterns | 스펙에 근로기준법 제56조 직접 인용 — 데이터 기반, 규정 인용 의사결정 | 0.90 |

**요약**: PO는 Planner와 협업하여 최종 스펙을 만드는 컴파일러 역할. 규정 기반 의사결정.

### Planner — Requirements Analyst

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 모듈 단위 임팩트 분석: 정확한 파일(WorkOvertimeCalculator.java L:142-189, ShiftNightDetector.java L:55-78) 식별. 파일+라인 수준 정밀도 | 0.92 |
| communication_patterns | 구조화된 테스트 시나리오 형식: 입력/출력 명시 번호 목록. 엣지 케이스 포함 3개 시나리오 | 0.87 |

**요약**: Planner는 코드베이스 수준의 정밀도로 임팩트를 분석. 테스트 시나리오를 구조화된 형식으로 작성.

### Lead 1 — Squad 1 Scope & Review

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | Scope → Assign → Review → QA handoff 4메시지 완결. 직접 구현 안 함. 역할 경계 명확 | 0.93 |
| communication_patterns | 리뷰 코멘트 'LGTM' + 구체적 긍정 피드백 ('splitAt 로직 깔끔'). 간결한 승인 패턴 | 0.85 |

**요약**: Lead 1은 스코프→배정→리뷰→QA 핸드오프를 4메시지로 처리. 구현은 절대 안 함.

### Developer 1 — Squad 1 Implementor

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 구현 사이클: 착수 선언 → 구현 → 변경 요약 + 테스트 수 포함 PR. 3메시지 패턴 | 0.90 |
| decision_patterns | TimeRange.splitAt(22:00) 접근 선택 — 명확한 시간 도메인 분할. 기존 23개 테스트에 5개 추가 | 0.88 |

**요약**: Dev 1은 착수→구현→PR 3단계로 움직임. PR에 반드시 테스트 수 포함.

### QA 1 — Squad 1 Verification

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 구조화된 QA 리포트: 시나리오별 PASS/FAIL + 증거. 회귀 테스트 수 포함. 단일 메시지 종합 보고 | 0.92 |

**요약**: QA 1은 단일 메시지로 모든 시나리오 결과를 구조화하여 보고. 회귀 테스트 필수 포함.

### Lead 2 — Squad 2 Scope & Review

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 성능 이슈 근본 원인 분석 후 스코핑: N+1 쿼리 패턴 식별, 임팩트 계산 (50개 부서 × 30명 = 1500 쿼리). 데이터 기반 스코핑 | 0.90 |

**요약**: Lead 2는 스코핑 단계에서 정량적 임팩트 분석 수행. 성능 이슈에 특히 강함.

### Developer 2 — Squad 2 Implementor

| 신호 유형 | 관찰 내용 | 신뢰도 |
|----------|---------|--------|
| work_patterns | 성능 수정: N+1 → 배치 fetch. 결과 정량화 (1500→3 쿼리, 5.2s→0.4s). 결과 지향 보고 | 0.91 |

**요약**: Dev 2는 성능 개선 시 수치로 성과를 보고. 결과 중심 커뮤니케이션.

## 커뮤니케이션 매트릭스

| 역할 | 선호 포맷 | 톤 | 스피드 | 특이사항 |
|------|---------|-----|--------|---------|
| CTO | 단문 불릿 (3줄 이내) | 중립 | 초고속 | 도메인 태그 필수 |
| PO | 상세 불릿 + 산문 | 격식 | 신중 | 규정 인용 포함 |
| Planner | 구조화 목록 + 산문 | 격식 | 신중 | 파일:라인 수준 정밀도 |
| Lead 1/2 | 코드블록 + 불릿 | 중립 | 빠름 | 구현 안 함 |
| Dev 1/2 | 코드블록 + 불릿 | 중립 | 빠름 | PR에 테스트 수 포함 |
| QA 1 | 번호 목록 + 체크리스트 | 격식 | 신중 | PASS/FAIL + 증거 |

## 워크플로우 패턴

```
이슈 생성
    → CTO: 도메인 태깅 + 라우팅 (1 msg)
    → PO: Planner 위임 + 스펙 컴파일 (3 msgs)
    → Lead: Scope + Dev 배정 (1 msg)
    → Dev: 착수 선언 + 구현 + PR (3 msgs)
    → Lead: LGTM 리뷰 (1 msg)
    → QA: PASS/FAIL 구조화 리포트 (1 msg)
    → Lead: CTO 핸드오프 (1 msg)
    → CTO: 릴리즈 승인
```

**총 메시지 수**: ~11개 메시지로 이슈 완결

## 주요 관찰 포인트

- **N+1 쿼리 임팩트**: 부서 × 직원 수 곱산으로 정량화 — 스코핑 품질 지표
- **야간 근무 오버타임 계산**: TimeRange.splitAt(22:00) 패턴 — 근로기준법 야간수당 기준 반영
- **회귀 테스트 카운팅**: QA가 반드시 기존 테스트 수 + 신규 테스트 수 보고
- **도메인 기반 라우팅**: CTO가 'work+schdul domain', 'reporting domain' 등 명시적 태깅

## 이슈 사례 (2026-04-08 관찰)

| 이슈 | 담당 | 결과 |
|------|------|------|
| 야간 근무 오버타임 계산 버그 | Squad 1 (Lead 1 + Dev 1 + QA 1) | PASS — TimeRange.splitAt(22:00), 5개 테스트 추가 |
| 대시보드 성능 이슈 (N+1 쿼리) | Squad 2 (Lead 2 + Dev 2) | 배치 fetch, 1500→3 쿼리, 5.2s→0.4s |
