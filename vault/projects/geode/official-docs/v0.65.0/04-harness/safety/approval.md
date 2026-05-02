---
title: Approval Flow
category: harness-safety
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/agent/approval.py:34-200"
  - "core/agent/safety.py:11-100"
external_refs:
---

# Approval Flow

WRITE/DANGEROUS 도구 호출 시 사용자 승인을 받는 HITL (Human-in-the-loop) 메커니즘.

## ApprovalWorkflow 클래스 (`core/agent/approval.py:58-200+`)

```python
class ApprovalWorkflow:
    def request_approval(
        self,
        tool: str,
        args_repr: str,
        intent: str,           # "read" / "write" / "execute"
    ) -> ApprovalDecision:
        if self._auto_approve_streak.get(tool, 0) >= 3:
            return ApprovalDecision.auto_approve()
        if self._auto_deny_streak.get(tool, 0) >= 3:
            return ApprovalDecision.auto_deny()
        # 사용자에게 prompt
        response = self._prompt_user(tool, args_repr, intent)
        self._update_streak(tool, response)
        return response
```

## Auto-approve / Auto-deny 임계값

| 조건 | 결과 |
|---|---|
| 같은 도구 3회 연속 사용자 승인 | 4번째부터 자동 승인 |
| 같은 도구 3회 연속 거부 | 4번째부터 자동 거부 |
| 한 번이라도 반대 응답 | streak 리셋 |

이는 사용자가 같은 결정을 반복 강요받는 것을 줄이면서, 의도가 분명한 경우만 자동화하는 트레이드오프.

## Write Denial Fallback (`approval.py:34-56`)

WRITE 도구 거부 시 LLM에게 "다음에 뭐 할지" 힌트 제공:

```python
_FALLBACKS = {
    "memory_save": "Try `memory_search` first to see what's already stored",
    "note_save": "Try reading existing notes with `note_read`",
    "profile_update": "Use `profile_get` to inspect current state first",
    "manage_login": "Run /login slash command in interactive mode",
    "schedule_job": "Try /task or check current schedule first",
    "trigger_event": "Verify event payload before triggering",
    "install_mcp_server": "Check available MCP registry first",
    # ...
}

def _write_denial_with_fallback(tool: str) -> dict:
    return {
        "error": f"User denied write operation for '{tool}'",
        "fallback_hint": _FALLBACKS.get(tool, "Consider read-only alternatives"),
    }
```

이 결과가 LLM의 다음 turn message에 들어감 → LLM이 alternative 도구 호출.

## Hook 통합

| 이벤트 | 시점 |
|---|---|
| `TOOL_APPROVAL_REQUESTED` | `request_approval()` 진입 |
| `TOOL_APPROVAL_GRANTED` | 승인 응답 |
| `TOOL_APPROVAL_DENIED` | 거부 응답 |
| `TOOL_APPROVAL_AUTO_APPROVED` | streak 자동 승인 |
| `TOOL_APPROVAL_AUTO_DENIED` | streak 자동 거부 |

## v0.52.1 incident — parallel approval bug

LLM이 동시에 두 `manage_login` tool call을 보내는 케이스에서 race condition. 둘 다 `request_approval()` 호출하면서 같은 prompt가 두 번 떠서 사용자 혼란.

수정: `core/agent/approval.py` 의 lock + dedup. `tests/test_parallel_approval.py` 회귀 테스트.

## DANGEROUS 도구

`run_bash` / `computer` 는 streak 적용 안 됨 — *항상 명시 승인*. `SAFE_BASH_PREFIXES` 매칭만 자동 승인.

## 다음

- [[policy-chain]] — 6-layer 결정
- [[safety-tiers]] — SAFE/WRITE/DANGEROUS
- [[manage-login]] — manage_login 거부 후 fallback
