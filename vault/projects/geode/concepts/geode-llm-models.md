---
title: GEODE LLM Models
category: concepts
tags: [geode, llm, anthropic, openai, codex, glm, fallback, failover, reasoning, opus-4-7, gpt-5.5, glm-5.1]
sources:
  - "geode/core/config.py:374-395,410,545-550"
  - "geode/core/llm/registry.py:33-79,106-109"
  - "geode/core/llm/providers/anthropic.py:297,312,376-454"
  - "geode/core/llm/providers/openai.py"
  - "geode/core/llm/providers/codex.py:37-100"
  - "geode/core/llm/providers/glm.py:33-49,118,206"
  - "geode/core/llm/router.py"
  - "geode/core/llm/fallback.py"
  - "geode/core/llm/errors.py:159-196,332-333"
  - "geode/core/llm/token_tracker.py:198-226"
  - "geode/CHANGELOG.md (v0.54.0–v0.64.0, 2026-04-28 ~ 2026-04-29)"
created: 2026-04-07T07:59:58Z
updated: 2026-05-01T04:55:00Z
---

# GEODE LLM Models

> **한 줄 요약**: 4 프로바이더(Anthropic / OpenAI PAYG / OpenAI Codex / ZhipuAI GLM) × 14 모델. v0.53.0 이후 fallback depth=1 (primary→secondary)로 fail-fast 정책. cross-provider failover는 opt-in. 모든 가격·컨텍스트는 v0.62.0 (2026-04-28) 기준 코드 실측.

## 1. Provider 매트릭스

| Provider | Auth | Endpoint | 디폴트 모델 | 비고 |
|---|---|---|---|---|
| **Anthropic** | API key (`x-api-key`) | `api.anthropic.com` | `claude-opus-4-7` | Primary 에이전트 backbone |
| **OpenAI PAYG** | Bearer | `api.openai.com` | `gpt-5.5` | Cross-LLM secondary, Responses reasoning |
| **OpenAI Codex** | OAuth (`oauth_external`) | `chatgpt.com/backend-api/codex` | `gpt-5.5` | Plus 구독 quota, Codex-only 모델 포함 |
| **ZhipuAI GLM** | Bearer | `api.z.ai/api/coding/paas/v4` (Coding Plan) / `paas/v4` (PAYG) | `glm-5.1` | 200K 컨텍스트 한도, always-on thinking |

`PROVIDER_VARIANTS` 레지스트리: `core/llm/registry.py:47-79`

## 2. 모델 카탈로그 (v0.62.0 코드 실측)

가격 refresh: 2026-04-26 (platform.claude.com / developers.openai.com / docs.z.ai).
컨텍스트 윈도우: `core/llm/token_tracker.py:198-226`.

### 2.1 Anthropic (4 모델)

| Model ID | Input $/M | Output $/M | Context | Adaptive | xhigh | Fallback |
|---|---|---|---|---|---|---|
| **`claude-opus-4-7`** | $5.00 | $25.00 | 1M | ✓ | **✓ only** | **Primary** |
| `claude-opus-4-6` | $5.00 | $25.00 | 1M | ✓ | ✗ | (legacy primary) |
| `claude-sonnet-4-6` | $3.00 | $15.00 | 1M | ✓ | ✗ | Fallback-1 |
| `claude-haiku-4-5-20251001` | $1.00 | $5.00 | 200K | ✗ | ✗ | Budget tier |

캐시 가격: write = input × 1.25, read = input × 0.1.

```python
# core/config.py:374-377
ANTHROPIC_PRIMARY = "claude-opus-4-7"
ANTHROPIC_SECONDARY = "claude-sonnet-4-6"
ANTHROPIC_BUDGET = "claude-haiku-4-5-20251001"
ANTHROPIC_FALLBACK_CHAIN: list[str] = [ANTHROPIC_PRIMARY, ANTHROPIC_SECONDARY]
```

Adaptive thinking 게이트는 [[geode-adaptive-thinking|adaptive thinking]] 참조.

### 2.2 OpenAI PAYG (4 모델 + 2 reasoning)

| Model ID | Input $/M | Output $/M | Context | 비고 |
|---|---|---|---|---|
| **`gpt-5.5`** | $5.00 | $30.00 | 1.05M | **Primary**, Responses reasoning |
| `gpt-5.4` | $2.50 | $15.00 | 1.05M | Fallback-1 |
| `gpt-5.4-mini` | $0.75 | $4.50 | 1.05M | (chain 미포함) |
| `gpt-5.3-codex` | $1.75 | $14.00 | 200K | (chain 미포함) |
| `o3` | $2.00 | $8.00 | (reasoning) | Reasoning 토큰은 output 과금 |
| `o4-mini` | $1.10 | $4.40 | (reasoning) | Reasoning 토큰은 output 과금 |

```python
# core/config.py:382-383
OPENAI_PRIMARY = "gpt-5.5"
OPENAI_FALLBACK_CHAIN: list[str] = ["gpt-5.5", "gpt-5.4"]
```

### 2.3 OpenAI Codex (Plus 구독, OAuth)

| Model ID | Auth | Fallback | 비고 |
|---|---|---|---|
| **`gpt-5.5`** | OAuth | **Primary** | Codex-only 강제 |
| `gpt-5.5-pro` | OAuth | Secondary | Codex-only 강제 |
| `gpt-5.3-codex` | OAuth | Fallback-1 | Codex 엔드포인트 |

```python
# core/config.py:388-390
CODEX_PRIMARY = "gpt-5.5"
CODEX_FALLBACK_CHAIN: list[str] = ["gpt-5.5", "gpt-5.3-codex"]
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"

# core/config.py:410
_CODEX_ONLY_MODELS: frozenset[str] = frozenset({"gpt-5.5", "gpt-5.5-pro"})
```

`_CODEX_ONLY_MODELS`는 PAYG 키로 호출 시 명시적 reject — Plus 구독 quota만 쓰도록 게이트.

### 2.4 ZhipuAI GLM (6 모델, 모두 200K + always-on thinking)

| Model ID | Input $/M | Output $/M | Context | Fallback |
|---|---|---|---|---|
| **`glm-5.1`** | $1.40 | $4.40 | 200K | **Primary** |
| `glm-5` | $1.00 | $3.20 | 200K | Fallback-1 |
| `glm-5-turbo` | $1.20 | $4.00 | 200K | (chain 미포함) |
| `glm-5v-turbo` | (n/a) | (n/a) | 200K | Vision |
| `glm-4.7` | $0.60 | $2.20 | 200K | (chain 미포함) |
| `glm-4.7-flash` | $0 | $0 | 200K | Free tier |

```python
# core/config.py:394-395
GLM_PRIMARY = "glm-5.1"
GLM_FALLBACK_CHAIN: list[str] = ["glm-5.1", "glm-5"]
GLM_BASE_URL = "https://api.z.ai/api/coding/paas/v4"        # Coding Plan
GLM_PAYG_BASE_URL = "https://api.z.ai/api/paas/v4"          # PAYG
```

GLM 4.5+ 전 모델이 thinking 활성. `_GLM_THINKING_MODELS` frozenset 정의(`providers/glm.py:118`), 호출 site(`providers/glm.py:206`):

```python
# providers/glm.py:206 (호출부)
local_extra["thinking"] = {"type": "enabled", "clear_thinking": False}
```

## 3. Fallback 정책 — depth=1 fail-fast (v0.53.0+)

### 3.1 체인 구조

| 프로바이더 | 체인 | 깊이 |
|---|---|---|
| Anthropic | `claude-opus-4-7 → claude-sonnet-4-6` | 2 |
| OpenAI PAYG | `gpt-5.5 → gpt-5.4` | 2 |
| Codex | `gpt-5.5 → gpt-5.3-codex` | 2 |
| GLM | `glm-5.1 → glm-5` | 2 |

> v0.53.0에서 depth를 줄였다. 이전엔 `opus → sonnet → haiku → glm` 같은 deep chain이 있었지만, *cost transparency*와 *fail-fast 거버넌스*를 위해 primary→secondary 1단으로 축약. 자세한 동작은 [[geode-agentic-loop]] 참조.

### 3.2 Cross-provider failover (opt-in, v0.52.2+)

```python
# core/config.py:319-320
llm_cross_provider_failover: bool = False
llm_cross_provider_order: list[str] = ["anthropic", "openai", "glm"]
```

디폴트 비활성. 명시 활성 시 `anthropic → openai → glm` 순서로 walk. Codex는 cross-provider 체인에 안 들어감 (구독 quota 분리).

### 3.3 Failover 코드 진입점

| 위치 | 책임 |
|---|---|
| `core/llm/providers/anthropic.py:236-269` | Per-provider retry+backoff |
| `core/llm/fallback.py` | Generic `retry_with_backoff_generic` + `CircuitBreaker` |
| `core/llm/router.py::call_with_failover` | Async router, failover_models walker |
| `core/llm/errors.py:159-196` | 에러 분류 (트리거 vs 터미널) |

### 3.4 Failover 트리거 분류 (`errors.py:159-196`)

| 에러 종류 | 동작 |
|---|---|
| Rate limit / Timeout / Connection / 5xx | Retry + backoff → 다음 모델 |
| Auth / BadRequest / Billing | **Terminal** (다음 모델로도 안 넘어감) |
| Context overflow | 별도 분류 (§ 5) |

## 4. Adaptive thinking / Reasoning effort

5단계 effort enum: `low | medium | high | max | xhigh`. 디폴트 `agentic_effort = "high"` (`core/config.py:255`).

### 4.1 Anthropic Adaptive (Opus 4.6+, Sonnet 4.6)

```python
# core/llm/providers/anthropic.py:297, 312
_ADAPTIVE_MODELS = frozenset({"claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"})
_XHIGH_EFFORT_MODELS = frozenset({"claude-opus-4-7"})
```

Wire 형식:

```python
thinking_param = {"type": "adaptive", "display": "summarized"}
output_config = {"effort": effective_effort}
call_temperature = None  # adaptive는 sampling 거부
```

`xhigh` 권한은 Opus 4.7만. 4.6/Sonnet에 보내면 자동 `"max"` 다운그레이드. 자세한 게이트와 동적 다운그레이드는 [[geode-adaptive-thinking]] 참조.

### 4.2 OpenAI Responses Reasoning (gpt-5.x + o-series, v0.60.0)

```python
# providers/openai.py
def _is_payg_reasoning_model(model: str) -> bool:
    return model.startswith("gpt-5") or model in {"o3", "o4-mini"}

reasoning = {"effort": effort, "summary": "auto"}
include = ["reasoning.encrypted_content"]
store = False
```

Encrypted reasoning round-trip: 멀티턴에서 prior `codex_reasoning_items`를 `inject_reasoning_replay` (공유 헬퍼, v0.60.0)로 다음 turn input array에 재주입. ID는 strip, encrypted blob만 carry.

### 4.3 GLM Thinking (binary gate)

```python
# providers/glm.py:206
thinking = {"type": "enabled", "clear_thinking": False}
```

GLM-5.x는 항상 활성, 비활성 옵션 무시. `reasoning_content`를 `AgenticResponse.reasoning_summaries`로 추출 (v0.58.0 R2).

### 4.4 Per-provider effort enum 매핑

`core/cli/effort_picker.py` 두 축 picker (model ↑↓, effort ←→, v0.59.0 R8). v0.61.0부터 picker 선택은 `settings + .env + config.toml` 3중 영속.

## 5. Context overflow 처리

### 5.1 Anthropic 1M 모델 (server-side compaction, v0.56.0+)

```python
# providers/anthropic.py:421-436
extra_h["anthropic-beta"] = "context-management-2025-06-27,compact-2026-01-12"
extra_b["context_management"] = {
    "edits": [
        {"type": "clear_tool_uses_20250919", "keep": {"type": "tool_uses", "value": 5}},
        {"type": "compact_20260112", "trigger": {"type": "input_tokens", "value": m_trigger}},
    ]
}
# m_trigger = max(50_000, int(m_window * 0.8))
```

대상: `_CONTEXT_MGMT_MODELS = {opus-4-7, opus-4-6, opus-4-5, sonnet-4-6, sonnet-4-5}`.

### 5.2 GLM 200K cap (v0.53.0 이후 error 분류 의존)

GLM은 server-side compaction 없음 → BadRequestError 패턴 매칭으로 overflow 식별:

```python
# core/llm/errors.py:195-196
if "token" in msg or "context" in msg or "prompt exceeds" in msg or "max length" in msg:
    return _ERROR_CLASSIFICATION["context_overflow"]
```

[[geode-context-guard]]가 token_tracker로 사용량 추적, [[geode-context-overflow-prevention]]이 prevention 전략 정리.

### 5.3 Tool result 토큰 가드

```python
# core/config.py:238
max_tool_result_tokens: int = 25000   # 0 = no limit
compact_keep_recent: int = 10         # compaction 보존 라운드
observation_mask_keep_rounds: int = 3
```

## 6. OAuth 자세히 — [[geode-oauth-policy]] 참조

- **Anthropic OAuth**: ToS 위반으로 비활성. `PROVIDER_EQUIVALENCE["anthropic"] = ["anthropic"]` (OAuth variant 없음, `registry.py:106-109`)
- **OpenAI Codex OAuth**: GEODE-issued 토큰 우선, Codex CLI 토큰 fallback. JWT의 `chatgpt_account_id` 추출, Cloudflare bypass 헤더(`User-Agent: codex_cli_rs/0.0.0 (GEODE)`, `originator: codex_cli_rs`).

## 7. 최근 LLM 관련 변경 (CHANGELOG, 2026-04-28 ~ 2026-04-29)

| 버전 | 날짜 | 변경 | 영향 |
|---|---|---|---|
| Unreleased | 2026-04-29 | Messages-level cache_control (Hermes `system_and_3` parity, PR #864/865) | 시스템 블록 + 3-slot rolling history caching (Anthropic 4-slot cap) |
| 0.64.0 | 2026-04-29 | Game IP domain → plugins namespace | 인프라 (모델 변경 없음) |
| 0.63.0 | 2026-04-29 | Lifecycle commands (`/stop`, `/clean`, `/uninstall`) | UX |
| 0.62.0 | 2026-04-28 | R9 — live reasoning-depth wire tests | 5-chain wire 검증 (`@pytest.mark.live`) |
| 0.61.0 | 2026-04-28 | Picker durable persistence (effort + model → config.toml) | env wipe 생존 |
| 0.60.0 | 2026-04-28 | R3-mini — PAYG OpenAI Responses reasoning parity | gpt-5.x `reasoning.encrypted_content` + multi-turn replay |
| 0.59.0 | 2026-04-28 | Two-axis picker (model ↑↓, effort ←→) | UX |
| 0.58.0 | 2026-04-28 | R2 — GLM thinking field activation | `extra_body.thinking.type=enabled` for GLM-4.5+ |
| 0.57.0 | 2026-04-28 | R6 — `reasoning_summary` IPC event surface to AgenticUI | Live reasoning trace |
| 0.56.0 | 2026-04-28 | R4-mini — Opus 4.7 `xhigh` + `display="summarized"` | 신 effort 등급, 4.6/Sonnet 다운그레이드 |
| 0.55.x | 2026-04-28 | R1/R5 — Codex Plus 멀티턴 encrypted reasoning + sub-agent wiring | Multi-turn reasoning carry |
| 0.54.0 | 2026-04-28 | First-run setup wizard + Codex OAuth proactive detection | `/geode setup`, `/geode about`, `/geode doctor bootstrap` |

마지막 모델 추가: `o4-mini` (v0.55.0). 모델 제거 없음.

## 8. 운영 체크리스트

신모델 추가/모델 제거 시:

- [ ] `core/config.py`의 `*_PRIMARY` / `*_FALLBACK_CHAIN` 갱신
- [ ] `_CODEX_ONLY_MODELS` / `_ADAPTIVE_MODELS` / `_XHIGH_EFFORT_MODELS` / `_CONTEXT_MGMT_MODELS` / `_GLM_THINKING_MODELS` frozenset 갱신
- [ ] `token_tracker.py:MODEL_CONTEXT_WINDOW` 갱신
- [ ] 가격을 official docs(2026-04-26 기준 reaffirm)에 맞춰 검증
- [ ] `tests/test_e2e_live_reasoning_depth.py::TestAnthropicXhighLive` R9 live test 실행
- [ ] 본 페이지(geode-llm-models.md)와 [[geode-adaptive-thinking]] 동기화

## Related

- [[geode-architecture]] — 4-layer stack, Model layer
- [[geode-agentic-loop]] — `while(tool_use)` LLM 호출 + failover walker
- [[geode-adaptive-thinking]] — Anthropic adaptive 7단 파이프라인 + xhigh 게이트
- [[geode-oauth-policy]] — Anthropic OAuth 비활성, Codex OAuth 활성, GEODE-issued 우선
- [[geode-context-guard]] — token_tracker + context usage %
- [[geode-context-overflow-prevention]] — server-side compaction + sidecar 분리
- [[geode-system-index]] — 22 LLM 모듈 카탈로그
- [[geode]] — 프로젝트 hub
