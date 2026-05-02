---
title: 4-Layer Stack
category: architecture
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/runtime.py:95-223"
  - "core/cli/__init__.py:987-1018"
  - "core/agent/loop.py:162-682"
  - "core/graph.py:10-50"
  - "core/lifecycle/container.py:39-360"
external_refs:
---

# 4-Layer Stack

GEODE는 명시적 4-layer 구조를 따른다. 각 레이어는 단일 책임을 가지며, 위 레이어는 아래 레이어 인터페이스에만 의존한다.

```
┌──────────────────────────────────────────────────────┐
│  L4 — Agent       core/agent/loop.py:162-682         │
│  AgenticLoop, while(tool_use)                        │
├──────────────────────────────────────────────────────┤
│  L3 — Harness     core/cli/__init__.py:987-1018      │
│  Typer dispatcher, slash commands, IPC client/serve  │
├──────────────────────────────────────────────────────┤
│  L2 — Runtime     core/runtime.py:95-223             │
│  GeodeRuntime factory, 3-stage bootstrap             │
├──────────────────────────────────────────────────────┤
│  L1 — Graph       core/graph.py:10-50                │
│  StateGraph DAG, 9-node topology                     │
└──────────────────────────────────────────────────────┘
```

## L1 — Graph (`core/graph.py`)

LangGraph StateGraph로 정의된 도메인 파이프라인. **현재 구현(plugins/game_ip)** 의 경우:

```
START → router → signals → analysts(×4 Send) → evaluators(×3 Send)
      → scoring → [skip?] → verification → synthesizer → END
```

- **Send API** 로 analysts 4종 (game_mechanics/player_experience/growth_potential/discovery), evaluators 3종 (quality_judge/hidden_value/community_momentum) 병렬 실행.
- **Conditional edges** — `route_after_router()` 같은 함수로 동적 분기.
- **Reducer** — `add_sequences()` 로 N→1 결과 병합.
- **Dynamic skip** — `state.skip_nodes` 기반 노드 건너뛰기 + audit trail.

도메인 교체 시 그래프 자체는 동일하고 노드 구현만 갈아끼운다 (`DomainPort`로 주입).

## L2 — Runtime (`core/runtime.py`)

`GeodeRuntime.create()` 가 entry point. 3-stage bootstrap:

| Stage | 책임 | 주요 호출 |
|---|---|---|
| Stage 1 — Domain+Session | 도메인 어댑터 로드 + 세션 컨텍스트 초기화 | `load_domain_adapter()` |
| Stage 2 — Core 인프라 | hooks/policies/LLM/auth | `build_hooks()`, `build_default_policies()`, `build_llm_adapters()`, `build_auth()` |
| Stage 3 — Memory+Automation | org/project/session memory + scheduler | `ContextAssembler`, `Scheduler` |

DI 패턴: `RuntimeCoreConfig`/`RuntimeAutomationConfig`/`RuntimeMemoryConfig` 3개 dataclass에 의존성 묶어서 주입. backward-compat을 위해 flat attribute로도 노출.

## L3 — Harness (`core/cli/__init__.py`)

Typer 기반 thin CLI. 핵심 책임:

- 슬래시 명령 dispatch (`resolve_action()` — `/login`, `/model`, `/clear`, `/status`, `/stop`, `/clean`, `/uninstall`, `/skills`, `/mcp`, `/task` 등)
- Free-text 입력 → AgenticLoop 위임
- IPC 클라이언트 (`core/cli/ipc_client.py`) — Serve daemon 살아있으면 위임, 없으면 in-process 실행

Serve daemon (`core/server/ipc_server/poller.py`) 은 별도 프로세스로 떠서 AgenticLoop+MCP+memory 싱글톤을 공유. JSON-over-Unix-socket 프로토콜.

```
[CLI] geode "summarize ..."
   → ipc_client.connect_to_serve()
   → {"type": "prompt", "body": "..."}
[Serve] CLIPoller 받음
   → AgenticLoop.run()
   → {"type": "stream", "delta": "..."}  (반복)
   → {"type": "result", "summary": "..."}
[CLI] 렌더링
```

## L4 — Agent (`core/agent/loop.py`)

AgenticLoop. 핵심 primitive:

```python
while stop_reason == "tool_use":
    for tool_call in response.tool_calls:
        result = tool_executor.execute(tool_call)
    response = llm_adapter.invoke(messages + tool_results)
    stop_reason = response.stop_reason
```

종료 조건: `stop_reason in ("end_turn", "max_tokens")` 또는 `iterations >= max_iterations`.

각 iteration 마다 hook 발화 (`AGENT_TURN_STARTED`, `TOOL_USE_RECEIVED`, `TOOL_RESULT_RECEIVED`, `AGENT_TURN_ENDED` 등).

## 레이어 간 격리

- **L1 → L2**: 그래프 노드는 `RuntimeCoreConfig` 통해 LLM 어댑터 주입 받음 (직접 `from core.llm.providers.X import ...` 금지).
- **L2 → L3**: Runtime은 CLI를 모름. Harness가 Runtime을 호출.
- **L3 → L4**: AgenticLoop은 thin CLI/Serve 양쪽에서 호출 가능 (Runtime 주입 필수).
- **상위 → 하위 의존만 허용**. 역방향 import는 dependency-review 스킬에서 차단.

## 다음

- [[agentic-loop]] — L4 디테일
- [[system-index]] — 부트스트랩 흐름
- [[thin-cli-vs-serve]] — L3 분리
- [[data-flow]] — L1 StateGraph
