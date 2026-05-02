---
title: Hook Handler Patterns
category: harness-hooks
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/lifecycle/bootstrap.py:42-225"
external_refs:
---

# Hook Handler Patterns

`core/lifecycle/bootstrap.py` 의 핸들러 등록 관용구.

## Factory 패턴

핸들러는 closure를 통해 외부 의존성 capture:

```python
def _make_run_log_handler(log_path: Path) -> Callable:
    def _handler(event_name, data):
        with log_path.open("a") as f:
            f.write(json.dumps({"event": event_name, "data": data}) + "\n")
    return _handler

hooks.register(
    HookEvent.AGENT_TURN_STARTED,
    _make_run_log_handler(GLOBAL_RUNS_DIR / "log.jsonl"),
    name="run_log",
    priority=50,
)
```

## DRY 등록 (`_register_plugin`)

복잡 의존성 핸들러는 try/except 데코레이터로 안전하게:

```python
def _register_plugin(name, register_fn):
    try:
        register_fn(hooks)
    except (ImportError, ValueError, RuntimeError) as e:
        log.warning(f"plugin '{name}' skipped: {e}")
```

이 패턴 덕에 plugin 누락이나 임포트 실패가 시스템 전체를 무너뜨리지 않음.

## Priority 룰

| Priority | 의미 |
|---|---|
| 0-30 | 최우선 — 시스템 안전 (StuckDetector, ContextAction) |
| 40-49 | 모니터링 (RunLog) |
| 50-69 | 비즈니스 로직 (Journal, ContextAction) |
| 70-79 | 사용자 표면 (Notification) |
| 80-99 | 후처리 (TurnAutoMemory) |
| 100+ | 디버그 / 옵션 |

## State Mutation

핸들러는 *데이터를 수정해도 됨*. `state.skip_nodes.add("synthesizer")` 같은 흐름 제어가 정상 패턴.

```python
def _make_stuck_hook_handler(threshold_seconds=7200):
    def _handler(event_name, data):
        if data.get("turn_duration_seconds", 0) > threshold_seconds:
            data["should_kill"] = True
            log.warning(...)
    return _handler
```

## 테스트

```python
def test_run_log_writes():
    hooks = HookSystem()
    hooks.register(HookEvent.AGENT_TURN_STARTED, _make_run_log_handler(tmp_log), ...)
    hooks.fire(HookEvent.AGENT_TURN_STARTED, {"prompt": "..."})
    assert tmp_log.exists()
    line = tmp_log.read_text().splitlines()[-1]
    assert json.loads(line)["event"] == "AGENT_TURN_STARTED"
```

## CANNOT — handler exists ≠ handler fires

가장 흔한 실수: 핸들러 함수만 만들고 `bootstrap.py:build_hooks()` 에 register 추가 누락. 핸들러는 호출되지 않으나 import는 성공해서 silent skip.

dependency-review 스킬 + grep 으로 검출:

```bash
grep -rn "_make_.*_handler\b" core/lifecycle/
# 위 결과의 모든 함수가 build_hooks()에서 호출되는지 cross-check
```

## 다음

- [[overview]] — Hooks 전반
- [[58-events]] — 이벤트 카탈로그
