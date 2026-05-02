---
title: OpenAI PAYG Provider
category: runtime-llm-providers
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/providers/openai.py:48-150"
external_refs:
---

# OpenAI PAYG Provider

표준 OpenAI API. Codex (ChatGPT Plus) 와 분리된 별도 provider. `provider="openai"`.

## 엔드포인트

```
base_url: https://api.openai.com/v1   (기본)
auth:     Bearer API key
```

## Key resolve (`openai.py:48-52`)

```python
def _resolve_openai_key() -> str:
    return resolve_provider_key("openai", settings.openai_api_key)
```

`resolve_provider_key()` 가 ProfileRotator 우선, 없으면 settings.openai_api_key fallback.

## 클라이언트

```python
@lru_cache_via_lock
def _get_openai_client():
    return openai.OpenAI(api_key=_resolve_openai_key())
```

## Codex와의 차이

| 항목 | OpenAI Codex | OpenAI PAYG |
|---|---|---|
| `provider` 값 | `openai-codex` | `openai` |
| base_url | `https://chatgpt.com/backend-api/codex` | `https://api.openai.com/v1` |
| 인증 | OAuth Bearer (JWT) | API key |
| Quota 출처 | ChatGPT Plus 구독 | API 청구 |
| 헤더 | `ChatGPT-Account-ID`, `originator` | (없음) |
| API | Responses API + streaming | chat.completions / responses |

`resolve_routing` 의 equivalence class에서 `openai-codex` (SUBSCRIPTION) → `openai` (PAYG) 순서로 fallback. ChatGPT Plus quota 소진/cooldown 시 자동 PAYG.

## 다음

- [[openai-codex]] — Codex provider
- [[fallback-rotation]] — resolve_routing
