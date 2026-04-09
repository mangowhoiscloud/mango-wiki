---
title: "Tool Registry 7-Layer Architecture — LLM Agent의 도구 관리에서 런타임 안전까지"
type: reference
category: blog-post
tags: [blog, tools-mcp]
source: "blog/posts/tools-mcp/36-tool-registry-policy-chain-lazy-loading.md"
created: 2026-04-08T00:00:00Z
---

# Tool Registry 7-Layer Architecture — LLM Agent의 도구 관리에서 런타임 안전까지

> Date: 2026-03-19 | Author: reode-team | Tags: tool-registry, policy-chain, lazy-loading, HITL, permission-system, workflow-guard, LLM-tools, access-control

## 목차

1. 도입: 도구 관리의 7개 레이어
2. Tool Protocol — 구조적 타이핑과 메타데이터
3. ToolRegistry — 등록, 조회, 실행, 메타데이터 필터링
4. Tool Port — Clean Architecture 의존성 역전
5. PolicyChain — 다층 접근 제어
6. Deferred Loading — ALWAYS_LOADED + tool_search
7. ToolExecutor — 5-Tier HITL Safety Gate
8. Permission System — deny→ask→allow Glob 패턴
9. WorkflowGuard — 워크플로우 규칙 자동 감시
10. Runtime 통합 — 7개 레이어의 조립
11. 마무리

---

## 1. 도입: 도구 관리의 7개 레이어

LLM Agent가 실제 업무를 수행하려면 외부 시스템과 상호작용할 도구가 필요합니다. 그런데 도구를 "등록하고 호출"하는 것만으로는 프로덕션 수준의 에이전트를 만들 수 없습니다. 40개 이상의 도구를 관리하면서 모드별 접근 제어, 위험 도구 승인, 비용 확인, 워크플로우 규칙 감시까지 처리해야 합니다.

REODE는 이 복잡성을 7개 레이어로 분리합니다.

```
Layer 7  WorkflowGuard       워크플로우 규칙 자동 감시 (commit, push, merge)
Layer 6  Permission System   deny→ask→allow glob 패턴 평가
Layer 5  ToolExecutor        5-tier HITL safety gate (SAFE→STANDARD→DANGEROUS→WRITE→EXPENSIVE)
Layer 4  Deferred Loading    ALWAYS_LOADED 코어 + tool_search 메타 도구
Layer 3  PolicyChain         모드/노드별 AND 체인 접근 제어
Layer 2  ToolRegistry        등록, 조회, 실행, 이중 포맷 변환
Layer 1  Tool Protocol       @runtime_checkable 구조적 타이핑 계약
───────  Tool Port           Clean Architecture 의존성 역전 (L2-L3 횡단)
```

> Layer 1-3은 "어떤 도구를 사용할 수 있는가"를, Layer 5-7은 "이 도구를 지금 실행해도 안전한가"를 결정합니다. Layer 4는 컨텍스트 토큰 최적화를 담당합니다. 이 7개 레이어가 하나의 도구 호출 경로에서 순차적으로 평가됩니다.

---

## 2. Tool Protocol — 구조적 타이핑과 메타데이터

```python
# core/tools/base.py
VALID_CATEGORIES = frozenset({
    "discovery", "analysis", "memory", "planning", "external",
    "model", "data", "scheduling", "profile", "editing",
})
VALID_COST_TIERS = frozenset({"free", "cheap", "expensive"})

@runtime_checkable
class Tool(Protocol):
    """REODE Tool Protocol. 4개 속성/메서드를 구현하면 유효한 Tool입니다.

    Optional metadata:
        category  — functional group (discovery, analysis, memory, ...).
        cost_tier — resource cost indicator (free, cheap, expensive).
    """

    @property
    def name(self) -> str: ...

    @property
    def description(self) -> str: ...

    @property
    def parameters(self) -> dict[str, Any]: ...

    def execute(self, **kwargs: Any) -> dict[str, Any]: ...
```

> ABC 상속 없이 `Protocol`로 계약을 정의합니다. `isinstance(my_tool, Tool)`로 런타임 검증이 가능하며, 테스트에서 Mock 도구를 쉽게 생성할 수 있습니다. `category`와 `cost_tier`는 선택적 메타데이터로, ToolExecutor의 비용 게이트와 Registry의 카테고리 필터링에 활용됩니다.

### 구현 예시 — Edit Tool with Metadata

```python
# core/tools/edit_tools.py
class StrReplaceEditorTool:
    """Claude Code 스타일의 정확 텍스트 치환 도구."""

    category = "editing"       # 메타데이터: 카테고리
    cost_tier = "cheap"        # 메타데이터: 비용 등급

    @property
    def name(self) -> str:
        return "str_replace_editor"

    @property
    def description(self) -> str:
        return (
            "Replace exact text in a file. "
            "old_string must match exactly (including whitespace/indentation). "
            "By default old_string must be unique in the file; "
            "set replace_all=true to replace every occurrence."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "old_string": {"type": "string"},
                "new_string": {"type": "string"},
                "replace_all": {"type": "boolean", "default": False},
            },
            "required": ["file_path", "old_string", "new_string"],
        }

    def execute(self, **kwargs: Any) -> dict[str, Any]:
        file_path, err = _validate_path(kwargs["file_path"])  # 경로 샌드박싱
        if err:
            return {"error": err}
        # ... 정확 매칭 + 유사 힌트 제공
```

> Edit Tool은 의도적으로 WRITE가 아닌 STANDARD로 분류됩니다. 마이그레이션 파이프라인에서 수백 개 파일을 자동 편집해야 하므로, 매번 사용자 승인을 받으면 파이프라인이 멈추기 때문입니다. 대신 `_validate_path()`로 프로젝트 루트 밖의 경로를 원천 차단하여 보안을 확보합니다.

---

## 3. ToolRegistry — 등록, 조회, 실행, 메타데이터 필터링

```python
# core/tools/registry.py
class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """도구 등록. 중복 이름은 ValueError."""
        if tool.name in self._tools:
            raise ValueError(f"Tool '{tool.name}' already registered")
        self._tools[tool.name] = tool

    def to_anthropic_tools(self, *, policy: PolicyChain | None = None,
                           mode: str = "full_pipeline") -> list[dict[str, Any]]:
        """Anthropic API tool_use 포맷으로 변환 (PolicyChain 필터링 적용)."""
        allowed_names = self.list_tools(policy=policy, mode=mode)
        result: list[dict[str, Any]] = []
        for tool in self._tools.values():
            if tool.name not in allowed_names:
                continue
            schema = dict(tool.parameters)
            if "additionalProperties" not in schema:
                schema["additionalProperties"] = False  # Anthropic 권장
            result.append({
                "name": tool.name,
                "description": tool.description,
                "input_schema": schema,
            })
        return result

    def to_openai_tools(self, *, policy=None, mode="full_pipeline") -> list[dict]:
        """OpenAI function-calling 포맷으로 변환."""
        # { "type": "function", "function": { "name", "description", "parameters" } }

    def execute(self, name: str, *, policy=None, mode="full_pipeline", **kwargs):
        """도구 실행 (정책 검사 포함). KeyError/PermissionError 발생 가능."""

    # -- 메타데이터 필터링 --
    def get_tools_by_category(self, category: str) -> list[Tool]:
        """category 속성으로 도구 필터링. 속성이 없는 도구는 무시."""

    def get_tools_by_cost_tier(self, tier: str) -> list[Tool]:
        """cost_tier 속성으로 도구 필터링 (free/cheap/expensive)."""
```

> Registry는 등록, 조회, 실행, 포맷 변환의 네 가지 책임을 가집니다. PolicyChain을 옵셔널 파라미터로 받아 정책 검사를 위임하므로, Registry 자체는 정책 로직에 대해 알지 못합니다. `additionalProperties: false`를 자동 삽입하여 Anthropic API의 strict mode를 만족시킵니다.

### 이중 포맷 변환 — Cross-LLM 검증

하나의 레지스트리에서 Anthropic과 OpenAI 양쪽 포맷을 생성합니다. 동일한 도구 정의에서 파생되므로 포맷 간 정합성이 보장됩니다.

```
Anthropic format                          OpenAI format
─────────────────────────────────         ──────────────────────────────────
{ "name": "str_replace_editor",           { "type": "function",
  "description": "Replace ...",             "function": {
  "input_schema": {                            "name": "str_replace_editor",
    "type": "object",                          "description": "Replace ...",
    "properties": { ... },                     "parameters": {
    "required": [...]                            "type": "object",
  }                                              "properties": { ... },
}                                                "required": [...]
                                           } } }
```

### Tool Loader — definitions.json 캐싱

```python
# core/tools/loader.py
_all_tools: list[dict[str, Any]] | None = None  # 모듈 수준 캐시

def get_all_tool_definitions() -> list[dict[str, Any]]:
    """definitions.json에서 도구 정의를 로드합니다. 최초 1회만 파일 I/O."""
    global _all_tools
    if _all_tools is None:
        _all_tools = json.loads(_TOOLS_JSON_PATH.read_text(encoding="utf-8"))
    return list(_all_tools)  # 얕은 복사로 캐시 보호
```

> `definitions.json`에는 40개 이상의 정적 도구 정의가 선언되어 있습니다. 모든 코드가 이 모듈을 통해 접근하므로 파일 I/O가 1회로 고정됩니다.

---

## 4. Tool Port — Clean Architecture 의존성 역전

Tool 시스템은 Hexagonal Architecture의 Port/Adapter 패턴을 따릅니다. `core/infrastructure/ports/tool_port.py`에 Protocol 포트를 정의하고, 실제 구현체는 외부에서 주입됩니다.

```python
# core/infrastructure/ports/tool_port.py
@runtime_checkable
class ToolRegistryPort(Protocol):
    """Tool Registry 추상 계약."""
    def register(self, tool: Any) -> None: ...
    def get(self, name: str) -> Any | None: ...
    def list_tools(self, *, policy=None, mode="full_pipeline") -> list[str]: ...
    def to_anthropic_tools(self, *, policy=None, mode="full_pipeline") -> list[dict]: ...
    def to_anthropic_tools_with_defer(self, *, policy=None, mode="full_pipeline",
                                       defer_threshold=None, mcp_tools=None) -> list[dict]: ...
    def to_openai_tools(self, *, policy=None, mode="full_pipeline") -> list[dict]: ...
    def execute(self, name: str, *, policy=None, mode="full_pipeline", **kwargs) -> dict: ...

@runtime_checkable
class PolicyChainPort(Protocol):
    """Policy Chain 추상 계약."""
    def add_policy(self, policy: Any) -> None: ...
    def remove_policy(self, name: str) -> bool: ...
    def filter_tools(self, tool_names: list[str], *, mode: str) -> list[str]: ...
    def is_allowed(self, tool_name: str, *, mode: str) -> bool: ...
```

> Runtime 조립 시 `ToolRegistry`가 `ToolRegistryPort`를, `PolicyChain`이 `PolicyChainPort`를 만족시킵니다. 테스트에서는 Mock 구현체를 주입할 수 있습니다.

### ContextVar 기반 DI — Tool Executor 주입

```python
# core/infrastructure/ports/tool_port.py
ToolExecutorCallable = Callable[..., dict[str, Any]]

_tool_executor_ctx: ContextVar[ToolExecutorCallable | None] = ContextVar(
    "tool_executor", default=None
)

def set_tool_executor(executor: ToolExecutorCallable | None) -> None:
    """Tool executor를 주입합니다 (ReodeRuntime.create()에서 호출)."""
    _tool_executor_ctx.set(executor)

def get_tool_executor() -> ToolExecutorCallable | None:
    """주입된 tool executor를 반환합니다."""
    return _tool_executor_ctx.get()
```

> `contextvars.ContextVar`를 사용하여 스레드 안전한 DI를 구현합니다. Tool executor는 함수 시그니처(`Callable[..., dict]`)이므로 직렬화가 불가능하여 상태 저장소가 아닌 ContextVar에 별도로 관리합니다.

---

## 5. PolicyChain — 다층 접근 제어

OpenClaw의 6-Layer Resolution(Profile → Global → Agent → Group → Sandbox → Subagent)을 REODE의 파이프라인 모드에 맞게 2계층(mode + node)으로 적용합니다.

### 5.1 ToolPolicy — 단일 규칙

```python
# core/tools/policy.py
@dataclass
class ToolPolicy:
    """단일 정책 규칙. Whitelist가 Blacklist보다 우선합니다."""
    name: str
    mode: str  # "dry_run", "evaluation", "scoring", "full_pipeline", "*"
    priority: int = 100  # 낮을수록 높은 우선순위
    allowed_tools: set[str] = field(default_factory=set)   # Whitelist
    denied_tools: set[str] = field(default_factory=set)    # Blacklist

    def is_allowed(self, tool_name: str) -> bool:
        if self.allowed_tools:
            return tool_name in self.allowed_tools
        if self.denied_tools:
            return tool_name not in self.denied_tools
        return True  # 제한 없음
```

### 5.2 PolicyChain — AND 결합 평가

```python
# core/tools/policy.py
class PolicyChain:
    """우선순위 기반 정책 체인. 모든 해당 정책을 통과해야 허용됩니다."""

    def filter_tools(self, tool_names: list[str], *, mode: str = "full_pipeline") -> list[str]:
        applicable = [p for p in self._policies if p.mode in (mode, "*")]
        if not applicable:
            return tool_names
        result = []
        for name in tool_names:
            if all(p.is_allowed(name) for p in applicable):
                result.append(name)
            else:
                blocking = [p.name for p in applicable if not p.is_allowed(name)]
                log.debug("Tool '%s' blocked by policies: %s", name, blocking)
        return result

    def audit_check(self, tool_name: str, *, mode: str, user: str = "") -> PolicyAuditResult:
        """감사 추적이 포함된 권한 확인. 각 정책의 허용/거부 판정을 기록합니다."""
```

> `all()` 연산자로 AND 체인을 구현합니다. 하나의 정책이라도 거부하면 도구는 차단됩니다. `audit_check()`의 `PolicyAuditResult.blocking_policies` 프로퍼티로 차단한 정책 이름을 즉시 확인할 수 있습니다.

### 5.3 기본 정책 구성

```python
# core/runtime.py
def _build_default_policies() -> PolicyChainPort:
    chain = PolicyChain()
    chain.add_policy(ToolPolicy(
        name="dry_run_block_llm", mode="dry_run", priority=100,
        denied_tools={"run_analyst", "run_evaluator", "send_notification"},
    ))
    chain.add_policy(ToolPolicy(
        name="full_block_notification", mode="full_pipeline", priority=100,
        denied_tools={"send_notification"},
    ))
    return chain
```

| 모드 | 차단 도구 | 이유 |
|---|---|---|
| dry_run | run_analyst, run_evaluator, send_notification | LLM 호출 없이 시뮬레이션 |
| full_pipeline | send_notification | 명시적 요청만 허용 |
| evaluation | (제한 없음) | 전체 도구 접근 가능 |
| scoring | (제한 없음) | 전체 도구 접근 가능 |

### 5.4 NodeScopePolicy — 노드별 도구 격리

```python
# core/tools/policy.py
NODE_TOOL_ALLOWLISTS: dict[str, list[str]] = {
    "analyst":     ["memory_search", "memory_get"],
    "evaluator":   ["memory_search", "memory_get"],
    "scoring":     ["memory_search"],
    "synthesizer": ["memory_search", "memory_get"],
}

class NodeScopePolicy:
    """파이프라인 노드별 도구 화이트리스트. 접두사 매칭을 지원합니다."""

    def filter(self, tool_names: list[str], *, node: str | None = None) -> list[str]:
        """node에 허용된 도구만 반환합니다.
        analyst_migration → "analyst" 접두사 매칭으로 analyst 화이트리스트 적용."""
```

> 각 파이프라인 노드는 최소한의 도구만 사용할 수 있습니다. `analyst`는 `memory_search`와 `memory_get`만 허용되며, 노드가 경계를 넘는 도구를 호출하면 조용히 필터링됩니다. 접두사 매칭으로 `analyst_game_mechanics` 같은 서브타입에도 자동 적용됩니다.

---

## 6. Deferred Loading — ALWAYS_LOADED + tool_search

도구가 15개를 초과하면 LLM 프롬프트의 입력 토큰이 급증합니다. Defer 패턴은 **코어 도구는 항상 로드**하고, 나머지는 `tool_search` 메타 도구를 통해 필요할 때만 스키마를 제공합니다.

### 6.1 ALWAYS_LOADED_TOOLS — 코어 도구 면제

```python
# core/tools/registry.py
class ToolRegistry:
    ALWAYS_LOADED_TOOLS: frozenset[str] = frozenset({
        "show_help",
        "check_status",
        "run_bash",
        "delegate_task",
        "web_fetch",
        "general_web_search",
        "note_save",
        "note_read",
        "memory_search",
    })
```

> 9개 코어 도구는 deferred loading이 활성화되어도 **항상 전체 스키마가 LLM에 전달**됩니다. `run_bash`, `web_fetch`, `memory_search` 같은 고빈도 도구를 매번 tool_search로 찾아야 한다면 사용성이 급감하기 때문입니다.

### 6.2 to_anthropic_tools_with_defer — 3-Way 합류 + Defer

```python
# core/tools/registry.py
def to_anthropic_tools_with_defer(
    self, *, policy=None, mode="full_pipeline",
    defer_threshold: int | None = None,
    mcp_tools: list[dict] | None = None,
) -> list[dict[str, Any]]:
    if defer_threshold is None:
        from core.config import settings
        defer_threshold = settings.tool_defer_threshold  # 기본값: 15

    native_tools = self.to_anthropic_tools(policy=policy, mode=mode)

    # MCP 도구 합류 (이름 기반 중복 제거)
    all_tools = list(native_tools)
    if mcp_tools:
        existing = {t["name"] for t in all_tools}
        for mcp_tool in mcp_tools:
            if mcp_tool.get("name") not in existing:
                all_tools.append(mcp_tool)

    if len(all_tools) <= defer_threshold:
        return all_tools  # 임계 이하: 전체 스키마 즉시 제공

    # 코어 도구와 나머지 분리
    always_loaded = [t for t in all_tools if t.get("name") in self.ALWAYS_LOADED_TOOLS]
    deferred = [dict(t, defer_loading=True)
                for t in all_tools if t.get("name") not in self.ALWAYS_LOADED_TOOLS]

    tool_search = {
        "name": "tool_search",
        "description": f"Search REODE native and MCP tools. Categories: {category_str}.",
        "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, ...},
    }

    return [tool_search, *always_loaded, *deferred]
```

> 핵심 변경점: 이전 버전은 모든 도구를 무차별 defer했지만, 현재는 **ALWAYS_LOADED 9개 + tool_search 메타 도구**가 항상 전체 스키마로 제공됩니다. 나머지만 `defer_loading=True`로 태깅됩니다. 임계값은 `settings.tool_defer_threshold`로 환경변수 오버라이드가 가능합니다 (기본 15).

### 6.3 ToolSearchTool — Native + MCP 통합 검색

```python
# core/tools/registry.py
class ToolSearchTool:
    """메타 도구: 레지스트리 + MCP 도구를 키워드로 검색합니다."""

    def set_mcp_tools(self, mcp_tools: list[dict]) -> None:
        """MCP 도구 인덱스를 동적으로 업데이트합니다."""

    def execute(self, **kwargs) -> dict[str, Any]:
        query = kwargs.get("query", "").lower()

        # Native 도구 검색 (이름 + description 매칭)
        for tool in self._registry._tools.values():
            if query in tool.name.lower() or query in tool.description.lower():
                matches.append({...})

        # MCP 도구 검색
        for mcp_tool in self._mcp_tools:
            if query in mcp_tool["name"].lower() or query in mcp_tool["description"].lower():
                matches.append({..., "source": "mcp"})

        # 매칭 없으면 전체 도구 요약 반환 (fallback)
        if not matches:
            return {"matched": False, "available_tools": all_tools_summary}

        return {"matched": True, "tools": matches}
```

> 매칭 실패 시 전체 도구 목록을 요약(`description[:80]`)으로 반환합니다. LLM이 정확한 키워드를 모르더라도 사용 가능한 도구를 파악할 수 있습니다. MCP 도구는 `"source": "mcp"` 태그로 출처를 구분합니다.

**동작 흐름:**

```
1. 도구 수 > 15 → Defer 모드 활성화
2. LLM은 tool_search + 9개 코어 도구의 전체 스키마를 받음
3. LLM이 tool_search("file editing") 호출
4. ToolSearchTool이 native + MCP 양쪽에서 매칭 도구 반환
5. LLM이 반환된 스키마로 실제 도구(str_replace_editor 등) 호출
```

---

## 7. ToolExecutor — 5-Tier HITL Safety Gate

Layer 1-4가 "어떤 도구를 제공할 것인가"를 결정한다면, ToolExecutor는 "이 도구 호출을 지금 실행해도 되는가"를 결정합니다. 모든 도구 호출은 ToolExecutor를 통해 디스패치되며, 5단계 안전 분류에 따라 HITL(Human-In-The-Loop) 게이트가 적용됩니다.

### 7.1 안전 분류 체계

```python
# core/cli/tool_executor.py
SAFE_TOOLS: frozenset[str] = frozenset({
    "list_projects", "search_projects", "show_help", "check_status",
    "switch_model", "memory_search", "manage_rule", "web_fetch",
    "general_web_search", "note_read", "read_document", "profile_show",
})

DANGEROUS_TOOLS: frozenset[str] = frozenset({"run_bash"})

WRITE_TOOLS: frozenset[str] = frozenset({
    "memory_save", "note_save", "set_api_key", "manage_auth",
    "profile_update", "profile_preference", "profile_learn",
})

EXPENSIVE_TOOLS: dict[str, float] = {
    "analyze_project": 1.50,
    "batch_analyze": 5.00,
    "compare_projects": 3.00,
}
```

| 분류 | 동작 | 예시 도구 |
|---|---|---|
| **SAFE** | 즉시 실행, 확인 없음 | show_help, memory_search, web_fetch |
| **STANDARD** | 정상 실행 | 분석, 비교, 리포트, 편집 도구 |
| **DANGEROUS** | 항상 사용자 승인 필요 | run_bash |
| **WRITE** | 항상 사용자 확인 (auto_approve 무시) | memory_save, set_api_key |
| **EXPENSIVE** | 비용 확인 후 실행 | analyze_project (~$1.50) |

> WRITE 도구는 `auto_approve=True`로 설정된 Sub-agent에서도 **절대 자동 승인되지 않습니다**. 자격 증명이나 메모리를 수정하는 도구는 항상 사용자 확인을 거칩니다. 반면 `str_replace_editor`, `write_file`, `insert_text`는 의도적으로 STANDARD입니다. 마이그레이션 파이프라인이 수백 개 파일을 자동 편집해야 하기 때문입니다.

### 7.2 SAFE_BASH_PREFIXES — 읽기 전용 명령어 화이트리스트

```python
# core/cli/tool_executor.py
SAFE_BASH_PREFIXES: tuple[str, ...] = (
    # 파일 검사 (읽기 전용)
    "cat ", "head ", "tail ", "ls ", "pwd", "grep ", "rg ", "find ",
    # Python 도구
    "uv run pytest", "uv run ruff", "uv run mypy", "uv run python",
    # Git (읽기 전용)
    "git status", "git log", "git diff", "git branch", "git show",
    # GitHub CLI
    "gh pr", "gh run", "gh api",
    # Java/JVM
    "mvn compile", "mvn test", "mvn dependency:", "gradle build", "jdeps ",
    # Node.js
    "npm test", "npm run build", "npx ",
)
```

> `run_bash`는 DANGEROUS로 분류되지만, 이 접두사로 시작하는 명령어는 읽기 전용이므로 HITL 승인 없이 즉시 실행됩니다. `BashTool.validate()`로 파괴적 패턴(`rm -rf`, `sudo` 등)이 먼저 차단된 후에만 접두사 매칭이 수행됩니다.

### 7.3 MCP 서버별 세션 승인 캐시

```python
# core/cli/tool_executor.py
AUTO_APPROVED_MCP_SERVERS: frozenset[str] = frozenset({
    "brave-search", "steam", "arxiv", "linkedin-reader",
})

class ToolExecutor:
    def __init__(self, ...):
        self._mcp_approved_servers: set[str] = set()  # 세션별 승인 캐시

    def _execute_mcp(self, server, tool_name, tool_input):
        # 읽기 전용 서버는 자동 승인
        if server in AUTO_APPROVED_MCP_SERVERS:
            self._mcp_approved_servers.add(server)
        # 미승인 서버: 1회만 확인, 이후 동일 서버는 자동 실행
        if server not in self._mcp_approved_servers:
            if not self._confirm_mcp(server, tool_name):
                return {"error": "User denied MCP tool execution", "denied": True}
            self._mcp_approved_servers.add(server)
```

> MCP 도구는 외부 서버에서 실행되므로 신뢰 수준이 다릅니다. **서버당 1회 승인** 후에는 같은 서버의 후속 호출이 자동 실행됩니다. `brave-search`, `steam` 같은 읽기 전용 서버는 첫 호출부터 자동 승인됩니다.

### 7.4 디스패치 체인 — Handler → MCP → Registry Fallback

```python
# core/cli/tool_executor.py — ToolExecutor.execute() 핵심 흐름
def execute(self, tool_name: str, tool_input: dict) -> dict:
    # Phase 1: PermissionEvaluator (설정 시)
    #   deny → 즉시 차단
    #   allow → 빠른 경로 실행 (HITL 생략)
    #   ask → 아래 레거시 게이트로 진행

    # Phase 2: WorkflowGuard 사전 검사 (advisory)
    # Phase 3: DANGEROUS 게이트 (run_bash → 사용자 승인)
    # Phase 4: WRITE 게이트 (memory_save 등 → 사용자 확인)
    # Phase 5: EXPENSIVE 게이트 (비용 확인)

    # Phase 6: 디스패치
    handler = self._handlers.get(tool_name)
    if handler is None:
        # Fallback 1: MCP 서버에서 도구 탐색
        if self._mcp_manager:
            server = self._mcp_manager.find_server_for_tool(tool_name)
            if server:
                return self._execute_mcp(server, tool_name, tool_input)
        # Fallback 2: ToolRegistry에서 도구 실행
        if self._tool_registry:
            reg_tool = self._tool_registry.get(tool_name)
            if reg_tool:
                return dict(reg_tool.execute(**tool_input))
        return {"error": f"Unknown tool: {tool_name}"}

    return handler(**tool_input)
```

```
도구 호출 도착
  │
  ├─ PermissionEvaluator → deny?  ──→ 차단
  │                      → allow? ──→ 빠른 경로 실행
  │                      → ask?   ──→ 레거시 게이트
  │
  ├─ WorkflowGuard 사전 검사 → blocked? ──→ hard block
  │                          → warning? ──→ 경고 출력 후 속행
  │
  ├─ DANGEROUS?  → HITL 승인 (safe bash prefix 제외)
  ├─ WRITE?      → HITL 확인 (auto_approve 무시)
  ├─ EXPENSIVE?  → 비용 확인
  │
  └─ 디스패치: Handler → MCP → Registry → "Unknown tool"
```

---

## 8. Permission System — deny→ask→allow Glob 패턴

ToolExecutor의 frozenset 분류는 단순하지만 유연하지 않습니다. Permission System(Gap G4)은 Claude Code에서 영감을 받은 **JSON 규칙 기반 3-phase 평가**를 추가합니다.

### 8.1 규칙 모델

```python
# core/auth/permissions.py
class PermissionRule(BaseModel):
    tool: str    # fnmatch glob 패턴: "Bash(git *)", "memory_save", "Edit(**/secret*)"
    action: str  # "allow" | "deny" | "ask"

class PermissionConfig(BaseModel):
    rules: list[PermissionRule] = []

    @classmethod
    def load(cls, path: Path) -> PermissionConfig:
        """JSON 파일에서 로드. 파일 없으면 빈 설정 반환."""
```

### 8.2 기본 규칙 — 33개 Baseline

```python
# core/auth/permissions.py
_DEFAULT_RULES = [
    # 읽기 전용 도구: 자동 허용
    {"tool": "show_help", "action": "allow"},
    {"tool": "memory_search", "action": "allow"},
    {"tool": "web_fetch", "action": "allow"},
    # 안전한 bash 패턴: 허용
    {"tool": "Bash(cat *)", "action": "allow"},
    {"tool": "Bash(git status*)", "action": "allow"},
    {"tool": "Bash(uv run pytest*)", "action": "allow"},
    {"tool": "Bash(uv run ruff*)", "action": "allow"},
    # Write 도구: 항상 확인
    {"tool": "memory_save", "action": "ask"},
    {"tool": "set_api_key", "action": "ask"},
    # 위험한 bash 패턴: 차단
    {"tool": "Bash(rm -rf *)", "action": "deny"},
    {"tool": "Bash(sudo *)", "action": "deny"},
    {"tool": "Bash(curl * | bash*)", "action": "deny"},
    {"tool": "Bash(dd *)", "action": "deny"},
]
```

### 8.3 PermissionEvaluator — 3-Phase 평가

```python
# core/auth/permissions.py
class PermissionEvaluator:
    """deny → ask → allow → default(ask) 순서로 평가합니다."""

    def evaluate(self, tool_call: str) -> str:
        # Phase 1: deny가 먼저 매칭되면 즉시 차단
        for pattern in self._deny:
            if fnmatch.fnmatch(tool_call, pattern):
                return "deny"
        # Phase 2: ask 매칭 → HITL 게이트
        for pattern in self._ask:
            if fnmatch.fnmatch(tool_call, pattern):
                return "ask"
        # Phase 3: allow 매칭 → 자동 실행
        for pattern in self._allow:
            if fnmatch.fnmatch(tool_call, pattern):
                return "allow"
        return "ask"  # 기본값: 사용자에게 물어봄
```

> deny가 항상 최우선입니다. `Bash(sudo *)` deny 규칙과 `Bash(*)` allow 규칙이 동시에 존재해도 sudo는 차단됩니다. 프로젝트별 `.reode/permissions.json`이 기본 규칙보다 먼저 평가되므로, 프로젝트 특성에 맞는 커스텀 규칙을 추가할 수 있습니다.

### 8.4 Canonical Tool Call Format

```python
# core/auth/permissions.py
def format_tool_call(tool_name: str, tool_input: dict | None = None) -> str:
    """도구 호출을 정규 문자열로 변환합니다.

    run_bash + {"command": "git status"} → "Bash(git status)"
    memory_save + {"content": "..."} → "memory_save"
    """
    if tool_name == "run_bash" and tool_input:
        return f"Bash({tool_input.get('command', '')})"
    return tool_name
```

> Bash 명령어는 `Bash(명령어)` 형태로 정규화되어 glob 패턴 매칭의 대상이 됩니다. 이로써 `Bash(git *)` 패턴으로 모든 git 명령어를 허용하면서 `Bash(rm -rf *)` 패턴으로 위험한 명령어를 차단할 수 있습니다.

---

## 9. WorkflowGuard — 워크플로우 규칙 자동 감시

ToolExecutor의 모든 도구 실행에 대해 **사전 검사**(pre-check)와 **사후 알림**(post-notify)을 수행하는 워크플로우 감시자입니다. PolicyChain이 "어떤 도구를 쓸 수 있는가"를, Permission이 "이 호출을 허용할 것인가"를 판단한다면, WorkflowGuard는 "이 호출이 워크플로우 규칙에 부합하는가"를 판단합니다.

### 9.1 3개 워크플로우 규칙

```python
# core/cli/workflow_guard.py
class WorkflowGuard:
    def _check_bash(self, command: str) -> GuardDecision:
        """Bash 명령어에 대한 워크플로우 규칙 평가.

        R1: git commit outside worktree → advisory warning
        R2: git push without quality gate → advisory warning
        R3: gh pr merge without CI green → HARD BLOCK
        """
```

| 규칙 | 조건 | 동작 | 차단 수준 |
|---|---|---|---|
| R1 | worktree 밖에서 `git commit` | 경고 메시지 출력 | Advisory (실행 허용) |
| R2 | Quality gate 미통과 후 `git push` | 경고 메시지 출력 | Advisory (실행 허용) |
| R3 | CI 미통과 상태에서 `gh pr merge` | **실행 차단** | Hard block |

> R1과 R2는 Advisory 경고만 표시하고 실행을 허용합니다. R3만 유일한 Hard block입니다. `gh pr checks`를 실행하여 CI 상태를 실시간 확인한 후, 하나라도 실패/대기 중이면 merge를 원천 차단합니다.

### 9.2 도구 결과 자동 감지 — Quality Gate & CI

```python
# core/cli/workflow_guard.py
def notify_tool_result(self, tool_name, tool_input, result):
    """실행 완료된 도구 결과에서 상태를 자동 감지합니다."""
    command = tool_input.get("command", "")
    output = (result.get("stdout", "") + result.get("stderr", "")).lower()
    success = bool(result.get("success", False))

    self._auto_detect_quality_gate(command, output, success)
    self._auto_detect_ci_status(command, output, success)
    self._auto_detect_pr_create(command, result)
```

```
uv run ruff check → 성공 → quality_gate_passed = True
uv run pytest     → 실패 → quality_gate_passed = False (리셋)
gh pr checks      → all green → ci_green = True
gh pr create      → PR URL 감지 → auto-merge watcher 시작
```

> Quality gate 상태는 **실패 시 리셋**됩니다. ruff가 성공해도 이후 pytest가 실패하면 gate가 다시 닫힙니다. 이 상태에서 `git push`를 시도하면 R2 경고가 표시됩니다.

### 9.3 Auto-Merge Watcher — 백그라운드 CI 감시

```python
# core/cli/workflow_guard.py
def _auto_detect_pr_create(self, command, result):
    """gh pr create 결과에서 PR URL을 감지하고 auto-merge watcher를 시작합니다."""
    pr_number = _PR_URL_RE.search(stdout).group(1)
    thread = threading.Thread(
        target=self._auto_merge_watcher,
        args=(pr_number, repo),
        daemon=True,
    )
    thread.start()

def _auto_merge_watcher(self, pr_number, repo):
    """30초 간격으로 gh pr checks 폴링. 최대 15분. CI green → 자동 merge."""
    while elapsed < 900:
        time.sleep(30)
        proc = subprocess.run(["gh", "pr", "checks", pr_number, "--repo", repo])
        if proc.returncode == 0:  # All checks passed
            subprocess.run(["gh", "pr", "merge", pr_number, "--merge", "--repo", repo])
            return
        if "fail" in proc.stdout.lower():
            return  # CI 실패 → watcher 종료
```

> PR이 생성되면 데몬 스레드가 백그라운드에서 CI를 30초마다 폴링합니다. 모든 체크가 통과하면 자동으로 `gh pr merge`를 실행합니다. CI가 실패하면 즉시 watcher를 종료하여 불필요한 폴링을 방지합니다. 최대 대기 시간은 15분입니다.

---

## 10. Runtime 통합 — 7개 레이어의 조립

### 10.1 Registry 빌더

```python
# core/runtime.py
def _build_default_registry() -> ToolRegistryPort:
    registry = ToolRegistry()
    # Memory (7): search, get, save, rule_create/update/delete/list
    registry.register(MemorySearchTool())
    registry.register(MemoryGetTool())
    registry.register(MemorySaveTool())
    registry.register(RuleCreateTool())
    registry.register(RuleUpdateTool())
    registry.register(RuleDeleteTool())
    registry.register(RuleListTool())
    # Output (3): report, json, notification
    registry.register(GenerateReportTool())
    registry.register(ExportJsonTool())
    registry.register(SendNotificationTool())
    # Editing (3): str_replace, write_file, insert_text
    registry.register(StrReplaceEditorTool())
    registry.register(WriteFileTool())
    registry.register(InsertTextTool())
    # Meta (1): tool_search
    registry.register(ToolSearchTool(registry))
    return registry  # 14개 도구
```

### 10.2 ToolExecutor 조립 — 전체 배선

```python
# core/cli/repl.py
_workflow_guard = WorkflowGuard()
_tool_registry = _build_default_registry()

executor = ToolExecutor(
    action_handlers=handlers,
    bash_tool=BashTool(),
    mcp_manager=mcp_mgr,
    permission_evaluator=load_evaluator(),     # Layer 6: Permission
    workflow_guard=_workflow_guard,              # Layer 7: WorkflowGuard
    tool_registry=_tool_registry,               # Layer 2: Registry fallback
)
```

### 10.3 전체 호출 경로

```
사용자 입력
  │
  ├─ AgenticLoop: LLM API 호출 (tools=merged_tools)
  │    └─ 3중 소스 합류: definitions.json + ToolRegistry + MCP
  │         └─ Deferred Loading 적용 (>15개 시)
  │
  ├─ LLM 응답: tool_use 블록
  │
  └─ ToolExecutor.execute(tool_name, tool_input)
       │
       ├─ [L6] PermissionEvaluator: deny→ask→allow
       ├─ [L7] WorkflowGuard: pre-check (R1-R3)
       ├─ [L5] Safety Gate: DANGEROUS→WRITE→EXPENSIVE
       ├─ [L2] Dispatch: Handler → MCP → Registry
       └─ [L7] WorkflowGuard: post-notify (quality gate/CI 자동 감지)
```

---

## 11. 마무리

### 핵심 정리

| 항목 | 값/설명 |
|---|---|
| Tool Protocol | `@runtime_checkable` Protocol, 4개 메서드 + category/cost_tier 메타데이터 |
| Registry | 등록/조회/실행/이중 포맷 변환 + `additionalProperties: false` 자동 삽입 |
| Tool Port | `ToolRegistryPort`, `PolicyChainPort` Protocol + ContextVar DI |
| PolicyChain | 우선순위 AND 체인, Whitelist > Blacklist, audit_check 감사 추적 |
| NodeScopePolicy | 4개 노드 × 최소 화이트리스트 (접두사 매칭) |
| Defer 패턴 | ALWAYS_LOADED 9개 + tool_search 메타 도구, 85% 컨텍스트 절감 |
| Defer 임계 | 15개 (settings.tool_defer_threshold, 환경변수 오버라이드 가능) |
| ToolExecutor | 5-tier HITL: SAFE/STANDARD/DANGEROUS/WRITE/EXPENSIVE |
| SAFE_BASH_PREFIXES | 47개 읽기 전용 명령어 패턴 (HITL 생략) |
| MCP 승인 | 서버당 1회 세션 캐시 + 4개 자동 승인 서버 |
| Permission System | deny→ask→allow 3-phase, fnmatch glob, 33개 기본 규칙 |
| WorkflowGuard | 3개 규칙 (commit/push advisory, merge hard block) |
| Auto-merge | PR 생성 시 백그라운드 CI 폴링 → 자동 merge (최대 15분) |

### 체크리스트

- [ ] Tool Protocol 4개 메서드 + category/cost_tier 메타데이터 구현
- [ ] ToolRegistry에 중복 등록 방지 + `additionalProperties: false` 삽입
- [ ] ToolRegistryPort/PolicyChainPort Protocol 포트로 의존성 역전
- [ ] ContextVar로 스레드 안전한 Tool Executor DI
- [ ] PolicyChain AND 체인으로 다층 접근 제어 + audit_check 감사 추적
- [ ] NodeScopePolicy로 파이프라인 노드별 도구 격리
- [ ] ALWAYS_LOADED_TOOLS 9개가 defer에서 면제되는지 확인
- [ ] defer_threshold를 settings에서 구성 가능한지 확인
- [ ] ToolSearchTool이 native + MCP 양쪽을 검색하는지 확인
- [ ] ToolExecutor 5-tier 안전 분류 동작 확인
- [ ] WRITE 도구가 auto_approve=True에서도 HITL을 거치는지 확인
- [ ] SAFE_BASH_PREFIXES가 BashTool.validate() 이후 적용되는지 확인
- [ ] MCP 서버별 세션 승인 캐시가 동작하는지 확인
- [ ] Permission System deny→ask→allow 평가 순서 확인
- [ ] WorkflowGuard R3 (merge without CI green)가 hard block인지 확인
- [ ] Auto-merge watcher가 CI 실패 시 즉시 종료되는지 확인

---

*Source: `blog/posts/tools-mcp/36-tool-registry-policy-chain-lazy-loading.md` | Category: [[blog-tools-mcp]]*

## Related

- [[blog-tools-mcp]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
- [[geode-llm-models]]
- [[geode-tool-system]]
