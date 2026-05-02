---
title: 58 Hook Events Catalog
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

# 58 Hook Events Catalog

`core/hooks/system.py:28-140` 의 `HookEvent` enum. 14 카테고리 합계 58개.

## 카테고리별 카운트

| 카테고리 | 개수 | 대표 이벤트 |
|---|---|---|
| Pipeline | 3 | `PIPELINE_STARTED`, `PIPELINE_COMPLETED`, `PIPELINE_FAILED` |
| Node | 4 | `NODE_BEFORE`, `NODE_AFTER`, `NODE_SKIPPED`, `NODE_FAILED` |
| Analysis | 3 | analyst 시작/완료/실패 |
| Verification | 2 | guardrails / biasbuster |
| L4 Automation | 5 | StuckDetector / Drift / Outcome / Snapshot / Feedback |
| Memory | 4 | save / load / vault / journal |
| LLM | 4 | request / response / cache_hit / cache_miss |
| Tool | 5 | use / result / approval_requested / approval_granted / approval_denied |
| Context | 2 | overflow / compress |
| Session | 2 | session_started / session_ended |
| Model | 1 | model_switched |
| SubAgent | 3 | spawn / announce / despawn |
| Recovery | 3 | recovery_started / recovery_succeeded / recovery_failed |
| Turn | 1 | `AGENT_TURN_STARTED` / `AGENT_TURN_ENDED` (한 쌍을 1로 카운트) |

> 정확한 enum 멤버 리스트는 `core/hooks/system.py:28-140` 직접 참조.

## 4-Tier Maturity (OpenClaw 패턴)

`docs/architecture/hook-system.md` :

| Tier | 책임 | 예 |
|---|---|---|
| L1 Observe | 단순 로그/메트릭 | `RunLog` (P50) |
| L2 React | 이벤트에 응답하여 부수 효과 | `Notification` (P75) |
| L3 Decide | 조건부 분기 결정 | `ContextAction` (P50) — context budget 검사 |
| L4 Autonomy | 시스템 자체 자율 행동 | `StuckDetector` (P40) — 7200s 후 자동 kill |

## 등록 (`core/lifecycle/bootstrap.py:126-230`)

`build_hooks()` 가 38+ 핸들러를 priority 순서로 등록.

```python
hooks = HookSystem()
hooks.register(HookEvent.AGENT_TURN_STARTED, run_log_handler, name="run_log", priority=50)
hooks.register(HookEvent.TOOL_RESULT_RECEIVED, stuck_detector_handler, name="stuck", priority=40)
# ... 38+ entries
```

우선순위 *낮은* 게 먼저 실행 (P40 < P50 < P75 < P85).

## Wiring Verification 룰

CANNOT 룰 (CLAUDE.md:108-115): "handler 정의 ≠ handler 발화. bootstrap.py에 등록 필수." 이는 누락된 핸들러가 silent skip되는 것을 막는다. dependency-review 스킬이 검출.

## 다음

- [[overview]] — Hook 시스템 전반
- [[handler-patterns]] — 핸들러 등록 패턴
