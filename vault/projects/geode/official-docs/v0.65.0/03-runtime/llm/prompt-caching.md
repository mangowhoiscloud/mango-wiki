---
title: Prompt Caching
category: runtime-llm
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/providers/anthropic.py:152-228"
  - "core/llm/providers/anthropic.py:473-501"
  - "core/agent/system_prompt.py"
external_refs:
  - url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching"
    pattern: "ephemeral cache_control"
---

# Prompt Caching

Anthropic API의 **5분 ephemeral prompt cache**를 활용해 다중 turn agentic loop의 입력 토큰 비용을 절감.

## Anthropic 4-슬롯 모델

`cache_control: {"type": "ephemeral"}` 마킹 위치 이전의 prompt prefix 가 5분간 캐시된다. 슬롯 한도 4개. 다음 호출에서 동일 prefix 매칭 → 95% 할인.

GEODE는 4 슬롯을 다음과 같이 분배:

| 슬롯 | 위치 | 안정성 |
|---|---|---|
| 1 | system block STATIC | 거의 변하지 않음 (도메인 prompt + base instructions) |
| 2 | system block DYNAMIC | 세션별 (working_dir, mode, profile prefs) |
| 3 | message N-2 | 직전 turn |
| 4 | message N | 가장 최근 |

## STATIC/DYNAMIC split

`core/agent/system_prompt.py` 의 `PROMPT_CACHE_BOUNDARY` sentinel 마커로 system prompt를 두 블록으로 쪼갠다.

`core/llm/providers/anthropic.py:152-166`:

```python
def _system_block_with_cache_control(system: str | list) -> list:
    """PROMPT_CACHE_BOUNDARY 기준 STATIC + DYNAMIC 분리, 각 끝에 ephemeral 마킹."""
```

## v0.65.0 신규 — messages-level cache

`apply_messages_cache_control()` (`anthropic.py:175-228`):

```python
MAX_MESSAGE_CACHE_BREAKPOINTS = 3

def apply_messages_cache_control(messages, n_breakpoints=3):
    """마지막 n개 non-system 메시지의 final content block에 ephemeral 마킹."""
    n = min(n_breakpoints, MAX_MESSAGE_CACHE_BREAKPOINTS)
    # ... shallow-copy non-mutating
```

매 turn 호출 — `messages.create()` 직전 wiring (`anthropic.py:501`).

## 캐시 hit-rate 측정

`response.usage.cache_read_input_tokens` 가 캐시된 토큰 수. 전체 토큰 대비 비율로 hit-rate 산출 가능. LangSmith trace 또는 `core/llm/observability.py` 콜백에서 추출.

## 적용 안 되는 경우

- **첫 호출** — 캐시 없음. `cache_creation_input_tokens` 만 발생 (캐시 생성 비용 25% 추가)
- **5분 idle** — TTL 만료
- **prompt 변경** — 마킹 이전 부분 한 글자라도 다르면 prefix 매칭 실패
- **다른 모델 호출** — 모델별 캐시 격리

## 다음

- [[anthropic]] — Anthropic provider 디테일
- [[prompt-system]] — Prompt 로더
