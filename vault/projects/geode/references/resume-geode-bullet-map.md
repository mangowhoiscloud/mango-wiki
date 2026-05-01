---
title: Resume GEODE Bullet Map
type: reference
category: career
tags: [resume, bullet-map, geode, ssot]
related:
  - "[[resume-bullet-maps-hub]]"
  - "[[resume-linkedin-narrative]]"
  - "[[geode]]"
  - "[[geode-architecture]]"
  - "[[geode-system-index]]"
sources:
  - "/Users/mango/workspace/resume/common/GEODE-BULLET-MAP.md"
created: 2026-05-01T05:00:00Z
updated: 2026-05-01T05:00:00Z
---

# Resume GEODE Bullet Map — SSOT × Narrative

레주메 불릿 조립용 모든 소재를 카테고리별 매핑. 각 항목은 **문제→설계→결과** 3파트 서사 + 시스템 SOT 인용.

원본 갱신: **2026-04-08 (v0.47.1 기준)** · 326 라인 · 커버리지 ~93% (76/SystemTotal).

> **유의**: 본 페이지의 메트릭은 v0.47.1 시점 SSOT. 현재 버전(v0.64.0) 의 정확한 수치는 [[geode-system-index]] 참조.

## 카테고리 A — 진화와 생산 (성장 스토리)

| ID | 시스템 | 핵심 수치 / 모먼트 |
|---|---|---|
| A1 | Runtime, StateGraph, DomainPort | 111→**214** 모듈, **60** 릴리스, **669** PR, 1,572→**3,881** 테스트, ~100K LOC. Runtime 1476→517줄 분해(v0.30), Hook L3→L0(v0.31), 6→4-Layer(v0.37) |
| A2 | Skills, SkillRegistry, PromptAssembler, CLAUDE.md, CI Ratchet | MD 칸반 + CAN/CANNOT + **41 Skills** + **48 Hooks** + GitFlow. 5-Job CI Ratchet(lint→test→type→sec→docs) |

## 카테고리 B — 자율 실행 (에이전트 코어)

| ID | 시스템 | 핵심 수치 / 모먼트 |
|---|---|---|
| B0 | Memory(S15-S22), ContextCompaction, AtomicIO | 3-Tier Memory(Org/Project/Session), 80%/95% threshold, **Clean Context Pattern**(analyses 제외 → Anchoring 차단), Write-Through L1/L2, 200K Absolute Token Guard(v0.40), **57 릴리스 동안 컨텍스트 오버플로우 0회** |
| B1 | AgenticLoop, CLI, Transcript/Checkpoint | while(tool_use) 50 rounds, 5 종료 경로, 200 turns sliding, 80%/95% compaction. 동일 에러 4회→break |
| B2 | Planner, PlanMode, GoalDecomposer | 6 routes, 7 PlanStatus, Haiku 분해 ~$0.01 |
| B3 | AgenticUI, ResultCache | 결정론적 요약, 토큰 비용 0, tool-type 그루핑 |

## 카테고리 C — 도구와 실행 (디스패치)

| ID | 시스템 | 핵심 수치 |
|---|---|---|
| C1 | ToolExecutor, ToolRegistry, PolicyChain, WebTools | Native/Bash/MCP/DAG 4계층, 5-Tier 안전 등급, **56 tools** (현재 v0.64는 57), asyncio.gather 병렬, Error Recovery (2회→자동 복구), LLM-Friendly Tool Errors v0.40 |
| C2 | SubAgentManager, TaskGraph, TaskBridge | max_concurrent=5, max_depth=1, timeout=120s, subprocess crash isolation, SessionLane per-key 직렬화 |
| C3 | clarification_needed | MAX_CLARIFICATION_ROUNDS=3, 한국어 힌트 |

## 카테고리 D — 검증과 품질 (DAG 파이프라인)

| ID | 시스템 | 핵심 수치 |
|---|---|---|
| D1 | Guardrails G1-G4, BiasDetector, CrossLLM, RightsRisk, Calibration | 5 layers, 6 bias types, α≥0.67, gather loopback 5회 max, BiasDetector CV<0.05 (Send API 격리 후 개선) |
| D2 | PSM Scoring + D-E-F Decision Tree | ATT, Z-value≥1.645, Rosenbaum Γ≤2.0, 14축 루브릭 |

## 카테고리 E~F (요약)

- **E** — 관찰성 (LangSmith opt-in, Hook 58 events, 텔레메트리)
- **F** — 인프라 (uv 패키지, Hatchling wheel, Python 3.12+, Codex/Anthropic/OpenAI/GLM 어댑터)

## v0.47.1 → v0.64.0 변경 요약

본 BULLET-MAP 갱신 후 발생한 변화 ([[geode-changelog-summary]] 참조):

- 모듈: 214 → **236** (core 223 + plugins 13)
- 테스트: 3,881 → **4,379** (오늘 PR #864 후)
- 릴리스: 60 → **64+**
- 도구: 56 → **57** (`registry.py` 의 ALWAYS_LOADED_TOOLS frozenset 6개)
- 도메인 분리: `core/domains/game_ip/` → `plugins/game_ip/` (v0.64.0)
- Anthropic messages cache_control: PR #864 (Hermes system_and_3 parity)

## 타겟별 권장 조립

| 타겟 | 권장 카테고리 | 키 |
|---|---|---|
| Agent-first (NAVER/업스테이지/뤼튼) | A1, B1, D1 | "while(tool_use) AgenticLoop + 5-Layer 검증" |
| Platform/Infra (토스) | A2, B0, C1 | "MD 칸반 + 5-Job CI Ratchet + 4계층 도구 디스패치" |
| Product/Applied (당근/카카오) | B0, B2, C3 | "3-Tier Memory + Plan-first + Clarification" |

## Related

- [[resume-bullet-maps-hub]] — 모든 bullet map 인덱스
- [[geode]] · [[geode-architecture]] · [[geode-system-index]]
- [[geode-prompt-system]] · [[geode-memory-system]] · [[geode-tool-system]]

## Open Questions

- v0.64.0 기준으로 BULLET-MAP 갱신 일정은? (현재 v0.47.1, 16개 마이너 버전 차이)
- Kiki 의 K-A1 (Behavioral Profiling) 과 GEODE 의 B0 (Memory) 가 한 면접에서 충돌하지 않게 조립 우선순위 가이드 필요.
