---
title: Anthropic Provider
category: runtime-llm-providers
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/providers/anthropic.py:152-228"
  - "core/llm/providers/anthropic.py:473-501"
  - "tests/test_anthropic_messages_cache.py"
external_refs:
  - url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching"
    pattern: "ephemeral cache_control"
---

# Anthropic Provider

Anthropic Claude 모델 호출 어댑터. v0.65.0의 핵심 추가는 **Hermes-precedent의 messages-level cache_control** 적용.

## Cache Control 4-슬롯 활용

Anthropic은 `cache_control: {"type": "ephemeral"}` 를 메시지에 마킹하면 해당 위치 이전 prefix를 5분간 캐시한다. 슬롯 한도 4개. GEODE는 이를 다음과 같이 분할:

| 슬롯 | 위치 | 용도 |
|---|---|---|
| 1-2 | system block | STATIC + DYNAMIC split (`anthropic.py:473-495`) |
| 3-4 | 마지막 3 messages | rolling 대화 히스토리 (v0.65.0 신규) |

남는 슬롯이 없을 때 OS 라이브러리는 가장 오래된 cache_control 마킹 우선 무효화. Hermes Agent의 `system_and_3` 패턴 그대로 차용.

## 핵심 함수 (v0.65.0 신규)

`apply_messages_cache_control()` — `core/llm/providers/anthropic.py:175-228`:

```python
MAX_MESSAGE_CACHE_BREAKPOINTS = 3

def apply_messages_cache_control(messages, n_breakpoints=3):
    """마지막 n개 non-system 메시지의 final content block에 ephemeral cache_control 마킹.

    Non-mutating: shallow-copy로 N개 message만 새로 생성.
    str / list[block] content shape 모두 처리.
    """
    n = min(n_breakpoints, MAX_MESSAGE_CACHE_BREAKPOINTS)
    ...
```

매 turn 호출되며, `messages.create()` 직전에 wiring (`anthropic.py:501`).

## System Block Cache Control

`_system_block_with_cache_control()` (`anthropic.py:152-166`):

```python
def _system_block_with_cache_control(system: str | list) -> list:
    """
    PROMPT_CACHE_BOUNDARY 마커 기준으로 STATIC + DYNAMIC 두 블록으로 쪼갠다.
    각 블록 끝에 cache_control: {"type": "ephemeral"} 추가.
    """
```

`PROMPT_CACHE_BOUNDARY` 는 system prompt에 박힌 sentinel (`core/agent/system_prompt.py`). 그 위쪽은 거의 변하지 않는 STATIC 영역, 아래쪽은 도메인/세션별 DYNAMIC. 분리해서 캐시하면 DYNAMIC 만 invalidate되어도 STATIC cache hit 유지.

## 테스트

`tests/test_anthropic_messages_cache.py` — 19 케이스:
- 빈/짧은/긴 message 리스트
- system 메시지 skip
- str → block conversion
- list-block 마지막만 마킹
- idempotency (이미 마킹된 항목 안전)
- parametrized n_breakpoints bound (1-3)

## 캐시 hit-rate 분석

캐시 hit 효과는 LangSmith trace의 `cache_creation_input_tokens` / `cache_read_input_tokens` 메트릭으로 검증 가능 (`core/llm/observability.py` 또는 trace 콜백). `[Unreleased]` 시기 측정 결과 다중 turn 루프에서 입력 토큰 빌링 ~80% 감소 (CHANGELOG.md:32 참조).

## v0.65.0 도입 경위

- **PR #864** — feature/messages-cache-control. Hermes Agent의 `auxiliary_client.py` 패턴 차용.
- 이전: 시스템 블록만 캐시 (2 슬롯). 다중 turn에서 message 히스토리가 매 turn 재과금됨.
- 이후: messages 끝 3개도 캐시 (4 슬롯 풀 활용). agentic loop 비용 절감.

## 다음

- [[prompt-caching]] — 일반 prompt caching
- [[openai-codex]] — Codex provider
- [[fallback-rotation]] — resolve_routing
