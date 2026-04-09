---
title: "확장성 레이어 -- Skills x MCP x Tool Registry가 만드는 동적 역량 확장"
type: reference
category: blog-post
tags: [blog, tools-mcp]
source: "blog/posts/tools-mcp/16-extensibility-skills-mcp-tool-registry.md"
created: 2026-04-08T00:00:00Z
---

# 확장성 레이어 -- Skills x MCP x Tool Registry가 만드는 동적 역량 확장

> Date: 2026-03-12 | Author: geode-team | Tags: extensibility, skills, mcp, tool-registry, policy-chain, harness

## 목차

1. 도입 -- 왜 런타임 확장이 필요한가
2. Skills System -- 도메인 지식의 동적 주입
3. MCP Protocol -- 31개 서버 카탈로그와 자동 설치
4. Tool Registry -- 도구 등록과 스키마 관리
5. Policy Chain -- 모드별 접근 제어
6. 동적 등록 -- /skills add x /mcp add
7. 통합 -- 확장성 레이어가 하네스에서 하는 역할
8. 설계 원천 (Design Origin)
9. 마무리

---

## 1. 도입 -- 왜 런타임 확장이 필요한가

IP 분석 하네스의 초기 버전은 세 가지 한계를 안고 있었습니다.

**하드코딩 프롬프트**: 분석가/평가자 역할별 지식이 소스코드에 박혀 있어, 새 도메인(예: 메카 장르)을 추가하려면 코드를 고쳐야 했습니다.

**정적 도구 집합**: `definitions.json`에 선언한 20개 도구가 전부였으며, MCP 서버가 제공하는 외부 도구를 런타임에 붙일 방법이 없었습니다.

**모드 무관 접근**: dry-run에서도 LLM 비용이 발생하는 `run_analyst` 도구를 호출할 수 있었고, 노드 간 도구 경계도 없었습니다.

L6(Extensibility) 레이어는 이 세 문제를 각각 Skills, MCP, PolicyChain으로 해결합니다.

```
문제                       해법                    구현
─────────────────────────  ──────────────────────  ──────────────
하드코딩 프롬프트           Skills System           SkillLoader + SkillRegistry
정적 도구 집합              MCP Protocol            MCPServerManager + StdioMCPClient
모드 무관 접근              Policy Chain            PolicyChain + NodeScopePolicy
```

---

## 2. Skills System -- 도메인 지식의 동적 주입

Skills는 `.claude/skills/*/SKILL.md` 파일로 존재하는 도메인 지식 단위입니다. YAML frontmatter에 메타데이터를, Markdown body에 프롬프트 본문을 담습니다.

### 2.1 SkillDefinition 모델

```python
# core/extensibility/skills.py
class SkillDefinition(BaseModel):
    name: str
    description: str = ""
    triggers: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    body: str = ""
    source: str = ""
    risk: str = "safe"
```

> Pydantic BaseModel을 사용하여 직렬화/검증을 자동화합니다. `triggers`는 사용자 입력과 매칭하여 관련 스킬을 자동 활성화하는 키워드 목록입니다.

### 2.2 Frontmatter 파서 -- PyYAML 없이

```python
# core/extensibility/_frontmatter.py
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)

def parse_yaml_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """YAML frontmatter를 파싱합니다. PyYAML 의존 없이 key: value 파싱."""
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    # key: value 라인 파싱 + [a, b, c] 리스트 지원
    ...
```

> 외부 의존성 제로를 목표로 합니다. PyYAML 대신 정규표현식으로 간단한 key-value + 리스트(`[a, b, c]`) + 따옴표 문자열을 처리합니다. Skills 메타데이터에 중첩 구조가 필요 없기 때문에 이 수준으로 충분합니다.

### 2.3 트리거 추출

```python
# core/extensibility/skills.py
_TRIGGER_RE = re.compile(r'"([^"]+)"(?:\s*,\s*"([^"]+)")*\s*키워드로\s*트리거')
```

description 필드 끝에 `"pipeline", "graph" 키워드로 트리거`라고 쓰면, `_extract_triggers()`가 `["pipeline", "graph"]`를 추출합니다. 사용자가 "pipeline 토폴로지 보여줘"라고 입력하면 `find_by_trigger()`가 해당 스킬을 매칭합니다.

### 2.4 SkillLoader -- 디스커버리와 로딩

```python
# core/extensibility/skills.py
class SkillLoader:
    def discover(self) -> list[Path]:
        """Find all SKILL.md files in subdirectories."""
        return sorted(self._skills_dir.glob("*/SKILL.md"))

    def load_all(self, registry: SkillRegistry | None = None) -> list[SkillDefinition]:
        for path in self.discover():
            skill = self.load_file(path)
            if registry is not None:
                registry.register(skill)
```

> `.claude/skills/` 아래 각 서브디렉토리의 `SKILL.md`를 자동 발견합니다. `load_file()`은 frontmatter를 파싱하고, name이 없으면 디렉토리 이름을 fallback으로 사용합니다.

### 2.5 시스템 프롬프트 주입 -- get_context_block()

```python
# core/extensibility/skills.py — SkillRegistry
def get_context_block(self, max_chars: int = 8000) -> str:
    lines: list[str] = []
    total = 0
    for skill in sorted(self._skills.values(), key=lambda s: s.name):
        line = f"- **{skill.name}**: {skill.description}"
        if skill.tools:
            line += f" (tools: {', '.join(skill.tools)})"
        if total + len(line) > max_chars:
            lines.append(f"- ... and {len(self._skills) - len(lines)} more skills")
            break
        lines.append(line)
        total += len(line)
    return "\n".join(lines)
```

> 8,000자 상한으로 토큰 예산을 관리합니다. 스킬이 많아져도 컨텍스트 윈도우를 넘기지 않습니다. AgenticLoop에서 `{skill_context}` 플레이스홀더를 이 블록으로 교체합니다.

---

## 3. MCP Protocol -- 31개 서버 카탈로그와 자동 설치

MCP(Model Context Protocol)는 LLM Agent가 외부 도구 서버와 JSON-RPC로 통신하는 표준입니다. GEODE는 31개 서버를 내장 카탈로그로 제공하며, `npx` 한 줄로 자동 설치합니다.

### 3.1 카탈로그 -- 가중치 기반 검색

```python
# core/infrastructure/adapters/mcp/catalog.py
@dataclass(frozen=True)
class MCPCatalogEntry:
    name: str           # "brave-search"
    package: str        # "@anthropic/mcp-server-brave-search"
    description: str
    tags: tuple[str, ...]
    env_keys: tuple[str, ...] = ()
    command: str = "npx"
    extra_args: tuple[str, ...] = ()
```

`search_catalog()` 함수는 토큰별로 가중치를 부여합니다.

```
가중치 매핑
───────────────────────────────
name 정확 일치    10.0
name 부분 일치     5.0
tag  정확 일치     4.0
tag  부분 일치     2.0
description 일치   1.5
package 일치       1.0
```

"vector db"를 검색하면 `qdrant`(tag=vector+db, 8.0점)이 `pinecone`(tag=vector+db, 8.0점)과 함께 상위에 올라옵니다. "steam"을 검색하면 `steam`(name 정확 일치 10.0 + tag 4.0)이 최상위입니다.

### 3.2 카탈로그 구성

31개 서버는 7개 카테고리로 분류됩니다.

| 카테고리 | 서버 수 | 대표 서버 |
|---------|---------|----------|
| Official/Anthropic | 8 | brave-search, memory, fetch, filesystem, git, puppeteer, github, sequential-thinking |
| Gaming | 1 | steam |
| Social/Community | 4 | linkedin, reddit, twitter, youtube |
| Search | 3 | tavily-search, firecrawl, omnisearch |
| Database/Vector | 3 | qdrant, pinecone, sqlite |
| Memory | 3 | memory, mcp-memory-service, zep |
| Productivity/Dev/AI | 9 | slack, notion, google-drive, sentry, postgres, docker, langsmith, exa, google-trends |

### 3.3 StdioMCPClient -- 3단계 핸드셰이크

MCP 서버는 subprocess로 실행되며, stdin/stdout을 통한 JSON-RPC로 통신합니다.

```
[1] initialize    →  protocolVersion, clientInfo
                  ←  serverInfo, capabilities
[2] initialized   →  notification (응답 없음)
[3] tools/list    →  {}
                  ←  { tools: [...] }
```

```python
# core/infrastructure/adapters/mcp/stdio_client.py
class StdioMCPClient:
    def connect(self) -> bool:
        self._process = subprocess.Popen(
            [self._command, *self._args],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=env,
        )
        # Step 1: initialize
        init_response = self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "geode", "version": "0.9.0"},
        })
        # Step 2: initialized notification
        self._send_notification("notifications/initialized", {})
        # Step 3: tools/list
        tools_response = self._send_request("tools/list", {})
        self._tools = tools_response["tools"]
```

> 핸드셰이크 완료 후 도구 목록을 캐싱합니다. 이후 `call_tool()`은 `tools/call` 메서드로 실행합니다.

### 3.4 MCPServerManager -- 환경변수 해석과 멀티서버 관리

```python
# core/infrastructure/adapters/mcp/manager.py
class MCPServerManager:
    def _resolve_env(self, env: dict[str, str]) -> dict[str, str]:
        """${VAR} 참조를 실제 환경변수 값으로 치환합니다."""
        resolved: dict[str, str] = {}
        for key, value in env.items():
            if value.startswith("${") and value.endswith("}"):
                var_name = value[2:-1]
                resolved[key] = os.environ.get(var_name, "")
            else:
                resolved[key] = value
        return resolved
```

> `.claude/mcp_servers.json` 설정 파일에서 `"BRAVE_API_KEY": "${BRAVE_API_KEY}"`처럼 선언하면, `_resolve_env()`가 실제 값으로 치환합니다. 비밀키를 설정 파일에 직접 노출하지 않습니다.

`get_all_tools()`는 모든 연결된 서버에서 도구를 수집하고, 각 도구에 `_mcp_server` 필드를 태깅하여 출처를 추적합니다.

---

## 4. Tool Registry -- 도구 등록과 스키마 관리

ToolRegistry는 REODE의 도구 중앙 저장소입니다. 세 가지 소스에서 도구를 수집합니다.

```
소스 1: definitions.json     정적 JSON 도구 정의 (40+개, AgenticLoop 기본)
소스 2: ToolRegistry         런타임 등록 도구 (14개, 코드 기반)
소스 3: MCP servers          외부 MCP 서버 도구 (동적, 서버당 N개)
```

> Tool Registry의 전체 아키텍처(7-Layer)에 대해서는 [Tool Registry 7-Layer Architecture](tool-registry-policy-chain-lazy-loading.md) 포스트에서 상세히 다룹니다. 이 섹션에서는 확장성 레이어와의 통합에 초점을 맞춥니다.

### 4.1 Tool Protocol + 메타데이터

```python
# core/tools/base.py
VALID_CATEGORIES = frozenset({
    "discovery", "analysis", "memory", "planning", "external",
    "model", "data", "scheduling", "profile", "editing",
})
VALID_COST_TIERS = frozenset({"free", "cheap", "expensive"})

@runtime_checkable
class Tool(Protocol):
    """4개 속성/메서드 + category/cost_tier 선택적 메타데이터."""
    @property
    def name(self) -> str: ...
    @property
    def description(self) -> str: ...
    @property
    def parameters(self) -> dict[str, Any]: ...
    def execute(self, **kwargs: Any) -> dict[str, Any]: ...
```

> `@runtime_checkable`로 `isinstance(obj, Tool)`이 가능합니다. `category`와 `cost_tier`는 선택적 메타데이터로, ToolExecutor의 비용 게이트(`EXPENSIVE_TOOLS`)와 Registry의 `get_tools_by_category()` 필터링에 활용됩니다.

### 4.2 이중 포맷 변환 -- Anthropic / OpenAI

```python
# core/tools/registry.py — ToolRegistry
def to_anthropic_tools(self, ...) -> list[dict[str, Any]]:
    """Anthropic API tool_use 포맷으로 변환. additionalProperties: false 자동 삽입."""

def to_openai_tools(self, ...) -> list[dict[str, Any]]:
    """OpenAI function-calling 포맷으로 변환."""
```

> Cross-LLM 검증에서 Anthropic과 OpenAI 양쪽에 동일한 도구를 제공해야 합니다. 하나의 레지스트리에서 두 포맷을 생성하므로 도구 정의의 정합성이 보장됩니다. Anthropic 포맷에서는 `additionalProperties: false`가 자동 삽입되어 strict mode를 만족시킵니다.

### 4.3 Deferred Loading -- ALWAYS_LOADED + tool_search

합산 도구 수가 15개를 초과하면 `to_anthropic_tools_with_defer()`가 활성화됩니다.

```python
# core/tools/registry.py — ToolRegistry
ALWAYS_LOADED_TOOLS: frozenset[str] = frozenset({
    "show_help", "check_status", "run_bash", "delegate_task",
    "web_fetch", "general_web_search", "note_save", "note_read", "memory_search",
})

def to_anthropic_tools_with_defer(self, *, defer_threshold: int | None = None,
                                   mcp_tools: list[dict] | None = None, ...) -> list[dict]:
    if defer_threshold is None:
        defer_threshold = settings.tool_defer_threshold  # 기본 15

    # Native + MCP 합류 (이름 기반 중복 제거)
    all_tools = list(native_tools) + deduplicated_mcp_tools

    if len(all_tools) <= defer_threshold:
        return all_tools  # 임계 이하: 전체 스키마 즉시 전송

    # 코어 도구(9개)는 항상 전체 스키마 유지, 나머지만 defer
    always_loaded = [t for t in all_tools if t["name"] in ALWAYS_LOADED_TOOLS]
    deferred = [dict(t, defer_loading=True) for t in rest]
    return [tool_search, *always_loaded, *deferred]
```

> 이전 구현은 모든 도구를 무차별 defer했지만, 현재는 **ALWAYS_LOADED 9개 + tool_search 메타 도구**가 항상 전체 스키마로 제공됩니다. `tool_search`는 native와 MCP 양쪽을 통합 검색하며, 매칭 실패 시 전체 도구 요약을 반환합니다. 임계값은 `settings.tool_defer_threshold`로 환경변수 오버라이드가 가능합니다.

### 4.4 3중 소스 합류 -- AgenticLoop

```python
# core/cli/agentic_loop.py
def get_agentic_tools(registry: ToolRegistry | None = None,
                      *, mcp_tools: list[dict] | None = None) -> list[dict]:
    tools = list(_BASE_TOOLS)               # 소스 1: definitions.json (40+개)
    if registry:
        existing_names = {t["name"] for t in tools}
        for tool_def in registry.to_anthropic_tools():   # 소스 2: ToolRegistry (14개)
            if tool_def["name"] not in existing_names:
                tools.append(tool_def)

    # 소스 3: MCP (동적)
    if mcp_tools:
        existing_names = {t["name"] for t in tools}
        for mcp_tool in mcp_tools:
            if mcp_tool.get("name") not in existing_names:
                tools.append(mcp_tool)

    # Deferred Loading 적용 (임계치 초과 시)
    if len(tools) > settings.tool_defer_threshold:
        tools = _apply_defer_loading(tools)
    return tools
```

> 이름 기반 중복 방지로 세 소스를 안전하게 합류시킵니다. 정적 정의 > 레지스트리 > MCP 순서로 우선권을 가집니다. 합류 후 총 도구 수가 임계치(기본 15)를 초과하면 Deferred Loading이 자동 적용됩니다.

### 4.5 ToolExecutor -- HITL Safety Gate (요약)

확장성 레이어에서 동적으로 추가된 도구(MCP, Registry)를 포함한 모든 도구 호출은 ToolExecutor를 통해 디스패치됩니다. 5-tier 안전 분류(SAFE/STANDARD/DANGEROUS/WRITE/EXPENSIVE)와 Permission System(deny→ask→allow glob), WorkflowGuard(commit/push/merge 규칙)가 순차적으로 적용됩니다.

```
도구 호출 → PermissionEvaluator → WorkflowGuard → Safety Gate → Dispatch
                                                                   │
                                                     Handler → MCP → Registry
```

> MCP 도구는 **서버당 1회 세션 승인** 모델을 따릅니다. 읽기 전용 서버(`brave-search`, `steam`, `arxiv`, `linkedin-reader`)는 첫 호출부터 자동 승인됩니다. ToolExecutor의 전체 아키텍처는 [Tool Registry 7-Layer Architecture](tool-registry-policy-chain-lazy-loading.md) 7장에서 상세히 다룹니다.

---

## 5. Policy Chain -- 모드별 접근 제어

### 5.1 ToolPolicy -- 단일 정책 규칙

```python
# core/tools/policy.py
@dataclass
class ToolPolicy:
    name: str
    mode: str           # "dry_run", "evaluation", "*" (전체)
    priority: int = 100  # 낮을수록 높은 우선순위
    allowed_tools: set[str] = field(default_factory=set)   # 화이트리스트
    denied_tools: set[str] = field(default_factory=set)    # 블랙리스트
```

> `allowed_tools`가 설정되면 화이트리스트 모드로 동작하며, `denied_tools`보다 우선합니다.

### 5.2 PolicyChain -- AND 결합

```python
# core/tools/policy.py
class PolicyChain:
    def filter_tools(self, tool_names: list[str], *, mode: str) -> list[str]:
        applicable = [p for p in self._policies if p.mode in (mode, "*")]
        result = []
        for name in tool_names:
            if all(p.is_allowed(name) for p in applicable):
                result.append(name)
        return result
```

> 도구가 허용되려면 해당 모드에 적용되는 **모든** 정책을 통과해야 합니다. 하나라도 거부하면 차단됩니다. 이 AND 결합이 안전 기본값을 보장합니다.

### 5.3 기본 정책 -- dry_run 비용 방어

```python
# core/runtime.py — _build_default_policies()
chain = PolicyChain()
chain.add_policy(ToolPolicy(
    name="dry_run_block_llm",
    mode="dry_run",
    denied_tools={"run_analyst", "run_evaluator", "send_notification"},
))
chain.add_policy(ToolPolicy(
    name="full_block_notification",
    mode="full_pipeline",
    denied_tools={"send_notification"},
))
```

> dry_run 모드에서 LLM 비용이 발생하는 도구를 원천 차단합니다. `send_notification`은 full_pipeline에서도 명시적 요청 시에만 허용됩니다.

### 5.4 NodeScopePolicy -- 노드 격리

```python
# core/tools/policy.py
NODE_TOOL_ALLOWLISTS: dict[str, list[str]] = {
    "analyst":     ["memory_search", "memory_get"],
    "evaluator":   ["memory_search", "memory_get"],
    "scoring":     ["memory_search"],
    "synthesizer": ["memory_search", "memory_get"],
}
```

> 각 파이프라인 노드는 **최소한의 도구만** 사용할 수 있습니다. 4개 노드 모두 `memory_search`만 공통 허용되며, 노드별 외부 도구 접근은 차단됩니다. `analyst_game_mechanics`는 `analyst` 접두사 매칭으로 analyst 화이트리스트가 적용됩니다. 노드가 경계를 넘는 도구를 호출하면 조용히 필터링됩니다.

### 5.5 감사 추적

```python
# core/tools/policy.py — PolicyChain
def audit_check(self, tool_name: str, *, mode: str, user: str = "") -> PolicyAuditResult:
    """정책 평가 체인 전체를 추적합니다."""
    # PolicyAuditResult에 각 정책의 허용/거부 판정을 기록
```

> 프로덕션 환경에서 "왜 이 도구가 차단되었는가"를 추적할 수 있습니다. `blocking_policies` 프로퍼티로 거부한 정책 이름을 즉시 확인합니다.

---

## 6. 동적 등록 -- /skills add x /mcp add

v0.9.0에서 추가된 핵심 기능은 런타임 중 스킬과 MCP 서버를 등록하는 동적 커맨드입니다.

### 6.1 /skills add

```python
# core/cli/commands.py — _skills_add()
def _skills_add(reg, raw: str) -> None:
    src = Path(path_str).expanduser().resolve()
    # 1. SKILL.md 파일 검증
    # 2. .claude/skills/<name>/ 디렉토리에 복사
    shutil.copy2(src, dest)
    # 3. 파싱 후 레지스트리에 등록
    skill = loader.load_file(dest)
    reg.register(skill)
```

흐름:

```
/skills add /path/to/my-skill/SKILL.md
    │
    ├── 파일 존재 + SKILL.md 이름 검증
    ├── .claude/skills/<parent-dir-name>/ 에 복사
    ├── SkillLoader.load_file()로 파싱
    ├── SkillRegistry.register()로 등록
    └── 트리거 키워드 표시
```

### 6.2 /mcp add

```python
# core/cli/commands.py — _mcp_add()
def _mcp_add(mgr, raw: str) -> None:
    name = parts[0]
    command = parts[1]
    cmd_args = parts[2:]
    # MCPServerManager.add_server() → config 파일에 영속화
    mgr.add_server(name, command, args=cmd_args)
```

```python
# core/infrastructure/adapters/mcp/manager.py — MCPServerManager.add_server()
def add_server(self, name, command, args=None, env=None) -> bool:
    self._servers[name] = entry
    # .claude/mcp_servers.json에 즉시 영속화
    self._config_path.write_text(json.dumps(self._servers, indent=2))
    return True
```

> add_server()는 메모리 등록과 파일 영속화를 한 번에 수행합니다. 다음 실행 시에도 설정이 유지됩니다.

### 6.3 refresh_tools() -- Hot Reload

```python
# core/cli/agentic_loop.py — AgenticLoop
def refresh_tools(self) -> int:
    """MCP 도구를 다시 로드합니다. 새로 추가된 도구 수를 반환합니다."""
    existing = {t["name"] for t in self._tools}
    added = 0
    for tool in self._mcp_manager.get_all_tools():
        if tool.get("name") not in existing:
            self._tools.append(tool)
            added += 1
    return added
```

> MCP 서버를 추가한 뒤 `refresh_tools()`를 호출하면, AgenticLoop를 재생성하지 않고도 새 도구가 즉시 사용 가능해집니다.

---

## 7. 통합 -- 확장성 레이어가 하네스에서 하는 역할

### 7.1 AgenticLoop의 3중 통합

AgenticLoop는 Skills, MCP, ToolRegistry를 하나의 실행 루프에서 통합합니다.

```
┌─────────────────────────────────────────────────────┐
│  AgenticLoop                                         │
│                                                      │
│  _build_system_prompt()                              │
│    ├── base system prompt                            │
│    ├── {skill_context} ← SkillRegistry.get_context() │
│    └── + AGENTIC_SUFFIX                              │
│                                                      │
│  self._tools (합류 순서)                              │
│    ├── [1] definitions.json (정적 20개)               │
│    ├── [2] ToolRegistry.to_anthropic_tools() (22개)   │
│    └── [3] MCPServerManager.get_all_tools() (동적)    │
│                                                      │
│  while stop_reason == "tool_use":                    │
│    ├── LLM API 호출 (tools=self._tools)              │
│    ├── ToolExecutor.execute(tool_name, input)        │
│    └── 결과 피드백 → 다음 라운드                       │
└─────────────────────────────────────────────────────┘
```

```python
# core/cli/agentic_loop.py — AgenticLoop._build_system_prompt()
def _build_system_prompt(self) -> str:
    base = _build_system_prompt()
    skill_ctx = ""
    if self._skill_registry is not None:
        skill_ctx = self._skill_registry.get_context_block()
    base = base.replace("{skill_context}", skill_ctx or "No skills loaded.")
    return base + "\n" + AGENTIC_SUFFIX
```

### 7.2 GeodeRuntime DI -- 컴포넌트 배선

GeodeRuntime.create()가 모든 인프라 컴포넌트를 조립합니다. 확장성 관련 배선은 다음과 같습니다.

```python
# core/runtime.py — ReodeRuntime.create() 발췌
policy_chain = _build_default_policies()      # PolicyChain (2 기본 정책)
tool_registry = _build_default_registry()     # ToolRegistry (14 도구)
prompt_assembler = cls._build_prompt_assembler(hooks=hooks)  # SkillRegistry 포함
```

`_build_default_registry()`가 등록하는 14개 도구의 구성은 다음과 같습니다.

| 카테고리 | 도구 수 | 대표 도구 |
|---------|---------|----------|
| Memory | 7 | memory_search, memory_get, memory_save, rule_create/update/delete/list |
| Output | 3 | generate_report, export_json, send_notification |
| Editing | 3 | str_replace_editor, write_file, insert_text |
| Meta | 1 | tool_search (deferred loading 지원) |

> 이 14개 Registry 도구에 `definitions.json`의 40+개 정적 도구와 MCP 동적 도구가 합류하여 AgenticLoop의 전체 도구셋을 구성합니다. ToolExecutor는 Handler → MCP → Registry 순서로 fallback 디스패치합니다.

### 7.3 두 SkillRegistry 비교

GEODE에는 이름이 같은 두 SkillRegistry가 존재합니다. 역할이 다릅니다.

| 항목 | extensibility SkillRegistry | llm SkillRegistry |
|------|---------------------------|-------------------|
| 위치 | `core/extensibility/skills.py` | `core/llm/skill_registry.py` |
| 모델 | `SkillDefinition(BaseModel)` | `SkillDefinition(dataclass, frozen)` |
| 발견 경로 | `.claude/skills/*/SKILL.md` | 4-priority: .claude/skills, ./skills, ~/.geode/skills, extra |
| 용도 | CLI /skills 명령, 시스템 프롬프트 컨텍스트 블록 | PromptAssembler ADR-007, 노드별 프롬프트 주입 |
| 매칭 | 트리거 키워드 텍스트 매칭 | node + type + role 필터링 |
| 주입 대상 | AgenticLoop system prompt | 개별 노드(analyst, evaluator, synthesizer) 프롬프트 |

extensibility 쪽은 CLI 레벨의 컨텍스트 주입(사용자 대화에 스킬 정보 제공), llm 쪽은 파이프라인 노드 레벨의 프롬프트 주입(각 분석가/평가자에게 도메인 지식 제공)을 담당합니다.

### 7.4 Plugin 생명주기

```python
# core/extensibility/plugins.py
class PluginState(StrEnum):
    INSTALLED = "installed"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"

# 유효 전이: INSTALLED → ACTIVE/INACTIVE, ACTIVE → INACTIVE/ERROR, ...
```

Plugin은 install/activate/deactivate/uninstall 4단계 생명주기를 가집니다. 의존성 검사(`dependencies` 필드)를 load 시 수행하며, 역의존성이 있으면 unload를 거부합니다. Skills가 "지식 확장"이라면 Plugin은 "동작 확장"입니다.

---

## 8. 설계 원천 (Design Origin)

각 컴포넌트의 설계 원천을 매핑합니다.

| 컴포넌트 | 원천 | 변환 |
|---------|------|------|
| SkillLoader | OpenClaw Skill Loader | TypeScript 4-priority glob → Python Path.glob + YAML frontmatter |
| PolicyChain | OpenClaw 6-layer Policy Resolution | 6계층 → 2계층(mode + node), TypeScript → Python dataclass |
| Plugin | OpenClaw Channel/Tool Plugin | Channel Plugin ABC → Python Plugin ABC + StrEnum 상태머신 |
| ToolRegistry | OpenClaw createOpenClawTools + Anthropic tool_use | Policy 필터 + 이중 포맷 + ALWAYS_LOADED defer + category/cost_tier 메타데이터 |
| ToolExecutor | Claude Code permission model | 5-tier HITL safety gate + deny→ask→allow glob + WorkflowGuard |
| MCP stdio | Anthropic MCP 표준 (2024-11-05) | JSON-RPC subprocess 통신, 31개 카탈로그 + 가중치 검색 |
| Skills 주입 | Claude Code system prompt 패턴 | `{skill_context}` 플레이스홀더 + 8000자 상한 |

**변환 원칙**:

1. **충실한 이식**: 원천의 핵심 계약(interface)을 보존합니다. ToolPolicy의 allowed/denied 이중 필터, SkillLoader의 4-priority 탐색 순서가 그 예입니다.
2. **Python 관용구**: TypeScript의 런타임 타입 검사를 Python Protocol + `@runtime_checkable`로 대체합니다. Zod 스키마 대신 Pydantic BaseModel을 사용합니다.
3. **필요 최소 적응**: OpenClaw의 6계층 Policy를 2계층(mode + node)으로 줄인 것처럼, 도메인에 불필요한 복잡성은 제거합니다.

---

## 9. 마무리

L6 Extensibility 레이어의 핵심을 정리합니다.

**Skills**: YAML frontmatter + Markdown body로 도메인 지식을 파일 단위로 관리합니다. 트리거 키워드 매칭으로 자동 활성화되며, 8,000자 상한의 컨텍스트 블록으로 시스템 프롬프트에 주입됩니다.

**MCP**: 31개 카탈로그 + 가중치 검색으로 서버를 발견하고, StdioMCPClient의 3단계 핸드셰이크로 연결합니다. `${VAR}` 환경변수 치환으로 비밀키를 안전하게 관리합니다.

**Tool Registry**: Tool Protocol로 계약을 정의하고, 3중 소스(정적 JSON 40+개, 런타임 등록 14개, MCP 동적)에서 도구를 수집합니다. ALWAYS_LOADED 9개 코어 도구를 보장하는 Deferred Loading(임계 15), 이중 포맷 변환(Anthropic/OpenAI), 5-tier HITL safety gate, deny→ask→allow Permission System, WorkflowGuard까지 7개 레이어로 도구의 등록부터 안전한 실행까지 관리합니다.

**Policy Chain**: AND 결합으로 모든 정책을 통과해야 도구가 허용됩니다. dry_run 비용 방어와 NodeScopePolicy 노드 격리를 기본 제공합니다.

**동적 등록**: `/skills add`와 `/mcp add`로 재시작 없이 역량을 확장합니다. `refresh_tools()` hot-reload로 AgenticLoop에 즉시 반영됩니다.

### 확장성 체크리스트

- [ ] 새 도메인 지식 추가 시 코드 수정 없이 SKILL.md 파일 추가만으로 가능한가
- [ ] 새 외부 도구 필요 시 `/mcp add`로 런타임에 등록 가능한가
- [ ] dry_run 모드에서 LLM 비용 발생 도구가 차단되는가
- [ ] 각 노드가 허용된 도구만 사용하는가 (NodeScopePolicy)
- [ ] 도구 차단 사유를 audit_check()로 추적할 수 있는가
- [ ] Deferred Loading으로 도구 수 증가 시에도 토큰 예산이 관리되는가
- [ ] ALWAYS_LOADED 9개 코어 도구가 defer에서 면제되는가
- [ ] MCP 도구가 ToolExecutor의 서버별 세션 승인을 거치는가
- [ ] Permission System이 MCP/Registry 도구에도 적용되는가

---

*Source: `blog/posts/tools-mcp/16-extensibility-skills-mcp-tool-registry.md` | Category: [[blog-tools-mcp]]*

## Related

- [[blog-tools-mcp]]
- [[blog-hub]]
- [[geode]]
- [[geode-tool-system]]
