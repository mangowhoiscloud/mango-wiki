---
title: Credential Semantics & Eligibility
category: runtime-auth
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/auth/profiles.py:21-48"
  - "core/auth/profiles.py:75-129"
  - "core/auth/profiles.py:176-261"
  - "core/auth/credential_breadcrumb.py:47-150"
external_refs:
  - url: "https://docs.openclaw.ai/auth-credential-semantics.md"
    pattern: "AuthCredentialReasonCode 매핑"
---

# Credential Semantics & Eligibility

GEODE는 모든 LLM 호출 자격을 **EligibilityResult** verdict 단위로 관리한다. 인증이 실패할 수 있는 5가지 이유가 enum으로 박혀 있고, 매 호출마다 활성 profile들을 평가해 첫 통과한 것을 사용한다.

## CredentialType (3종)

`core/auth/profiles.py:21-34`:

| Type | Value | 우선순위 | 용도 |
|---|---|---|---|
| `OAUTH` | `"oauth"` | 0 (높음) | ChatGPT Plus / Claude Pro device-code 흐름 |
| `TOKEN` | `"token"` | 1 | 사전 발급 토큰 |
| `API_KEY` | `"api_key"` | 2 (낮음) | 표준 PAYG API key |

`TYPE_PRIORITY` dict로 정의. 같은 provider에 여러 profile이 있으면 OAuth → Token → API_Key 순으로 라우팅.

## ProfileRejectReason (5종)

`core/auth/profiles.py:37-48`:

| Reason | 의미 | 사용자 액션 힌트 |
|---|---|---|
| `PROVIDER_MISMATCH` | profile.provider ≠ 요청된 provider | (실제 차단 의미 아님 — UI noise) |
| `DISABLED` | 사용자가 명시적으로 비활성화 | `manage_login enable <name>` |
| `EXPIRED` | OAuth 토큰 만료 | `manage_login oauth <provider>` 재인증 |
| `COOLING_DOWN` | rate-limit/upstream 거부 후 cooldown 중 | 대기 또는 다른 plan 사용 |
| `MISSING_KEY` | profile에 key 미설정 | `manage_login set-key <plan-id> <key>` |

OpenClaw의 `AuthCredentialReasonCode` 와 1:1 매핑되도록 설계 (출처: docs.openclaw.ai).

## AuthProfile dataclass

`core/auth/profiles.py:75-129`:

```python
@dataclass
class AuthProfile:
    name: str                  # e.g. "anthropic:work"
    provider: str              # e.g. "anthropic", "openai-codex"
    credential_type: CredentialType
    key: str = ""
    refresh_token: str = ""
    expires_at: float = 0.0
    managed_by: str = ""       # external CLI 소유 여부 (e.g. "codex-cli")
    last_used: float = 0.0
    error_count: int = 0
    cooldown_until: float = 0.0
    disabled: bool = False
    plan_id: str | None = None
    base_url_override: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
```

핵심 속성:
- `is_expired` — `time.time() > expires_at`
- `is_cooling_down` — `time.time() < cooldown_until`
- `is_available` — `not disabled and not is_expired and not is_cooling_down and key`
- `sort_key()` — TYPE_PRIORITY + LRU `last_used`

## evaluate_eligibility (핵심 함수)

`core/auth/profiles.py:176-261`:

```python
def evaluate_eligibility(self, provider: str) -> list[EligibilityResult]:
    """Return one verdict per profile in store, against the given provider."""
    results = []
    for p in self._profiles.values():
        if p.provider != provider:
            results.append(make(False, PROVIDER_MISMATCH, ...))
            continue
        if p.disabled:
            results.append(make(False, DISABLED, ...))
            continue
        if not p.key:
            results.append(make(False, MISSING_KEY, ...))
            continue
        if p.expires_at and time.time() > p.expires_at:
            results.append(make(False, EXPIRED, ...))
            continue
        if time.time() < p.cooldown_until:
            results.append(make(False, COOLING_DOWN, ...))
            continue
        results.append(make(True))  # eligible
    return results
```

5단계 순차 검사. 통과한 profile만 `eligible=True`.

## PROVIDER_MISMATCH의 미묘함 — v0.65.0 fix 케이스

`evaluate_eligibility(provider="X")` 는 store의 *모든* profile을 평가한다. provider != X인 profile은 `PROVIDER_MISMATCH` 로 자동 reject. 이는 *진짜* 차단이 아니라 "다른 provider 소속" 표시일 뿐이다.

문제: 외부 사용처가 dict 키 `(name, profile.provider)` 로 verdict를 저장하면서 set의 모든 provider를 iter하면, 마지막 iteration이 mismatch verdict로 *real verdict*를 덮어쓴다.

**v0.65.0 (PR #866) 에서 `core/cli/tool_handlers.py:handle_manage_login` 에 필터 추가**:

```python
if v.reason is ProfileRejectReason.PROVIDER_MISMATCH:
    continue  # cross-provider noise — real verdict는 자기 provider iter에서 옴
```

`credential_breadcrumb.format()` 은 v0.51.0 부터 같은 필터를 적용 중이었다 (`core/auth/credential_breadcrumb.py:71-72`):

```python
relevant_rejected = [
    v for v in rejected if v.reason is not ProfileRejectReason.PROVIDER_MISMATCH
]
```

이 일관성 회복이 fix의 본질. 자세한 이야기는 [[manage-login]].

## EligibilityResult 사용처

| 소비자 | 용도 |
|---|---|
| `ProfileRotator.resolve()` | 다음 호출에 쓸 profile 선택 |
| `manage_login` tool | LLM/대시보드 보고 |
| `credential_breadcrumb.format()` | LLM-readable 인증 노트 (auth 실패 시 다음 turn 컨텍스트에 주입) |

## 다음

- [[oauth-flow]] — OAuth device-code 흐름
- [[plan-registry]] — Plan ↔ Profile 결합, equivalence-class fallback
- [[manage-login]] — manage_login tool + v0.65.0 fix
- [[breadcrumb]] — credential_breadcrumb 패턴
