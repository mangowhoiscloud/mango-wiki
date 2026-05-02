---
title: System Index
category: architecture
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/runtime.py:212-250"
  - "core/lifecycle/bootstrap.py:126-230"
  - "core/lifecycle/container.py:39-360"
external_refs:
---

# System Index — Bootstrap & DI

GEODE 런타임은 `GeodeRuntime.create()` 호출로 부팅된다. 3 stage 순서로 의존성 그래프가 구축된다.

## Stage 1 — Domain + Session

```
load_domain_adapter("game_ip")  # core/domains/loader.py
  → plugins.game_ip.adapter.GameIPDomain()
  → set_domain(domain)  # core/domains/port.py ContextVar
SessionContext 초기화
  → run_id, working_directory, mode 등 메타데이터
```

## Stage 2 — Core 인프라 (`core/lifecycle/container.py`)

DI 컨테이너 조립 순서:

| 호출 | 책임 | 출력 |
|---|---|---|
| `build_default_policies()` | 6-layer Policy Chain | `PolicyChain` |
| `build_default_registry()` | ToolRegistry + 도구 등록 | `ToolRegistry` |
| `build_default_lanes()` | LaneQueue 초기화 | `LaneQueue` |
| `build_auth()` | ProfileStore + ProfileRotator | `ProfileStore` (singleton) |
| `build_llm_adapters()` | Anthropic/Codex/OpenAI/GLM 어댑터 | dict |
| `build_hooks()` | HookSystem + 38+ handler 등록 | `HookSystem` |

## Stage 3 — Memory + Automation

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| `ContextAssembler` | `core/memory/context.py:46-212` | Org → Project → Session 3-tier merge |
| `Scheduler` | `core/scheduler/scheduler.py:1-69` | AT/EVERY/CRON 작업 스케줄링 |
| `StuckDetector` | `core/automation/` | long-running task 자동 해제 (기본 7200s) |
| `Vault` | `core/memory/vault.py:1-80` | 4-category 자동 라우팅 (.geode/vault/) |

## Hook 등록 (`core/lifecycle/bootstrap.py:126-230`)

`build_hooks()` 가 38+ 핸들러를 priority 순서로 등록. 우선순위가 *낮은* 핸들러가 먼저 실행 (P40 < P50 < P75 < P85).

| 핸들러 | priority | 책임 |
|---|---|---|
| `_make_run_log_handler()` | P50 | 모든 turn JSONL 로그 |
| `_make_stuck_hook_handler()` | P40 | 7200s 이상 turn 진행 시 알림+kill |
| `ContextAction` | P50 | TOOL_RESULT 후 context budget 체크 |
| `Notification` | P75 | TOOL_USE 시 사용자 알림 |
| `Journal` | P60 | 의사결정 기록 |
| `TurnAutoMemory` | P85 | turn 종료 후 메모리 자동 저장 |

## ContextVar Injection (Wiring Verification)

GEODE는 ContextVar로 thread-local 컨텍스트 격리한다. 모든 `get_*()` accessor는 bootstrap에서 `set_*()` 호출 매칭이 필수 (CLAUDE.md Anti-Disconnection 룰).

| 접근자 | 설정 위치 | 의미 |
|---|---|---|
| `get_profile_store()` | `ensure_profile_store()` (`container.py:49-58`) | Auth profile 싱글톤 |
| `get_domain()` / `get_domain_or_none()` | `set_domain()` (`port.py`) | 활성 도메인 어댑터 |
| `get_tool_executor()` | `set_tool_executor()` (`registry.py`) | 활성 ToolExecutor |

미설정 → `None` 반환 → silent skip 위험. dependency-review 스킬이 누락 검출.

## 메트릭 (v0.65.0 측정값)

```
$ find core/ plugins/ -name "*.py" | wc -l
236

$ uv run pytest tests/ -m "not live" --collect-only -q | tail -1
4380 tests collected
(1 skipped, 24 deselected — 4380 actual run)

Hooks (HookEvent enum count):
  core/hooks/system.py:28-140  →  58 events
```

## 다음

- [[4-layer-stack]] — 레이어 책임
- [[thin-cli-vs-serve]] — L3 분리
- [[58-events]] — Hook 카탈로그
