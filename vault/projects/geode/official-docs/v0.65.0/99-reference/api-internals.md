---
title: API Internals
category: reference
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/runtime.py"
  - "core/lifecycle/container.py"
  - "core/agent/loop.py"
external_refs:
---

# API Internals

GEODE 프로그래매틱 API 내부 인터페이스 (외부 패키지 임포트 가이드).

## Public Entry Points

```python
from core.runtime import GeodeRuntime
from core.agent.loop import AgenticLoop
from core.cli import main
from core.lifecycle.container import ensure_profile_store, get_profile_rotator
from core.auth.profiles import AuthProfile, CredentialType, ProfileRejectReason
from core.auth.plans import Plan, PlanKind, GLM_CODING_TIERS
from core.auth.plan_registry import resolve_routing, get_plan_registry
from core.domains.port import set_domain, get_domain, DomainPort
from core.domains.loader import load_domain_adapter, register_domain
from core.skills.skills import SkillRegistry
from core.tools.policy import PolicyChain
from core.verification.guardrails import run_guardrails
from core.verification.biasbuster import run_biasbuster
```

## Runtime 초기화

```python
runtime = GeodeRuntime.create(
    domain_name="game_ip",
    config_path=None,           # 기본 .geode/config.toml
    extra_skill_dirs=None,
)
```

3-stage bootstrap 자동:

1. domain + session
2. core 인프라 (hooks, policies, LLM, auth)
3. memory + automation

## 직접 AgenticLoop 호출

```python
result = AgenticLoop(runtime_context).run("summarize ...")
```

또는 IPC 통해:

```python
from core.cli.ipc_client import connect_to_serve
client = connect_to_serve()
response = client.send_prompt("summarize ...")
```

## Pipeline 실행 (도메인)

```python
from core.graph import build_graph, run_pipeline

set_domain(load_domain_adapter("game_ip"))
result = run_pipeline(target="Cowboy Bebop", mode="dry_run")
print(result["tier"], result["final_score"])  # → "A", 68.4
```

## Auth 직접 조작

```python
from core.lifecycle.container import ensure_profile_store
store = ensure_profile_store()
profile = AuthProfile(
    name="test:work",
    provider="anthropic",
    credential_type=CredentialType.API_KEY,
    key="sk-ant-...",
)
store.add(profile)

# 평가
verdicts = store.evaluate_eligibility("anthropic")
for v in verdicts:
    print(v.profile_name, v.eligible, v.reason_code)

# 라우팅
target = resolve_routing("claude-sonnet-4-6")
print(target.plan.id, target.profile.name)
```

## Hook System

```python
from core.hooks.system import HookEvent, HookSystem

hooks = HookSystem()
def on_turn_started(event_name, data):
    print(f"turn started: {data}")
hooks.register(HookEvent.AGENT_TURN_STARTED, on_turn_started, name="my_handler", priority=50)

hooks.fire(HookEvent.AGENT_TURN_STARTED, {"prompt": "test"})
```

## ContextVar

```python
from core.domains.port import _domain_ctx, set_domain, get_domain_or_none

# 명시적 set
set_domain(domain)

# 검사
domain = get_domain_or_none()
if domain is None:
    raise RuntimeError("domain not set")
```

## 안정성 표시

| 모듈 | 안정성 | 비고 |
|---|---|---|
| `core.runtime` | stable | bootstrap factory |
| `core.cli` | stable | dispatcher + thin |
| `core.agent.loop` | stable | AgenticLoop |
| `core.auth.*` | stable | Profile / Plan / Routing |
| `core.domains.port` | stable | DomainPort Protocol |
| `core.verification.*` | stable | G1-G4 / BiasBuster |
| `core.tools.*` | semi-stable | Tool Protocol + Policy |
| `core.hooks.*` | stable | 58 events |
| `core.memory.*` | semi-stable | 5-tier (일부 internal) |
| `core.scheduler` | stable | 3-type |
| `core.orchestration.*` | semi-stable | LaneQueue 등 |
| `core.lifecycle.*` | internal | bootstrap, container |
| `core.config` | internal | pydantic settings |
| `plugins.*` | stable | 도메인별 |

semi-stable / internal 은 사용 가능하나 minor 버전에서 변경 가능. PR로 stable 승격 요청.

## 다음

- [[changelog]] — 변경 이력
- [[version-policy]] — 버전 룰
