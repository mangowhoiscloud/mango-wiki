---
title: Hooks Overview
category: harness-hooks
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/hooks/system.py:28-140"
  - "docs/architecture/hook-system.md"
  - "core/lifecycle/bootstrap.py:126-230"
external_refs:
  - url: "https://docs.openclaw.ai/automation/hooks.md"
    pattern: "Hook 4-tier maturity"
---

# Hooks Overview

Hooks는 GEODE의 *자율 동작* primitive. 58개 이벤트가 파이프라인/도구/메모리/에이전트 모든 지점에서 발화하며, 핸들러가 등록되어 있으면 priority 순서로 실행된다.

## 4-Tier Maturity (OpenClaw 패턴)

```
L1 Observe  → 단순 로그
L2 React    → 부수 효과 (알림, 히스토리)
L3 Decide   → 조건부 분기 (context budget 검사)
L4 Autonomy → 시스템 자체 자율 행동 (StuckDetector, DriftDetection)
```

## 등록 (`core/lifecycle/bootstrap.py:126-230`)

```python
hooks = HookSystem()
hooks.register(
    HookEvent.AGENT_TURN_STARTED,
    run_log_handler,
    name="run_log",
    priority=50,
)
```

priority 낮음 = 먼저 실행. 같은 이벤트에 여러 핸들러 가능.

## 발화

```python
hooks.fire(HookEvent.TOOL_USE_RECEIVED, {"tool": "manage_login", "args": ...})
```

또는 dataclass 형태:

```python
@dataclass
class ToolUseEvent:
    tool: str
    args: dict
    sub_agent: bool

hooks.fire(HookEvent.TOOL_USE_RECEIVED, ToolUseEvent(...))
```

## 실행 흐름

```
hooks.fire(event, data)
  │
  ├── 등록된 핸들러 priority 정렬
  ├── 각 핸들러 try/except 격리 호출
  │     ├── 예외 → log + 다음 핸들러로 이동 (전체 cascade 차단 안 함)
  │     └── 정상 → 다음 핸들러
  └── 모두 종료 → fire() 리턴
```

## 등록 시점

bootstrap.py:build_hooks() 한 번만. 이후 동적 등록은 가능하나 권장 안 함 (테스트 어려움).

## CANNOT 룰 — Wiring Verification

CLAUDE.md:108-115:

> "handler 정의 ≠ handler 발화. bootstrap.py에 등록 필수."

핸들러 함수만 만들고 `hooks.register()` 누락하면 silent skip. dependency-review 스킬이 검출.

## 사용 사례

| 핸들러 | 이벤트 | 책임 |
|---|---|---|
| RunLog | AGENT_TURN_STARTED, TOOL_RESULT_RECEIVED | JSONL 로그 |
| StuckDetector | TOOL_RESULT_RECEIVED | 7200s 타임아웃 |
| ContextAction | TOOL_RESULT_RECEIVED | context budget 검사 |
| Notification | TOOL_USE_RECEIVED | 사용자 알림 |
| Journal | AGENT_TURN_ENDED | 의사결정 기록 |
| TurnAutoMemory | AGENT_TURN_ENDED | turn 결과 메모리 자동 저장 |

## 다음

- [[58-events]] — 전체 이벤트 카탈로그
- [[handler-patterns]] — 핸들러 등록 패턴
