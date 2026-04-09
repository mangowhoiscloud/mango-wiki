---
title: "Model-First: LLM 프로바이더 설정의 Single Source of Truth"
type: reference
category: blog-post
tags: [blog, llm-resilience]
source: "blog/posts/llm-resilience/39-model-first-provider-inference.md"
created: 2026-04-08T00:00:00Z
---

# Model-First: LLM 프로바이더 설정의 Single Source of Truth

> AI 코딩 에이전트에서 "어떤 모델을 쓸 것인가"는 가장 기본적인 설정인데, 왜 이렇게 틀리기 쉬울까요?

## 문제: 두 개의 설정, 하나의 진실

멀티 프로바이더를 지원하는 LLM 애플리케이션은 보통 이렇게 설정합니다:

```env
MODEL=glm-5
LLM_PROVIDER=glm
```

**모델명**과 **프로바이더**를 별도로 지정합니다. 논리적으로 이 둘은 종속 관계입니다 — `glm-5`는 반드시 GLM 프로바이더로만 호출할 수 있습니다. 그런데 설정 파일에서는 독립 필드로 취급됩니다.

### 불일치 시나리오

| MODEL | PROVIDER | 결과 |
|-------|----------|------|
| `glm-5` | `glm` | OK |
| `claude-opus-4-6` | `anthropic` | OK |
| `glm-5` | `anthropic` | Anthropic API에 `glm-5` 전송 → 404 |
| `claude-opus-4-6` | `glm` | GLM API에 `claude-opus-4-6` 전송 → 400 |

사용자가 모델을 바꾸면서 프로바이더를 깜빡하면 — 혹은 `.env`의 한쪽만 수정하면 — **런타임에서야 에러가 발생**합니다. 에러 메시지도 혼란스럽습니다: "GLM API가 왜 Anthropic 모델을 거부하지?"

REODE에서 실제로 이 버그가 발생했습니다. `.env`에 `REODE_MODEL=glm-5`와 `REODE_LLM_PRIMARY_PROVIDER=anthropic`이 공존하면서, ClaudeAdapter가 Anthropic API에 `model: glm-5`를 전송 → `not_found_error`가 발생했습니다.

## 프론티어 사례: 모델명이 곧 프로바이더

### Claude Code / Cursor

설정이 단 하나입니다:

```
CLAUDE_MODEL=claude-sonnet-4-5
```

프로바이더를 별도로 지정하지 않습니다. SDK가 모델명에서 API 엔드포인트를 자동으로 결정합니다. 사용자는 "무슨 모델을 쓸지"만 생각하면 됩니다.

### OpenHands (구 OpenDevin)

URI 스타일로 프로바이더를 모델명에 내장합니다:

```
LLM_MODEL=anthropic/claude-sonnet-4-5
LLM_MODEL=openai/gpt-4.1
LLM_MODEL=ollama/llama3
```

`provider/model` 포맷이기 때문에 불일치가 **구조적으로 불가능**합니다. litellm의 `completion()` 함수가 이 문자열을 파싱해서 올바른 API로 라우팅합니다.

### LangChain / LiteLLM

LiteLLM의 접근 방식입니다:

```python
from litellm import completion
response = completion(model="glm/glm-5", messages=[...])
# 내부적으로 "glm" 프로바이더를 자동 선택
```

모델명에 프로바이더 접두사가 없으면, 모델명 패턴 매칭으로 추론합니다:
- `claude-*` → Anthropic
- `gpt-*` → OpenAI
- `glm-*` → ZhipuAI

### 공통 원칙

**모델명이 Single Source of Truth입니다.** 프로바이더는 파생 정보(derived data)입니다.

```
사용자 설정:  MODEL=glm-5
시스템 추론:  provider = infer("glm-5") → "glm"
어댑터 선택:  GLM adapter (OpenAI SDK + base_url swap)
```

## 해법: Model-First 설계

REODE에 적용한 Model-First 설계를 소개합니다.

### 핵심 함수: `infer_provider()`

```python
_MODEL_PREFIX_TO_PROVIDER = (
    ("claude-", "anthropic"),
    ("glm-", "glm"),
    ("glm4", "glm"),
    ("qwen", "qwen"),
    ("kimi", "kimi"),
    ("minimax", "minimax"),
    ("gpt-", "openai"),
    ("o1", "openai"),
    ("o3", "openai"),
)

def infer_provider(model: str) -> str:
    model_lower = model.lower()
    for prefix, provider in _MODEL_PREFIX_TO_PROVIDER:
        if model_lower.startswith(prefix):
            return provider
    return "openai"  # default fallback
```

Settings 로드 시점에 자동 실행됩니다:

```python
def _infer_provider_from_model(s: Settings) -> None:
    inferred = infer_provider(s.model)
    if inferred != s.llm_primary_provider:
        log.info("Model-First: '%s' → provider '%s'", s.model, inferred)
        s.llm_primary_provider = inferred
```

### Before vs After

**Before (두 설정 수동 동기화):**
```env
REODE_MODEL=glm-5
REODE_LLM_PRIMARY_PROVIDER=glm    # 깜빡하면 폭발
```

**After (Model-First):**
```env
REODE_MODEL=glm-5                 # 이것만 설정
# provider는 자동 추론 → glm
```

### 런타임 모델 전환

사용자가 REPL에서 모델을 바꿀 때의 흐름입니다:

```
reode> GLM으로 바꿔줘
  → settings.model = "glm-5"
  → infer_provider("glm-5") → "glm"     # 자동
  → 다음 파이프라인부터 GLM adapter 사용
```

`/model` 명령이든 자연어든, `settings.model`만 바꾸면 provider가 따라옵니다.

### 안정성: 진행 중 파이프라인은 영향 없음

adapter는 `ReodeRuntime.create()` 시점에 바인딩됩니다. 모델 변경은 **다음** 파이프라인 실행부터 적용됩니다. 진행 중인 LLM 호출이 갑자기 다른 프로바이더로 전환되는 일은 없습니다.

이것은 의도적 설계입니다. Kubernetes의 Rolling Update처럼 — 기존 Pod(파이프라인)는 현재 설정으로 완료하고, 새 Pod(다음 실행)부터 새 설정을 적용합니다.

## Hot-Reload과의 통합

REODE는 `.env` 파일 변경을 감지하는 ConfigWatcher가 있습니다. Model-First 이전에는 `settings.model`만 갱신하고 `llm_primary_provider`는 갱신하지 않아서 불일치가 발생했습니다.

```python
# Hot-reload 시 provider 재추론
settings.model = new_settings.model
settings.llm_primary_provider = infer_provider(settings.model)
```

이제 `.env`에서 `REODE_MODEL=qwen3.5-plus`로 바꾸면 ConfigWatcher가 감지 → model 갱신 → provider 자동 재추론 → 다음 실행부터 Qwen adapter가 사용됩니다.

## 순환참조 회피

`infer_provider()`를 `core/config.py`에 직접 정의한 이유가 있습니다. 외부 모듈을 import하면 순환참조가 발생합니다.

```
core.config → core.cli.llm_response → core.cli.__init__ → core.config  # 순환!
```

`detect_provider()`가 이미 `core/cli/llm_response.py`에 존재했지만, config 로드 시점에는 사용할 수 없었습니다. 동일한 로직을 외부 의존성 없이 config 모듈 내부에 복제했습니다.

```python
# core/config.py — 외부 import 없음
_MODEL_PREFIX_TO_PROVIDER = (...)

def infer_provider(model: str) -> str:
    ...
```

이것은 DRY 원칙 위반처럼 보이지만, **순환참조 회피**와 **부트스트랩 시점 안전성**이 더 중요합니다. config 모듈은 애플리케이션에서 가장 먼저 로드되는 모듈 중 하나이기 때문에, 이 시점에서 다른 모듈에 의존하면 import 순서에 따라 `AttributeError`나 `ImportError`가 비결정적으로 발생할 수 있습니다. 특히 pytest, mypy, 그리고 런타임 진입점이 서로 다른 순서로 모듈을 로드하기 때문에, "개발 환경에서는 되는데 CI에서는 깨지는" 유형의 버그로 이어지기 쉽습니다. 두 함수의 매핑 테이블이 동기화되어야 하는 점은 테스트로 보장합니다.

## 결론

| 접근 | 설정 수 | 불일치 가능 | 에러 시점 |
|------|---------|-----------|----------|
| 수동 동기화 | 2개 (model + provider) | O | 런타임 API 호출 |
| 자동 교정 (band-aid) | 2개 | O (교정됨) | 부트스트랩 (warning) |
| **Model-First** | **1개** (model only) | **X** | **불가능** |

불일치가 "발생할 수 없는" 구조가 "발생하면 고치는" 구조보다 낫습니다. 설정이 하나면 틀릴 수가 없습니다.

이 원칙은 LLM 프로바이더 설정에만 국한되지 않습니다. "종속 관계가 있는 두 값을 독립 필드로 두지 말 것"은 설정 설계의 보편적 원칙입니다. 데이터베이스 정규화에서 파생 컬럼을 제거하는 것, Kubernetes에서 selector와 label을 자동 매칭하는 것, 모두 같은 사상입니다. 설정이 복잡해질수록 Single Source of Truth의 가치는 기하급수적으로 커집니다. 파생 가능한 값은 파생하고, 사용자에게는 본질적인 선택만 요구하는 것 — 이것이 설정 API를 설계할 때 가장 먼저 확인해야 할 질문입니다.

---

*REODE v0.15.0 — PR #201. 6개 LLM 프로바이더(Anthropic, OpenAI, GLM, Qwen, Kimi, MiniMax) 대상 검증 완료.*

> **한 줄 요약**: 모델명이 프로바이더를 결정하므로, 사용자에게 모델명만 받고 프로바이더는 시스템이 추론하면 설정 불일치가 구조적으로 불가능해집니다.

---

*Source: `blog/posts/llm-resilience/39-model-first-provider-inference.md` | Category: [[blog-llm-resilience]]*

## Related

- [[blog-llm-resilience]]
- [[blog-hub]]
- [[geode]]
- [[geode-llm-models]]
