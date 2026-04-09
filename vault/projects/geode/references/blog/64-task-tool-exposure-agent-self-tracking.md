---
title: "Task Tool 노출 — 에이전트가 자신의 작업을 추적하게 하다"
type: reference
category: blog-post
tags: [blog, orchestration]
source: "blog/posts/orchestration/64-task-tool-exposure-agent-self-tracking.md"
created: 2026-04-08T00:00:00Z
---

# Task Tool 노출 — 에이전트가 자신의 작업을 추적하게 하다

> Date: 2026-03-27 | Author: geode-team | Tags: [orchestration, task-graph, agentic-loop, tool-design, frontier]

## 목차

1. 도입 — 보이지 않는 에이전트
2. 구현 전 GEODE의 Task 상태
3. 프론티어 GAP 분석 — Claude Code · OpenClaw · Codex CLI
4. 설계 결정 1 — 두 개의 TaskGraph
5. 설계 결정 2 — 상태 추상화 (6→3)
6. 설계 결정 3 — ContextVar 격리와 세션 복원
7. 구현: `_build_task_handlers()`
8. `/tasks` 슬래시 커맨드 — 인간을 위한 뷰
9. 트레이드오프 요약
10. 마무리

---

## 1. 도입 — 보이지 않는 에이전트

AgenticLoop가 "Berserk 분석 후 Ghost in the Shell과 비교해줘"라는 요청을 처리할 때, 내부적으로 어떤 일이 일어나는지 볼 수 없었습니다. 분석이 진행되는 동안 사용자는 결과가 나올 때까지 기다릴 뿐이었고, 에이전트 스스로도 "지금 무엇을 하고 있는지", "무엇이 남아있는지"를 표현할 도구가 없었습니다.

이 글은 GEODE v0.29.1에서 진행한 **Task Tool 노출(task-tools, PR #466)** 작업을 기록합니다. 내부에 이미 완성되어 있던 `TaskGraph` 엔진을 에이전트와 사용자 모두가 사용할 수 있는 도구로 연결하는 과정, 그리고 그 과정에서 내린 설계 결정들을 다룹니다.

---

## 2. 구현 전 GEODE의 Task 상태

### 이미 있었던 것

`core/orchestration/task_system.py`에는 완성된 TaskGraph 엔진이 있었습니다.

```python
# core/orchestration/task_system.py
class TaskStatus(Enum):
    PENDING  = "pending"
    READY    = "ready"    # 의존성 충족, 실행 대기
    RUNNING  = "running"
    COMPLETED = "completed"
    FAILED   = "failed"
    SKIPPED  = "skipped"  # upstream FAILED 시 자동 전파

@dataclass
class Task:
    task_id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    dependencies: list[str] = field(default_factory=list)
    started_at: float | None = None
    completed_at: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
```

> 이 엔진은 IP 분석 파이프라인 전용으로 설계되었습니다. `create_geode_task_graph(ip_name)` 호출 시 13개 task(router → signals → analyst×4 → evaluator×3 → …)를 고정 구조로 생성합니다. DAG 위상 정렬, 의존성 전파, 실패 시 SKIPPED 전파까지 모두 구현되어 있었습니다.

### 없었던 것

| 구성 요소 | 상태 |
|-----------|------|
| `task_create` handler | 없음 |
| `task_update` handler | 없음 |
| `task_get` / `task_list` handler | 없음 |
| `task_stop` handler | 없음 |
| `definitions.json` 등록 | 없음 |
| 사용자용 `/tasks` 커맨드 | 없음 |
| 에이전트용 UserTaskGraph ContextVar | 없음 |

**핵심 GAP**: TaskGraph 엔진은 완성되어 있었지만, AgenticLoop의 Claude가 이를 호출할 수 있는 도구 인터페이스가 전혀 없었습니다. 에이전트가 작업을 분해하려 해도 "task_create"라는 도구를 볼 수 없는 상태였습니다.

---

## 3. 프론티어 GAP 분석

구현에 앞서 Claude Code, OpenClaw, Codex CLI 세 시스템을 조사했습니다.

### Claude Code의 Task 설계

Claude Code는 세션별 `.json` 파일로 태스크를 영속화합니다.

```json
// ~/.claude/tasks/{session_id}/{id}.json
{
  "id": "41",
  "subject": "블로그 토픽 리스트업 + MD 작성",
  "activeForm": "작업 중",
  "status": "pending",
  "blocks": ["42"],
  "blockedBy": []
}
```

주목할 점은 `blocks`/`blockedBy` 양방향 의존성입니다. 생성 시 항상 `pending`, 상태 전환은 단방향(pending → in_progress → completed)으로 설계되어 있으며 `metadata` 필드로 임의 확장을 허용합니다.

### OpenClaw의 Task 분해 패턴

OpenClaw는 장시간 실행 에이전트(Long-running Agent)에서 **작업 분해를 의식적으로 도구로 표현**합니다. 각 서브태스크는 명시적 ID를 가지며, 부모 에이전트가 자식 에이전트에게 task_id를 전달해 진행 상황을 폴링합니다. 특히 작업이 실패하면 다운스트림 태스크를 `SKIPPED`로 자동 전파하는 실패 전파 패턴을 채택합니다.

### Codex CLI의 접근

Codex CLI는 태스크를 별도 저장소에 영속화하지 않고, **AgenticLoop 자체가 내부 계획(plan)을 도구 호출 순서로 표현**합니다. 명시적인 task_create 없이 계획을 실행 그 자체로 드러내는 방식입니다.

### GAP 매트릭스

| 기능 | Claude Code | OpenClaw | Codex CLI | GEODE (구현 전) |
|------|:-----------:|:--------:|:---------:|:---------------:|
| 에이전트 task_create | ○ | ○ | △ (암묵적) | ✗ |
| 의존성 추적 | ○ | ○ | ✗ | ✗ (엔진만) |
| 실패 전파 | ✗ | ○ | ✗ | ✗ (엔진만) |
| 사용자 뷰 (/tasks) | ○ | ✗ | ✗ | ✗ |
| 상태 API (5종) | ○ | △ | ✗ | ✗ |
| TaskGraph 엔진 | ✗ | ✗ | ✗ | ○ (파이프라인 전용) |

GEODE는 **TaskGraph 엔진을 이미 보유한 유일한 시스템**이었지만, 에이전트 facing 인터페이스가 없어 활용되지 못하고 있었습니다. 가장 강력한 엔진을 가지고 있으면서 가장 기초적인 도구 노출이 없는 역설적인 상태였습니다.

---

## 4. 설계 결정 1 — 두 개의 TaskGraph

**결정**: IP 분석 파이프라인의 `runtime.task_graph`와 사용자/에이전트 작업 추적용 `UserTaskGraph`를 완전히 분리한다.

```
runtime.task_graph         ← IP 분석 파이프라인 전용 (13-task 고정 구조)
_user_task_graph_ctx       ← 사용자/에이전트 자유 생성 TaskGraph (새로 추가)
```

**왜 분리해야 했는가:**

IP 분석 파이프라인의 TaskGraph는 `create_geode_task_graph(ip_name)`으로 생성되는 **13개 고정 구조**입니다. `router → signals → analyst×4 → evaluator×3 → scoring → synthesizer`의 의존성이 하드코딩되어 있습니다. 이 그래프에 에이전트가 임의의 task_id로 작업을 추가하면 파이프라인 자체가 오염됩니다.

**트레이드오프:**

| 방식 | 장점 | 단점 |
|------|------|------|
| 단일 TaskGraph 공유 | 구조 단순, 전체 상태 한 곳 | 파이프라인 오염, 생명주기 충돌 |
| **UserTaskGraph 분리 (채택)** | 파이프라인 격리, 독립 생명주기 | 두 그래프 관리 |

---

## 5. 설계 결정 2 — 상태 추상화 (6→3)

내부 `TaskStatus`는 6개(PENDING, READY, RUNNING, COMPLETED, FAILED, SKIPPED)이지만, 외부 API는 3개(`pending`, `in_progress`, `completed`)로 단순화했습니다.

```python
# core/cli/tool_handlers.py
def _status_to_external(status: TaskStatus) -> str:
    return {
        TaskStatus.PENDING:   "pending",
        TaskStatus.READY:     "pending",    # READY는 사용자에게 여전히 "대기중"
        TaskStatus.RUNNING:   "in_progress",
        TaskStatus.COMPLETED: "completed",
        TaskStatus.FAILED:    "failed",
        TaskStatus.SKIPPED:   "failed",     # SKIPPED는 "실패의 결과"로 표현
    }.get(status, "pending")
```

> `READY`는 내부 최적화 상태입니다. "의존성이 충족되어 실행 가능"한 상태이지만, 사용자 관점에서는 여전히 "아직 시작되지 않은" 작업입니다. `SKIPPED`는 upstream 실패로 인한 자동 전파 결과인데, 이를 별도 상태로 노출하면 사용자가 혼란스러울 수 있습니다. Claude Code가 `pending → in_progress → completed`의 단방향 3-상태를 채택한 것과 동일한 이유입니다.

**`task_status` 키 네이밍:**

response 딕셔너리에서 `"status": "ok"` (성공 여부)와 `"status": "pending"` (태스크 상태)가 충돌하는 문제를 발견했습니다. task 상태를 `"task_status"` 키로 분리함으로써 응답 구조의 일관성을 유지했습니다.

```python
# 충돌 발생 구조 (X)
{"status": "completed", "task_id": "t_abc123"}

# 충돌 없는 구조 (O)
{"status": "ok", "task_status": "completed", "task_id": "t_abc123"}
```

---

## 6. 설계 결정 3 — ContextVar 격리와 세션 복원

`_user_task_graph_ctx`는 `contextvars.ContextVar`로 구현했습니다. 이는 GEODE의 기존 패턴(`_search_engine_ctx`, `_readiness_ctx` 등)과 일치하며, `core/cli/session_state.py`에서 관리됩니다.

```python
# core/cli/session_state.py
_user_task_graph_ctx: ContextVar[Any] = ContextVar("user_task_graph", default=None)

def _get_user_task_graph() -> Any:
    from core.orchestration.task_system import TaskGraph

    graph = _user_task_graph_ctx.get()
    if graph is None:
        graph = TaskGraph()
        _user_task_graph_ctx.set(graph)
    return graph
```

> **Lazy 초기화**: 첫 `task_create` 호출 시에만 `TaskGraph()`를 생성합니다. Task 도구를 전혀 사용하지 않는 세션은 오버헤드가 없습니다.

**Kent Beck 충돌 에피소드:**

이 구현은 kent-beck-p3/p4/p5 리팩토링(CLI God Object 분해)과 병렬로 진행되었습니다. kent-beck-p3에서 `__init__.py`의 ContextVar들을 `session_state.py`로 추출했고, task-tools 브랜치는 그 이전 상태의 `__init__.py`에 `_user_task_graph_ctx`를 추가했습니다. develop → main PR 머지 시 세 곳의 충돌이 발생했습니다.

해결 원칙: **HEAD(kent-beck) 채택 + task-tools의 새 ContextVar를 `session_state.py`에 이식**. Gateway 코드 충돌에서는 `_build_agentic_stack()` 팩토리 패턴(HEAD)을 유지하고 origin/develop의 수동 조립 코드를 제거했습니다.

---

## 7. 구현: `_build_task_handlers()`

5개 핸들러를 하나의 팩토리 함수로 묶어 기존 `_build_tool_handlers()` 패턴과 일관성을 유지했습니다.

```python
# core/cli/tool_handlers.py
def _build_task_handlers() -> dict[str, Any]:
    """Build user-facing task management handlers."""
    import uuid
    from core.cli.session_state import _get_user_task_graph
    from core.orchestration.task_system import Task, TaskStatus

    def handle_task_create(**kwargs: Any) -> dict[str, Any]:
        subject = kwargs.get("subject", "")
        if not subject:
            return _clarify("task_create", ["subject"], "작업 제목을 알려주세요.")
        graph = _get_user_task_graph()
        task_id = f"t_{uuid.uuid4().hex[:8]}"   # uuid로 충돌 방지
        metadata: dict[str, Any] = dict(kwargs.get("metadata") or {})
        if desc := kwargs.get("description"):
            metadata["description"] = desc
        task = Task(task_id=task_id, name=subject, metadata=metadata)
        graph.add_task(task)
        return {"status": "ok", "action": "created", "task_id": task_id, "subject": subject}

    # ... (task_update, task_get, task_list, task_stop)

    return {
        "task_create": handle_task_create,
        "task_update": handle_task_update,
        "task_get": handle_task_get,
        "task_list": handle_task_list,
        "task_stop": handle_task_stop,
    }
```

> **task_id 설계**: 처음에는 `int(time.time() * 1000) % 1_000_000`으로 생성했습니다. 같은 밀리초 내에 두 개를 생성하는 테스트에서 충돌이 발생했고, `uuid.uuid4().hex[:8]`으로 교체했습니다. 8자리 hex는 2^32 ≈ 43억 가지 조합으로 세션 내 충돌 확률이 사실상 0입니다.

**`task_stop` 설계:**

단순히 `mark_failed()`가 아니라 `propagate_failure()`까지 호출합니다.

```python
def handle_task_stop(**kwargs: Any) -> dict[str, Any]:
    # ...
    graph.mark_failed(task_id, error=reason)
    graph.propagate_failure(task_id)   # 다운스트림 SKIPPED 전파
    return {"status": "ok", "action": "stopped", "task_id": task_id, "reason": reason}
```

> 에이전트가 "t_1을 중단해줘"라고 요청하면, t_1에 의존하는 t_2, t_3도 자동으로 `SKIPPED` 상태가 됩니다. 이 설계는 "실패 전파"를 사용자가 아닌 시스템이 담당하게 합니다. OpenClaw가 채택한 패턴과 동일합니다.

---

## 8. `/tasks` 슬래시 커맨드 — 인간을 위한 뷰

에이전트 도구와 별도로, 사용자가 REPL에서 작업 상태를 확인할 수 있는 `/tasks` 커맨드를 추가했습니다.

```
> /tasks

  Tasks
  ▶  t_a3f2bc1e  Fetch Berserk signals  0.3s
  ▶  t_7d19e02c  Run IP analysis  1.2s
  ○  t_c84fa391  Compare with Ghost in the Shell
  ✓  t_2b8d0e45  Load fixtures

  4 total  ▶ 2 active  ○ 1 pending  ✓ 1 done
```

Claude Code의 Task UI에서 참고한 아이콘 규칙:

| 아이콘 | 상태 | 의미 |
|--------|------|------|
| `○` | pending / ready | 대기 중 |
| `▶` | running | 실행 중 |
| `✓` | completed | 완료 |
| `✗` | failed | 실패 |
| `–` | skipped | 건너뜀 |

```python
# core/cli/commands.py
_STATUS_LABEL: dict[TaskStatus, tuple[str, str]] = {
    TaskStatus.PENDING:   ("○", "muted"),
    TaskStatus.READY:     ("○", "muted"),
    TaskStatus.RUNNING:   ("▶", "value"),
    TaskStatus.COMPLETED: ("✓", "success"),
    TaskStatus.FAILED:    ("✗", "error"),
    TaskStatus.SKIPPED:   ("–", "muted"),
}
```

토폴로지 정렬 순서대로 태스크를 표시하고, 실행 중인 것을 상단에 정렬합니다. `/tasks pending`, `/tasks done`, `/tasks active` 필터를 지원합니다.

---

## 9. 트레이드오프 요약

### 채택한 결정 vs. 고려했던 대안

| 결정 사항 | 채택 | 고려했던 대안 | 이유 |
|-----------|------|--------------|------|
| task_id 생성 | `uuid4().hex[:8]` | 타임스탬프 모듈로 | 밀리초 내 충돌 가능성 |
| 상태 수 | 3개 외부 (6개 내부) | 6개 그대로 노출 | 사용자/에이전트 혼란 방지 |
| UserTaskGraph 분리 | 별도 ContextVar | pipeline TaskGraph 공유 | 파이프라인 오염 방지 |
| `task_status` 키명 | `task_status` | `status` | `"status": "ok"` 충돌 방지 |
| task_stop 구현 | `mark_failed + propagate_failure` | `mark_failed`만 | 다운스트림 SKIPPED 자동 전파 |
| 영속화 | 없음 (메모리) | 파일 / DB | 세션 범위 작업에는 과잉 |

### 의도적으로 구현하지 않은 것

**파일 영속화**: Claude Code는 `~/.claude/tasks/{session_id}/`에 파일로 저장합니다. GEODE의 UserTaskGraph는 세션 메모리에만 존재하며 재시작 시 초기화됩니다. 이는 현재 GEODE의 작업이 단일 세션 범위를 벗어나지 않는다는 판단에 근거합니다. 다중 세션에 걸친 장기 프로젝트 추적이 필요해지는 시점에 추가할 수 있습니다.

**`blocks`/`blockedBy` 양방향 의존성**: Claude Code처럼 생성 시 의존성을 선언하는 방식을 지원할 수 있지만, 현재 구현에서는 `metadata.depends_on`으로 선언해도 TaskGraph가 자동으로 enforcing하지 않습니다. 이는 에이전트가 의존성을 스스로 관리(task_list로 확인 후 task_update)하도록 위임한 결과입니다.

---

## 10. 마무리

### 핵심 정리

| 항목 | 내용 |
|------|------|
| 추가된 도구 | `task_create`, `task_update`, `task_get`, `task_list`, `task_stop` (5종) |
| 추가된 커맨드 | `/tasks [pending|done|active]` |
| 변경 없는 파일 | `task_system.py`, `task_bridge.py`, `runtime.py`, `graph.py` |
| 단위 테스트 | 25개 (5개 클래스 × 5개 케이스) |
| 전체 테스트 결과 | 3,249 passed, 1 skipped |
| CI 게이트 | Lint / Format / Type / Test / Gate — 5/5 통과 |

### 설계 교훈

이 작업이 준 가장 큰 교훈은 **"엔진이 있다고 도구가 있는 게 아니다"**입니다. TaskGraph 엔진은 v0.14.0부터 존재했지만, 에이전트와 사용자는 그것을 쓸 수 없었습니다. 계층 경계에서 인터페이스를 명시적으로 노출하는 것이 시스템을 완성시킵니다.

프론티어 시스템과 비교했을 때, GEODE의 TaskGraph가 가진 **실패 전파(propagate_failure)**는 다른 시스템에 없는 차별점입니다. 에이전트가 하나의 태스크를 중단하면 그 파급 효과를 DAG 전체에 자동으로 전달합니다. 이 기능이 에이전트의 자기 수정(Self-correction) 능력의 기반이 됩니다.

### 다음 단계

- **파일 영속화**: 세션 간 작업 추적 (장기 프로젝트)
- **`blocks`/`blockedBy` 선언적 의존성**: task_create 시 의존성 enforcing
- **Sub-Agent task 위임**: 부모 에이전트가 자식에게 task_id를 전달해 진행 상황 폴링

---

*Source: `blog/posts/orchestration/64-task-tool-exposure-agent-self-tracking.md` | Category: [[blog-orchestration]]*

## Related

- [[blog-orchestration]]
- [[blog-hub]]
- [[geode]]
- [[geode-tool-system]]
