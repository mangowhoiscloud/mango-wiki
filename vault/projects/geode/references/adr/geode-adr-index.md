---
title: GEODE ADR Index
category: references
tags: [geode, adr, architecture-decision, prompt-injection, subagent-dry-run, async-pipeline, geode-system]
sources:
  - "geode/docs/adr/ADR-007-prompt-skill-injection.md"
  - "geode/docs/adr/ADR-008-subagent-dry-run-bypass.md"
  - "geode/docs/adr/ADR-009-async-pipeline-migration.md"
  - "geode/docs/adr/ADR-011-geode-enhancement.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE ADR Index

`docs/adr/` 의 4개 Architecture Decision Records. 코드만 봐선 재구성 못하는 의사결정 기록.

## 목록

| ID | Status | Date | 제목 |
|---|---|---|---|
| ADR-007 | Proposed | (date n/a) | Prompt & Skill Injection System |
| ADR-008 | Accepted | 2026-03-14 | 서브에이전트 파이프라인 dry-run 강제 해제 |
| ADR-009 | Proposed | 2026-03-16 | 파이프라인 Async 전환 전략 |
| ADR-011 | Proposed | 2026-03-17 | .geode 시스템 고도화 |

## ADR-007: Prompt & Skill Injection System

### Context

agent system prompt 가 매번 다르게 구성되어야 함:
- 기본 GEODE identity
- Per-task 도메인 (game_ip / research / ...)
- 사용자 profile (Kiki 통합 시)
- 활성 skill 목록

이걸 모두 hardcoded string concat 으로 만들면:
- 매 turn 동일 부분 토큰 비용 폭증 (cache miss)
- 변경 시 multiple 호출 site 수정 필요

### Decision

Layered prompt injection system:

```
System Prompt = STATIC ⊕ DYNAMIC

STATIC (cache-eligible):
  ├── GEODE identity
  ├── Tool definitions
  ├── Skill registry (현재 활성)
  └── Domain adapter (game_ip, ...)

DYNAMIC (no cache):
  ├── User profile (Kiki injection)
  ├── Per-turn context
  └── Last N messages
```

`PROMPT_CACHE_BOUNDARY` marker 로 STATIC/DYNAMIC split. STATIC 부분은 Anthropic prompt cache hit → 토큰 90%+ 절감.

### 영향

- [[geode-agentic-loop]] 의 `_build_system_prompt` 가 이 boundary 따라 split
- [[geode-adaptive-thinking|adaptive thinking]] 의 prompt cache reuse 와 결합
- Kiki profile injection ([[kiki-profile-pipeline]]) 이 DYNAMIC 부분에 들어옴

## ADR-008: 서브에이전트 dry-run 강제 해제 (Accepted)

### Context

[[geode-quality-evaluation|G1-G4 verification]] 중 sub-agent 가 호출되면 외부 API 호출 발생 가능. 비용 통제 위해 sub-agent 도 dry-run 모드 상속받았음.

**문제**: sub-agent 가 실제 API 호출 없으면 verification 결과가 mock → 의미 없음. dry-run 모드의 격리는 필요하지만 sub-agent 가 그 틀을 깨고 진짜 호출해야 검증 가능.

### Decision

sub-agent 가 dry-run 모드를 **selective override** 가능:
- 일반 sub-agent → dry-run 상속
- Verifier sub-agent → dry-run bypass (real API 호출)
- 사용자 명시 `--no-dry-run` 플래그 → 모든 sub-agent bypass

`SubAgentManager` 가 spawn 시 `force_dry_run=False` 인자로 명시적 bypass.

### 영향

- [[geode-quality-evaluation]] 의 verifier 가 real API 호출 가능
- [[geode-tool-routing]] 가 sub-agent dispatch 시 dry-run 모드 전파
- E2E 테스트 (`test_e2e_live_llm.py`) 가 이 패턴 활용

## ADR-009: 파이프라인 Async 전환 전략 (Proposed)

### Context

GEODE 파이프라인이 전면 **sync**:
- LangGraph 노드가 `def` (sync)
- LLM 호출이 `Anthropic` (sync client)
- `graph.stream()` 으로 실행

**문제**:
- multi-LLM 동시 호출 (앙상블 verification) 이 sequential
- Slack collector MCP 등 IO-bound 작업이 block
- AgenticLoop 의 tool 호출 사이 thinking 도 sequential

### Decision

Async 전환 단계적:

| Phase | 범위 | 시점 |
|---|---|---|
| Phase 1 | LLM client → AsyncAnthropic / AsyncOpenAI | v0.5x |
| Phase 2 | Tool executor → asyncio.gather (parallel tool calls) | v0.5x |
| Phase 3 | LangGraph 노드 → `async def` | v0.6x |
| Phase 4 | 앙상블 verification → 동시 호출 | v0.6x |
| Phase 5 | MCP server → async transport | (deferred) |

### 영향

v0.55+ 가 Phase 1-2 완료. Phase 3 부분 진행 중. Phase 5 는 MCP spec 안정화 대기.

## ADR-011: .geode 시스템 고도화 (Proposed)

### Context

`.geode/` 디렉터리가 단순 cache 에서 **per-project knowledge layer** 로 발전 중:
- `MEMORY.md` — 프로젝트 메모리 인덱스
- `LEARNING.md` — 학습 로그
- `result_cache/` — analysis 결과 캐시
- `embedding-cache/` — embedding 캐시 ([[geode-experimental-namespace|experimental]] 통합 시)
- `vectors/` — 벡터 store
- `tool-offload/` — tool 결과 오프로드
- `scheduled_tasks.json` + `scheduler_logs/` — 스케줄

### Decision

`.geode/` 를 `~/.geode/` 와 대칭으로 운영:
- `.geode/` = **per-project** (cwd 종속)
- `~/.geode/` = **per-user** (machine 종속)

각 layer 마다 path 상수 SOT 화 ([[geode-lifecycle-commands|v0.63.0 D-1]] 에서 9개 추가).

### 영향

- [[geode-lifecycle-commands]] 의 `/clean` 이 두 layer 분리해서 정리
- [[geode-vault]] 가 `~/.geode/vault/` 에 정착
- [[geode-memory-system]] 가 `.geode/MEMORY.md` 활용

## See also

- [[geode-architecture]] — 4-layer stack (모든 ADR 의 영향 받음)
- [[geode-quality-evaluation]] — ADR-008 의 verifier
- [[geode-agentic-loop]] — ADR-007 prompt 구성
- [[geode-lifecycle-commands]] — ADR-011 의 `.geode` 정리
- [[geode-vault]] — ADR-011 vault path
- [[index]]
