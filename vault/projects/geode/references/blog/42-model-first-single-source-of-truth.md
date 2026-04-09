---
title: "Model-First 설계 — `REODE_MODEL` 하나로 모든 LLM provider를 지배하다"
type: reference
category: blog-post
tags: [blog, llm-resilience]
source: "blog/posts/llm-resilience/42-model-first-single-source-of-truth.md"
created: 2026-04-08T00:00:00Z
---

# Model-First 설계 — `REODE_MODEL` 하나로 모든 LLM provider를 지배하다

> "왜 GLM-5가 Anthropic API로 요청을 보내고 있죠?"

이 질문에서 모든 것이 시작되었습니다.

---

## Context: 6개 provider, 2개 설정, 1개의 재앙

REODE는 6개의 LLM provider를 지원합니다: Anthropic, OpenAI, GLM (ZhipuAI), Qwen (Alibaba), Kimi (Moonshot), MiniMax. 사용자는 `.env` 파일에 두 개의 설정을 기재해야 했습니다:

```env
REODE_MODEL=glm-5
REODE_LLM_PRIMARY_PROVIDER=glm
```

문제는 명확했습니다. **두 설정이 일치하지 않으면 crash가 발생합니다.** `REODE_MODEL=glm-5`로 설정하고 `REODE_LLM_PRIMARY_PROVIDER`를 지정하지 않으면, 기본값인 `anthropic`이 적용되어 GLM-5 모델명으로 Anthropic API에 요청을 보냅니다. 결과는 400 Bad Request였습니다. 그리고 에러 메시지는 "model not found"라는 지극히 일반적인 문구뿐이었습니다.

실사용 시나리오에서 이 mismatch는 놀라울 정도로 자주 발생했습니다:

- `.env` 파일을 복사한 뒤 모델만 교체하고 provider를 잊는 경우
- config.toml에서 모델을 변경했지만 `.env`의 provider가 남아있는 경우
- CI 환경에서 환경 변수 하나만 주입한 경우

**두 개의 설정 필드가 동일한 사실(fact)을 표현하고 있었습니다.** 그리고 동일한 사실의 이중 표현은 반드시 불일치를 낳습니다.

---

## Trade-offs: 세 가지 접근

### Option A: Band-aid validation — `_validate_provider_model()`

처음에는 방어적 검증을 구현했습니다. `Settings` 로딩 후 provider와 model의 일치 여부를 검사하고, 불일치 시 자동 교정하는 방식이었습니다.

```python
# 초기 구현 (이후 교체됨)
def _validate_provider_model(s: Settings) -> None:
    if s.model.startswith("glm-") and s.llm_primary_provider != "glm":
        s.llm_primary_provider = "glm"  # auto-correct
        log.warning("Provider mismatch detected, corrected to 'glm'")
```

**문제**: 하드코딩된 if-elif 체인이었습니다. 새 provider가 추가될 때마다 분기를 추가해야 합니다. 유지보수 비용이 선형으로 증가합니다.

### Option B: URI 스타일 — `provider/model` (OpenHands 방식)

OpenHands(구 OpenDevin)는 `anthropic/claude-3-opus`처럼 URI 형태로 provider를 명시합니다.

**장점**: 명시적이고 모호하지 않습니다.
**치명적 단점**: 기존 `.env` 파일을 모두 수정해야 합니다. `REODE_MODEL=claude-opus-4-6`을 `REODE_MODEL=anthropic/claude-opus-4-6`으로 변경하는 것은 breaking change입니다. 이미 운영 중인 파이프라인의 설정 파일을 건드리는 것은 허용할 수 없었습니다.

### Option C: Model-First — `infer_provider(model)` (채택)

**모델 이름이 곧 진실입니다.** `claude-`로 시작하면 Anthropic, `glm-`로 시작하면 GLM, `gpt-`로 시작하면 OpenAI입니다. 이 규칙은 각 provider의 모델 네이밍 컨벤션에서 자연스럽게 도출됩니다.

**장점**:
- 사용자 설정 변경 없음 (`REODE_MODEL` 하나만 설정)
- 새 provider 추가 시 tuple에 한 줄 추가
- provider 필드를 아예 삭제할 수 있는 경로 확보

---

## Implementation: `infer_provider()`와 prefix mapping

`core/config.py`에 구현된 핵심 로직입니다:

```python
_MODEL_PREFIX_TO_PROVIDER: tuple[tuple[str, str], ...] = (
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
    """Infer LLM provider from model name (no external imports).

    Returns one of: "anthropic", "glm", "qwen", "kimi", "minimax", "openai".
    """
    model_lower = model.lower()
    for prefix, provider in _MODEL_PREFIX_TO_PROVIDER:
        if model_lower.startswith(prefix):
            return provider
    return "openai"  # default fallback
```

`tuple[tuple[str, str], ...]` 타입을 사용한 이유가 있습니다. `dict`가 아니라 tuple인 것은 **순서가 중요하기 때문입니다.** `glm4`는 `glm-` prefix로 매칭되지 않으므로 별도 항목이 필요합니다. `o1`과 `o3`는 OpenAI의 reasoning model로, `gpt-` prefix가 아닙니다. 순서 보장이 필요한 prefix 매칭에서 dict는 적합하지 않습니다.

Settings 초기화 시 자동으로 호출되는 `_infer_provider_from_model()`입니다:

```python
def _infer_provider_from_model(s: Settings) -> None:
    """Model-First: infer llm_primary_provider from REODE_MODEL."""
    inferred = infer_provider(s.model)
    declared = s.llm_primary_provider

    if inferred != declared:
        log.info(
            "Model-First: '%s' -> provider '%s' (was '%s')",
            s.model, inferred, declared,
        )
        object.__setattr__(s, "llm_primary_provider", inferred)
```

`object.__setattr__`를 직접 호출하는 이유는 Pydantic의 frozen model 보호를 우회하기 위함입니다. Settings는 한 번 생성되면 immutable이지만, 초기화 과정에서의 교정은 허용해야 합니다.

Config cascade에서의 위치도 의도적입니다:

```python
def _get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is not None:
        return _settings_instance
    with _settings_lock:
        if _settings_instance is None:
            s = Settings()
            _apply_toml_overlay(s)          # 1. TOML 오버레이
            _infer_provider_from_model(s)   # 2. Model-First 추론 (항상 마지막)
            _settings_instance = s
        return _settings_instance
```

TOML overlay 이후에 provider 추론이 실행되므로, config.toml에서 모델을 변경해도 provider가 자동으로 따라갑니다.

---

## Decision Rationale

선택의 핵심 기준은 **사용자 인지 부하 최소화**였습니다.

| 기준 | Band-aid | URI 스타일 | Model-First |
|------|----------|-----------|-------------|
| 기존 `.env` 호환 | O | X (breaking) | O |
| provider 추가 비용 | if-elif 1개 | 없음 | tuple 1줄 |
| mismatch 가능성 | 존재 (2개 필드) | 없음 (1개 필드) | 없음 (자동 추론) |
| 사용자 인지 부하 | 중간 | 낮음 | 최저 |

Model-First는 단일 진실 원천(Single Source of Truth) 원칙의 직접적 적용입니다. **모델 이름이 provider를 결정한다**는 불변식(invariant)을 코드에 새겨넣음으로써, 설정 불일치라는 전체 오류 클래스를 제거했습니다.

이 설계는 하네스 엔지니어링의 핵심 원칙인 **설정 표면적(configuration surface area) 축소**와 직결됩니다. 설정 필드가 늘어날수록 사용자가 실수할 수 있는 조합의 수는 기하급수적으로 증가합니다. 6개 provider에 대해 model과 provider를 각각 설정하면 6 x 6 = 36가지 조합이 생기고, 그 중 유효한 것은 6가지뿐입니다. 나머지 30가지는 모두 잠재적 장애 시나리오입니다. Model-First는 이 36차원의 설정 공간을 6차원으로 축소합니다. 이른바 "pit of success" 설계 — 올바르게 사용하는 것이 잘못 사용하는 것보다 더 쉬운 구조를 만드는 것입니다.

---

## What's Next

`REODE_LLM_PRIMARY_PROVIDER` 필드는 아직 존재합니다. backward compatibility를 위해 남겨두었지만, `infer_provider()`가 항상 덮어쓰므로 사실상 dead field입니다. 다음 major 버전에서 deprecation warning과 함께 제거할 예정입니다. Dead field 제거가 중요한 이유는 단순히 코드 정리 차원이 아닙니다. 사용자가 `.env`에서 이 필드를 발견하면 "설정해야 하는 것"으로 인식하게 되고, 잘못된 값을 넣어도 `infer_provider()`가 무시하므로 "내가 설정한 값이 반영되고 있다"는 착각을 유발합니다. 이는 디버깅 시 혼란을 가중시킵니다. 사용자 멘탈 모델과 실제 시스템 동작의 불일치를 제거하는 것이 deprecation의 진짜 목적입니다.

또 하나의 과제는 custom model endpoint 지원입니다. 자체 호스팅 모델(vLLM, TGI 등)은 prefix 규칙으로 provider를 추론할 수 없습니다. 이 경우에 한해 명시적 provider 지정을 허용하는 opt-in 경로가 필요합니다. 현재 검토 중인 접근은 URI 스타일이 아닌, `REODE_CUSTOM_PROVIDER_URL` 같은 별도 필드를 두는 방식입니다. 구체적으로는 `REODE_CUSTOM_PROVIDER_URL`이 설정되어 있으면 `infer_provider()`를 건너뛰고, 해당 URL로 OpenAI-compatible API 호출을 직접 라우팅하는 구조입니다. 이렇게 하면 Model-First의 기본 경로를 오염시키지 않으면서도, vLLM이나 TGI 같은 self-hosted 환경을 지원할 수 있습니다. 핵심은 "기본 경로는 제로 설정, 예외 경로만 명시적 설정"이라는 비대칭 설계를 유지하는 것입니다.

"하나의 설정 필드가 하나의 사실을 표현한다"는 원칙은 사소해 보이지만, 6개 provider를 넘나드는 멀티 LLM 시스템에서 이 원칙의 위반은 운영 장애로 직결됩니다. Model-First는 그 교훈의 코드화입니다.

---

*Source: `blog/posts/llm-resilience/42-model-first-single-source-of-truth.md` | Category: [[blog-llm-resilience]]*

## Related

- [[blog-llm-resilience]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
- [[geode-llm-models]]
