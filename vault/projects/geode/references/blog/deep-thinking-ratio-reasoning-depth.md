---
title: "길게 생각하면 잘 푸는 게 아니다 — DTR 논문이 바꾸는 추론 설계"
type: reference
category: blog-post
tags: [blog, reasoning, dtr, thinking-tokens, adaptive-compute, test-time-compute]
source: "docs/research/deep-thinking-ratio-research.md"
related:
  - "[[deep-thinking-ratio]]"
  - "[[overthinking-inverse-scaling]]"
  - "[[test-time-compute-scaling]]"
  - "[[geode-agentic-loop]]"
  - "[[geode-llm-models]]"
created: 2026-04-15T00:00:00Z
---

# 길게 생각하면 잘 푸는 게 아니다 — DTR 논문이 바꾸는 추론 설계

> Date: 2026-04-15 | Author: mango | Tags: DTR, reasoning, thinking-tokens, adaptive-compute

## 목차

1. 상식의 전복: 길수록 틀립니다
2. Logit Lens에서 DTR까지 — 레이어를 들여다보는 계보
3. Deep-Thinking Ratio: 측정 방법의 기술적 세부
4. Think@n: 50 토큰으로 결과를 예측합니다
5. Reasoning Level Paradox: 높은 추론이 낮은 DTR을 만드는 이유
6. Overthinking 연구 생태계: 5편의 독립적 검증
7. Google의 궤적: 외부 스캐폴드에서 내재화로
8. GEODE에 적용한 것들
9. 에이전트 설계자에게 주는 교훈

---

## 1. 상식의 전복: 길수록 틀립니다

2024년부터 2025년 초까지 업계의 상식은 분명했습니다. **"추론 모델은 길게 생각할수록 좋다."** OpenAI o1이 등장한 이후, 긴 Chain-of-Thought(CoT)가 곧 성능이라는 공식이 자리 잡았고, [[test-time-compute-scaling|Test-Time Compute Scaling]]은 학계와 산업계 모두의 화두가 되었습니다.

ICLR 2025에서는 "Inference compute scaling이 parameter scaling보다 효율적인 조건"이 정식으로 도출되었고, 30B 토큰 이상을 생성하는 대규모 TTS 전략 비교 실험(arXiv:2512.02008)까지 등장했습니다. "더 오래 생각하게 하라"는 처방이 거의 정설에 가까웠습니다.

그런데 Google + University of Virginia 팀이 2026년 2월에 발표한 논문 하나가 이 공식을 정면으로 뒤집었습니다.

**"Think Deep, Not Just Long"** (arXiv:2602.13517)

이 논문의 핵심 발견은 충격적으로 단순합니다.

| 메트릭 | 정확도 상관 (Pearson r) | 해석 |
|--------|:---------------------:|------|
| Token Count (길이) | **-0.594** | 길수록 **오히려 틀림** |
| Log Probability | 0.527 | 모델 간 불일치, 불안정 |
| Negative Entropy | 0.571 | 중간 수준, 변동 큼 |
| Self-Certainty | 0.605 | 최선의 confidence baseline |
| **DTR (깊이)** | **+0.683** | **가장 강하고 안정적** |

토큰 수와 정확도는 음의 상관입니다. AIME, HMMT, GPQA-Diamond 네 개 벤치마크에서, GPT-OSS(20B/120B), DeepSeek-R1-70B, Qwen3-30B-Thinking까지 — 모델과 태스크를 가리지 않고 일관됩니다. 길게 쓴 답일수록 틀릴 확률이 높습니다.

시험을 보는 학생에 비유하면 직관적입니다.

| 상황 | 행동 | 결과 |
|------|------|------|
| 잘 아는 문제 | 바로 답을 씁니다 | 정답 |
| 모르는 문제 | 일단 길게 채웁니다 | 오답 |
| 어렵지만 풀 수 있는 문제 | 머릿속에서 여러 번 검토한 뒤 간결하게 씁니다 | 정답 |

세 번째 학생이 하는 것이 "deep thinking"입니다. **겉으로 보이는 답안 길이가 아니라, 머릿속에서 답이 바뀌는 횟수**가 실력의 지표입니다.

---

## 2. Logit Lens에서 DTR까지 — 레이어를 들여다보는 계보

[[deep-thinking-ratio|DTR]]은 하늘에서 떨어진 아이디어가 아닙니다. Transformer 내부를 관찰하는 연구 계보의 연장선에 있습니다.

**2020년, Logit Lens** — nostalgebraist가 제안한 기법입니다. Transformer 중간 레이어의 hidden state에 최종 레이어의 unembedding matrix를 직접 곱하면, 그 시점에서 모델이 "무엇을 예측하고 있는지"를 볼 수 있습니다. GPT-2에서는 효과적이었지만, 대형 모델에서는 레이어 간 representation drift로 인해 불안정했습니다.

**2023년, [[tuned-lens|Tuned Lens]]** (Belrose et al., arXiv:2303.08112) — Logit Lens의 한계를 해결했습니다. 각 레이어에 별도의 affine probe를 훈련하여, 20B 파라미터 모델까지도 안정적으로 중간 예측을 추출할 수 있게 되었습니다. 이 연구가 확립한 핵심 프레임워크가 있습니다: **"Transformer는 초기 레이어에서 대략적인 추측(coarse guess)을 하고, 깊은 레이어로 갈수록 반복적으로 정교화(iterative refinement)한다."**

**2023년, DoLa** (Chuang et al., arXiv:2309.03883, ICLR 2024) — Tuned Lens의 관찰을 디코딩 전략에 활용했습니다. 후반 레이어와 전반 레이어의 logit 차이를 대비(contrast)하여 디코딩하면, factuality가 향상됩니다. TruthfulQA에서 LLaMA 모델의 성능을 12-17% 절대값으로 끌어올렸습니다.

**2026년, DTR** — 동일한 "레이어별 분포 변화" 신호를 **추론 노력 측정 + inference routing**에 활용합니다. Tuned Lens가 "관찰"이었고 DoLa가 "디코딩 개선"이었다면, DTR은 **"compute 배분 의사결정"**입니다. 그리고 training이 필요 없습니다. Unembedding matrix를 직접 사용하기 때문에 어떤 open-weight 모델에도 즉시 적용할 수 있습니다.

```
Logit Lens (2020)     → "중간 레이어에서 예측을 볼 수 있다" (관찰)
     ↓
Tuned Lens (2023)     → "안정적으로 볼 수 있다" (정교화)
     ↓
DoLa (2023)           → "이 신호로 디코딩을 개선할 수 있다" (활용 — factuality)
     ↓
DTR (2026)            → "이 신호로 compute를 배분할 수 있다" (활용 — efficiency)
```

---

## 3. Deep-Thinking Ratio: 측정 방법의 기술적 세부

DTR의 계산은 5단계로 이루어집니다.

### Step 1: 중간 레이어 예측 분포 추출

각 레이어 `l`의 hidden state `h_{t,l}`에 최종 레이어의 unembedding matrix `W`를 곱합니다.

```python
# 각 레이어에서의 "다음 토큰 예측 확률"
p_t_l = softmax(W @ h_t_l)   # 중간 레이어 l의 예측
p_t_L = softmax(W @ h_t_L)   # 최종 레이어 L의 예측 (ground truth)
```

> Tuned Lens는 레이어별 affine probe를 훈련해야 했지만, DTR은 unembedding matrix를 직접 사용합니다. Training-free라는 점이 실용적 이점입니다.

### Step 2: 레이어 간 분포 차이 측정

중간 레이어 분포와 최종 레이어 분포 사이의 거리를 **Jensen-Shannon Divergence (JSD)**로 측정합니다.

```
D_{t,l} = JSD(p_{t,L} || p_{t,l})
```

JSD를 선택한 이유가 있습니다.

| 메트릭 | 문제점 | DTR 적합성 |
|--------|--------|-----------|
| KL Divergence | 비대칭, 수치 불안정 (AIME 25에서 부호 반전 발생) | 부적합 |
| Cosine Similarity | 약한 상관 (r=0.172, HMMT) | 부적합 |
| **JSD** | 대칭, 유계 [0,1], 안정적 | **최적** |

### Step 3: Settling Depth 결정

"이 토큰이 레이어 몇에서 최종 답에 수렴했는가?"를 판정합니다.

```
D_bar_{t,l} = min_{j<=l} D_{t,j}    # monotonic — 한번 수렴하면 되돌아가지 않도록 강제
settling_depth(t) = argmin_l { D_bar_{t,l} <= g }   # g = 0.5 (threshold)
```

### Step 4: Deep-Thinking 판정

전체 레이어의 85% 이상(`rho = 0.85`)에서야 수렴하면 deep-thinking으로 분류합니다.

```
Deep-thinking cutoff = ceil(0.85 * L)

# 예: L=32 레이어 모델
# cutoff = ceil(0.85 * 32) = 28
# 28층 이후에야 수렴 → deep-thinking token
# 10층에서 수렴    → shallow-thinking token
```

### Step 5: DTR 계산

```
DTR(S) = (deep-thinking tokens 수) / (전체 tokens 수)
```

하이퍼파라미터 `g=0.5`, `rho=0.85`는 실험적으로 도출된 값입니다. 논문의 sensitivity 분석에 따르면, `g`가 상관 계수에 더 큰 영향을 미치고, `rho`는 DTR 범위를 이동시키되 양의 상관 기울기는 유지합니다.

---

## 4. Think@n: 50 토큰으로 결과를 예측합니다

DTR의 실전 활용이 [[deep-thinking-ratio|Think@n]] 전략입니다.

기존 self-consistency(Cons@n)는 n개의 답변을 **전부** 생성한 뒤 majority voting을 합니다. 비용이 n에 비례합니다.

Think@n은 다릅니다.

1. n개 답변 생성을 **시작**합니다
2. **50 토큰만 생성한 시점에서** 각각의 DTR을 측정합니다
3. DTR 상위 eta%만 끝까지 생성하고, 나머지는 **조기 중단**합니다
4. 상위 답변들로 majority voting을 합니다

```
              Cons@n                            Think@n
         ┌─────────────┐                 ┌─────────────┐
답변 1   │█████████████│ 전부 생성        │█████████████│ DTR 높음 → 완주
답변 2   │█████████████│ 전부 생성        │██░░░░░░░░░░░│ DTR 낮음 → 중단
답변 3   │█████████████│ 전부 생성        │█████████████│ DTR 높음 → 완주
답변 4   │█████████████│ 전부 생성        │██░░░░░░░░░░░│ DTR 낮음 → 중단
답변 5   │█████████████│ 전부 생성        │█████████████│ DTR 높음 → 완주
         └─────────────┘                 └─────────────┘
비용: 5 x 전체                            비용: 3 x 전체 + 2 x 50토큰 ≈ 50%
```

실제 벤치마크 결과입니다.

| Model | Benchmark | Cons@n Acc | Cons@n Tokens | Think@n Acc | Think@n Tokens | Savings |
|-------|-----------|:---------:|:------------:|:----------:|:-------------:|:------:|
| OSS-120B | AIME 2025 | 92.7% | 307.6k | **94.7%** | 155.4k | **-49%** |
| Qwen3-30B | AIME 2025 | 86.7% | 1073.1k | **90.0%** | 537.5k | **-50%** |

더 정확하면서 절반만 씁니다. 핵심 인사이트는 이것입니다: **처음 50 토큰의 DTR만으로 그 답변이 "깊이 생각하고 있는지" 예측할 수 있습니다.** 마치 시험 답안의 첫 줄만 읽고 "이 학생이 풀 줄 안다"를 판별하는 것과 같습니다.

---

## 5. Reasoning Level Paradox: 높은 추론이 낮은 DTR을 만드는 이유

논문에서 발견한 흥미로운 역설이 있습니다.

> GPT-OSS 모델에서 reasoning level을 높이면 **DTR은 오히려 낮아지는데, 정확도는 올라갑니다**.

왜 그런 것일까요?

```
Reasoning Level 낮음:  적은 토큰, 각 토큰이 열심히 계산 (높은 DTR)
Reasoning Level 높음:  많은 토큰, 각 토큰의 부담 분산 (낮은 DTR), 전체 정확도 상승
```

비유하면 이렇습니다. 혼자서 짐을 나르면 힘들지만(높은 DTR), 여럿이 나누면 각자 부담이 줄어듭니다(낮은 DTR). **계산 노력이 "깊이"에서 "길이"로 재분배**된 것입니다.

이 역설이 의미하는 바가 중요합니다. DTR은 "높을수록 무조건 좋다"가 아닙니다. **동일한 조건 내에서 답변 간 품질을 비교하는 상대적 지표**로 사용해야 합니다. Think@n이 정확히 그 용도입니다 — 같은 모델, 같은 문제에 대한 n개의 candidate 중 어떤 것이 더 유망한지를 판별합니다.

---

## 6. Overthinking 연구 생태계: 5편의 독립적 검증

[[overthinking-inverse-scaling|DTR 논문은 혼자가 아닙니다]]. 2025년 후반에 5편의 논문이 독립적으로 같은 현상을 보고했습니다. **긴 CoT가 성능을 적극적으로 해칩니다.**

| 논문 | 핵심 발견 | 실질적 절감 |
|------|----------|-----------|
| "Don't Overthink It" (arXiv:2505.17813) | 짧은 chain이 긴 것보다 **최대 34.5% 더 정확** | — |
| "When More is Less" (arXiv:2502.07266) | CoT 길이-정확도 **역 U자 커브**. 최적점 이후 하락. 능력 높은 모델일수록 짧은 CoT를 선호 | — |
| "Between Under/Overthinking" (arXiv:2505.00127) | 쉬운 문제에서 overthink, 어려운 문제에서 underthink — **양방향 비효율** | — |
| "Evolution of Thought" / RCPD (arXiv:2508.17627) | Reasoning Completion Point 이후의 computation은 무의미 | **44% 토큰 절감** |
| "NoWait" (arXiv:2506.08343, EMNLP 2025) | "Wait", "Hmm" 등 self-reflection 토큰 억제 (plug-and-play) | **27-51% CoT 단축** |

"Token-Budget-Aware Reasoning"(ACL 2025)은 난이도별 토큰 예산을 달리 할당하여 **토큰 67% 절감, 비용 59% 절감**을 달성했고, "Plan and Budget"은 sub-question 분해 + 예산 배분으로 **정확도 70% 향상 + 토큰 39% 절감**을 보였습니다. "Increasing the Thinking Budget is Not All You Need"(arXiv:2512.19585)는 단순히 budget을 늘리는 것보다 **self-consistency + reflection 조합**이 더 효과적임을 입증했습니다.

하나의 방향으로 수렴하고 있습니다: **"More" → "Better"로의 패러다임 전환**. 길이를 늘리는 것이 아니라, 품질을 높이는 것입니다.

---

## 7. Google의 궤적: 외부 스캐폴드에서 내재화로

Google의 연구 궤적을 시간순으로 추적하면, [[test-time-compute-scaling|추론 설계의 진화 방향]]이 보입니다.

| 시점 | 연구 | 접근 |
|------|------|------|
| 2024.02 | **SELF-DISCOVER** (NeurIPS 2024) | LLM이 스스로 atomic reasoning module을 선택-조합하여 task-specific 추론 구조를 생성. CoT-SC 대비 20%+ 향상, **10-40x 적은 compute** |
| 2025.03 | **Gemini 2.5** | Thinking Budget 최대 32,768 토큰. 모델이 **내부적으로** 추론 과정을 생성하는 "thinking model" 아키텍처 |
| 2025.07 | **Gemini Deep Think** | 별도 모델이 아니라 **동일 모델에 추론 강화 모드**를 추가하는 접근. IMO 금메달, IMO-ProofBench Advanced 90% |
| 2026.02 | **DTR / Think@n** | 깊이 기반 compute routing. 50 토큰 prefix로 품질 예측 → **50% 비용 절감** |

OpenAI가 o1 → o3 → o4-mini로 **별도의 reasoning model**을 만드는 전략을 취하는 반면, Google은 **동일 모델 + 추론 모드**라는 접근을 취합니다. 스캐폴드를 모델 내부로 흡수하는 설계 철학입니다.

```
외부 스캐폴드 (2024)     → 모델 내재화 (2025)      → 적응적 배분 (2026)
SELF-DISCOVER               Gemini Thinking          DTR / Think@n
(프롬프트 구조 제공)         (내부 추론 생성)           (깊이 기반 routing)
```

---

## 8. GEODE에 적용한 것들

DTR은 open-weight 모델 전용입니다. [[geode-llm-models|GEODE가 사용하는 모델]]은 Claude, GPT 등 API 모델이므로 중간 레이어에 접근할 수 없어 DTR을 직접 측정하는 것은 불가능합니다. 하지만 **핵심 교훈**은 API 환경에도 적용할 수 있습니다. 3단계로 나누어 구현했습니다.

### Phase 1: Thinking Token Infrastructure

Anthropic Extended Thinking과 OpenAI reasoning_effort를 GEODE가 인식하고 추적하도록 했습니다.

```python
# core/llm/agentic_response.py
@dataclass(slots=True)
class ResponseUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0   # NEW — 추론 토큰 별도 추적
```

> thinking_tokens를 output_tokens와 분리하여 추적하는 것이 핵심입니다. Anthropic Extended Thinking은 output과 동일 단가로 과금되므로, 이를 별도 추적하지 않으면 추론 비용을 정확히 파악할 수 없습니다.

Provider별 전달 방식도 다릅니다.

```python
# core/llm/providers/anthropic.py — Extended Thinking 활성화
if thinking_budget > 0:
    thinking_param = {"type": "enabled", "budget_tokens": thinking_budget}
    call_temperature = 1.0  # Anthropic API 제약: Extended Thinking은 temperature=1 필수
    call_max_tokens = max(max_tokens, thinking_budget + max_tokens)
```

```python
# core/llm/providers/openai.py — reasoning effort 매핑
_REASONING_MODELS = {"o3", "o4-mini", "o3-mini"}
if thinking_budget > 0 and m in _REASONING_MODELS:
    if thinking_budget <= 4096:
        create_kwargs["reasoning"] = {"effort": "low"}
    elif thinking_budget <= 16384:
        create_kwargs["reasoning"] = {"effort": "medium"}
    else:
        create_kwargs["reasoning"] = {"effort": "high"}
```

> Anthropic은 토큰 단위(`budget_tokens`)로 정밀 제어가 가능하고, OpenAI는 3단계 effort level(`low/medium/high`)로만 제어할 수 있습니다. `thinking_budget` 값을 두 Provider에 맞게 매핑하는 것이 adapter layer의 역할입니다.

### Phase 2: Adaptive Compute Allocation

모든 LLM call에 동일한 32K 토큰을 주던 것을, [[geode-agentic-loop|AgenticLoop]]의 라운드 특성에 따라 차등 배분합니다.

```python
# core/agent/agentic_loop.py — 라운드별 적응적 예산
adaptive_max_tokens = self.max_tokens       # 기본: 32,768
adaptive_thinking = self._thinking_budget

if force_text:
    # Wrap-up 라운드: 요약만 하면 됩니다
    adaptive_max_tokens = min(self.max_tokens, 4096)
    adaptive_thinking = 0
elif self._consecutive_text_only_rounds >= 2:
    # Overthinking 감지: 행동 없이 말만 길어지고 있습니다
    adaptive_max_tokens = min(self.max_tokens, 16384)
    adaptive_thinking = min(adaptive_thinking, adaptive_thinking // 2)
```

> Overthinking 감지의 프록시 신호는 "연속 2+ 라운드에서 tool call 없이 긴 텍스트만 생성"입니다. DTR을 직접 측정할 수 없는 API 환경에서, 이것이 가장 신뢰할 수 있는 외부 heuristic입니다.

GoalDecomposer에 난이도 태깅도 추가했습니다.

```python
# core/orchestration/goal_decomposer.py
class SubGoal(BaseModel):
    ...
    difficulty: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="Complexity: low=lookup, medium=analysis, high=reasoning",
    )
```

Sub-agent에 전파될 때 difficulty에 따라 thinking_budget이 차등 설정됩니다. `low`는 thinking을 비활성화하고, `high`는 최소 8,192 토큰을 보장합니다.

### Phase 3: Reasoning Metrics

세션 종료 시 추론 효율을 측정하여 `REASONING_METRICS` hook event로 발행합니다.

```python
# core/agent/reasoning_metrics.py
@dataclass(slots=True)
class ReasoningMetrics:
    total_rounds: int = 0
    thinking_tokens: int = 0
    output_tokens: int = 0
    thinking_ratio: float = 0.0         # thinking / (thinking + output)
    tool_calls_total: int = 0
    empty_rounds: int = 0               # tool call 없는 라운드
    cost_per_tool_call: float = 0.0     # 도구 1회당 비용 효율
    overthinking_detected: bool = False
```

> `thinking_ratio`는 DTR의 API 환경 대응물입니다. DTR이 "레이어 깊이에서의 계산 비율"이라면, thinking_ratio는 "전체 출력 중 추론에 할애한 토큰의 비율"입니다. 직접적인 대응은 아니지만, 모델이 얼마나 "생각하는 데" 자원을 쓰고 있는지를 추적할 수 있습니다.

---

## 9. 에이전트 설계자에게 주는 교훈

DTR과 그 주변 연구가 에이전트 시스템 설계에 주는 메시지는 명확합니다.

**첫째, "더 길게 생각하십시오"라는 프롬프트는 위험합니다.** [[overthinking-inverse-scaling|Overthinking]]을 유발하여 성능을 오히려 악화시킬 수 있습니다. "Step by step으로 풀어보십시오"보다 "핵심만 간결하게 판단하십시오"가 나을 수 있습니다.

**둘째, 조기 품질 판별이 가능합니다.** 에이전트가 여러 경로를 탐색할 때, 초반 출력만으로 유망한 경로를 선별할 수 있습니다. 모든 경로를 끝까지 따라갈 필요가 없습니다. Think@n은 50 토큰이면 충분하다는 것을 보여주었습니다.

**셋째, Compute는 균등이 아니라 적응적으로 배분해야 합니다.** 쉬운 sub-task에 과도한 토큰을 쓰면 전체 효율이 떨어집니다. 난이도 인식이 핵심이며, 이것이 GoalDecomposer에 `difficulty` 필드를 추가한 이유입니다.

**넷째, 품질 신호는 출력이 아니라 내부에 있습니다.** 가능하다면 모델 내부 상태를 활용하는 것이 외부 heuristic보다 신뢰할 수 있습니다. Open-weight 모델이 점점 더 중요해지는 이유이기도 합니다.

2024년의 질문이 "어떻게 하면 더 길게 생각하게 할까?"였다면, 2026년의 질문은 **"어떻게 하면 더 깊이 생각하게 할까?"**입니다.

---

## Summary

| 항목 | 내용 |
|------|------|
| 핵심 논문 | Think Deep, Not Just Long (arXiv:2602.13517) |
| 핵심 발견 | 토큰 길이와 정확도는 음의 상관 (r=-0.594) |
| 제안 메트릭 | DTR — 레이어 깊이 기반 추론 노력 측정 (r=+0.683) |
| 실전 전략 | Think@n — 50 토큰 prefix로 품질 예측, 비용 50% 절감 |
| 선행 연구 | Logit Lens → Tuned Lens → DoLa → DTR |
| 관련 현상 | Overthinking / Inverse Scaling (5편 독립 검증) |
| GEODE 적용 | thinking_tokens 추적 + adaptive compute + ReasoningMetrics |

## Checklist

- [x] DTR 메트릭 정의 및 수학적 기초 이해
- [x] Think@n 전략과 비용 절감 효과 파악
- [x] Reasoning Level Paradox 인지 (높은 추론 = 낮은 DTR)
- [x] Overthinking 연구 생태계 5편 파악
- [x] Google의 추론 설계 궤적 이해 (스캐폴드 → 내재화 → 적응적)
- [x] GEODE에 thinking_tokens + adaptive compute 구현
- [ ] Open-weight 모델 기반 DTR 직접 측정 실험

---

## References

- [Think Deep, Not Just Long (arXiv:2602.13517)](https://arxiv.org/abs/2602.13517) — Google + U. of Virginia
- [Tuned Lens (arXiv:2303.08112)](https://arxiv.org/abs/2303.08112) — Belrose et al.
- [DoLa (arXiv:2309.03883)](https://arxiv.org/abs/2309.03883) — Chuang et al., ICLR 2024
- [SELF-DISCOVER (arXiv:2402.03620)](https://arxiv.org/abs/2402.03620) — Google DeepMind, NeurIPS 2024
- [Gemini 2.5 Technical Report (arXiv:2507.06261)](https://arxiv.org/abs/2507.06261)
- [Don't Overthink It (arXiv:2505.17813)](https://arxiv.org/abs/2505.17813)
- [When More is Less (arXiv:2502.07266)](https://arxiv.org/abs/2502.07266)
- [Between Under/Overthinking (arXiv:2505.00127)](https://arxiv.org/abs/2505.00127)
- [Evolution of Thought / RCPD (arXiv:2508.17627)](https://arxiv.org/abs/2508.17627)
- [NoWait (arXiv:2506.08343)](https://arxiv.org/abs/2506.08343) — EMNLP 2025
- [Token-Budget-Aware Reasoning (ACL 2025)](https://aclanthology.org/2025.findings-acl.1274.pdf)
- [Increasing the Thinking Budget is Not All You Need (arXiv:2512.19585)](https://arxiv.org/abs/2512.19585)
- [Scaling LLM Test-Time Compute Optimally (ICLR 2025)](https://openreview.net/forum?id=4FWAwZtd2n)

### Wiki Pages

- [[deep-thinking-ratio]] — DTR 메트릭 상세
- [[overthinking-inverse-scaling]] — Overthinking 역 스케일링 현상
- [[test-time-compute-scaling]] — TTC 연구 생태계
- [[geode-agentic-loop]] — GEODE AgenticLoop
- [[geode-llm-models]] — GEODE 3-Provider 모델 체계
