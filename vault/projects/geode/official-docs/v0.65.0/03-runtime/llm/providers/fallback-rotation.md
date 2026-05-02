---
title: Fallback & Rotation (resolve_routing)
category: runtime-llm-providers
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/auth/plan_registry.py:122-230"
  - "core/auth/profiles.py:176-261"
  - "core/llm/fallback.py"
external_refs:
  - url: "https://docs.openclaw.ai/concepts/model-failover.md"
    pattern: "Lane fail-over"
---

# Fallback & Rotation (resolve_routing)

`core/auth/plan_registry.py:122-206` `resolve_routing(model)` 가 모델 호출 시 *어떤 plan/profile 조합을 쓸지* 결정하는 핵심 함수. 4-step 탐색 + 동치류 우선.

## 4단계 흐름

```
resolve_routing("claude-sonnet-4-6")
  │
  ├─ Step 1: 명시 모델 라우팅
  │    registry.get_routing("claude-sonnet-4-6")
  │    → 사용자가 set_routing("claude-sonnet-4-6", plan_id="anthropic:work")로 박은 게 있으면 우선
  │
  ├─ Step 2: Equivalence-class 스캔  (v0.52.4+)
  │    base_provider = "anthropic"
  │    eq_chain = _equivalence_class_plans(registry, "anthropic")
  │    sorted(eq_chain, key=PLAN_KIND_PRIORITY)   # SUBSCRIPTION 우선
  │    → eq_chain의 각 plan에 대해 사용 가능한 profile 탐색
  │
  ├─ Step 3: 단일 provider 폴백 (legacy)
  │    registry.list_for_provider("anthropic")의 모든 plan 순회
  │
  └─ Step 4: PAYG plan 합성
       rotator.resolve("anthropic")
       → 합성 Plan + 그 profile 반환
```

각 단계에서 첫 번째로 발견되는 사용 가능 조합을 즉시 return.

## Equivalence Class

`_equivalence_class_plans()` (`plan_registry.py:209-230`):

같은 모델 family를 공유하는 provider variant들을 묶는다. 예:

| Base provider | Class members |
|---|---|
| `openai` | `[openai-codex, openai]` (Plus 구독 + PAYG) |
| `glm` | `[glm-coding-lite, glm-coding-pro, glm-coding-max, glm]` |
| `anthropic` | `[anthropic]` (단일 — Claude Pro OAuth는 ToS 제약으로 비활성) |

PLAN_KIND_PRIORITY 정렬 결과:

```
SUBSCRIPTION(0) → OAUTH_BORROWED(1) → CLOUD_PROVIDER(2) → PAYG(3)
```

ChatGPT Plus가 등록된 사용자에 대해 OpenAI 모델 호출 시:
```
1순위: openai-codex-geode (OAUTH_BORROWED, ChatGPT Plus quota)
2순위: openai (PAYG, API key 청구)
```

Plus quota가 cooldown이거나 expired면 자동으로 PAYG 폴백.

## Profile 선택 (`_pick_profile_for_plan`)

```python
def _pick_profile_for_plan(store, rotator, plan):
    candidates = [p for p in store.list_all()
                  if p.plan_id == plan.id and p.is_available]
    if not candidates:
        return None
    return min(candidates, key=lambda p: p.sort_key())
```

`sort_key()` = (TYPE_PRIORITY, last_used) — 같은 plan에 OAuth + API_Key profile이 둘 다 있으면 OAuth 우선, 그 다음 LRU.

## Circuit Breaker

`core/llm/fallback.py:CircuitBreaker` — 연속 실패 시 일정 시간 차단:

```python
breaker.record_failure()  # error_count++
if breaker.error_count >= threshold:
    profile.cooldown_until = time.time() + 60  # 1분 cooldown
```

다음 `evaluate_eligibility()` 호출 시 `COOLING_DOWN` 으로 reject → resolve_routing 자동 다음 옵션 탐색.

## v0.65.0 manage_login 결함과의 관계

manage_login 보고가 PAYG/OAuth 모두 "비활성"으로 표시했어도, *resolve_routing 동작은 영향 없음*. 동치류 fallback이 그대로 작동 → 사용자 호출은 성공. 보고와 동작의 어휘 분리는 [[manage-login]] 분석 참조.

## 다음

- [[plan-registry]] — Plan dataclass + Quota
- [[credential-semantics]] — Eligibility 평가 룰
- [[anthropic]] — Anthropic provider
- [[openai-codex]] — Codex provider
