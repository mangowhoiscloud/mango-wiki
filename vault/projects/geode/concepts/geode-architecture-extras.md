---
title: GEODE Architecture Extras (Context Lifecycle, Orchestration Decision, Observability, Wiring Audit)
category: concepts
tags: [geode, architecture, context-lifecycle, orchestration, observability, wiring-audit]
sources:
  - "geode/docs/architecture/context-lifecycle.md (+.ko)"
  - "geode/docs/architecture/orchestration-decision.md (+.en)"
  - "geode/docs/architecture/observability-report.md"
  - "geode/docs/architecture/wiring-audit-matrix.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE Architecture Extras

`docs/architecture/` 의 4개 문서. [[geode-architecture|메인 아키텍처]] 의 보충.

## 1. Context Lifecycle (`context-lifecycle.md`)

[[geode-context-overflow-prevention|컨텍스트 오버플로우 방지]] 와 별개의 *전체 생명주기* 관점:

```
[Session start]
   ↓
[Initial context: system prompt + tool defs + skills]      ← STATIC (cache)
   ↓
[User input → conversation context append]                ← DYNAMIC
   ↓
[LLM call → response → conversation append]
   ↓ (loop)
[Tool use → tool result append]
   ↓ (60% threshold)
[Compaction trigger]
   ├── Zone A (recent 20%) — verbatim
   ├── Zone B (middle 60%) — summarized
   └── Zone C (oldest 20%) — archived to .geode/journal/
   ↓ (80% threshold)
[Hard guard — context overflow prevention]
   ├── Force tool offload
   ├── Truncate large tool results
   └── Emergency wrap-up
   ↓
[Session end → checkpoint to .geode/checkpoints/]
```

5-layer 방어 ([[geode-context-overflow-prevention]]):
1. Adaptive thinking sidecar 분리 (thinking 블록 누적 안 함)
2. Tool offload threshold (15K tokens)
3. Progressive compression (60% trigger, [[geode-experimental-namespace|experimental]])
4. 200K hard guard (80% trigger)
5. Emergency wrap-up (95% trigger, force_text)

## 2. Orchestration Decision (`orchestration-decision.md` + `.en`)

LangGraph (현재) vs alternative orchestrator (CrewAI, AutoGen, custom) 의 design decision 기록.

### 결정: LangGraph 유지

이유:
- **Stateful graph** 가 GEODE 의 [[geode-tool-routing|while(tool_use) 루프]] 와 fit
- **Channels + Send API** 가 multi-LLM 앙상블 ([[geode-quality-evaluation|G1-G4]]) 에 필요
- **Checkpointing** native (LangGraph SqliteSaver / PostgresSaver)
- **Streaming** 지원

### Alternative 검토 결과

| 시스템 | Pros | Cons | 결론 |
|---|---|---|---|
| CrewAI | 빠른 multi-agent setup | DAG 표현력 제한, ensemble 어려움 | reject |
| AutoGen | Microsoft backing, group chat | overhead 큼, custom node 어려움 | reject |
| Custom (직접 구현) | full control | 6개월+ 구현 비용 | defer |
| **LangGraph** ✓ | 위 장점 + Python ecosystem | learning curve | **선택** |

→ ADR-009 ([[geode-adr-index|async pipeline migration]]) 가 LangGraph 위에서 진행되는 마이그레이션.

## 3. Observability Report (`observability-report.md`)

GEODE 운영 가시성 audit. 트랙:

### LLM call 가시성

- LangSmith 통합 — 모든 LLM call → trace 자동 송신
- per-call token usage breakdown (input / output / thinking / cached)
- Adaptive thinking 의 reasoning_summaries → IPC 이벤트 ([[geode-adaptive-thinking|R6]])

### Tool call 가시성

- HookSystem ([[geode-hook-production-gap|49 events]]) — TOOL_CALL_BEFORE / AFTER 이벤트
- tool_offload 시 [[geode-vault]] 에 저장 + tracking
- Slow tool detection (>10s 호출 → 자동 알림)

### Cost 가시성

- Per-session cost summary (모델별 비용)
- Daily / monthly aggregation (`~/.geode/usage/`)
- Budget guard (`agentic.budget_per_run`, `agentic.budget_daily`)

### Error 가시성

- BillingError → quota_exhausted IPC 이벤트
- LLMBadRequestError → 4xx 패널 표시
- UserCancelledError → graceful shutdown

### 갭

- **Production metrics dashboard** 없음 — LangSmith UI 의존
- **Long-running session 의 progress bar** 부분 (force_text 단계만 명시)
- **Cost forecast** 없음 — historical only

## 4. Wiring Audit Matrix (`wiring-audit-matrix.md`)

[[geode-development-workflow|개발 워크플로우]] 의 "Wiring Verification (Anti-Disconnection)" 의 detailed matrix.

### 매트릭스 차원

| 차원 | 검사 항목 |
|---|---|
| Read-Write parity | 모든 read path 가 대응되는 write path 가짐 |
| Hook registration | hook handler 가 bootstrap.py 에 등록됨 |
| ContextVar injection | get_*() 가 set_*() 와 양방향 |
| Singleton lifecycle | mutable state 의 refresh/invalidation path 명시 |

### 적용 사례 (recent)

| 발견 시점 | 결함 | 매트릭스 항목 |
|---|---|---|
| v0.55.0 R1 | encrypted_content 가 server 에서 옴 + GEODE 가 normalize 만 함, replay 안 함 | Read-Write parity gap |
| v0.57.0 R6 | reasoning_summaries 가 sidecar 에 쌓임 + IPC writer 없음 | Read-Write parity gap |
| v0.61.0 R8 | picker effort 가 settings 에 set + config.toml 갱신 안 함 | Read-Write parity gap |
| v0.63.0 D-1 | path 상수가 ipc_client / poller / mcp.registry 에 중복 정의 | Singleton lifecycle gap |

→ 매트릭스가 정기 정찰 포인트. 새 기능 추가 시 wiring 점검 필수.

## See also

- [[geode-architecture]] — 메인 아키텍처
- [[geode-context-overflow-prevention]] — context lifecycle 의 5-layer 방어
- [[geode-tool-routing]] — orchestration decision 의 tool dispatch
- [[geode-quality-evaluation]] — orchestration decision 의 ensemble verification
- [[geode-development-workflow]] — wiring audit 의 정기 점검
- [[geode-adr-index]] — ADR-009 (async pipeline) 의 동기
- [[geode-hook-production-gap]] — observability 의 hook 트랙
- [[index]]
