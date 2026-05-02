---
title: Orchestration
category: runtime
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/orchestration/"
  - "core/orchestration/lane_queue.py:29-80"
  - "core/agent/sub_agent.py"
external_refs:
  - url: "https://docs.openclaw.ai/concepts/multi-agent.md"
    pattern: "Lane Queue + Spawn+Announce"
---

# Orchestration

여러 에이전트/태스크를 동시 실행할 때의 *직렬화 + 격리 + dedup* 메커니즘. OpenClaw Lane Queue + Claude Code Sub-agent 패턴 합성.

## 핵심 컴포넌트

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| **TaskGraph** | `core/orchestration/task_graph.py` | DAG 추적 — 태스크 의존성 관계 |
| **IsolatedRunner** | `core/orchestration/isolated_runner.py` | 격리된 컨텍스트로 sub-task 실행 |
| **LaneQueue** | `core/orchestration/lane_queue.py:29-80` | per-key 직렬화 + global concurrency 제한 |
| **AgentRegistry** | `core/orchestration/agent_registry.py` | sub-agent 메타데이터 + 라이프사이클 |
| **PlanStore / Planner / GoalDecomposer** | `core/orchestration/` | high-level plan → sub-tasks 분해 |
| **TaskBridge** | `core/orchestration/task_bridge.py` | Send API + IsolatedRunner 통합 |

## LaneQueue (per-key serialization)

```python
class LaneQueue:
    """
    같은 lane_key (e.g. user_id, project_id) 의 태스크는 직렬 실행,
    다른 lane_key는 병렬 (global max-N).
    """
    def submit(self, lane_key: str, fn: Callable, *args) -> Future: ...
```

OpenClaw의 Session Lane fail-over 패턴과 동일 — 한 사용자가 동시에 2개 호출하면 직렬화돼 race 방지.

### v0.49.0 결함 수정

이전: lane_key 동수가 무한 증가 (cleanup_idle 누락) → memory leak. 수정: max_sessions cap + idle lane GC.

## IsolatedRunner

sub-agent 실행을 위한 **별도 RuntimeContext**:

```python
def run_isolated(prompt, parent_context, denied_tools=None) -> str:
    sub_context = parent_context.spawn_child(
        denied_tools=denied_tools or SUBAGENT_DENIED_TOOLS,
    )
    sub_loop = AgenticLoop(sub_context)
    return sub_loop.run(prompt).summary
```

격리 효과:
- denied_tools 자동 적용 (`manage_login`, `set_api_key` 등 차단)
- 메모리 분리 — sub-agent의 도구 결과가 main agent 메모리에 자동 흐르지 않음
- approval auto-grant — main agent가 사용자 승인을 sub-agent로 위임

## Sub-agent Spawn+Announce (OpenClaw 패턴)

```python
# main agent
result = task_tool.invoke(
    description="Find recent papers on RAG",
    subagent_type="Explore",
    prompt="...",
)
# → IsolatedRunner.run_isolated()
# → 결과만 main agent로 돌아옴
```

`Task` 도구가 SUBAGENT_DENIED_TOOLS 자동 적용 + announce hook 발화.

## TaskGraph (DAG)

```python
graph = TaskGraph()
t1 = graph.add_task("fetch", priority=10)
t2 = graph.add_task("analyze", deps=[t1])
t3 = graph.add_task("report", deps=[t2])
# t1 완료 → t2 실행 → t3 실행
```

planner가 자연어 plan을 받아 TaskGraph 생성. Concurrent 실행 가능 sub-task는 `Send` API로 fan-out.

## Deduplication

같은 (lane_key, task_signature) 의 중복 호출 차단:

```python
seen_set = WeakValueDictionary()
key = (lane_key, hash(prompt))
if key in seen_set:
    return seen_set[key]  # 진행 중인 같은 호출의 future 공유
```

## 다음

- [[scheduler]] — 시간 기반 스케줄
- [[automation]] — L4.5 자율 동작
- [[approval]] — sub-agent approval 위임
