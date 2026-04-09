---
title: "PolicyChain 6-Layer 접근 제어 — 자율 에이전트의 도구 권한 아키텍처"
type: reference
category: blog-post
tags: [blog, safety-verification]
source: "blog/posts/safety-verification/57-policychain-6layer-access-control.md"
created: 2026-04-08T00:00:00Z
---

# PolicyChain 6-Layer 접근 제어 — 자율 에이전트의 도구 권한 아키텍처

> Date: 2026-04-05 | Author: geode-team | Tags: [policychain, access-control, hitl, sandbox, session-mode, tool-safety, sub-agent]

## 목차

1. [도입 — 왜 6계층인가](#1-도입--왜-6계층인가)
2. [PolicyChain 아키텍처 개요](#2-policychain-아키텍처-개요)
3. [Layer 1-2: Profile + Org — 정적 정책](#3-layer-1-2-profile--org--정적-정책)
4. [Layer 3: Mode — 실행 컨텍스트별 제한](#4-layer-3-mode--실행-컨텍스트별-제한)
5. [Layer 4: Agent-Level — HITL Safety Gate](#5-layer-4-agent-level--hitl-safety-gate)
6. [Layer 5-6: Node Scope + SubAgent — 런타임 격리](#6-layer-5-6-node-scope--subagent--런타임-격리)
7. [Path Sandbox — 파일 시스템 경계](#7-path-sandbox--파일-시스템-경계)
8. [SessionMode와 PolicyChain의 상호작용](#8-sessionmode와-policychain의-상호작용)
9. [A=Always 세션 승인과 그 범위](#9-aalways-세션-승인과-그-범위)
10. [실전 사례: IPC 모드 외부 경로 차단](#10-실전-사례-ipc-모드-외부-경로-차단)
11. [설계 트레이드오프](#11-설계-트레이드오프)
12. [정리](#12-정리)

---

## 1. 도입 — 왜 6계층인가

자율 에이전트가 도구를 사용할 때 단일 안전 게이트로는 부족합니다. [HITL 보안 강화 포스트](25-hitl-hardening-security-audit.md)에서 서브에이전트의 `auto_approve=True`가 모든 안전 경계를 무력화한 사례를 다뤘습니다. 그때 3단계 분류(SAFE/STANDARD/DANGEROUS)를 WRITE 추가로 4단계로 확장했지만, 근본적인 한계가 남아있었습니다.

**누가** 실행하는가(사용자 vs 스케줄러 vs 서브에이전트), **어떤 맥락**에서 실행하는가(파이프라인 모드, 노드 위치), **어디까지** 접근할 수 있는가(파일 시스템 경계) — 이 세 축을 동시에 제어해야 합니다.

OpenClaw의 Policy Chain 패턴에서 영감을 받아, GEODE는 6계층 정책 해소 체인으로 이를 해결합니다:

```
Priority 5   ┃ L2 Org      ┃ 조직 전체 차단 (최우선)
Priority 10  ┃ L1 Profile  ┃ 사용자 선호
Priority 100 ┃ L3 Mode     ┃ 실행 컨텍스트 (dry_run, full_pipeline)
Runtime      ┃ L4 Agent    ┃ HITL Safety Gate (DANGEROUS/WRITE/EXPENSIVE)
Runtime      ┃ L5 Node     ┃ 파이프라인 노드별 허용 목록
Runtime      ┃ L6 SubAgent ┃ 서브에이전트 격리
```

낮은 Priority 숫자 = 높은 우선순위입니다. 도구가 **모든** 적용 가능한 정책을 통과해야 실행됩니다. 하나라도 차단하면 실행 불가.

---

## 2. PolicyChain 아키텍처 개요

### 핵심 데이터 구조

```python
# core/tools/policy.py
@dataclass
class ToolPolicy:
    name: str                           # 정책 이름
    mode: str = "*"                     # 적용 모드 ("*" = 전체)
    allowed_tools: set[str] | None      # 화이트리스트 (설정 시 이것만 허용)
    denied_tools: set[str] | None       # 블랙리스트 (이것만 차단)
    priority: int = 100                 # 낮을수록 우선
```

### 해소 로직

```python
class PolicyChain:
    def filter_tools(self, tool_names: list[str], mode: str) -> list[str]:
        applicable = [p for p in self._policies if p.mode in (mode, "*")]
        result = set(tool_names)
        for policy in applicable:
            if policy.allowed_tools is not None:
                result &= policy.allowed_tools    # 교집합
            if policy.denied_tools is not None:
                result -= policy.denied_tools      # 차집합
        return [t for t in tool_names if t in result]
```

`allowed_tools`(화이트리스트)와 `denied_tools`(블랙리스트) 모두 설정된 경우, 화이트리스트가 우선합니다. 도구는 먼저 화이트리스트에 포함되어야 하고, 그다음 블랙리스트에 없어야 합니다.

---

## 3. Layer 1-2: Profile + Org — 정적 정책

### L1: Profile Policy (Priority 10)

사용자 개인 선호를 `~/.geode/user_profile/preferences.toml`에 정의합니다:

```toml
[policy]
allow_expensive = false      # 비용 발생 도구 차단
allow_write = true           # 쓰기 도구 허용
allow_dangerous = false      # bash 차단 (기본값)
denied_tools = ["send_notification"]
```

`allow_dangerous = false`이면 `run_bash`가 차단됩니다. `allow_expensive = false`이면 `analyze_ip`, `batch_analyze`, `compare_ips`가 차단됩니다.

### L2: Org Policy (Priority 5 — 최우선)

조직 수준 제한은 `.geode/config.toml`에 정의합니다:

```toml
[policy.org]
org_id = "nexon"
denied_tools = ["run_bash", "set_api_key"]
```

Org 정책은 Priority 5(가장 높음)로 Profile과 Mode 정책을 모두 오버라이드합니다. 개인이 `allow_dangerous = true`로 설정해도 Org에서 `run_bash`를 차단하면 실행 불가합니다.

### 조합 규칙

```
build_6layer_chain() 조립 순서:
1. Org policies  → chain.add_policy(priority=5)
2. Profile       → chain.add_policy(priority=10)
3. Mode          → chain.add_policy(priority=100)

평가 시: 모든 applicable 정책에서 AND 조건으로 필터링
```

---

## 4. Layer 3: Mode — 실행 컨텍스트별 제한

파이프라인 실행 모드에 따라 도구 접근이 달라집니다:

```python
# core/runtime_wiring/infra.py
mode_policies = [
    ToolPolicy(
        name="dry_run_block_llm",
        mode="dry_run",
        denied_tools={"run_analyst", "run_evaluator", "send_notification"},
        priority=100,
    ),
    ToolPolicy(
        name="full_block_notification",
        mode="full_pipeline",
        denied_tools={"send_notification"},
        priority=100,
    ),
]
```

| Mode | 차단 도구 | 용도 |
|------|-----------|------|
| `dry_run` | LLM 도구 + notification | 비용 없는 테스트 |
| `full_pipeline` | notification | 정상 실행 |
| `*` (와일드카드) | 정책별 상이 | 모든 모드 적용 |

Mode 정책은 Priority 100(가장 낮음)으로, Org/Profile에 의해 오버라이드될 수 있습니다.

---

## 5. Layer 4: Agent-Level — HITL Safety Gate

PolicyChain(L1-L3)을 통과한 도구는 ToolExecutor의 런타임 안전 게이트를 만납니다.

### 도구 분류 4단계

```python
# core/agent/safety_constants.py

SAFE_TOOLS = frozenset({                    # 읽기 전용 — 확인 불필요
    "list_ips", "search_ips", "show_help", "memory_search",
    "web_fetch", "general_web_search", "glob_files", "grep_files", ...
})

WRITE_TOOLS = frozenset({                   # 상태 변경 — 승인 필요
    "memory_save", "note_save", "set_api_key", "manage_auth",
    "edit_file", "write_file", "profile_update", ...
})

DANGEROUS_TOOLS = frozenset({               # 시스템 접근 — 항상 승인
    "run_bash"
})

EXPENSIVE_TOOLS = {                         # 비용 발생 — 비용 확인
    "analyze_ip": 1.50,
    "batch_analyze": 5.00,
    "compare_ips": 3.00,
}
```

### HITL Level 3단계

| Level | 이름 | DANGEROUS | WRITE | EXPENSIVE | 사용처 |
|-------|------|-----------|-------|-----------|--------|
| 0 | autonomous | skip | skip | skip | DAEMON, SCHEDULER |
| 1 | write-only | skip | prompt | skip | (미사용) |
| 2 | full | prompt | prompt | prompt | REPL, IPC |

### 안전 게이트 실행 순서

```
execute(tool_name, tool_input)
  │
  ├─ DANGEROUS? ──yes──→ _request_approval() ──denied──→ 거부
  │                                           └─approved─→ 실행
  ├─ WRITE? ──yes──→ hitl=0? ──yes──→ 자동 승인
  │                  └─no──→ "write" in always? ──yes──→ 자동 승인
  │                          └─no──→ _confirm_write() ──denied──→ 거부
  │                                                     └─approved─→ 실행
  ├─ EXPENSIVE? ──yes──→ hitl=0? ──yes──→ 자동 승인
  │                      └─no──→ _confirm_cost() ──denied──→ 거부
  │                                                └─approved─→ 실행
  └─ STANDARD ──→ 즉시 실행
```

### Bash 특수 처리

`run_bash`는 DANGEROUS이지만, 읽기 전용 명령어는 안전한 것으로 분류됩니다:

```python
SAFE_BASH_PREFIXES = frozenset({
    "cat", "head", "tail", "ls", "pwd", "echo", "wc",
    "grep", "rg", "find", "which", "date", "git status",
    "git log", "git diff", "gh pr", ...
})
```

단, 리다이렉트(`>`), 파이프(`|`), 체이닝(`;`, `&&`)이 포함되면 안전하지 않은 것으로 판정됩니다.

---

## 6. Layer 5-6: Node Scope + SubAgent — 런타임 격리

### L5: Node Scope Policy

파이프라인 노드별로 사용 가능한 도구를 제한합니다:

```python
NODE_TOOL_ALLOWLISTS = {
    "analyst":      ["memory_search", "memory_get", "query_monolake"],
    "evaluator":    ["memory_search", "memory_get", "steam_info",
                     "reddit_sentiment", "web_search"],
    "scoring":      ["memory_search", "psm_calculate"],
    "synthesizer":  ["memory_search", "memory_get", "explain_score"],
    "verification": ["memory_search", "memory_get"],
}
```

이 접두사 매칭(`analyst_game_mechanics` -> `analyst`)으로, 파이프라인 내 각 노드는 자신의 역할에 필요한 도구만 접근합니다. 앵커링 방지를 위한 Clean Context 원칙의 도구 버전입니다.

### L6: SubAgent Denied Tools

서브에이전트는 부모의 도구를 상속하지만, 민감한 도구는 명시적으로 차단됩니다:

```python
# core/agent/sub_agent.py
SUBAGENT_DENIED_TOOLS = {
    "set_api_key",              # 인증 정보 변경 — 부모만 허용
    "manage_auth",              # 인증 프로필 관리
    "profile_update",           # 사용자 프로필 변경
    "calendar_create_event",    # 외부 시스템 변경
    "calendar_sync_scheduler",  # 외부 시스템 변경
    "delegate_task",            # 재귀적 위임 — max_depth=1 강제
}
```

서브에이전트가 `delegate_task`를 호출할 수 없으므로 재귀 깊이가 1로 강제됩니다. 이는 OpenClaw의 Sub-agent Spawn+Announce 패턴에서 도출한 설계입니다.

---

## 7. Path Sandbox — 파일 시스템 경계

PolicyChain과 별개로, 파일 도구(glob, grep, edit, write, read)에는 프로젝트 디렉토리 샌드박스가 적용됩니다:

```python
# core/tools/file_tools.py
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

def _check_sandbox(path: Path) -> str | None:
    if path.is_symlink():
        return f"Symlinks not allowed: {path}"
    resolved = path.resolve()
    try:
        resolved.relative_to(_PROJECT_ROOT)
    except ValueError:
        return f"Access denied: path outside project directory ({_PROJECT_ROOT})"
    return None
```

### 검증 순서

1. **심링크 차단** — 디렉토리 트래버설 공격 방지
2. **절대 경로 해소** — `../` 등 상대 경로를 정규화
3. **`_PROJECT_ROOT` 포함 여부** — `relative_to()` 실패 시 접근 거부

### 적용 범위

| 도구 | 샌드박스 적용 |
|------|--------------|
| `glob_files` | O |
| `grep_files` | O |
| `edit_file` | O |
| `write_file` | O |
| `read_document` | O |
| `run_bash` | X (별도 HITL 승인으로 제어) |

`run_bash`는 샌드박스 대상이 아닙니다. 대신 DANGEROUS 분류로 매번 HITL 승인을 받습니다. bash를 통해 `cat ../외부파일`을 실행하면 샌드박스를 우회할 수 있지만, 이는 사용자가 명시적으로 승인한 것이므로 허용됩니다.

### 에러 형태

```
✗ write_file — Access denied: path outside project directory (/Users/mango/workspace/geode) (43.1s)
```

`error_type="permission"`, `recoverable=False` — LLM에게 재시도 불가임을 알립니다.

---

## 8. SessionMode와 PolicyChain의 상호작용

GEODE의 4가지 실행 모드는 PolicyChain과 HITL을 다르게 결합합니다:

```python
# core/gateway/shared_services.py
class SessionMode(StrEnum):
    REPL = "repl"          # 직접 터미널
    IPC = "ipc"            # thin CLI (Unix socket)
    DAEMON = "daemon"      # Slack/Discord 폴러
    SCHEDULER = "scheduler"  # 예약 실행
```

### 모드별 권한 매트릭스

| | REPL | IPC | DAEMON | SCHEDULER |
|---|---|---|---|---|
| **hitl_level** | 2 (full) | 2 (full) | 0 (autonomous) | 0 (autonomous) |
| **run_bash** | O (승인 필요) | O (IPC 중계) | X (핸들러 제거) | X (핸들러 제거) |
| **delegate_task** | O | O | X (핸들러 제거) | X (핸들러 제거) |
| **write tools** | O (승인 필요) | O (IPC 중계) | O (자동 승인) | O (자동 승인) |
| **time_budget** | 무제한 | 무제한 | 120s | 300s |
| **Path Sandbox** | O | O | O | O |

### Headless 모드 차단

DAEMON/SCHEDULER는 사용자가 없으므로(headless), 승인이 필요한 DANGEROUS 도구를 아예 핸들러에서 제거합니다:

```python
_HEADLESS_DENIED_TOOLS = frozenset({"run_bash", "delegate_task"})

if mode in (SessionMode.SCHEDULER, SessionMode.DAEMON):
    handlers = {k: v for k, v in handlers.items()
                if k not in _HEADLESS_DENIED_TOOLS}
```

IPC 모드는 headless가 **아닙니다**. thin CLI 클라이언트가 Unix socket을 통해 HITL 승인 요청을 중계하므로, 사용자 승인이 가능합니다. 단, 120초 타임아웃이 적용되며 타임아웃 시 자동 거부(`"n"`)됩니다.

---

## 9. A=Always 세션 승인과 그 범위

HITL 프롬프트에서 `A`(Always)를 선택하면, 해당 **카테고리**의 모든 도구가 세션 동안 자동 승인됩니다:

```python
# tool_executor.py
if response == "a":
    self._always_approved_categories.add("write")  # 세션 동안 모든 write 도구 승인
```

### 카테고리 종류

| 카테고리 | 범위 | 트리거 |
|----------|------|--------|
| `"write"` | memory_save, note_save, edit_file 등 전체 | Write 도구 승인 시 |
| `"bash"` | 모든 bash 명령어 | Bash 승인 시 |
| `"cost"` | analyze_ip, batch_analyze 등 전체 | 비용 확인 승인 시 |
| `"mcp:<server>"` | 특정 MCP 서버의 모든 도구 | MCP 도구 승인 시 |

### 범위 제한

- **세션 스코프**: ToolExecutor 인스턴스 변수에 저장. 세션 종료 시 초기화됩니다.
- **카테고리 단위**: 개별 도구가 아닌 카테고리 전체에 적용됩니다. `memory_save`에 Always를 선택하면 `edit_file`도 자동 승인됩니다(둘 다 `"write"` 카테고리).
- **크로스 세션 불가**: 다음 세션에서는 다시 승인이 필요합니다.

### 스레드 안전성

```python
self._approval_lock = threading.Lock()
self._always_approved_categories: set[str] = set()
```

`_approval_lock`으로 서브에이전트 병렬 실행 시에도 안전합니다. 다만 소켓 수준의 `request_approval()` 읽기는 스레드 안전하지 않으므로, 동일 소켓에서 동시 승인 요청은 피해야 합니다.

---

## 10. 실전 사례: IPC 모드 외부 경로 차단

### 상황 재현

```
⠴ write_file(file_path="../resume/lilysai/product-maker/cover_letter.md")

  Write tool requires approval
  Tool: write_file
  ⠋ write_file(file_path="../resume/lilysai/product-maker/cove...)
  ✗ write_file — Access denied: path outside project directory
    (/Users/mango/workspace/geode) (43.1s)
```

### 차단 경로 분석

```
AgenticLoop (IPC 모드, hitl_level=2)
  └─ LLM → tool_use: write_file(path="../resume/...")
      └─ ToolExecutor._apply_safety_gates()
          └─ write_file ∈ WRITE_TOOLS → _confirm_write()
              └─ IPC approval relay → 사용자 "A" → 승인
                  └─ WriteFileTool.execute()
                      └─ _check_sandbox("../resume/...")
                          └─ resolve → /Users/mango/workspace/resume/...
                              └─ relative_to(/Users/.../geode) → ValueError
                                  └─ "Access denied: path outside project"
```

**HITL 승인을 통과했지만 Path Sandbox에서 차단**됩니다. 이 두 계층은 독립적으로 작동합니다:
- HITL: "이 도구를 실행해도 되는가?" (사용자 의도 확인)
- Sandbox: "이 경로에 접근해도 되는가?" (시스템 경계 강제)

사용자가 A(Always)로 승인해도 프로젝트 외부 경로는 접근할 수 없습니다.

### 해결 방법

1. **프로젝트 내부 경로 사용**: `./tmp/cover_letter.md` 등 프로젝트 내부에 작성
2. **run_bash 사용**: `run_bash("cp ./tmp/cover_letter.md ../resume/...")`는 별도 HITL 승인으로 실행 가능 (bash는 샌드박스 대상 아님)
3. **해당 디렉토리에서 작업**: 다른 프로젝트에서 GEODE를 실행

---

## 11. 설계 트레이드오프

### 안전성 vs 자율성

| 선택 | 근거 |
|------|------|
| Org가 Profile을 오버라이드 | 조직 보안 정책은 개인 편의보다 우선 |
| Headless에서 bash 핸들러 제거 | hitl_level=0 + run_bash = 무제한 시스템 접근 |
| Path Sandbox와 HITL 독립 | 사용자 승인이 시스템 경계를 무력화해서는 안 됨 |
| A=Always가 카테고리 단위 | 개별 도구 단위보다 UX 개선, 보안은 세션 스코프로 보상 |
| Bash가 Sandbox 대상 아님 | bash의 능력을 제한하면 도구 유용성이 크게 감소. 대신 HITL 승인으로 보상 |

### 마스터 오버라이드 부재

PolicyChain에는 "모든 것을 허용" 스위치가 **없습니다**. 정책을 해제하려면:
- 개별 정책을 `remove_policy(name)`으로 제거하거나
- HITL 프롬프트에서 A=Always를 선택하거나
- 설정 파일을 직접 수정해야 합니다

이는 Karpathy P1 원칙(CANNOT이 CAN보다 먼저)의 적용입니다.

### 알려진 한계

1. **Sandbox 우회**: `run_bash`를 통한 외부 파일 접근은 가능 (의도된 설계)
2. **MCP 도구 분류 부재**: MCP 도구는 SAFE/WRITE/DANGEROUS 자동 분류가 없어, 서버 단위로만 승인 제어
3. **세션 간 Always 비전파**: 매 세션마다 재승인 필요 (UX 비용 vs 보안 이점)

---

## 12. 정리

### 6계층 정책 해소 체인

```
         ┌─────────────────────────────────────────────────────┐
         │                   도구 실행 요청                      │
         └────────────────────┬────────────────────────────────┘
                              │
         ┌────────────────────▼────────────────────────────────┐
  L2     │  Org Policy (priority=5)                            │
         │  조직 전체 denied_tools 확인                          │
         └────────────────────┬────────────────────────────────┘
                              │ 통과
         ┌────────────────────▼────────────────────────────────┐
  L1     │  Profile Policy (priority=10)                       │
         │  allow_dangerous / allow_write / allow_expensive    │
         └────────────────────┬────────────────────────────────┘
                              │ 통과
         ┌────────────────────▼────────────────────────────────┐
  L3     │  Mode Policy (priority=100)                         │
         │  dry_run / full_pipeline 별 제한                     │
         └────────────────────┬────────────────────────────────┘
                              │ 통과
         ┌────────────────────▼────────────────────────────────┐
  L4     │  Agent-Level HITL Safety Gate                       │
         │  DANGEROUS → 항상 승인 / WRITE → 조건부 승인          │
         │  EXPENSIVE → 비용 확인 / STANDARD → 즉시 실행         │
         └────────────────────┬────────────────────────────────┘
                              │ 승인
         ┌────────────────────▼────────────────────────────────┐
  L5     │  Node Scope (파이프라인 노드별 허용 목록)              │
         └────────────────────┬────────────────────────────────┘
                              │ 통과
         ┌────────────────────▼────────────────────────────────┐
  L6     │  SubAgent Denied Tools (서브에이전트 격리)            │
         └────────────────────┬────────────────────────────────┘
                              │ 통과
         ┌────────────────────▼────────────────────────────────┐
  Path   │  File Sandbox (_PROJECT_ROOT 경계 검증)              │
         │  심링크 차단 + resolve + relative_to                  │
         └────────────────────┬────────────────────────────────┘
                              │ 통과
                        [ 도구 실행 ]
```

### 핵심 원칙

1. **AND 조합**: 모든 계층을 통과해야 실행 가능 (하나라도 거부 = 차단)
2. **우선순위 기반**: Org > Profile > Mode (낮은 priority = 높은 우선순위)
3. **계층 독립성**: HITL 승인이 Path Sandbox를 우회하지 않음
4. **Headless 보호**: 사용자 없는 모드에서 DANGEROUS 도구 핸들러 자체를 제거
5. **세션 스코프**: A=Always 승인은 세션이 끝나면 초기화

### 관련 소스

| 파일 | 역할 |
|------|------|
| `core/tools/policy.py` | PolicyChain, ToolPolicy, Profile/Org Policy |
| `core/agent/safety_constants.py` | SAFE/WRITE/DANGEROUS/EXPENSIVE 분류 |
| `core/agent/tool_executor.py` | HITL Safety Gate, A=Always |
| `core/tools/file_tools.py` | Path Sandbox (_check_sandbox) |
| `core/gateway/shared_services.py` | SessionMode, Headless 차단 |
| `core/agent/sub_agent.py` | SubAgent denied tools |
| `core/runtime_wiring/infra.py` | Mode 기본 정책 조립 |

---

> **다음 글 예고**: HITL IPC Relay에서 발견된 spinner race 버그 — daemon thread의 ANSI cursor-up이 `console.input()`을 파괴하는 과정과 수정기.

---

*Source: `blog/posts/safety-verification/57-policychain-6layer-access-control.md` | Category: [[blog-safety]]*

## Related

- [[blog-safety]]
- [[blog-hub]]
- [[geode]]
