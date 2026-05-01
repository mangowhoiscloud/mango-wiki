---
title: GEODE System Index (All Subsystems)
type: concept
category: architecture
tags: [geode, system-index, subsystems, sitemap, docs-foundation, catalog]
related:
  - "[[geode-architecture]]"
  - "[[geode-prompt-system]]"
  - "[[geode-memory-system]]"
  - "[[geode-tool-system]]"
  - "[[geode-gateway]]"
  - "[[geode-domain-plugin]]"
sources:
  - "geode/core/ (223 modules)"
  - "geode/plugins/ (13 modules)"
  - "geode/CLAUDE.md"
  - "geode/GEODE.md"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE System Index — All Subsystems

GEODE v0.64.0 의 모든 1차 서브시스템을 한 페이지에 색인. 이 문서는 **docs 사이트 (`mangowhoiscloud.github.io/portfolio/geode/docs`) 의 sitemap 토대** 이며, 각 서브시스템의 위치·진입점·의존성·핵심 사실을 정리한다.

## 4계층 스택

```
Layer 4 — Agent      AgenticLoop, while(tool_use), error recovery
Layer 3 — Harness    CLI, Gateway, IPC, Hooks, Lifecycle
Layer 2 — Runtime    LLM router, providers, prompts, tools, MCP, memory, skills
Layer 1 — Model      Anthropic / OpenAI / Codex Plus / GLM (3 fallback chains, 9 models)
```

## Core Subsystems (15)

### L4 Agent

| Subsystem | 정체성 | Root | 모듈 | 주요 진입점 |
|---|---|---|---|---|
| **agent** | Claude Code 스타일 agentic loop (while tool_use) | `core/agent/` | 14 | `loop.py:162` `class AgenticLoop` |

**핵심 사실**:
- Multi-intent ("분석하고 비교해줘"), goal decomposition, multi-turn 지원
- `ToolCallProcessor` + `ErrorRecoveryStrategy` + `ConvergenceDetector` 로 도구 실행 제어
- system prompt builder: `core/agent/system_prompt.py:build_system_prompt()` (STATIC + boundary + DYNAMIC)
- Hook events: SESSION_START, TURN_COMPLETE, LLM_CALL_*

### L3 Harness

| Subsystem | 정체성 | Root | 모듈 | 주요 진입점 |
|---|---|---|---|---|
| **cli** | Thin gateway (IPC/daemon) + slash commands | `core/cli/` | 30 | `commands.py:41` `class ModelProfile` |
| **server** | serve daemon + IPC bridge (gateway 분리) | `core/server/` | 10 | `geode serve` 커맨드 |
| **hooks** | 58 events lifecycle FX | `core/hooks/` | 9 | `system.py:28` `class HookEvent`, `:200` `class HookSystem` |
| **lifecycle** | Bootstrap / startup / shutdown | `core/lifecycle/` | 5 | bootstrap entry |
| **channels** | Slack / Discord / email integration | `core/channels/` | 4 | adapter classes |
| **ui** | Terminal UI, spinners, operation log | `core/ui/` | 8 | progress / spinner classes |

**핵심 사실**:
- Slash commands: `/model`, `/skip`, `/resume`, `/clear`, `/help`, `/stop`, `/clean`, `/uninstall`, `/status`
- Hook 58 events: pipeline(3), node(4), analysis(3), verification(2), automation(5), memory(4), tool(8), session(2), model(1), llm(4), approval(2), context(2), prompt(1) — see [[geode-hook-production-gap]]
- IPC: structured event types, streaming
- 파일 발견: `find core/cli -name "*.py" | wc -l`

### L2 Runtime

| Subsystem | 정체성 | Root | 모듈 | 주요 진입점 |
|---|---|---|---|---|
| **llm** | Provider-agnostic LLM abstraction (router, fallback, agentic_response) | `core/llm/` | 22 (incl. prompts + providers) | `agentic_response.py:46` `class AgenticResponse` |
| **llm/prompts** | 17 templates + 3 axes + 20 핀 | `core/llm/prompts/` | 2 + .md | `__init__.py`, `axes.py` |
| **llm/providers** | Anthropic / OpenAI / Codex / GLM | `core/llm/providers/` | 5 | `anthropic.py` (cache_control, STATIC/DYNAMIC split, last-3 messages cache) |
| **tools** | Tool protocol + registry + 56 tools | `core/tools/` | 16 | `base.py:35` `class Tool` |
| **mcp** | MCP server orchestration + 25K guard | `core/mcp/` | 20 | `service.py` `MCPManager` |
| **memory** | 5-tier context hierarchy | `core/memory/` | 14 | `context.py:46` `class ContextAssembler` |
| **skills** | SkillRegistry + 5-tier discovery | `core/skills/` | 6 | `skill_registry.py` |
| **verification** | Guardrails G1-G4 | `core/verification/` | 7 | `guardrails.py`, `engine.py` |
| **scheduler** | NL + cron + jitter | `core/scheduler/` | 6 | `scheduler.py:76` `class ScheduleKind` |
| **automation** | L4.5 feedback loop + model promotion | `core/automation/` | 8 | `model_registry.py:36` `class PromotionStage` |
| **orchestration** | LangGraph StateGraph composition | `core/orchestration/` | 17 | `graph.py` builders |
| **auth** | Identity & permission | `core/auth/` | 14 | OAuth profile rotator |
| **domains** | Plugin loader + DomainPort | `core/domains/` | 3 | `port.py:18` `class DomainPort`, `loader.py` |
| **utils** | Shared helpers (pure, side-effect-free) | `core/utils/` | 3 | utility functions |

### Root-level core modules (single-file)

| File | 정체성 |
|---|---|
| `core/config.py` | settings, env vars, model registry, fallback chains |
| `core/paths.py` | project root resolution, `.geode/` paths |
| `core/state.py` | `GeodeState` TypedDict (LangGraph state shape) |
| `core/graph.py` | StateGraph composition entry (top-level builder) |
| `core/runtime.py` | bootstrap entry (called by CLI/serve) |
| `core/mcp_server.py` | GEODE-as-MCP-server (exposes GEODE itself via MCP) |

**핵심 사실**:
- LLM 3 fallback chains: Anthropic, OpenAI, GLM (config.ANTHROPIC_FALLBACK_CHAIN 등)
- `system_with_cache()` + `PROMPT_CACHE_BOUNDARY` 로 Anthropic ephemeral cache (이미 구현)
- `core/llm/router.py` 의 5개 LLM 호출 지점이 `@maybe_traceable` 로 LangSmith opt-in
- Tools deferred loading (24 core always-on, 32 on-demand via tool_search)
- MCP 25K token guard hard cap

### L1 Model

| Provider | 모델 (chain) |
|---|---|
| Anthropic | Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| OpenAI Responses | gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5-mini |
| Codex Plus | (subscription path) |
| GLM | GLM-4.5+ (thinking field) |

3 chain × 평균 3 model = 9 models. 적응적 thinking depth (effort 5단계: low/medium/high/max/xhigh).

## Plugins (13 modules total)

| Plugin | 정체성 | Root | 핵심 노드 |
|---|---|---|---|
| **game_ip** | Game/IP 시장 잠재력 평가 (Analyst, Evaluator, Synthesizer, BiasBuster) | `plugins/game_ip/` | 4 Analyst + 3 Evaluator + Synthesizer + BiasBuster |

**game_ip 세부**:
- 4 Analyst: game_mechanics, player_experience, growth_potential, discovery
- 3 Evaluator: quality_judge (8 axes), hidden_value (3), community_momentum (3)
- 14축 PSM scoring (ATT, Z-value, Rosenbaum Gamma)
- Config SSOT: `plugins/game_ip/config/evaluator_axes.yaml`
- Fixtures: Berserk (S/81.2), Cowboy Bebop (A/68.4), Ghost in the Shell (B/51.7)

## 프로젝트 통계 (2026-05-01 실측)

```
$ find core/ -name "*.py" | wc -l        # 223
$ find plugins/ -name "*.py" | wc -l     # 13
$ find tests/ -name "test_*.py" | wc -l  # ~229
$ uv run pytest -m "not live" -q         # 4398 passed (post messages-cache PR #864)
```

서브시스템별 모듈 분포 (`find core/<subsys> -name "*.py" | wc -l`):

```
agent  14   auth  14   automation  8   channels  4    cli  30
domains 3   hooks  9   lifecycle  5   llm  22         mcp 20
memory 14   orchestration 17          scheduler 6    server 10
skills  6   tools 16   ui  8          utils  3       verification 7
+ 7 root-level files (config, graph, paths, runtime, state, mcp_server, __init__)
─────────
total 223 in core/
```

| 카테고리 | 카운트 |
|---|---|
| Core modules | 223 |
| Plugin modules | 13 |
| Tests | 229 (memory 83, llm 62, tools 59, hooks 31, agent 30) |
| Hooks events | 58 (12 그룹) |
| Tools | 56 (24 always-on + 32 deferred) |
| MCP servers | 16 |
| Slash commands | 15+ (/model, /skip, /resume, /clear, /help, /stop, /clean, /uninstall, /status, ...) |
| LLM templates | 17 base/extended (`.md`) + 3 axes (YAML) = 20 핀 |

## 의존성 흐름

```
User Input
    │
    ▼
┌─────────┐
│   CLI   │ slash commands, NL parse
└────┬────┘
     │
     ▼
┌─────────────────┐
│ AgenticLoop     │ while tool_use, multi-turn
└─┬─┬─┬─┬─────────┘
  │ │ │ │
  │ │ │ └──► Hooks (58 events)
  │ │ │
  │ │ └────► Memory (5-tier ContextAssembler)
  │ │
  │ └──────► Tools (56) ──► MCP (16 servers)
  │                          + 25K guard
  │
  └────────► LLM Router ──► PromptAssembler ──► Provider
                            (skill+memory+      (Anthropic /
                             bootstrap)          OpenAI /
                                                 Codex /
                                                 GLM)
                            ─── ephemeral cache (Anthropic only) ───
                            STATIC + boundary + DYNAMIC
    │
    ▼
Verification (G1-G4)
    │
    ▼
Output
```

## 진입점 색인 (`file_path:line_number`)

| 카테고리 | 진입점 |
|---|---|
| CLI app | `geode.cli:app` (Typer) |
| AgenticLoop | `core/agent/loop.py:162` |
| LLM AgenticResponse | `core/llm/agentic_response.py:46` |
| PromptAssembler | `core/llm/prompt_assembler.py:60` |
| System prompt builder | `core/agent/system_prompt.py:58` `build_system_prompt()` |
| Cache boundary | `core/agent/system_prompt.py:35` `PROMPT_CACHE_BOUNDARY` |
| Anthropic adapter | `core/llm/providers/anthropic.py:411-433` (cache split) |
| Hook system | `core/hooks/system.py:200` `class HookSystem` |
| Hook events | `core/hooks/system.py:28` `class HookEvent` (58 values) |
| ContextAssembler | `core/memory/context.py:46` |
| SkillRegistry | `core/skills/skill_registry.py` |
| ToolRegistry | `core/tools/registry.py` |
| MCPManager | `core/mcp/service.py` |
| DomainPort | `core/domains/port.py:18` |
| Scheduler | `core/scheduler/scheduler.py:76` |
| Verification G1-G4 | `core/verification/guardrails.py` |

## 외부 노출 인터페이스

### CLI commands (사용자 향)

```bash
geode                                    # interactive REPL
geode "summarize latest AI research"     # NL one-shot
geode analyze "Cowboy Bebop" --dry-run   # game_ip plugin
geode analyze "Berserk" --verbose        # full pipeline
geode serve                              # daemon mode
geode version
geode skill list / skill view / skill manage
```

Slash commands (REPL 내):
- `/model <name>` 모델 전환
- `/skip` 현재 도구 스킵
- `/resume` 이전 세션 재개
- `/clear` 컨텍스트 초기화
- `/stop` 작업 중지
- `/clean` 임시 파일 정리
- `/uninstall` 디인스톨
- `/status` 시스템 상태
- `/help`

### Hook events (확장 향)

58 events grouped:

| 그룹 | 이벤트 |
|---|---|
| pipeline (3) | PIPELINE_START, PIPELINE_END, PIPELINE_ERROR |
| node (4) | NODE_ENTER, NODE_EXIT, NODE_ERROR, NODE_RETRY |
| analysis (3) | ANALYST_START, ANALYST_COMPLETE, ANALYST_FAILED |
| verification (2) | VERIFICATION_PASS, VERIFICATION_FAIL |
| automation (5) | DRIFT_DETECTED, MODEL_PROMOTED, OUTCOME_COLLECTED, EXPERT_VOTE_CAST, FEEDBACK_PHASE_CHANGED |
| memory (4) | MEMORY_SAVED, RULE_CREATED, RULE_UPDATED, RULE_DELETED |
| tool (8) | TOOL_EXEC_START, TOOL_EXEC_END, TOOL_EXEC_FAILED, TOOL_RECOVERY_START, TOOL_RECOVERY_END, TOOL_APPROVAL_REQUEST, TOOL_APPROVAL_GRANTED, TOOL_APPROVAL_DENIED |
| session (2) | SESSION_START, SESSION_END |
| model (1) | MODEL_SWITCHED |
| llm (4) | LLM_CALL_START, LLM_CALL_END, LLM_CALL_FAILED, LLM_CALL_RETRY |
| approval (2) | APPROVAL_REQUEST, APPROVAL_GRANTED |
| context (2) | CONTEXT_OVERFLOW, CONTEXT_RESET |
| prompt (1) | PROMPT_ASSEMBLED |
| turn (1) | TURN_COMPLETE |

전체 카탈로그: [[geode-hook-production-gap]] 참조.

## docs 사이트 sitemap (제안)

```
/portfolio/geode/docs/
├── index.md                          ← 본 페이지의 축약판
├── architecture/
│   ├── overview.md                   ← 4계층 스택 설명
│   ├── agentic-loop.md
│   ├── 4-layer-stack.md
│   └── plugin-architecture.md
├── runtime/
│   ├── llm/
│   │   ├── providers.md
│   │   ├── prompt-system.md         ← [[geode-prompt-system]] 시리즈 통합
│   │   ├── prompt-hashing.md
│   │   ├── prompt-caching.md
│   │   └── langsmith.md
│   ├── tools/
│   │   ├── tool-protocol.md
│   │   └── tool-catalog.md
│   ├── mcp/
│   ├── memory/
│   │   └── 5-tier-context.md
│   └── skills/
├── harness/
│   ├── cli.md
│   ├── gateway.md
│   ├── hooks/
│   │   ├── overview.md
│   │   ├── 58-events.md
│   │   └── system-reminder.md
│   └── lifecycle.md
├── verification/
│   ├── guardrails-g1-g4.md
│   └── biasbuster.md
├── plugins/
│   └── game-ip/
│       ├── overview.md
│       ├── analysts.md
│       ├── evaluators.md
│       └── scoring.md
├── operations/
│   ├── installation.md
│   ├── configuration.md
│   ├── slash-commands.md
│   └── troubleshooting.md
├── reference/
│   ├── changelog.md
│   ├── adr-index.md
│   └── frontier-comparison.md
└── meta/
    ├── roadmap.md
    └── contributors.md
```

## Related

- [[geode-architecture]] — 4계층 스택 상세
- [[geode-prompt-system]] — 프롬프트 서브시스템 시리즈 (5 페이지)
- [[geode-memory-system]] — 5-tier 메모리
- [[geode-tool-system]] — 56 tools, 4-tier safety
- [[geode-hook-production-gap]] — 58 events 카탈로그
- [[geode-domain-plugin]] — DomainPort + game_ip
- [[geode]]
- [[index]]

## Open Questions

- ~~본 색인이 `core/` 의 모든 디렉토리를 커버하는가?~~ — **2026-05-01 실측 후 보강 완료**. 19 패키지 + 7 root-level 단일 파일 = 26 entry, 모두 색인됨. `core/storage/`, `core/observability/` 는 GEODE 에 존재하지 않는 디렉토리 (이전 추정 오류).
- Plugin SDK 가 표준화될 시점에 plugins/ 의 인터페이스 페이지를 docs 에 추가해야 하는가?
- Hook 카탈로그 58 events 가 별도 docs 페이지로 분리될 가치가 있는가? (현재 [[geode-hook-production-gap]])
