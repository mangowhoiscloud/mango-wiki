---
title: Credential Breadcrumb
category: runtime-memory
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/auth/credential_breadcrumb.py:47-150"
external_refs:
  - url: "https://docs.claude.com/en/docs/claude-code"
    pattern: "createModelSwitchBreadcrumbs"
---

# Credential Breadcrumb

LLM 호출이 인증 실패로 cooldown 진입한 경우, *다음 turn*의 system context에 LLM이 읽을 수 있는 인증 노트를 자동 주입한다. Claude Code의 `createModelSwitchBreadcrumbs` 패턴 차용.

## 위치

`core/auth/credential_breadcrumb.py:47-150` — `format(verdicts, attempted_provider, attempted_model)`.

## 출력 예

```
[system] credential note for openai-codex model=gpt-5:
  eligible: openai-codex-geode:user(oauth)
  rejected:
    - openai:work [cooling_down] 47s remaining (error_count=3) → rate-limited or upstream rejected — wait until cooldown clears, or call manage_login(subcommand='use', args='<other-plan>') to switch
  cross-provider: anthropic(anthropic:work) — switch with manage_login(subcommand='use', args='<plan-id>') or have the user run /model <slug>.
```

## 동작

1. `ProfileStore.evaluate_eligibility(provider)` 호출 → `EligibilityResult` 리스트
2. `eligible` 와 `rejected` 분리
3. **PROVIDER_MISMATCH 필터** (line 71-72) — cross-provider noise 제거
4. eligible 있으면 prefix 표시
5. rejected 있으면 reason + `_NEXT_ACTION[reason]` 힌트 (e.g. EXPIRED → `manage_login(subcommand='oauth', args='openai')`)
6. **모든 profile reject 시** — `_suggest_alternative_providers(exclude=attempted_provider)` 호출 → 다른 provider의 healthy profile 나열

## _NEXT_ACTION 매핑

| reason | 힌트 |
|---|---|
| `PROVIDER_MISMATCH` | "this profile belongs to a different provider; ignore for current call" (실제론 필터로 제외) |
| `DISABLED` | "user explicitly disabled this profile; do not auto-re-enable" |
| `EXPIRED` | "OAuth token expired — call `manage_login(subcommand='oauth', args='openai')` to refresh" |
| `COOLING_DOWN` | "rate-limited — wait until cooldown clears, or call `manage_login(subcommand='use', args='<other-plan>')`" |
| `MISSING_KEY` | "no API key registered — call `manage_login(subcommand='set-key', args='<plan-id> <key>')`" |

## 호출 처

`core/agent/loop.py` 가 LLM 호출 실패 후 다음 turn의 messages에 prefix 추가:

```
[system] credential note: ...
[user] (원래 사용자 입력 또는 도구 결과)
```

LLM은 이 노트를 읽고 → 사용자에게 상황 설명 → `manage_login` 도구 호출 또는 응답 생성.

## OpenClaw Lane fail-over 빌림

`_suggest_alternative_providers()` (line 123-150) — Session Lane 의 다른 healthy provider로 자동 안내. OpenClaw 의 Lane fail-over 패턴 차용 (출처: docs.openclaw.ai).

## v0.65.0 manage_login fix와의 관계

`format()` 의 PROVIDER_MISMATCH 필터(line 71-72)는 v0.51.0 부터 존재했다. v0.65.0에서 `manage_login` 도구가 *동일* 필터를 적용해 어휘 일관성 회복 — 즉 v0.65.0은 breadcrumb의 기존 룰을 한 곳에 더 박은 셈.

## 다음

- [[credential-semantics]] — Eligibility 평가
- [[manage-login]] — manage_login tool
- [[5-tier-context]] — Memory 계층
