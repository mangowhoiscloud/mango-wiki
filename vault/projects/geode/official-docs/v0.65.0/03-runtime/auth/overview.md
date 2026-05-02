---
title: Auth Overview
category: runtime-auth
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/auth/profiles.py"
  - "core/auth/plans.py"
  - "core/auth/plan_registry.py"
  - "core/auth/oauth_login.py"
  - "core/auth/credential_breadcrumb.py"
  - "core/lifecycle/container.py:39-360"
external_refs:
---

# Auth Overview

GEODE 인증은 **Plan + Profile + Routing** 3개 추상화로 분리된다.

## 책임 분리

| 컴포넌트 | 책임 | 파일 |
|---|---|---|
| **Plan** | 인증 자원 단위 (구독 / OAuth 차용 / PAYG / 클라우드) | `core/auth/plans.py` |
| **Profile** | 실제 자격증명 보관 (key/token + state) | `core/auth/profiles.py` |
| **PlanRegistry** | Plan + 모델 라우팅 + Quota | `core/auth/plan_registry.py` |
| **ProfileStore** | Profile in-memory store + eligibility 평가 | `core/auth/profiles.py` |
| **ProfileRotator** | LRU + cooldown 기반 profile 선택 | `core/auth/profile_rotator.py` |
| **OAuth Login** | Device-code 흐름 + JWT 클레임 추출 | `core/auth/oauth_login.py` |
| **Credential Breadcrumb** | LLM-readable 인증 노트 생성 | `core/auth/credential_breadcrumb.py` |

## 데이터 흐름

```
[사용자]  /login oauth openai
   ↓
oauth_login._device_authorization_grant()
   ↓
JWT 파싱 → creds = {access_token, refresh_token, plan_type, account_id}
   ↓
_persist_oauth_to_authtoml(creds)
   ├── plan = Plan(id="openai-codex-geode", kind=OAUTH_BORROWED, ...)
   ├── profile = AuthProfile(name="openai-codex-geode:user", credential_type=OAUTH, ...)
   └── save_auth_toml() → ~/.geode/auth.toml
   ↓
ProfileStore 메모리 등록 (lifecycle/container.build_auth())
```

LLM 호출 시:

```
LLMAdapter.invoke(model="claude-sonnet-4-6")
   ↓
resolve_routing("claude-sonnet-4-6")
   ├── Step 1: 명시 라우팅 검사
   ├── Step 2: Equivalence-class 폴백 (anthropic class)
   ├── Step 3: 단일 provider 폴백
   └── Step 4: PAYG plan 합성
   ↓
RoutingTarget(plan, profile, base_url, api_key)
   ↓
provider 클라이언트 (Anthropic OpenAI Codex GLM ...) 호출
   ↓
실패 → profile.error_count++ → cooldown_until set
   → 다음 호출은 다른 profile / fallback
```

## 저장소

```
~/.geode/auth.toml          ← Plan + Profile SOT (v0.50.2+)
~/.geode/auth.json          ← legacy (자동 마이그레이션 → auth.json.migrated.bak)
~/.codex/auth.json          ← 외부 Codex CLI (read-only fallback)
```

## v0.65.0 fix 영향

`manage_login` tool 보고가 PAYG/OAuth profile들을 mismatch로 잘못 표시하던 결함은 *보고만* 수정. 위 데이터 흐름 자체는 v0.64.0과 동일. ([[manage-login]])

## 다음

- [[credential-semantics]] — Eligibility 평가 룰
- [[oauth-flow]] — OAuth device-code
- [[plan-registry]] — Plan + Equivalence-class
- [[breadcrumb]] — Credential breadcrumb
