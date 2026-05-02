---
title: Safety Tiers
category: runtime-tools
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/agent/safety.py:11-100"
  - "core/agent/sub_agent.py"
  - "core/agent/error_recovery.py"
external_refs:
---

# Safety Tiers

도구는 위험도에 따라 4-tier 분류. `core/agent/safety.py:11-100`.

## SAFE_TOOLS (27)

읽기 전용. 자동 승인.

```python
SAFE_TOOLS = frozenset({
    "list_ips", "search_ips", "memory_search", "note_read",
    "profile_show", "profile_get", "show_help", "check_status",
    "web_fetch", "general_web_search", "read_document",
    "youtube_search", "reddit_sentiment", "steam_info", "google_trends",
    # ... 27 total
})
```

## WRITE_TOOLS (16)

영속 상태 수정. **ApprovalWorkflow** 트리거.

```python
WRITE_TOOLS = frozenset({
    "memory_save", "note_save", "profile_update",
    "schedule_job", "trigger_event", "set_api_key",
    "manage_login", "manage_rule", "install_mcp_server",
    "create_plan", "approve_plan", "reject_plan", "modify_plan",
    "rate_result", "accept_result", "reject_result",
})
```

## DANGEROUS_TOOLS (2)

OS-level 영향. **항상 명시 승인** 필수.

```python
DANGEROUS_TOOLS = frozenset({
    "run_bash",   # 임의 셸 명령 실행
    "computer",   # 마우스/키보드/스크린샷 (computer use)
})
```

`run_bash` 는 추가로 `SAFE_BASH_PREFIXES` 로 prefix matching:

```python
SAFE_BASH_PREFIXES = ("ls ", "cat ", "git status", "uv run pytest", ...)
```

prefix 매칭되면 자동 승인, 그 외 명시 승인.

## EXPENSIVE_TOOLS (dict)

비용 추적용. 특정 임계값 초과 시 추가 승인.

```python
EXPENSIVE_TOOLS = {
    "batch_analyze": 10_000,    # 토큰 예산
    "generate_data": 5_000,
}
```

## SUBAGENT_DENIED_TOOLS

Sub-agent (Task tool) 에서 호출 금지. 보안 + 격리:

```python
SUBAGENT_DENIED_TOOLS = frozenset({
    "manage_login", "manage_rule", "set_api_key",
    "schedule_job", "trigger_event",
    "install_mcp_server",
    # 인증/스케줄링/MCP 등 시스템 설정은 main agent만
})
```

## error_recovery._EXCLUDED_TOOLS

자동 재시도 제외 목록. manage_login 같은 *멱등하지 않은* 도구 포함:

```python
_EXCLUDED_TOOLS = {"manage_login", "set_api_key", "schedule_job", ...}
```

## 호출 흐름

```
Tool call
  ├── PolicyChain.is_allowed(tool_name, mode)   ← 6-layer 정책
  ├── tier 분류
  │   ├── SAFE → 즉시 실행
  │   ├── WRITE → ApprovalWorkflow → grant/deny
  │   └── DANGEROUS → 항상 명시 승인
  ├── (sub-agent라면) SUBAGENT_DENIED_TOOLS 검사
  └── 실패 시 (error_recovery._EXCLUDED_TOOLS 외만) 재시도
```

## 다음

- [[approval]] — ApprovalWorkflow
- [[policy-chain]] — 6-layer chain
- [[protocol]] — Tool 인터페이스
