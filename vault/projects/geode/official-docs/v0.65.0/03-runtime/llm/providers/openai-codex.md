---
title: OpenAI Codex Provider (ChatGPT Plus)
category: runtime-llm-providers
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/providers/codex.py:37-129"
  - "core/auth/oauth_login.py:54-148"
  - "core/config.py"
external_refs:
---

# OpenAI Codex Provider (ChatGPT Plus)

OpenAI 모델을 **ChatGPT Plus 구독 quota** 로 호출하는 provider. 표준 PAYG API와 분리.

## 엔드포인트

```
base_url:  https://chatgpt.com/backend-api/codex
auth:      OAuth Bearer token (JWT)
headers:
  ChatGPT-Account-ID: <jwt.chatgpt_account_id>
  originator: codex_cli_rs
```

`core/config.py` 의 `CODEX_BASE_URL`, `CODEX_PRIMARY` (기본 모델 ID), `CODEX_FALLBACK_CHAIN` 상수.

## 토큰 추출 — JWT

`core/llm/providers/codex.py:37-51`:

```python
def _extract_account_id(token: str) -> str:
    """JWT의 https://api.openai.com/auth.chatgpt_account_id 클레임 추출."""
    parts = token.split(".")
    if len(parts) < 2:
        return ""
    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded))
    auth_claim = payload.get("https://api.openai.com/auth", {})
    return auth_claim.get("chatgpt_account_id", "")
```

이 클레임이 없으면 ChatGPT-Account-ID 헤더 미주입 → API가 사용자 quota 식별 못 함.

## 토큰 resolve 우선순위 (`codex.py:54-101`)

| 순서 | 출처 | 조건 |
|---|---|---|
| 1 | ProfileStore (GEODE-issued OAuth) | `provider == "openai-codex"` and `is_available` and `not managed_by` |
| 2 | ProfileStore (Codex CLI 차용) | `provider == "openai-codex"` and `is_available` (managed_by 무시) |
| 3 | `~/.codex/auth.json` (외부 Codex CLI) | `read_codex_cli_credentials()` 성공 |
| 4 | (없음) | 빈 문자열 — Codex provider 비활성 |

> v0.52.4+ 에서 GEODE-issued 가 Codex CLI 차용보다 *우선*하도록 명시. 이전엔 `build_auth()` 가 외부 CLI를 먼저 등록하면서 GEODE 토큰을 가렸다.

## 클라이언트 (`codex.py:104-129`)

```python
@lru_cache_via_lock
def _get_codex_client() -> openai.OpenAI:
    token = _resolve_codex_token()
    if not token:
        return None
    account_id = _extract_account_id(token)
    headers = {"originator": "codex_cli_rs"}
    if account_id:
        headers["ChatGPT-Account-ID"] = account_id
    return openai.OpenAI(
        api_key=token,
        base_url=CODEX_BASE_URL,
        default_headers=headers,
    )
```

`_codex_lock` (threading.Lock) + double-check pattern으로 thread-safe.

## 호출 제약

- **Streaming 필수** — `store=False, stream=True` (Hermes Agent precedent)
- **Responses API 사용** — `client.responses.stream()` (chat.completions 아님)
- **`instructions` 파라미터** 필수 — system prompt를 instructions로 전달
- **Circuit breaker** — `_codex_circuit_breaker` (`core/llm/fallback.py`) 가 연속 실패 시 일정 시간 차단

## ChatGPT Plus 검증의 진실

> "ChatGPT Plus 가입자만 Codex 호출 가능" 표시는 OAuth JWT의 `chatgpt_plan_type` 클레임에서 옴 (`oauth_login.py:331`). OpenAI가 서명한 클레임이므로 GEODE 측 추가 검증 불필요. 사용자가 Plus를 해지하면 다음 토큰 갱신 때 클레임이 바뀌고, OpenAI 백엔드가 호출 자체를 거부.

## v0.65.0 메모

- `core/cli/tool_handlers.py:handle_manage_login` 결함 수정 — Codex profile이 다른 provider iter 때문에 "provider_mismatch / inactive" 로 *오표시* 되던 문제 해결 ([[manage-login]]).
- 본 Provider 자체의 호출 흐름은 v0.65.0에서 변경 없음.

## 다음

- [[oauth-flow]] — Device-code OAuth
- [[anthropic]] — Anthropic provider (cache_control)
- [[fallback-rotation]] — resolve_routing
