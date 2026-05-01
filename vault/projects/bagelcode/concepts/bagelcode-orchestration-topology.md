---
title: 베이글코드 과제 — Orchestration Topology 결정 (PDCA 폐기 → Hierarchical Hybrid)
category: concepts
tags: [bagelcode, topology, orchestration, hierarchical, pdca-rejected, fault-tolerance]
sources:
  - "[[bagelcode-frontier-orchestration-2026]]"
  - "[[bagelcode-tradingagents-paper]]"
  - "[[hub-spoke-pattern]]"
created: 2026-05-01
updated: 2026-05-01
---

# Orchestration Topology — PDCA 폐기 → Hierarchical Hybrid

> **결정 한 줄**: linear PDCA chain 폐기. Anthropic 의 orchestrator-worker + Magentic-One 의 ledger + Cognition 의 단일 transcript + ICML 2025 의 hierarchical resilience 를 합친 **Hub-Ledger-Spoke** 토폴로지로 간다.

## 왜 PDCA 를 버리는가 (3가지 fact)

### 1. Topology 별 fault degradation (ICML 2025)
[[bagelcode-frontier-orchestration-2026]] §F (Resilience of Faulty MAS):

| 구조 | faulty agent 1명일 때 성능 저하 | 우리 컨셉 매핑 |
|---|---|---|
| **Hierarchical** A→(B↔C) | **5.5%** | ✅ 채택 |
| Linear chain | 10.5% | ❌ PDCA 가 이 구조 |
| Flat peer | 23.7% | ❌ |

→ PDCA 의 Plan→Design→Do→Check→Act 가 정확히 **linear chain** = 가장 fragile 한 두 번째 자리.

### 2. Cognition 의 "context fragmentation" 경고
- "Share **full agent traces**, not just individual messages"
- PDCA 는 stage 끼리 산출물 (SPEC.md → DESIGN_SYSTEM.md → output/) 만 넘김 = 정확히 fragmentation
- 충돌하는 implicit decision 양산 (Planner 가 가정한 컨텍스트와 Builder 의 현실 불일치)

### 3. PDCA 의 단조로움 = 평가 신호 약화
- 베이글코드 메일 "**독창적 아이디어**" 명시
- PDCA 는 1980년대 품질 관리 프레임 — 신선함 0
- frontier 패턴 (Magentic-One ledger, ALAS local compensation, Challenger/Inspector) 무지

## 새 토폴로지 — "Hub-Ledger-Spoke"

```
                           ┌──────────────────────────┐
                           │        User (TUI)        │  ← 1급 actor
                           └────────────┬─────────────┘
                                        │  goal / intervene / approve
                ┌───────────────────────┴────────────────────┐
                │             ORCHESTRATOR (Hub)             │
                │     • Task Ledger  (ALAS state)            │
                │     • Progress Ledger (Magentic-One)        │
                │     • Adapter health / Circuit breaker     │
                │     • single transcript writer             │
                └────────┬────────┬───────────┬──────────────┘
                         │        │           │
              Builder.A ◀┘   Builder.B  ───▶ Verifier
              Claude Code    Codex         (cross-provider:
              (Anthropic)    (OpenAI)        Gemini / GLM / local)
                  ▲              ▲              ▲
                  │              │              │
                  └──── single shared transcript.jsonl ────┘
                         (모든 agent pull-only access)
```

### 4 actor (모두 hierarchical = ICML 5.5% degradation 군)

1. **Orchestrator (Haiku 4.5)** = 라우터 + ledger 관리자 + circuit breaker
2. **Builder.A (Claude Code)** = 1차 시도 (Anthropic provider)
3. **Builder.B (Codex)** = 2차 시도 또는 병렬 — **Builder.A 가 fail 시 자동 fallback** (provider 다양화)
4. **Verifier (cross-provider)** = Gemini 2.5 Pro / GLM-4.6 / 또는 local — Anthropic·OpenAI 와 다른 군

### 두 개 ledger (Magentic-One 차용)

```jsonc
// task-ledger.json — 무엇을 알고 있나
{
  "facts_known": ["...", "..."],
  "facts_to_lookup": ["...", "..."],
  "guesses": ["...", "..."],
  "constraints": ["...", "..."]
}

// progress-ledger.json — 어디까지 왔나
{
  "step": 3,
  "complete": false,
  "stuck": false,
  "next_speaker": "builder.b",
  "instruction": "GET endpoint test 재실행",
  "stuck_count": 0    // 5+ 면 escalation
}
```

→ Orchestrator 가 매 turn 시작 전 progress-ledger 갱신 + self-reflect. **task-ledger 는 사실 누적, progress-ledger 는 step 마다 새로 작성** (Magentic-One 패턴 그대로).

## Anthropic ⊕ Cognition 화해

| Cognition 입장 | Anthropic 입장 | 우리 화해 |
|---|---|---|
| 단일 컨텍스트 우월 | 병렬 spawn 가능 | **단일 transcript** + agent 가 query 시 자기 envelope 만 |
| context engineering 1순위 | prompt engineering 1순위 | sandwich §1+§2 = engineered context (캐시 boundary) |
| 코딩은 parallelizable 안 함 | research 는 됨 | **2 Builder 는 순차 시도** (병렬 X), Verifier 는 독립 |
| filesystem 출력으로 telephone game 회피 | filesystem 출력으로 telephone game 회피 | artifacts/ 디렉터리 + ref만 transcript 에 |

## "PDCA 가 아니면 뭔가" — Step model 변경

### old (PDCA, 폐기)
```
Plan → Do → Check → Act → (repeat)
```

### new (Hub-Ledger 기반)
```
                    ┌──────────────────────────┐
                    │ goal received → ledger.init │
                    └─────────────┬────────────┘
                                  │
                                  ▼
        ┌─────── progress-ledger update (per turn) ───────┐
        │                                                  │
        ▼                                                  │
   classify intent ──┬─→ Builder.A (try)                  │
                     │     │                              │
                     │     ▼                              │
                     │   Verifier ◀──── (cross-provider)  │
                     │     │                              │
                     │     ├─ PASS → done                 │
                     │     │                              │
                     │     ├─ PARTIAL → user.veto/approve │
                     │     │                              │
                     │     └─ FAIL → Builder.B (fallback) │
                     │                  │                 │
                     │                  ▼                 │
                     │              Verifier              │
                     │                                    │
                     └─→ stuck (5 turns) → escalate ─────┘
```

핵심 점:
- **순차 retry 가 아닌 provider fallback** — Builder.A 가 실패하면 같은 spec 으로 Builder.B 시도. ([[bagelcode-fault-tolerance-design]])
- **Verifier 는 항상 cross-provider** — Anthropic·OpenAI 결과 검증을 같은 provider 로 하면 의미 없음. 다른 군이 봐야 함. (CP-WBFT 인사이트)
- **stuck 감지** = progress-ledger.stuck_count 5+ → 사용자 escalation (자동 무한 루프 방지)

## ALAS local compensation 적용

[[bagelcode-frontier-orchestration-2026]] §H ALAS 패턴:

| 사고 | old (PDCA 식) | new (ALAS 식) |
|---|---|---|
| Builder 산출 hallucination | 전체 PDCA 재시작 | **그 build 메시지만 invalidate, 다음 turn 에 retry instruction** |
| 사용자 spec 변경 | Plan 부터 다시 | **diff 만 transcript 에 추가**, ledger 부분 갱신 |
| Verifier 실패 (네트워크) | 전체 멈춤 | **Verifier 로컬 fallback** (정적 lint 만), transcript 에 표기 |
| 한 adapter 장애 | 전체 down | **circuit breaker open**, 다른 Builder 로 라우팅 |

→ "역사 기반 로컬 보상" = transcript 에 already 있는 정보 기반 부분 retry. 전역 reset 금지.

## TradingAgents 와의 정합

[[bagelcode-tradingagents-paper]] §4.2 5단계 (Analyst/Trader/Researcher/Risk/Fund) 와 우리 매핑:

| TA | 우리 |
|---|---|
| Analyst Team (structured) | (없음, Orchestrator 가 흡수) |
| Trader (decision) | Builder.A 또는 .B |
| Researcher debate (NL) | Builder.A vs Builder.B 결과를 Verifier 가 판정 |
| Risk Mgmt (structured adjust) | progress-ledger 의 self-reflect |
| Fund Manager (final) | Orchestrator 의 done 판정 |

→ TA 5단계가 우리 4-actor 위에 층층이 매핑됨. 단조롭지 않음.

## 사용자 개입 위치 (4 hook)

```
1) goal 직후         → constraint 추가 가능
2) Verifier PARTIAL  → /approve 또는 /veto
3) stuck 감지        → /redo 또는 /switch (Builder 강제 변경)
4) done 직전         → /reject (재실행 강제)
```

→ 각 hook 이 **Builder/Verifier wake 사이의 자연스러운 quiet point**. interrupt-driven (TUI keystroke 가 transcript 에 기록).

## 예상 효율 영향

| 측정 | PDCA 안 (폐기) | Hub-Ledger (채택) |
|---|---|---|
| 1세션 turn 수 | ~6 (P/Des/Do/Check/Act/Final) | ~5 (goal/builder.A/verify/[fallback].B/done) |
| Token 1세션 (캐시 적용) | ~150K | ~140K (ledger overhead 약 +10K, 단축 turn 으로 상쇄) |
| Faulty agent 회복 | 중-약 (chain) | **강 (hierarchical + cross-provider fallback)** |
| 단일 컨텍스트 | 약 (stage 별 fragment) | **강 (single transcript)** |
| 독창성 | 낮음 (1980s 패턴) | **높음 (2026 frontier 차용)** |

## Stretch — 2 Builder **병렬** 모드 (옵션)

`--parallel-builders` 플래그 시:
- Builder.A 와 .B 가 같은 spec 받아 **동시** 산출
- Verifier 가 **둘 다 평가** + 선택 (또는 사용자 선택)
- 토큰 2× 비용 vs 정확도 ↑ + Cognition 의 "벤더 lock-in 회피" 정조준

→ default 는 sequential fallback. parallel 은 demo 시연 옵션.

## 미정 / 후속

- [ ] Verifier provider 선택 — Gemini 2.5 Pro vs GLM-4.6 vs local Llama 3.3 ([[bagelcode-agents-fixed]] 에서 결정)
- [ ] task-ledger / progress-ledger 의 정확한 JSON Schema
- [ ] stuck_count 임계값 (5 가 적당? 3?)
- [ ] parallel mode 의 cost guard (사용자 사전 confirm 강제?)

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-frontier-orchestration-2026]] — 1차 사료
- [[bagelcode-fault-tolerance-design]] — 실패 분류 + 복구 primitive (이 토폴로지 위에 올라감)
- [[bagelcode-agents-fixed]] — Claude Code + Codex 고정 + cross-provider 검증
- [[bagelcode-transcripts-schema]] — 단일 transcript 스키마 (이미 박혀 있음)
- [[bagelcode-tradingagents-paper]] / [[hub-spoke-pattern]]
