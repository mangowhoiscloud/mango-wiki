---
title: "Cross-Provider Escalation Architecture — GLM-5가 실패하면 Opus가 이어받는다"
type: reference
category: blog-post
tags: [blog, llm-resilience]
source: "blog/posts/llm-resilience/43-cross-provider-escalation-architecture.md"
created: 2026-04-08T00:00:00Z
---

# Cross-Provider Escalation Architecture — GLM-5가 실패하면 Opus가 이어받는다

> "저렴한 모델로 시작하고, 실패할 때만 비싼 모델을 투입한다."
>
> 말은 쉽습니다. 구현은 버그 5개짜리였습니다.

---

## Context: 단일 adapter의 한계

REODE의 마이그레이션 파이프라인에서 `fix_node`는 빌드/테스트 오류를 LLM이 분석하고 코드를 수정하는 노드입니다. 비용 최적화를 위해 1차 시도는 GLM-5(저렴)로, 2회 연속 실패 후에는 Claude Opus(고가, 고성능)로 escalation하는 전략을 설계했습니다.

문제는 adapter 바인딩 시점에 있었습니다. REODE의 DI(Dependency Injection)는 `contextvars` 기반입니다. Runtime 초기화 시 primary adapter가 한 번 바인딩되면, 파이프라인 전체에서 동일한 adapter를 사용합니다. GLM adapter가 바인딩된 상태에서 `model="claude-opus-4-6"`를 인자로 넘기면 어떻게 될까요? GLM API에 Anthropic 모델명으로 요청을 보내게 됩니다.

**adapter와 model은 분리할 수 없습니다.** Anthropic SDK와 OpenAI SDK는 API 형식이 다르고, 인증 방식이 다르며, tool-use 프로토콜이 다릅니다. model 이름만 바꿔서 해결할 수 있는 문제가 아니었습니다.

---

## Trade-offs: 세 가지 escalation 패턴

### Pattern A: Secondary adapter (채택)

REODE는 이미 cross-LLM 검증을 위한 secondary adapter 인프라를 보유하고 있었습니다. `set_llm_callable()`에 `secondary_tool_fn` 파라미터가 존재했고, `get_secondary_llm_tool()` accessor가 정의되어 있었습니다.

이 인프라를 escalation에 재활용하면:
- DI 계약을 위반하지 않습니다 (contextvars에 이미 secondary slot이 존재)
- Connection pool을 공유하지 않습니다 (각 adapter가 독립적 httpx client를 보유)
- Runtime 재시작 없이 adapter를 전환할 수 있습니다

### Pattern B: Per-call adapter 생성 (기각)

Escalation이 필요할 때마다 새 adapter 인스턴스를 생성하는 방식입니다.

```python
# 기각된 접근
if should_escalate:
    temp_adapter = ClaudeAdapter(api_key=settings.anthropic_api_key)
    result = temp_adapter.generate_with_tools(...)
```

**기각 이유**:
- DI 원칙 위반: contextvars를 우회하고 직접 생성하면 hook, logging, token tracking이 모두 누락됩니다
- Connection pool 낭비: 호출마다 새 httpx client가 생성되어 TCP 연결이 재수립됩니다
- Provider 의존성 역전: `fix_node`가 `ClaudeAdapter`를 직접 참조하면 port/adapter 분리가 무너집니다

### Pattern C: LiteLLM unified client (미래)

LiteLLM은 모든 provider를 단일 인터페이스로 추상화합니다. `model="anthropic/claude-opus-4-6"` 한 줄로 provider 전환이 가능합니다.

**보류 이유**: REODE의 tool-use 프로토콜은 Anthropic 네이티브 형식을 사용합니다. LiteLLM으로 전환하면 tool definition 형식, streaming 프로토콜, prompt caching 전략을 모두 재작성해야 합니다. 현재 단계에서는 비용 대비 이점이 불충분합니다.

---

## Implementation: 3-way branch in fix_node

`fix_node`의 escalation 결정 로직입니다:

```python
# core/pipelines/migration.py — fix_node 내부

# --- Model escalation: upgrade to Opus after consecutive failures ---
build_still_failing = bool(build_error)
in_recovery = _is_stuck(state) or state.get("recovery_attempted", False)
should_escalate = (len(prior_attempts) >= 2 and build_still_failing) or in_recovery

model_override: str | None = None
if should_escalate:
    from core.config import ANTHROPIC_PRIMARY  # claude-opus-4-6
    model_override = ANTHROPIC_PRIMARY
    log.info(
        "FIX: escalating to %s after %d failed attempts",
        model_override, len(prior_attempts),
    )
```

Escalation 조건은 두 가지입니다:
1. **2회 연속 실패 + 빌드 여전히 실패**: 저렴한 모델의 능력 한계
2. **Recovery mode 진입**: 동일 오류 반복(convergence) 감지

실제 LLM 호출 시의 3-way branch입니다:

```python
if should_escalate:
    from core.infrastructure.ports.llm_port import get_secondary_llm_tool

    escalation_tool = get_secondary_llm_tool()
    if escalation_tool is not None:
        # Path 1: Cross-provider escalation — secondary adapter (Opus) 사용
        log.info("FIX: cross-provider escalation — using secondary adapter (Opus)")
        result = escalation_tool(
            system_prompt, user_prompt,
            tools=tool_defs,
            tool_executor=_backpressure_executor,
            max_tokens=8192,
            temperature=0.2,
            max_tool_rounds=tool_rounds,
        )
    else:
        # Path 2: Same-provider escalation — primary adapter에 model override
        log.info("FIX: same-provider escalation — model=%s", model_override)
        result = llm_tool(
            system_prompt, user_prompt,
            tools=tool_defs,
            tool_executor=_backpressure_executor,
            model=model_override,
            max_tokens=8192,
            temperature=0.2,
            max_tool_rounds=tool_rounds,
        )
else:
    # Path 3: Normal mode — primary adapter, default model
    result = llm_tool(
        system_prompt, user_prompt,
        tools=tool_defs,
        tool_executor=_backpressure_executor,
        model=None,
        max_tokens=8192,
        temperature=0.2,
        max_tool_rounds=tool_rounds,
    )
```

**Path 1**이 핵심입니다. `get_secondary_llm_tool()`은 Runtime 초기화 시 바인딩된 secondary adapter의 `generate_with_tools` 메서드를 반환합니다. 이 adapter는 완전히 독립된 httpx client, API key, 인증 로직을 갖고 있습니다.

`llm_port.py`에서의 secondary tool accessor입니다:

```python
def get_secondary_llm_tool() -> LLMToolCallable | None:
    """Return the secondary tool-use callable, or None if not configured.

    Used by fix_node for cross-provider escalation: when the primary adapter
    (e.g., GLM) fails repeatedly, the secondary adapter (e.g., Claude Opus)
    can be invoked directly instead of passing an ignored model name.
    """
    return _secondary_llm_tool_ctx.get()
```

`None` 반환 시 Path 2로 fallback하는 설계는 의도적입니다. secondary adapter가 설정되지 않은 환경(예: Anthropic 단독 사용)에서도 same-provider escalation이 작동합니다.

---

## Opus에게 주어지는 추가 context: `_build_full_project_context()`

Escalation 시 단순히 adapter를 바꾸는 것만으로는 부족했습니다. Opus에게는 GLM-5보다 **넓은 시야**를 제공해야 합니다.

```python
def _build_full_project_context(source_path: str, tool_executor: Any) -> str:
    """Build comprehensive project context for escalated Opus calls."""
    parts: list[str] = []

    # 1. Project file tree (Java files only)
    # 2. Full pom.xml
    # 3. ALL model/entity classes (where @Data/@Getter/@Entity live)
    # 4. Config files (application.properties, spring XML, mybatis config)
    ...
    return "\n".join(parts)
```

이 함수는 프로젝트의 전체 구조, pom.xml 전문, 모든 model/entity 클래스, 설정 파일을 수집하여 Opus에게 전달합니다. Claude Code가 에이전트 모드에서 자동으로 확보하는 수준의 context를 파이프라인 내에서 재현한 것입니다.

---

## 5개의 버그, 5개의 교훈

Escalation 구현 과정에서 연쇄적으로 발견된 버그들입니다:

1. **TS-05**: `model=` 인자가 무시됨 — GLM adapter는 model 파라미터를 사용하지 않고 자체 설정의 모델명을 사용했습니다. 인자를 넘겨도 효과가 없었습니다. 이 버그가 중요한 이유는, adapter의 인터페이스 계약(contract)이 구현체마다 다르게 해석되고 있었다는 것을 드러냈기 때문입니다. port/adapter 패턴에서 adapter가 인터페이스의 파라미터를 선택적으로 무시하면, 호출자는 자신의 의도가 반영되고 있다고 착각하게 됩니다.

2. **TS-07**: Secondary adapter의 tool definition 형식 불일치 — GLM은 OpenAI 호환 형식, Anthropic은 `input_schema` 형식입니다. Escalation 시 tool definition을 변환해야 했습니다. 이는 cross-provider 시스템에서 가장 흔하면서도 가장 디버깅하기 어려운 유형의 버그입니다. 두 provider 모두 "tool-use를 지원한다"고 말하지만, 실제 JSON 스키마 형식은 완전히 다릅니다. 추상화 계층이 이 차이를 감추지 못하면 런타임에서 silent failure가 발생합니다.

3. **TS-09**: Backpressure executor가 secondary adapter와 호환되지 않음 — `_backpressure_executor`가 primary adapter의 tool_executor만 참조하고 있었습니다. 이 버그는 backpressure 메커니즘이 특정 adapter에 암묵적으로 결합(implicit coupling)되어 있었음을 보여줍니다. Executor가 adapter-agnostic하게 설계되어야 한다는 원칙을 재확인시켜 준 사례입니다.

4. **TS-11**: Token usage 추출 실패 — Anthropic의 `Usage` 객체와 OpenAI의 usage dict 형식이 달라 escalation 후 비용 추적이 깨졌습니다. 비용 추적은 파이프라인의 핵심 관측 가능성(observability) 인프라입니다. 이것이 깨지면 escalation의 경제적 효과를 측정할 수 없게 되므로, escalation 전략 자체의 유효성을 검증할 방법이 사라집니다.

5. **TS-13**: Escalation 후 recovery flag 미설정 — escalation이 성공해도 `recovery_attempted`가 갱신되지 않아 무한 escalation 루프에 빠졌습니다. 상태 머신에서 전이(transition) 후 상태 플래그를 갱신하지 않으면 동일 전이가 무한 반복되는 전형적인 FSM 버그입니다. Escalation처럼 비용이 높은 경로에서 이런 루프가 발생하면 API 비용이 통제 불능 상태에 빠집니다.

각 버그는 이전 버그의 수정을 통해 비로소 드러났습니다. adapter 전환이 작동해야 tool definition 불일치가 발견되고, tool definition이 맞아야 backpressure 호환성 문제가 노출됩니다.

---

## Decision Rationale

Secondary adapter 패턴을 선택한 결정적 이유는 **기존 인프라 재활용**이었습니다.

REODE의 ensemble mode(cross-LLM 검증)를 위해 이미 구축된 인프라는 다음과 같습니다:
- `contextvars` 기반 secondary slot (`_secondary_llm_tool_ctx`)
- `set_llm_callable()`의 secondary 파라미터
- Runtime의 secondary adapter 초기화 로직

이 인프라의 용도를 "검증"에서 "escalation"으로 확장하는 것은 architectural consistency를 유지하면서도 최소한의 코드 변경으로 달성할 수 있었습니다.

기존 인프라를 재활용한다는 판단에는 더 깊은 엔지니어링 원칙이 있습니다. 새로운 기능을 위해 새로운 추상화를 도입하면, 그 추상화 자체가 유지보수 대상이 됩니다. 반면 이미 검증된 인프라의 용도를 확장하면, 기존 테스트 커버리지와 운영 경험이 그대로 이전됩니다. Secondary adapter slot은 ensemble mode에서 이미 수백 회의 cross-provider 호출을 안정적으로 처리한 실적이 있었습니다. 여기에 escalation이라는 새로운 트리거를 연결한 것은, 검증 비용이 거의 제로인 확장이었습니다. 이는 "최소 개념 도입 원칙(minimal concept introduction)" — 새로운 개념을 도입하기 전에 기존 개념으로 해결할 수 있는지를 먼저 검토하라는 원칙의 직접적인 적용입니다.

---

## What's Next

현재 escalation 전략은 "2회 실패 후 Opus"라는 단순 규칙입니다. 다음 단계에서는 보다 정교한 전략을 도입할 예정입니다:

- **오류 복잡도 기반 동적 escalation**: 단순 import 오류나 missing dependency 같은 단일 원인 오류는 GLM으로 충분합니다. 반면 Lombok annotation processor 충돌이나 Spring circular dependency처럼 multi-hop reasoning이 필요한 오류는 즉시 Opus로 escalation해야 합니다. 이를 구현하기 위해 빌드 오류 메시지를 분류하는 경량 classifier를 도입할 계획입니다. 오류 메시지의 stack trace 깊이, 관련 파일 수, 오류 유형(컴파일 vs 런타임 vs 테스트)을 입력으로 받아 complexity score를 산출하고, 임계값 이상이면 1차 시도부터 Opus를 투입하는 방식입니다.
- **비용 최적화 보고**: escalation 빈도와 비용을 measure_node의 scorecard에 반영하여, 어떤 유형의 오류가 escalation을 유발하는지 패턴 분석을 수행할 계획입니다
- **LiteLLM 통합 검토**: provider 수가 10개를 넘어가면 adapter별 관리 비용이 LiteLLM 전환 비용을 초과할 것입니다

Cross-provider escalation은 단순한 fallback이 아닙니다. 비용과 능력의 트레이드오프를 런타임에 동적으로 조정하는 메커니즘입니다. 저렴한 모델이 대부분의 작업을 처리하고, 비싼 모델은 정말 필요할 때만 투입됩니다. 이것이 멀티 LLM 시대의 비용 엔지니어링입니다.

---

*Source: `blog/posts/llm-resilience/43-cross-provider-escalation-architecture.md` | Category: [[blog-llm-resilience]]*

## Related

- [[blog-llm-resilience]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
- [[geode-llm-models]]
