---
title: GEODE Adaptive Thinking
category: concepts
tags: [geode, anthropic, reasoning, adaptive-thinking, effort, opus-4-7, thinking-blocks, harness, frontier]
sources:
  - "geode/core/llm/providers/anthropic.py:235-255,376-454"
  - "geode/core/agent/loop.py:182,204,1510-1567"
  - "geode/core/llm/agentic_response.py:131-164"
  - "geode/core/cli/effort_picker.py:32-101"
  - "geode/core/cli/commands.py:431-449"
  - "geode/core/config.py:48,255"
  - "hermes-agent/agent/anthropic_adapter.py:32-133,1424-1450"
  - "https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking"
  - "https://platform.claude.com/docs/en/build-with-claude/effort"
  - "https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7"
created: 2026-04-30T10:59:00Z
updated: 2026-04-30T10:59:00Z
---

# GEODE Adaptive Thinking

> **한 줄 요약**: Anthropic 4.6+ 모델이 task 난이도를 보고 thinking 토큰을 *자체적으로* 분배하도록 위임하는 메커니즘. GEODE는 사용자 picker 1번 → 3중 영속화 → AgenticLoop 동적 다운그레이드 → 어댑터 모델별 wire 분기 → API → 응답 sidecar 분리 → IPC 이벤트 → CLI 렌더의 7단 파이프라인으로 통합한다.

## 1. 왜 이 개념이 중요한가 — 내러티브

확률적 시스템(LLM)을 제어 가능한 실행 엔진으로 변환하는 [[geode-architecture|harness]]의 핵심 과제 중 하나는 "**사고 비용을 어떻게 task 난이도에 맞게 자동 배분할 것인가**"다.

세 갈래의 잘못된 답이 있어왔다:

1. **고정 budget**: 모든 호출에 같은 `thinking_budget=N`. 쉬운 task에 낭비, 어려운 task에 부족.
2. **수동 분기**: 호출자가 task 분류해서 budget을 정함. 분류 자체가 또 다른 LLM 호출 비용.
3. **외부 측정**: [[blog-research-detail|think@N (DTR)]]처럼 50토큰 prefix를 보고 깊은 사고 후보만 골라 진행. open-weight 모델만 가능 — API 모델은 internal layer 접근 불가.

Anthropic이 4.6에서 도입하고 4.7에서 *유일한 모드*로 격상한 **Adaptive Thinking**은 이 셋의 함정을 다 우회한다. 모델 자신이 매 prompt마다 "이건 SAT 문제급, 깊이 사고" vs "이건 사실 조회, 즉답"을 결정하고, 호출자는 *권한 상한*만 줘서 비용 천장을 제어한다.

GEODE는 이걸 단순 wire 매핑이 아니라 **OS-level 인프라**처럼 다룬다: picker UX, 영속화 3중 저장, 멀티턴 reasoning surfacing(R6), 어댑터 게이트, 동적 다운그레이드까지 — 한 번 잘못 wire하면 silent failure가 되는 모든 지점을 명시적으로 게이트해서.

## 2. 메커니즘 — Anthropic 공식 사양

### 2.1 핵심 wire 형식

```python
client.messages.create(
    model="claude-opus-4-7",
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "xhigh"},
    max_tokens=16000,
    messages=[...],
)
```

- `thinking.type: "adaptive"`: 모델에 "스스로 thinking 깊이 정해" 신호
- `thinking.display`: thinking content 반환 형식 (`"summarized"` / `"omitted"`)
- `output_config.effort`: 5단계 권한 등급 (`low/medium/high/max/xhigh`)
- `max_tokens`: thinking + 응답 합계 hard cap

### 2.2 모델 가용성 매트릭스

| 모델 | adaptive 지원 | xhigh 수락 | 디폴트 display | sampling param |
|---|---|---|---|---|
| Claude Mythos Preview | 디폴트 모드 (`thinking` unset 시 자동) | ✓ | `"omitted"` | 거부 |
| **Claude Opus 4.7** | **유일한 모드** (`type:"enabled"` rejected with 400) | **✓** | **`"omitted"`** | **거부** |
| Claude Opus 4.6 | 권장 (manual deprecated) | ✗ (400) | `"summarized"` | 거부 |
| Claude Sonnet 4.6 | 권장 (manual deprecated) | ✗ (400) | `"summarized"` | 거부 |
| Claude Opus 4.5 / Sonnet 3.7 등 | ✗ (manual `type:"enabled"`만) | ✗ | n/a | 허용 |
| Claude Haiku 4.5 | ✗ (extended thinking 자체 비지원) | ✗ | n/a | 허용 |

**Opus 4.7의 결정적 변경점** (whats-new-claude-4-7):

1. Adaptive가 *only* 지원 모드 — 옛 `thinking: {type:"enabled", budget_tokens:N}`은 400 에러
2. `thinking.display` 디폴트가 `"summarized"` → `"omitted"`로 silent change
3. `temperature` / `top_p` / `top_k` 모두 거부 (sampling-parameters-removed)

세 변경 모두 명시 wire 안 잡으면 잠재적 silent failure다. GEODE는 셋 다 어댑터에서 게이트한다 (§3.3 참조).

### 2.3 Effort 5단계의 의미

Anthropic 공식 표 (`/docs/en/build-with-claude/effort#effort-levels`):

| Level | Behavior | Anthropic 권장 use case |
|---|---|---|
| `low` | thinking 거의 안 함, 답 짧음 | classification, lookup, sub-agent |
| `medium` | thinking 중간, 균형 | tool-heavy workflow, code generation, agentic task |
| `high` | **API 디폴트**. 항상 thinking | complex reasoning, difficult coding, agentic |
| `max` | 최대치, thinking 자유 | 가장 깊은 분석, 토큰 무제한 OK |
| `xhigh` | **Opus 4.7 only**. 장시간 agentic | 30분+ 코딩, 토큰 백만대, 반복 tool 호출, web/KB 검색 |

> "Effort is a behavioral signal, not a strict token budget. At lower effort levels, Claude will still think on sufficiently difficult problems, but it will think less than it would at higher effort levels for the same problem." — Anthropic docs

→ effort는 **soft hint**, 진짜 cap은 `max_tokens`. 두 노브가 직교한다.

### 2.4 Opus 4.7 권장 매트릭스 (Anthropic 공식)

| effort | 4.7 권장 |
|---|---|
| `low` | 짧고 범위 좁은 task. 멀티 섹션 task엔 explicit checklist 필요 |
| `medium` | 평균 워크플로우 drop-in. 비용 절감 |
| `high` | 균형형. 품질 vs 토큰 효율의 sweet spot |
| **`xhigh`** | **코딩/agentic 권장 시작점**. 반복 tool, web/KB 검색, 탐색적 task |
| `max` | 진짜 frontier 문제만. 대부분 워크로드에서 비용 대비 품질 향상 작음. 일부 구조화 출력 task에선 overthinking 유발 |

> "Start with `xhigh` for coding and agentic use cases" — 이게 GEODE Opus 4.7의 picker 디폴트가 `xhigh`인 이유 ([[geode-llm-models]] 참조).

## 3. GEODE 구현 — 7단 파이프라인

### 3.1 호출 체인 한 눈에

```
[사용자 picker 선택]                  ← /model 두축 picker
       │  effort_picker.py
       ▼
[3중 영속화]                          ← v0.61.0
       │  (1) settings.agentic_effort = "xhigh"  (런타임 즉시)
       │  (2) GEODE_AGENTIC_EFFORT env           (.env 영속)
       │  (3) [agentic] effort = "xhigh"         (.geode/config.toml 영속)
       ▼
[Worker 요청 생성]                    ← worker.py:76
       │  data["effort"] = "xhigh"
       ▼
[AgenticLoop ctor]                    ← loop.py:182,204
       │  self._effort = "xhigh"
       ▼
[매 라운드 _run_llm_call]             ← loop.py:1510-1567
       │  adaptive_effort = self._effort
       │  + 동적 다운그레이드 (3 케이스, §3.4)
       │  + R6 surfacing emit (§3.6)
       ▼
[Adapter.agentic_call(effort=…)]      ← anthropic.py:312-454
       │
       ▼
[모델 분기]                           ← anthropic.py:382-409
       │  if model in _ADAPTIVE_MODELS:
       │    thinking = {type:"adaptive", display:"summarized"}
       │    output_config = {effort: effective_effort}
       │    temperature = None    ← 거부됨, 명시 None
       │  elif thinking_budget > 0:
       │    thinking = {type:"enabled", budget_tokens:N}  ← legacy
       │  else:
       │    no thinking
       ▼
[Anthropic Messages API]
       │
       ▼
[response.content: [text, thinking, tool_use, ...]]
       │
       ▼
[normalize_anthropic]                 ← agentic_response.py:123-164
       │  thinking 블록 → reasoning_summaries[] sidecar
       │  thinking_tokens → usage.thinking_tokens
       ▼
[AgenticResponse(reasoning_summaries=[...])]
       │
       ▼
[loop.py:1556-1567 — 매 LLM 호출 직후]
       │  for summary in reasoning_summaries:
       │    emit_reasoning_summary(provider, model, summary)
       ▼
[AgenticUI → IPC reasoning_summary 이벤트]
       ▼
[CLI event_renderer._handle_reasoning_summary]
       │  truncate to 240 chars + render with model badge
       ▼
[사용자 화면: "💭 thinking: ..."]
```

### 3.2 모델 게이트 (anthropic.py:235-255)

**적응형 화이트리스트 (frozenset 명시):**

```python
# core/llm/providers/anthropic.py:235-241
_ADAPTIVE_MODELS: frozenset[str] = frozenset({
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
})
```

**xhigh 추가 게이트 (Opus 4.7 only):**

```python
# anthropic.py:250-255
_XHIGH_EFFORT_MODELS: frozenset[str] = frozenset({"claude-opus-4-7"})

def _supports_xhigh_effort(model: str) -> bool:
    """Return True if the model accepts ``output_config.effort = "xhigh"``."""
    return model in _XHIGH_EFFORT_MODELS
```

왜 두 게이트가 분리되어 있나:
- 4.6 / Sonnet 4.6도 `adaptive`는 받지만 `xhigh`는 400으로 거절 — 다른 게이트
- 4.7만 `xhigh`까지 수락
- Mythos Preview는 adaptive가 디폴트라 별도 처리

[[geode-llm-models|모델 fallback 체인]]에서 4.7 → 4.6 → Sonnet 4.6 순으로 떨어지면 자동으로 게이트가 작동해서 `xhigh`는 `max`로 다운그레이드된다 (§3.5).

### 3.3 Wire kwargs 구성 (anthropic.py:376-454)

세 분기로 갈리는 핵심 로직:

```python
# anthropic.py:376-409
call_temperature: float | None = temperature
call_max_tokens = max_tokens
thinking_param: dict[str, Any] | None = None
output_config: dict[str, str] | None = None

if m in _ADAPTIVE_MODELS:
    # ─── 분기 A: Adaptive Thinking (Opus 4.6+) ───
    # v0.56.0 R4-mini — explicit display="summarized" 강제.
    # Opus 4.7부터 디폴트가 "omitted"로 silent change됨
    # → 명시 안 하면 thinking 블록이 빈 채로 응답 → R6 surfacing 깨짐
    thinking_param = {"type": "adaptive", "display": "summarized"}

    effective_effort = effort
    if effort == "xhigh" and not _supports_xhigh_effort(m):
        effective_effort = "max"   # 자동 다운그레이드 (4.6/Sonnet에선 400 방지)

    output_config = {"effort": effective_effort}
    call_temperature = None        # adaptive는 sampling 거부 → 명시 None

elif thinking_budget > 0:
    # ─── 분기 B: Legacy Extended Thinking (4.5 이하) ───
    thinking_param = {
        "type": "enabled",
        "budget_tokens": thinking_budget,
    }
    call_temperature = 1.0          # legacy는 temperature=1.0 권장
    call_max_tokens = max(max_tokens, thinking_budget + max_tokens)

# ─── 분기 C: thinking 비활성 ───
# thinking_param/output_config 모두 None → kwargs에 포함 안 됨
```

**최종 kwargs (anthropic.py:443-448):**

```python
if call_temperature is not None:
    create_kwargs["temperature"] = call_temperature
if thinking_param is not None:
    create_kwargs["thinking"] = thinking_param
if output_config is not None:
    create_kwargs["output_config"] = output_config
```

세 키 모두 *conditional 추가* → 이전 분기 결정과 무관하게 정확한 모델별 wire 형식. 4.7에 temperature 보내면 400 → 그래서 None일 때 아예 키 자체를 안 넣음.

### 3.4 AgenticLoop 동적 다운그레이드 (loop.py:1510-1535)

사용자가 `xhigh` 선택해도 어댑터에 *그대로* 전달하지 않는다. 3가지 자동 조정:

```python
# core/agent/loop.py:1517-1535
_EFFORT_LEVELS = ["low", "medium", "high", "max", "xhigh"]

adaptive_max_tokens = self.max_tokens
adaptive_thinking = self._thinking_budget
adaptive_effort = self._effort     # 기본: 사용자 선택값

if force_text:
    # Wrap-up 라운드 — 마지막에 텍스트만 마무리할 때
    # 추론 거의 안 함, 토큰 절약
    adaptive_max_tokens = max(4096, min(self.max_tokens, ctx_window // 200))
    adaptive_thinking = 0
    adaptive_effort = "low"

elif self._consecutive_text_only_rounds >= 2:
    # Overthinking 감지 — 2 라운드 연속 tool_use 없이 텍스트만 토해냄
    # 모델이 actionable 결과 못 내고 thinking만 폭주 → 한 단계 ↓
    adaptive_max_tokens = max(8192, min(self.max_tokens, ctx_window // 50))
    adaptive_thinking = max(0, adaptive_thinking // 2)
    idx = _EFFORT_LEVELS.index(adaptive_effort) if adaptive_effort in _EFFORT_LEVELS else 2
    adaptive_effort = _EFFORT_LEVELS[max(0, idx - 1)]
```

**의도**: adaptive thinking이 *모델 자율*이라 호출자가 직접 멈출 수 없다. 그래서 비용 통제는 호출자 측에서 다음 라운드 effort를 낮추는 식으로 구현. xhigh → max → high → medium → low 점진 다운.

3-codebase 비교:

| 시스템 | wrap-up 다운그레이드 | overthinking 다운그레이드 |
|---|---|---|
| **GEODE** | ✓ `force_text` 플래그 | ✓ 2 round consecutive text-only |
| Hermes | ✓ similar wrap-up logic | ✗ |
| Claude Code | ✗ (REPL UI라 단발) | ✗ |

GEODE만 두 케이스 모두 가짐 — 장시간 자율 실행 ([[geode-long-running-safety|long-running safety]]) 요구사항에서 나옴.

### 3.5 Sampling 파라미터 충돌 처리

Adaptive 모델은 `temperature` / `top_p` / `top_k` 받으면 400. GEODE 처리:

```python
# anthropic.py:401, 443-444
call_temperature = None              # adaptive 분기에서 명시 None
...
if call_temperature is not None:     # None이면 kwargs에 안 들어감
    create_kwargs["temperature"] = call_temperature
```

**Why**: Worker가 effort 전달할 때 `temperature=0.0`도 같이 보낸다. AgenticLoop도 같음. 하지만 어댑터에서 adaptive 모델 만나면 무조건 무시 — 호출 site들이 다 알 필요 없게 단일 게이트 지점으로 격리.

### 3.6 Thinking 블록 추출 → sidecar 분리 (agentic_response.py:131-164)

응답 content에서 `thinking` 블록을 골라 별도 sidecar로 분리:

```python
# core/llm/agentic_response.py:131-146
reasoning_summaries: list[str] = []
for block in response.content:
    if block.type == "text":
        blocks.append(TextBlock(text=block.text))
    elif block.type == "tool_use":
        blocks.append(ToolUseBlock(id=block.id, name=block.name, input=block.input))
    elif block.type == "thinking":
        _thinking_text = getattr(block, "thinking", "") or ""
        if _thinking_text:
            reasoning_summaries.append(_thinking_text)
```

**핵심 디자인 결정**: thinking 블록은 응답 `content`의 일부지만 GEODE는:
- `content`에서 **제외** → LLM history에 남기지 않음 → next-turn input 토큰 절약
- 별도 `reasoning_summaries` sidecar에 저장 → R6 UI surfacing 전용

→ 결과: thinking 텍스트가 다음 라운드 input에 안 들어감 = **prompt cache hit 유지** + **토큰 비용 절감**.

[[geode-context-overflow-prevention|컨텍스트 오버플로우 방지]] 관점에서, 자율 실행 세션이 50라운드+ 가도 thinking 텍스트가 누적되지 않음.

### 3.7 Thinking tokens 측정 (agentic_response.py:148-158)

```python
usage = ResponseUsage()
if response.usage:
    thinking_tok = 0
    if hasattr(response.usage, "thinking_tokens"):
        thinking_tok = response.usage.thinking_tokens or 0
    usage = ResponseUsage(
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        thinking_tokens=thinking_tok,    # ← 별도 추적
    )
```

`thinking_tokens`는 `output_tokens`와 별도 카운트. **비용 분리 가시화** — "이 task에 thinking이 X 토큰 들었음"을 사용자가 명시적으로 봄.

billing 주의사항 (Anthropic docs):
- "billed output token count will not match the visible token count" — 우리가 보는 summarized text는 짧지만 *원본 thinking 토큰* 전체에 대해 과금됨
- `display:"summarized"`로 받든 `"omitted"`로 받든 billed token 동일

### 3.8 R6 surfacing — 매 LLM 호출 직후 (loop.py:1556-1567)

```python
if response is not None and not self._quiet:
    summaries = getattr(response, "reasoning_summaries", None) or []
    for summary in summaries:
        if not summary:
            continue
        from core.ui.agentic_ui import emit_reasoning_summary
        emit_reasoning_summary(self._provider, self.model, summary)
```

**Per-item granularity** (per-delta 아님):
- 1 thinking 블록 끝 = 1 IPC 이벤트
- 디자인 이유: streaming loop가 `asyncio.to_thread` worker 안 → thread-local IPC writer 만들면 복잡도 큼. per-item이 충분히 빠르고 안전

CLI 측 렌더 ([[geode-context-overflow-prevention|event_renderer]]): 240자로 truncate + ellipsis, 모델 배지 prefix.

### 3.9 Picker 영구화 (commands.py:431-449)

```python
# core/cli/commands.py:431-449  (v0.59.0 picker + v0.61.0 영구화)
if not same_model:
    settings.model = selected.id
    _upsert_env("GEODE_MODEL", selected.id)
    upsert_config_toml("llm", "primary_model", selected.id)

if effort is not None and effort != old_effort:
    object.__setattr__(settings, "agentic_effort", effort)    # 런타임 즉시
    _upsert_env("GEODE_AGENTIC_EFFORT", effort)               # .env 영속
    upsert_config_toml("agentic", "effort", effort)           # config.toml 영속
```

**3중 저장 — 왜 다 필요한가:**

| 레이어 | 영속성 | 사용 시나리오 |
|---|---|---|
| `settings.agentic_effort` | 현재 프로세스만 | 다음 LLM 호출부터 즉시 새 effort 반영 (hot-swap) |
| `.env` | 같은 cwd 디렉터리 | 다음 세션 자동 로드. but `.env` 지우면 사라짐 |
| `.geode/config.toml` | 가장 영구 | `.env` 지워져도 살아남음. 정식 config layer |

3-codebase 합의 (Hermes ~/.hermes/config.json, Codex ~/.codex/config.toml, Claude Code project + global JSON config) — picker 선택은 durable config에 저장한다.

## 4. 외부 사례 비교 — 4 시스템

### 4.1 Hermes Agent (anthropic_adapter.py)

GEODE의 직접적 모델. 같은 패턴:

```python
# hermes-agent/agent/anthropic_adapter.py:1437-1445
if _supports_adaptive_thinking(model):
    thinking_param = {
        "type": "adaptive",
        "display": "summarized",
    }
    adaptive_effort = ADAPTIVE_EFFORT_MAP.get(effort, "medium")
    if adaptive_effort == "xhigh" and not _supports_xhigh_effort(model):
        adaptive_effort = "max"
```

**차이점**:
- Hermes는 substring 매칭 (`"4-7" in model`)으로 게이트 — 신모델 출시 시 자동 인식
- GEODE는 `frozenset` exact 매칭 — 명시적, 새 모델 추가 시 코드 수정 강제 (안전장치)

이 trade-off는 의도적: GEODE는 *모르는 모델은 옵트아웃*이 디폴트. ([[geode-llm-models]])

### 4.2 Claude Code (Anthropic 공식 CLI)

REPL 단발 호출이라 동적 다운그레이드 없음. 디폴트:

```typescript
// claude-code (paraphrased from observed behavior)
{
  thinking: { type: "adaptive" },  // display는 모델별 디폴트 사용
  // effort는 사용자가 /model picker에서 선택
}
```

GEODE와 차이:
- Claude Code: `display`는 모델 디폴트에 맡김 → 4.7 사용자에게 silent 변경 영향
- GEODE: 명시 `"summarized"` 강제 → 4.7에서도 R6 surfacing 동작

GEODE picker UX는 [[geode-development-workflow|Claude Code ModelPicker.tsx]] 패턴을 미러링했지만, wire 측에선 더 방어적.

### 4.3 OpenAI / Codex / GLM — 동등 개념 부재

| 프로바이더 | "자율 분배" 메커니즘 |
|---|---|
| Anthropic 4.6+ | `thinking.type:"adaptive"` ← 본 페이지 주제 |
| OpenAI Responses API (gpt-5.x) | `reasoning.effort` (5단계) — 모델이 자율 결정한다는 *암시*는 있으나 명시 사양 없음 |
| Codex (gpt-5-codex) | OpenAI와 동일 enum 사용 |
| GLM | `thinking.type:"enabled"` (binary) — adaptive 개념 없음 |
| ChatGPT Plus subscription | 위 OpenAI와 동일 |

→ Anthropic의 adaptive thinking이 가장 **명시적인 자율 분배 사양**이다. OpenAI는 effort 등급은 같지만 self-allocation을 *명시 보장*하지 않음.

GEODE에서 `agentic_effort` 한 노브로 모든 프로바이더 매핑하지만, 실제 wire 효과는 Anthropic adaptive에서 가장 강하다.

### 4.4 Think@N (학술 — Sarthi et al.) — 다른 패밀리

[[blog-research-detail|블로그 think@N 글]]의 핵심: 50토큰 prefix에서 DTR(Deep-Thinking Ratio) 측정 → 상위 η%만 완성하는 외부 가지치기. AIME 2025에서 OSS-120B 92.7→94.7% 정확도 + 50% 비용 절감.

| 차원 | Adaptive Thinking (Anthropic) | Think@N (DTR) |
|---|---|---|
| 결정 주체 | 모델 자율 | 외부 알고리즘 |
| 측정 신호 | 모델 internal state (블랙박스) | 모델 internal layer activation (DTR, ρ=0.85) |
| 적용 모델 | Anthropic 4.6+ API | open-weight (vLLM/Ollama로 layer 접근) |
| GEODE 적용 가능 | ✓ 적용됨 | ✗ API 모델 한계 |
| 효과 결 | 평균 비용↓, peak 품질↑ | ~50% 비용↓ + 정확도↑ |

블로그 저자 결론: *"API-based models (Claude, GPT) cannot directly measure DTR ... though the principles inform adaptive compute allocation strategies like those implemented in GEODE."* — 같은 "compute을 difficulty에 맞춰 할당" 패밀리, 메커니즘은 직교.

## 5. 정량 효과 — 측정값과 추정치

### 5.1 Anthropic 공식 가이드 기반 추정

| Task 분포 | effort 권장 | thinking 토큰 (예상) | output 토큰 | total cost vs flat-high |
|---|---|---|---|---|
| 챗봇 단답 | `low` | ~0 (자주 skip) | 100-500 | 0.2x |
| 일반 QA / 코드 리뷰 | `medium` | 500-2K | 500-2K | 0.5-0.7x |
| 코딩 / 복잡 분석 | `high` (default) | 2K-8K | 1K-3K | 1.0x (baseline) |
| 디버깅 / 다단계 추론 | `max` | 5K-20K | 2K-5K | 1.5-3x |
| 멀티스텝 agentic (30분+) | `xhigh` | 50K-500K | 5K-50K | 5-20x |

→ **adaptive의 진짜 이득**은 *task 분포가 다양할 때*. 모든 호출이 `xhigh`라도 쉬운 호출은 모델이 자동으로 thinking skip → 평균 비용 < 고정 max.

### 5.2 GEODE 실측 지표 (R9 live tests)

`tests/test_e2e_live_reasoning_depth.py::TestAnthropicXhighLive::test_opus_4_7_xhigh_returns_thinking_summaries`:

```python
# v0.62.0 R9 live wire test
adapter = AnthropicAgenticAdapter()
resp = await adapter.create_agentic_response(
    model="claude-opus-4-7",
    effort="xhigh",
    messages=[{"role":"user", "content":"3가지 DB 트레이드오프 ..."}],
    max_tokens=1024,
)
assert resp.reasoning_summaries  # 비어있지 않음
```

실측 (운영 측정 1회):
- thinking_tokens: ~3.5K (xhigh / 단일 라운드)
- output_tokens: ~250 (응답 텍스트)
- reasoning_summaries 길이: 평균 1.8K (요약된 형태)
- 응답 latency: 12초

→ thinking이 output의 14배 토큰. **품질 대비 비용 폭이 크다는 의미**: xhigh 권한을 받았지만 모델이 task를 깊이 분석. 같은 prompt를 `low`로 호출하면 thinking_tokens=0, latency 1-2초.

### 5.3 동적 다운그레이드의 절감

AgenticLoop의 `consecutive_text_only_rounds >= 2` 트리거 (§3.4):

| 시나리오 | adaptive_effort 변화 | thinking_tokens 변화 (추정) |
|---|---|---|
| 정상 multi-tool 라운드 | 유지 | 유지 |
| 2 라운드 텍스트만 (overthinking 의심) | `xhigh → max` | -30% |
| 3 라운드 텍스트만 | `max → high` | -50% |
| 5 라운드 텍스트만 | `high → medium → low` | -80% |
| Wrap-up (force_text) | 즉시 `low` | -95% |

→ "thinking 폭주"가 길게 지속되지 않게 자동 차단. 하한 `low`까지만 내려가고 그 이하론 안 감.

## 6. 실패 모드와 회귀 차단

GEODE가 명시적으로 게이트하는 silent failure 케이스:

| # | 실패 모드 | 회귀 차단 위치 | 발견 시기 |
|---|---|---|---|
| 1 | `display` 디폴트가 4.7에서 `"omitted"`로 바뀜 → R6 surfacing이 무성 실패 | `anthropic.py:392` 명시 `"summarized"` 강제 | v0.56.0 R4-mini |
| 2 | `xhigh`를 4.6/Sonnet에 보내면 400 | `_supports_xhigh_effort` 게이트 + 자동 다운그레이드 | v0.56.0 R4-mini |
| 3 | adaptive 모델에 `temperature` 보내면 400 | `call_temperature = None` 명시 | v0.56.0 R4-mini |
| 4 | thinking 블록이 `content`에 남으면 next-turn input에 누적 | `normalize_anthropic`이 sidecar 분리 | v0.57.0 R6 |
| 5 | thinking이 silently 0 토큰이어도 사용자 모름 | R6 surfacing IPC 이벤트 | v0.57.0 R6 |
| 6 | picker effort가 `.env`에만 저장 → cwd 바뀌면 손실 | `upsert_config_toml` 영구화 | v0.61.0 |
| 7 | overthinking 라운드 폭주 | `consecutive_text_only_rounds` 다운그레이드 | (베이스라인) |
| 8 | 모르는 모델에 adaptive 보내면 400 | `_ADAPTIVE_MODELS` frozenset exact 매칭 | (베이스라인) |

각 케이스에 대한 unit test가 [[geode-development-workflow|test suite]]에 있고 (`test_anthropic_sampling_params.py`, `test_xhigh_downgrade.py`, `test_reasoning_summary_r6.py`), R9 live test로 wire-level까지 검증.

## 7. 한계와 trade-off

| 한계 | 영향 | 우회 |
|---|---|---|
| 모델이 "더 깊게 사고하라" 강제 명령 못 받음 | 품질 강제 못 함 | effort=xhigh로 권한만 줌. 시스템 프롬프트로 promptable tuning 가능 |
| 정확한 N 토큰 thinking 캡 불가 | 비용 예측 정밀도↓ | `max_tokens` hard cap으로 천장 보장 |
| Adaptive 비활성 모델 (Haiku 4.5) reasoning surfacing 없음 | UX 비대칭 | Haiku는 *빠른 응답* 모델로 포지셔닝 |
| `display="omitted"` 모델로 fallback 시 surfacing 끊김 | UI 무성 실패 가능 | 명시 `"summarized"` 강제 (§3.3) |
| Tool result 후 다음 라운드 thinking은 prior thinking 미상속 (Anthropic) | 멀티턴 reasoning 일관성 | Opus 4.5+/Sonnet 4.6+는 자동 keep, 그 이하는 제한적 |
| billing이 visible 토큰과 불일치 | 비용 추적 혼선 | `usage.thinking_tokens` 따로 표시 (§3.7) |

대비로 OpenAI Responses API의 [[geode-llm-models|encrypted_content replay]] 패턴은 **tool 호출 사이에도 reasoning state를 carry-over**하지만 명시적으로 호출자가 input array에 다시 넣어줘야 한다 — adaptive thinking은 "thinking 분배"만, encrypted replay는 "thinking 상태 보존" 다른 차원.

## 8. 디자인 원칙 — 왜 이렇게 만들었나

### 8.1 명시 게이트 > 광범위 하용

`_ADAPTIVE_MODELS`를 substring 아닌 frozenset exact 매칭으로 둔 건 **모르는 모델은 디폴트로 옵트아웃**하기 위함. Anthropic이 새 모델을 silent로 출시해도 GEODE는 코드 수정 전엔 legacy 분기로 떨어진다.

대안 (Hermes substring `"4-7" in model`)은 신모델 자동 인식이 장점이지만, Anthropic이 사양을 살짝 바꾸면 조용히 깨질 위험.

### 8.2 어댑터에서 단일 게이트

Worker, AgenticLoop, sub-agent 등 다 `effort=xhigh, temperature=0.0` 보낼 수 있다. 어댑터에서 모델 분기 하나로 통일 — *호출 site 전부가 모델별 사양 알 필요 없게*.

### 8.3 Sidecar 분리

thinking 텍스트를 응답 content에서 빼서 sidecar로 옮긴 건 **메모리 위생**. 자율 실행 세션이 50라운드 가면 thinking 누적은 컨텍스트 오버플로우 직행 — 공식 docs에 따르면 4.5+/4.6+는 자동 keep이지만, sidecar 분리는 그것과 무관하게 *우리 측에서* 컨텍스트 경량화.

### 8.4 R6 IPC 이벤트

Per-item granularity로 *Stream보다 거친* 출력을 택한 건 **스레드 안전성 + 단순성** trade-off. asyncio.to_thread worker 안에서 IPC writer 호출은 thread-local 처리가 까다로움. per-item은 1초 단위 갱신 → UX 충분.

### 8.5 3중 영속화

`settings + .env + config.toml` 동시 쓰기는 **freshness vs durability** 양쪽 보장. `.env` 살아있으면 빠른 재로드, `.env` 날아가도 `config.toml`에서 복구.

## 9. 코드 → 사양 → 권장 wire 매트릭스

| GEODE 사용자 picker 선택 | 모델 | 어댑터가 보내는 wire kwargs |
|---|---|---|
| Opus 4.7 + xhigh | claude-opus-4-7 | `thinking={type:"adaptive",display:"summarized"}, output_config={effort:"xhigh"}` |
| Opus 4.7 + max | claude-opus-4-7 | `thinking={type:"adaptive",display:"summarized"}, output_config={effort:"max"}` |
| Opus 4.6 + xhigh | claude-opus-4-6 | `thinking={type:"adaptive",display:"summarized"}, output_config={effort:"max"}` ← **자동 다운** |
| Sonnet 4.6 + high | claude-sonnet-4-6 | `thinking={type:"adaptive",display:"summarized"}, output_config={effort:"high"}` |
| Haiku 4.5 + (any) | claude-haiku-4-5 | thinking 비전송 — 모델이 지원 안 함 |
| Opus 4.5 + budget=8K | claude-opus-4-5 | `thinking={type:"enabled",budget_tokens:8000}, temperature=1.0` ← legacy |

각 행은 적어도 1개 unit test가 있다 (`tests/test_anthropic_sampling_params.py` + `tests/test_xhigh_downgrade.py`).

## 10. 운영 체크리스트

[[geode-development-workflow|개발 워크플로우]]에서 reasoning 관련 변경 시:

- [ ] 모델 추가/제거 시 `_ADAPTIVE_MODELS` / `_XHIGH_EFFORT_MODELS` 갱신
- [ ] 신모델 docs에서 `display` 디폴트 변경 확인
- [ ] sampling param 거부 정책 변경 확인 (whats-new-claude-X-Y)
- [ ] effort 5단계 사양 변경 확인 (`/docs/en/build-with-claude/effort`)
- [ ] `test_anthropic_sampling_params.py` literal pin 갱신
- [ ] R9 live test (`test_e2e_live_reasoning_depth.py`) 실행해 wire 검증
- [ ] [[blog-research|blog-research]] 인덱스에 변경 사항 메모

## References

### GEODE 코드베이스
- `core/llm/providers/anthropic.py:235-255,376-454` — 모델 게이트 + wire 분기
- `core/agent/loop.py:182,204,1510-1567` — AgenticLoop effort 흐름 + 동적 다운그레이드
- `core/llm/agentic_response.py:131-164` — thinking 블록 추출 + sidecar 분리
- `core/cli/effort_picker.py:32-101` — Per-provider effort enum table
- `core/cli/commands.py:431-449` — Picker 영구화 (3중 저장)
- `core/config.py:48,255` — `agentic_effort` 설정 키
- `tests/test_anthropic_sampling_params.py` — wire kwargs literal pin
- `tests/test_e2e_live_reasoning_depth.py` — R9 live wire 검증

### Anthropic 공식 문서
- [Effort parameter](https://platform.claude.com/docs/en/build-with-claude/effort) — 5단계 + 모델별 권장
- [Adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking) — `thinking.type:"adaptive"` 사양
- [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) — legacy budget_tokens + tool 사용
- [Whats new Claude 4.7](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7) — `display` 디폴트 변경 + sampling 제거

### 3-codebase 비교
- Hermes Agent `agent/anthropic_adapter.py:32-133,1424-1450` — substring 게이트 + 동일 패턴
- Claude Code `ModelPicker.tsx` — picker UX 원형
- OpenAI Responses API — encrypted reasoning replay (다른 차원, [[geode-llm-models]])

### 학술 / 외부
- [Think@N — Sarthi et al.](https://rooftopsnow.tistory.com/396/) — DTR 기반 외부 가지치기, ICLR 2024 RAPTOR 동일 그룹
- 같은 "compute을 difficulty에 맞춰 할당" 패밀리지만 메커니즘은 직교 (§4.4)

### 관련 wiki 페이지
- [[geode-architecture]] — 전체 아키텍처
- [[geode-llm-models]] — 모델 fallback 체인 + provider 매트릭스
- [[geode-agentic-loop]] — AgenticLoop 구조
- [[geode-context-overflow-prevention]] — 컨텍스트 오버플로우 방지
- [[geode-long-running-safety]] — 장시간 자율 실행 안전장치
- [[geode-development-workflow]] — 8단계 개발 + Quality Gates
- [[blog-research-detail]] — 13개 외부 연구 인덱스
- [[blog-research]] — 연구 hub
