---
title: Plan Registry & Equivalence-Class Fallback
category: runtime-auth
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/auth/plans.py:27-150"
  - "core/auth/plan_registry.py:122-206"
external_refs:
---

# Plan Registry & Equivalence-Class Fallback

`Plan` 은 GEODE가 인증 자원을 추상화한 단위다 — 구독(SUBSCRIPTION), OAuth 차용(OAUTH_BORROWED), PAYG 모두를 단일 dataclass로 표현한다. `resolve_routing()` 가 모델 요청에 대해 사용 가능한 Plan을 4단계로 탐색.

## PlanKind (`core/auth/plans.py:27-33`)

| Kind | Value | 우선순위 | 예 |
|---|---|---|---|
| `SUBSCRIPTION` | `"subscription"` | 0 (높음) | GLM Coding Lite/Pro/Max |
| `OAUTH_BORROWED` | `"oauth_borrowed"` | 1 | OpenAI Codex (ChatGPT Plus) |
| `CLOUD_PROVIDER` | `"cloud_provider"` | 2 | (vertex-ai 등) |
| `PAYG` | `"payg"` | 3 (낮음) | Anthropic API key, OpenAI PAYG |

`PLAN_KIND_PRIORITY` dict로 정의. fallback 체인에서 SUBSCRIPTION 우선, PAYG 최후.

## Plan dataclass (`core/auth/plans.py:56-82`)

```python
@dataclass
class Plan:
    id: str                       # e.g. "glm-coding-lite", "openai-codex-geode"
    provider: str                 # e.g. "glm", "openai-codex"
    kind: PlanKind
    display_name: str
    base_url: str | None          # endpoint override
    auth_type: str | None         # e.g. "api_key", "oauth_external"
    quota: Quota | None           # sliding window + per-model weights
    subscription_tier: str | None # "Lite", "Pro", "Max", "Plus"
    upgrade_url: str | None
```

## GLM_CODING_TIERS 예 (`core/auth/plans.py:120-150`)

```python
GLM_CODING_TIERS = {
    "lite": Plan(
        id="glm-coding-lite",
        provider="glm",
        kind=PlanKind.SUBSCRIPTION,
        display_name="GLM Coding Lite",
        base_url="https://api.z.ai/api/paas/v4",
        quota=Quota(window_seconds=18000, max_calls=80, weights={"glm-5.1": 3.0}),
        subscription_tier="Lite",
    ),
    "pro":  Plan(..., quota=Quota(window=18000, max_calls=240, ...)),
    "max":  Plan(..., quota=Quota(...)),
}
```

## resolve_routing 4단계 (`plan_registry.py:122-206`)

```python
def resolve_routing(model: str) -> RoutingTarget | None:
    base_provider = _provider_for_model(model)

    # Step 1: 명시적 모델 라우팅
    plan = registry.get_routing(model)
    if plan:
        profile = _pick_profile_for_plan(store, rotator, plan)
        if profile:
            return RoutingTarget(plan, profile, ...)

    # Step 2: Equivalence-class 스캔 (v0.52.4+)
    eq_chain = _equivalence_class_plans(registry, base_provider)
    eq_chain = sorted(eq_chain, key=lambda p: PLAN_KIND_PRIORITY[p.kind])
    for plan in eq_chain:
        profile = _pick_profile_for_plan(store, rotator, plan)
        if profile:
            return RoutingTarget(plan, profile, ...)

    # Step 3: 단일 provider 폴백 (legacy)
    for plan in registry.list_for_provider(base_provider):
        ...

    # Step 4: PAYG Plan 합성
    profile = rotator.resolve(base_provider)
    if profile:
        synth = default_plan_for_payg(base_provider, profile.key)
        return RoutingTarget(synth, profile, ...)

    return None
```

### Equivalence Class

같은 모델 family(예: `openai`)의 여러 provider variant를 묶는다.

| Base provider | Equivalence class |
|---|---|
| `openai` | `[openai-codex, openai]` |
| `glm` | `[glm-coding-lite, glm-coding-pro, glm-coding-max, glm]` |
| `anthropic` | `[anthropic]` (단일) |

`_equivalence_class_plans()` 가 base_provider를 받아 plan 후보 집합 반환. SUBSCRIPTION 우선 정렬 → 사용자가 ChatGPT Plus를 가지고 있으면 PAYG보다 먼저 시도.

## RoutingTarget

```python
@dataclass
class RoutingTarget:
    plan: Plan
    profile: AuthProfile
    base_url: str
    api_key: str
```

LLM 어댑터가 이 dataclass로 클라이언트 생성.

## v0.65.0의 미묘함 — manage_login 보고는 fallback 잠금 아님

`manage_login` 도구가 PAYG 키를 "provider_mismatch / inactive"로 표시했다고 해서 *실제로* 그 키가 차단된 건 아니다. `resolve_routing` Step 2/3/4 가 fallback으로 PAYG 키를 그대로 사용한다. v0.65.0 fix는 *보고만* 수정 — 실제 라우팅 동작은 그대로다.

## 다음

- [[credential-semantics]] — Eligibility
- [[oauth-flow]] — OAuth flow 상세
- [[fallback-rotation]] — resolve_routing 디테일
- [[manage-login]] — v0.65.0 fix
