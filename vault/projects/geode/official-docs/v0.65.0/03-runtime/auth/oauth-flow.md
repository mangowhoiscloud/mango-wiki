---
title: OAuth Flow (Device Code + JWT Claims)
category: runtime-auth
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/auth/oauth_login.py:22-30"
  - "core/auth/oauth_login.py:54-148"
  - "core/auth/oauth_login.py:315-368"
  - "core/llm/providers/codex.py:37-101"
external_refs:
---

# OAuth Flow (Device Code + JWT Claims)

GEODE는 OpenAI Codex (ChatGPT Plus 구독 활용) OAuth 흐름을 구현한다. 표준 OAuth 2.0 device-authorization grant.

## 흐름 개요

```
1. Init           → POST _DEVICE_CODE_URL  → device_code, user_code, verification_url
2. User auth      → 브라우저로 verification_url 방문 후 user_code 입력
3. Token poll     → POST _DEVICE_TOKEN_URL with device_code (5s 간격)
4. Token receive  → access_token (JWT), refresh_token, expires_in
5. JWT 파싱       → chatgpt_account_id, chatgpt_plan_type, email 추출
6. Persist        → ~/.geode/auth.toml + ProfileStore + Plan registry
```

## 상수 (`core/auth/oauth_login.py:22-30`)

```
_ISSUER             = "https://auth.openai.com"
_CLIENT_ID          = "<openai-codex-client-id>"
_TOKEN_URL          = f"{_ISSUER}/oauth/token"
_DEVICE_CODE_URL    = f"{_ISSUER}/oauth/device/code"
_DEVICE_TOKEN_URL   = f"{_ISSUER}/oauth/token"
_GEODE_OPENAI_PLAN_ID = "openai-codex-geode"
```

## JWT 클레임 추출 (`oauth_login.py:315-368`)

토큰 교환 후:

```python
import base64, json
parts = access_token.split(".")
if len(parts) >= 2:
    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded))
    auth_claim = payload.get("https://api.openai.com/auth", {})
    profile_claim = payload.get("https://api.openai.com/profile", {})
    account_id = auth_claim.get("chatgpt_account_id", "")
    plan_type = auth_claim.get("chatgpt_plan_type", "")  # "plus", "pro", "free", ...
    email = profile_claim.get("email", "")
```

> **중요**: `chatgpt_plan_type` 은 OpenAI가 서명한 JWT의 클레임이다. 즉 "ChatGPT Plus 구독" 표시는 OpenAI 측 검증이 보장한다 — 별도 API 호출로 재검증할 필요가 없다. (관련 오해는 [[manage-login]] v0.65.0 fix 분석 참조.)

## creds dict → auth.toml

`_persist_oauth_to_authtoml()` (`oauth_login.py:87-148`):

```python
plan = registry.get(_GEODE_OPENAI_PLAN_ID) or Plan(
    id=_GEODE_OPENAI_PLAN_ID,                     # "openai-codex-geode"
    provider="openai-codex",
    kind=PlanKind.OAUTH_BORROWED,
    display_name="OpenAI Codex (GEODE OAuth)",
    base_url="https://chatgpt.com/backend-api/codex",
    auth_type="oauth_external",
    subscription_tier=str(creds.get("plan_type") or "") or None,
)
profile = AuthProfile(
    name=f"{plan.id}:user",                       # "openai-codex-geode:user"
    provider="openai-codex",
    credential_type=CredentialType.OAUTH,
    key=creds["access_token"],
    refresh_token=creds["refresh_token"],
    expires_at=creds["expires_at"],
    plan_id=plan.id,
    metadata={
        "account_id": creds["account_id"],
        "email": creds["email"],
        "plan_type": creds["plan_type"],
        "source": "geode-device-code",
    },
)
```

저장 위치: `~/.geode/auth.toml` (v0.50.2+ SOT).

## 토큰 resolve 우선순위 (`codex.py:54-101`)

```python
def _resolve_codex_token() -> str:
    # 1) GEODE-issued (managed_by 빈 문자열) 우선
    for profile in store.list_all():
        if profile.provider == "openai-codex" and profile.is_available \
           and profile.key and not profile.managed_by:
            return profile.key
    # 2) Codex CLI 차용 (managed_by="codex-cli") 폴백
    for profile in store.list_all():
        if profile.provider == "openai-codex" and profile.is_available and profile.key:
            return profile.key
    # 3) 외부 ~/.codex/auth.json 폴백
    creds = read_codex_cli_credentials()
    if creds:
        return creds["access_token"]
    return ""
```

> v0.52.4+ 에서 GEODE-issued 토큰이 Codex CLI 차용보다 *우선*. 이는 `build_auth()` 가 외부 CLI를 먼저 등록하면서 발생한 shadow 결함 수정.

## ChatGPT-Account-ID 헤더 주입 (`codex.py:104-129`)

```python
account_id = _extract_account_id(token)  # JWT 클레임 재파싱
headers = {"originator": "codex_cli_rs"}
if account_id:
    headers["ChatGPT-Account-ID"] = account_id

_codex_client = openai.OpenAI(
    api_key=token,
    base_url="https://chatgpt.com/backend-api/codex",
    default_headers=headers,
)
```

## 다음

- [[credential-semantics]] — Eligibility 평가
- [[plan-registry]] — Plan + Quota
- [[openai-codex]] — Codex provider 디테일
