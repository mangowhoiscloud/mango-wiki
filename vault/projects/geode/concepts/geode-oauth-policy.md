---
title: GEODE OAuth Policy
category: concepts
tags: [geode, oauth, anthropic, openai, codex, managed-credentials, jwt, cloudflare-bypass]
related:
  - "[[geode-architecture]]"
  - "[[geode-llm-models]]"
  - "[[mango]]"
sources:
  - "geode/core/llm/registry.py:33-79,106-109"
  - "geode/core/llm/providers/codex.py:37-100"
  - "geode/core/llm/providers/glm.py:33-49"
  - "geode/CHANGELOG.md (v0.54.0 first-run setup wizard + Codex OAuth proactive detection)"
created: 2026-04-07T00:00:00Z
updated: 2026-05-01T05:00:00Z
---

# GEODE OAuth Policy

OpenClaw `managedBy` 패턴 — 외부 CLI 토큰을 *읽되 사본 보관 안 함*. v0.54.0부터 **GEODE-issued 토큰**(`/login oauth openai`)이 추가되어 Codex CLI fallback 위에 올라감.

## Provider 상태 (2026-05)

| Provider | OAuth 출처 | 정책 | GEODE 동작 |
|---|---|---|---|
| Anthropic | Claude Code Keychain | **금지** (ToS 2026-01-09) | 비활성. `PROVIDER_EQUIVALENCE["anthropic"] = ["anthropic"]` (OAuth variant 등록 안 됨) |
| OpenAI | (1) GEODE `/login oauth openai`, (2) Codex CLI `~/.codex/auth.json` | **허용** (공식 endorsement) | 활성. 우선순위: GEODE-issued > Codex CLI |

## Codex Provider 등록 (`registry.py:60-66`)

```python
ProviderSpec(
    id="openai-codex",
    display_name="OpenAI Codex (Plus)",
    default_base_url="https://chatgpt.com/backend-api/codex",
    auth_type="oauth_external",
    extra_headers_factory=_codex_extra_headers,
)
```

`auth_type="oauth_external"` — 표준 bearer가 아닌 외부 OAuth 토큰.

## Token 우선순위 & 라이프사이클

```
v0.54.0+ 우선순위:
  1순위: GEODE-issued OAuth token   (via /login oauth openai)
  2순위: Codex CLI auth             (~/.codex/auth.json, 기존 사용자 fallback)

읽기 → read_codex_cli_credentials()  (TTL 15min + mtime cache)
     → ProfileRotator OAUTH(0) > API_KEY(2)
     → OpenAI SDK client
     → 401? → 재읽기 + client reset → 1회 재시도
```

코드 위치: `core/llm/providers/codex.py:54-100`.

## JWT 파싱 — chatgpt_account_id 추출

Codex 엔드포인트는 호출자 account 식별 필요. JWT payload에서 추출:

```python
# core/llm/providers/codex.py:37-51
def _extract_account_id(token: str) -> str:
    parts = token.split(".")
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * padding))
    auth_claim = payload.get("https://api.openai.com/auth", {})
    return auth_claim.get("chatgpt_account_id", "")
```

토큰을 디코드만 하고 *서명 검증 안 함* — 발급자(openai) 신뢰 모델. account_id는 헤더에 첨부.

## Cloudflare Bypass 헤더 (`registry.py:33-44`)

`chatgpt.com/backend-api/codex` 엔드포인트는 표준 SDK User-Agent로 호출 시 Cloudflare WAF에 차단됨. 우회:

```python
def _codex_extra_headers(_access_token: str) -> dict[str, str]:
    return {
        "User-Agent": "codex_cli_rs/0.0.0 (GEODE)",
        "originator":  "codex_cli_rs",
    }
```

**의도**: Codex CLI(Rust)와 동일한 wire 시그니처 흉내 — Anthropic과 달리 OpenAI는 Codex CLI 사용을 공식 endorse하므로 이 흉내가 ToS-안전.

## Codex-only 모델 게이트 (`config.py:410`)

```python
_CODEX_ONLY_MODELS: frozenset[str] = frozenset({"gpt-5.5", "gpt-5.5-pro"})
```

이 모델들은 PAYG API 키로 호출 시 명시 reject — Plus 구독 quota 우회 차단. 자세한 모델 매트릭스는 [[geode-llm-models]] 참조.

## web_search 예외 (기존)

Codex OAuth 토큰은 `web_search` native tool 권한 부족 → 401.
`_openai_search`는 `settings.openai_api_key`를 직접 써서 ProfileRotator 우회.

## Setup UX (v0.54.0)

`/geode setup` first-run wizard, `/geode about` 진단, `/geode doctor bootstrap`이 Codex 토큰을 silent로 자동 감지 — 사용자가 명시 `/login` 안 해도 기존 Codex CLI 인증이 있으면 즉시 활용.

## Related

- [[geode-architecture]]
- [[geode-llm-models]] — 4 프로바이더 × 14 모델 매트릭스, Codex-only 게이트
- [[mango]]
- [[geode-claude-code-patterns]]
- [[geode-openclaw-patterns]]
- [[geode]]
- [[index]]

## Open Questions

- Will Anthropic reverse the ToS restriction for coding agents?
- GEODE-issued OAuth가 우선이라면 향후 Codex CLI fallback 제거 시점은? (사용자 분포 모니터링 필요)
- [[geode-session-58-retrospective]]
