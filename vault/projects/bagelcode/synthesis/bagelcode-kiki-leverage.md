---
title: 베이글코드 과제 — Kiki/AppMaker에서 가져올 수 있는 자산
category: synthesis
tags: [bagelcode, kiki, kiki-appmaker, leverage, multi-agent, reuse]
sources:
  - "[[kiki]]"
  - "[[kiki-appmaker]]"
created: 2026-05-01
updated: 2026-05-01
---

# 베이글코드 과제 — Kiki/AppMaker 활용 컨텍스트 정돈

> 과제 요구사항(2개+ 에이전트 통신, 사용자 개입/관찰)에 대해 **이미 가지고 있는 자산**을 어디서 잘라 쓸 수 있는지 정리. 새로 짜지 않고 검증된 패턴 위에 쌓는다.

## 자산 목록 — 잘라 쓸 수 있는 단위

### 1) Sandwich Identity (kiki-appmaker)

[[kiki-appmaker-orchestration]] 의 **4-section system prompt sandwich**:

```
§ 1. Engineering-team contract  (역할 + routing 규칙)
§ 2. Stage template             (per-agent 본문)
§ 3. bkit L4 footer             (도구 호출 강제 + audit log)
§ 4. Routing enforcement        (Agent 도구 금지, 단계 스킵 금지, STOP)
```

**과제 적용:**
- 각 코딩 에이전트(Claude Code / Codex / Gemini)에 **얇은 sandwich** 주입
- § 1 = "너는 누구이고 누구한테 PATCH한다"
- § 4 = "본인 stage 끝나면 STOP" — 가장 흔한 multi-agent 실패 모드 차단
- 제출물 `.md` 폴더에 sandwich 파일들 그대로 들어감 (채용 요구 충족)

### 2) Hub-Spoke Pattern (kiki)

[[hub-spoke-pattern]] — Hub agent triages, Spoke agents 만 wake.

| 차원 | 값 |
|---|---|
| 토큰 절감 | 평탄 구조 대비 **55-60%** |
| Hub | 넓고 얕은 컨텍스트 (제품 맵) |
| Spoke | 좁고 깊은 컨텍스트 (자기 도메인만) |

**과제 적용:**
- "Coordinator + Workers" 단순 토폴로지로 시작
- Coordinator = 사용자 입력 분류 + 적합한 Worker 호출
- Worker = 도메인 특화 (예: 코드 / 리서치 / 문서)
- DAVIS 의 **Agent Router** 패턴과 동형 ([[bagelcode-davis-system]])

### 3) Slack-Style Intent Classifier (kiki)

[[kiki-slack-integration]] — 9개 Intent + regex priority + Pipeline notifier.

```
@bot status     → 직답
@bot pipeline   → 직답
@bot ENG-38     → 이슈 상세
@bot create ... → agent invoke
@bot wake X     → 특정 에이전트 깨우기
```

**과제 적용:**
- 사용자 명령을 **`@coordinator`** 스타일 prefix 한 줄로 통일 → 직답 vs 에이전트 호출 분기
- "사용자가 개입 가능" 요구 충족: 진행 중에도 `@coordinator pause` `@<agent> rephrase` 같은 미세 조작
- 옵저버빌리티: kiki Pipeline Notifier 처럼 `[NEW] task-7: ...` `[ASSIGN] task-7 → coder` 한 줄 이벤트 스트림

### 4) PDCA / Stage Workflow (kiki-appmaker)

[[kiki-appmaker-pdca]] — Plan → Design → Do → Check → Act.

```
사용자 prompt
  → Plan (PM Lead)        → SPEC.md
  → Design (CDO Lead)     → DESIGN_SYSTEM.md
  → Do (CTO Lead)         → output/
  → Check (QA Lead)       → QA_REPORT.md
  → Act (자동 판정)       → 합격 / 재작업 max 3회
```

**과제 적용 (둘 중 하나 선택):**
- **A안 (보수적)**: 같은 PDCA를 단순화해서 2 에이전트로 — Planner ↔ Doer 핑퐁
- **B안 (확장)**: 3 에이전트 (Planner + Coder + Critic) — Critic이 합격/재작업 결정. 채점 가시성 ↑

### 5) Scorecard Guards (kiki)

[[kiki-scorecard-guards]] — C1-C21 가드레일. 그 중 과제에 가장 유용:

| Guard | Rule | 과제 적용 |
|---|---|---|
| C2 | PO Spec Gate (스펙 없이 진행 X) | Planner 산출물 없으면 Coder 동작 안 함 |
| C8 | Self-done 차단 (Lead Scorecard 필요) | Coder가 자기 자신 PASS 못 줌 → Critic 필수 |
| C10 | Release 차단 (Acceptance 없이 X) | 최종 출력은 사용자 OK 후에만 |
| C14 | 에러 자동 복구 (10초 후 wake) | 에이전트 실패 시 자동 재시도 |
| C18 | 로드 밸런싱 (least-loaded peer) | 동일 역할 worker 2+면 자동 분배 |

**과제 적용:**
- "두 에이전트가 메시지를 주고받음" 요건을 단순 ping-pong이 아닌 **계약 기반 대화**로 만들 수 있음
- Critic agent를 두면 자연스럽게 "사용자 개입/관찰" 포인트 생김 (사용자가 Critic 위에서 거부권)

### 6) AppMaker Routing Enforcement (kiki-appmaker)

[[kiki-appmaker-orchestration]] § 4 의 anti-pattern 금지:

| 금지 | 이유 | 과제 차용 |
|---|---|---|
| `Agent` / `Task` tool 사용 | sub-agent dispatch는 단일 stage owner 위반 | 에이전트가 sub-agent 마음대로 안 쓰게 차단 |
| 단계 스킵 | production path 깨짐 | Planner 안 거치고 Coder 직행 X |
| 다음 stage 욕심 | "도와주려는" 동기로 라인 침범 | 자기 turn만 하고 STOP |
| 라우팅 우회 | audit log 누락 | 모든 핸드오프는 명시적 메시지로 |

→ **이 4개 anti-pattern을 README에 박는다.** 평가자가 읽었을 때 "이 사람은 multi-agent 실패 모드를 안다" 신호.

### 7) Karpathy 5원칙 매핑 (kiki-appmaker)

| 원칙 | 의미 | 과제 적용 |
|---|---|---|
| **P1: Constraints First** | CANNOT 정의 후 CAN 자유 | sandwich § 4 = 금지 우선 |
| **P2: Explore Before Act** | read 후 edit, grep 후 reference | Planner 가 코드 읽고 SPEC 작성 |
| **P3: Minimal Viable Change** | 한 번에 한 가지 | stage 분리로 자연스럽게 강제 |
| **P4: Anti-Deception Ratchet** | fake green 금지 | Critic 이 실측 (테스트 실행 + 결과 확인) |
| **P5: Git as State Machine** | commit = evidence | 메시지 로그가 state machine — JSONL 제출 요건과 일치 |

## DAVIS와의 매핑 정리

DAVIS ([[bagelcode-davis-system]]) 패턴을 kiki/AppMaker 자산으로 재구성하면:

| DAVIS | kiki 자산 | AppMaker 자산 |
|---|---|---|
| Slack 봇 UI | [[kiki-slack-integration]] | — |
| Agent Router | [[hub-spoke-pattern]] CTO | [[kiki-appmaker-orchestration]] § 1 routing |
| 도메인별 Genie Space | engineering-team 9 spokes | 17-agent role |
| Genie Instructions | system prompt sandwich § 1, § 2 | sandwich §1+§2 |
| dbt YAML 메타 | Profile schema (kiki) | agent role md |
| 사용자 피드백 루프 | [[kiki-feedback-loop]] | bkit audit log |

→ **이 매핑이 곧 "베이글코드 톤에 맞춘 과제 솔루션"의 청사진.**

## 절대 가져오지 말 것 (rationale)

| 자산 | 왜 빼야 하나 |
|---|---|
| Paperclip API 의존 | 외부 인프라 — README 즉시 동작 요건 깨짐 |
| 17-agent / 12-agent 풀세트 | 과제 스코프 초과. Coordinator + 2 worker 면 충분 |
| `.bkit/` 런타임 | 디스크 상태 머신은 단일 데모에 과함 |
| `getdesign` 컬렉션 install | UI 디자인은 과제 본질 X |
| dual squad / Dev1·Dev2 | 평가자에게 노이즈 |

→ **빼는 결정도 평가 신호.** 베이글코드 블로그의 "단순 UI/UX 강조" 와 일관.

## 한 줄 결론

> **Sandwich Identity + Hub-Spoke + Intent Classifier + Karpathy 5원칙** 을 가장 작게 자른 형태로 재조립. 나머지는 모두 잘라낸다.

## See also

- [[bagelcode]] — 프로젝트 허브
- [[bagelcode-task-direction]] — 위 자산을 어떻게 묶을지 (방향성)
- [[bagelcode-team-profile]] — 팀 페르소나
- [[kiki]] / [[kiki-appmaker]] — 원천 자산
- [[hub-spoke-pattern]] / [[kiki-appmaker-orchestration]] / [[kiki-slack-integration]] / [[kiki-scorecard-guards]] / [[kiki-appmaker-pdca]]
