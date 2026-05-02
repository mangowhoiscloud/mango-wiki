---
title: manage_login Tool
category: harness-cli
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/cli/tool_handlers.py:882-955"
  - "core/auth/profiles.py:176-261"
  - "core/auth/credential_breadcrumb.py:71-75"
  - "tests/test_manage_login_tool.py"
external_refs:
changelog_refs:
  - "[0.65.0] Fixed (PR #866)"
---

# manage_login Tool

`manage_login` 은 LLM 에이전트가 인증 상태를 자기 진단하고 사용자에게 다음 액션을 안내할 수 있도록 만든 통합 도구다. CLI 슬래시 명령 `/login` 의 LLM-agentic counterpart.

## 핸들러 위치

`core/cli/tool_handlers.py:882-955` — `handle_manage_login(**kwargs)`.

## Subcommand

| Subcommand | 의미 |
|---|---|
| `status` (default) | Plans / Profiles / Routing 스냅샷 반환 |
| `add` | 새 plan 등록 |
| `oauth` | OAuth device-code 흐름 시작 (e.g. `oauth openai`) |
| `set-key` | API key 바인딩 (`set-key glm-coding-lite zai-xx-...`) |
| `use` | 활성 plan 전환 |
| `route` | 모델별 routing override |
| `remove` | profile/plan 삭제 |
| `quota` | 사용량 보고 |

## 출력 구조

```json
{
  "status": "ok",
  "action": "login",
  "subcommand": "status",
  "plans": [
    {"id": "openai-codex-geode", "provider": "openai-codex", "kind": "oauth_borrowed", ...},
    {"id": "glm-coding-lite", "provider": "glm", "kind": "subscription", ...}
  ],
  "profiles": [
    {"name": "openai-codex-geode:user", "provider": "openai-codex", "type": "oauth",
     "eligible": true, "reason": "ok", "reason_detail": ""},
    {"name": "anthropic:work", "provider": "anthropic", "type": "api_key",
     "eligible": true, "reason": "ok", "reason_detail": ""}
  ],
  "routing": {...}
}
```

각 profile의 `eligible` / `reason` 필드는 `ProfileStore.evaluate_eligibility(provider)` 결과에서 파생.

## v0.65.0 결함 수정 (PR #866)

### 증상

LLM이 manage_login 호출 후 등록된 PAYG/OAuth profile들을 "provider_mismatch / 비활성"으로 잘못 보고 → 사용자에게 "openai-codex 외에는 모두 비활성"이라는 잘못된 자기 진단 전달. 실제 `resolve_routing` 은 그 키들을 fallback 체인에서 정상 사용 가능.

### 원인

`tool_handlers.py:917-923` (수정 전) verdict 집계 루프가 dict 키 collision으로 last-write-wins 오류:

```python
verdict_index: dict[tuple[str, str], tuple[bool, str, str]] = {}
for prov in {p.provider for p in store.list_all()}:
    for v in store.evaluate_eligibility(prov):
        verdict_index[(v.profile_name, v.provider)] = (
            v.eligible, v.reason_code, v.detail
        )
```

`evaluate_eligibility(prov)` 는 *모든* profile을 평가한다 — provider != prov 이면 `PROVIDER_MISMATCH` verdict 반환. 이 mismatch verdict 가 dict 키 `(name, profile.provider)` 로 *real verdict* 를 덮어쓴다. set 이터레이션 순서가 string hash 기반이라 비결정적이며, 마지막 prov 가 다른 provider 면 모든 profile 이 mismatch로 표시됨.

### 수정 (`tool_handlers.py:932-933`)

```python
from core.auth.profiles import ProfileRejectReason

for prov in {p.provider for p in store.list_all()}:
    for v in store.evaluate_eligibility(prov):
        if v.reason is ProfileRejectReason.PROVIDER_MISMATCH:
            continue   # cross-provider noise — real verdict는 자기 provider iter에서 옴
        verdict_index[(v.profile_name, v.provider)] = (
            v.eligible, v.reason_code, v.detail
        )
```

### 일관성

`core/auth/credential_breadcrumb.format()` 은 v0.51.0 부터 같은 필터를 적용 중이었다 (`credential_breadcrumb.py:71-72`):

```python
relevant_rejected = [
    v for v in rejected if v.reason is not ProfileRejectReason.PROVIDER_MISMATCH
]
```

v0.65.0 fix 는 동일 필터를 `manage_login` 에도 적용해 *어휘 일관성* 을 회복.

### 회귀 테스트

`tests/test_manage_login_tool.py::TestVerdictPerOwnProvider`:

```python
def test_multi_provider_profiles_keep_real_verdicts(...):
    for name, provider in (
        ("openai-codex:user", "openai-codex"),
        ("openai:work", "openai"),
        ("anthropic:work", "anthropic"),
    ):
        store.add(AuthProfile(name=name, provider=provider, ...))
    result = _handler()(subcommand="status")
    for p in result["profiles"]:
        if p["name"] in {"openai-codex:user", "openai:work", "anthropic:work"}:
            assert p["eligible"] is True
            assert p["reason"] != "provider_mismatch"
```

fix 제거 시 마지막 set-iter prov가 아닌 모든 profile이 fail — 정확히 사용자가 본 증상 재현.

## Safety 등록

manage_login 은 WRITE_TOOLS 에 포함 (`core/agent/safety.py`):

| 등록 위치 | 효과 |
|---|---|
| `WRITE_TOOLS` | ApprovalWorkflow 트리거 |
| `SUBAGENT_DENIED_TOOLS` | sub-agent에서 호출 금지 |
| `error_recovery._EXCLUDED_TOOLS` | 실패 시 자동 재시도 안 함 |

거부 시 fallback hint: "Run `/login` slash command instead" (`core/agent/approval.py:_write_denial_with_fallback`).

## 다음

- [[credential-semantics]] — eligibility 평가 룰
- [[plan-registry]] — Plan + routing
- [[approval]] — Approval Workflow
- [[changelog]] — v0.65.0 변경 항목
