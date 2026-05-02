---
title: GLM Provider
category: runtime-llm-providers
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/providers/glm.py:33-138"
  - "core/auth/plans.py:120-150"
external_refs:
---

# GLM Provider

ZhipuAI GLM 시리즈 (GLM-5.1, GLM-4.7+) OpenAI-호환 API. **Subscription tier (Lite / Pro / Max)** + PAYG 양쪽 지원.

## 엔드포인트

```
base_url: https://api.z.ai/api/paas/v4   (기본)
auth:     Bearer (API key — Plan-bound 우선, fallback ZAI_API_KEY)
```

`core/llm/providers/glm.py:33-49` — `_resolve_glm_endpoint()`:

```python
target = resolve_routing("glm-5.1")
if target:
    return target.base_url, target.api_key
return GLM_BASE_URL, settings.zai_api_key   # PAYG fallback
```

## Plan 등록 (`core/auth/plans.py:120-150`)

```python
GLM_CODING_TIERS = {
    "lite": Plan(
        id="glm-coding-lite",
        kind=PlanKind.SUBSCRIPTION,
        quota=Quota(window_seconds=18000, max_calls=80, weights={"glm-5.1": 3.0}),
        subscription_tier="Lite",
    ),
    "pro":  Plan(..., quota=Quota(max_calls=240, ...), subscription_tier="Pro"),
    "max":  Plan(..., subscription_tier="Max"),
}
```

`weights={"glm-5.1": 3.0}` — GLM-5.1 호출은 weighted 3.0 으로 계산 (기본 1.0 호출 대비 3배 quota 차감).

## Thinking 필드 호환성

`core/llm/providers/glm.py:118-138` — `_GLM_THINKING_MODELS` frozenset.

| 모델 | thinking 필드 |
|---|---|
| GLM-5.1, GLM-5, GLM-4.7+ | **필수** — `thinking={"type": "enabled"}` |
| GLM-4.5, GLM-4.6 | 선택 |
| 그 이전 | **금지** — 보내면 거부 |

`_glm_thinking_supported(model)` 게이트로 자동 분기.

## 클라이언트

```python
@lru_cache_via_lock
def _get_glm_client():
    base_url, api_key = _resolve_glm_endpoint()
    return openai.OpenAI(api_key=api_key, base_url=base_url)
```

OpenAI SDK 그대로 사용 — GLM이 OpenAI-호환 protocol 지원.

## v0.65.0 메모

GLM provider 자체는 변경 없음. `manage_login` 보고 결함은 GLM Plan/Profile에도 영향 있었으나 (mismatch로 표시) `resolve_routing` 호출 흐름은 정상이었음. 보고 fix만 ([[manage-login]]).

## Quick Activation

GLM은 OpenAI API보다 저렴 (Lite tier ~$3/월, gpt-5 기준 ~80% 절감). ChatGPT Plus + GLM 병행 시 fallback 자원 확보.

```bash
# 1. ZhipuAI 코딩 plan 가입 (https://www.bigmodel.cn/)
# 2. API key 등록
geode /login set-key glm-coding-lite zai-xxxxxxxx

# 3. 모델 전환 (선택적)
geode /model glm-5.1

# 4. 검증
geode "explain this code in 1 sentence"   # GLM-5.1로 응답
```

`resolve_routing` 의 equivalence-class fallback 으로 ChatGPT Plus quota 소진 시 GLM 자동 fallback.

## 다음

- [[fallback-rotation]] — resolve_routing
- [[plan-registry]] — Plan + Quota
