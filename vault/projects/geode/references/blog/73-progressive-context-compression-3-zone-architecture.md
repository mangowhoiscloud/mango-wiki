---
title: "Progressive Context Compression — 대화 이력을 3개 Zone으로 나누어 Quadratic을 Linear로 바꾸기"
type: reference
category: blog-post
tags: [blog, memory-context]
source: "blog/posts/memory-context/73-progressive-context-compression-3-zone-architecture.md"
created: 2026-04-08T00:00:00Z
---

# Progressive Context Compression — 대화 이력을 3개 Zone으로 나누어 Quadratic을 Linear로 바꾸기

> 에이전트가 20라운드를 대화하면, 매 API 호출마다
> 1번째 라운드의 메시지까지 전부 다시 보냅니다.
> 비용은 라운드 수의 제곱에 비례합니다.
> 이 글은 대화 이력을 Verbatim / Summarized / Archived 3개 Zone으로 나누어,
> 제곱 비용을 선형으로 전환한 설계와 트레이드오프를 기록합니다.

> Date: 2026-04-05 | Author: rooftopsnow | Tags: progressive-compression, context-management, 3-zone, quadratic-cost, openhands, context-folding, haiku, budget-model, agentic-loop

---

## 목차

1. 문제: P0 이후에도 남는 Quadratic 구조
2. 선행 연구: OpenHands, Context-Folding, OPTIMA
3. 설계: 3-Zone Progressive Compression
4. Zone C 구현: 디스크 아카이빙과 recall 경로
5. Zone B 구현: Budget 모델 요약과 Fallback 전략
6. 트리거: 60% 임계치와 기존 방어선의 공존
7. 트레이드오프: 요약 비용 vs 정보 보존 vs Latency
8. 마무리: 압축은 단계적으로, 손실은 복원 경로로

---

## 1. 문제: P0 이후에도 남는 Quadratic 구조

직전 포스트(72번)에서 Tool Result Offloading과 Observation Masking을 도입하여, 개별 tool result의 context 점유를 10:1~30:1로 압축했습니다. 그러나 근본 구조는 바뀌지 않았습니다.

tool result가 줄어도, **assistant 메시지와 user 메시지**는 여전히 verbatim으로 매 라운드 재전송됩니다. 에이전트가 "이 IP의 게임화 가능성을 분석하겠습니다. 첫째로 원작의 세계관 깊이를..."라고 3,000 토큰의 분석문을 생성하면, 이 텍스트는 이후 모든 라운드에서 그대로 전송됩니다.

P0 적용 후의 비용 프로필을 다시 추적해 보겠습니다.

```
Round 1:   system(10K) + user(200) + tools(10K)                    = 20.2K
Round 10:  system(10K) + msgs(~50K, tool results 축소됨) + tools(10K) = 70K
Round 20:  system(10K) + msgs(~100K) + tools(10K)                   = 120K
```

P0이 180K를 120K로 줄였지만, 여전히 라운드가 늘어날수록 누적 비용은 제곱적으로 증가합니다. 핵심 질문은 이것입니다: **Round 1의 assistant 메시지 전문이 Round 20에서도 필요한가?**

대부분의 경우, 아닙니다. 에이전트는 최근 2-3 라운드의 맥락에서 작업하고, 그 이전은 "이런 작업을 했다" 수준의 요약만 있으면 충분합니다.

---

## 2. 선행 연구: OpenHands, Context-Folding, OPTIMA

### 2.1 OpenHands Context Condensation (2025.11)

OpenHands(구 OpenDevin)는 context condensation이라는 접근법을 프로덕션에 적용했습니다. 오래된 대화를 요약하되, **사용자 목표, 에이전트 진행 상황, 남은 작업, 핵심 기술 세부사항**(실패한 테스트, 중요한 파일 경로)을 보존합니다.

결과는 인상적이었습니다. SWE-bench Verified에서 54% solve rate(기존 53% 대비)를 유지하면서, **per-turn API 비용이 절반 이하**로 감소했습니다. 더 중요한 것은 비용 스케일링이 바뀌었다는 점입니다.

> "Baseline은 turn 수에 따라 비용이 quadratically 증가하지만,
> condensation을 적용하면 **linearly** 증가합니다."

Cursor와 Warp도 동일한 패턴을 채택했다고 보고되었습니다.

### 2.2 Context-Folding (arXiv:2510.11967, 2025.10)

Context-Folding은 더 구조적인 접근을 취합니다. 에이전트가 두 가지 특수 액션을 사용합니다.

- `branch`: 하위 작업을 위한 임시 sub-trajectory를 시작합니다
- `return`: sub-trajectory의 결과를 요약하고 메인 스레드에 복귀합니다

branch 내부의 중간 단계는 "접혀서(folded)" context에서 제거됩니다. FoldGRPO라는 강화학습 방법으로 훈련하며, **ReAct baseline 대비 동등하거나 더 나은 성능을 10x 더 작은 active context로 달성**합니다.

이 논문이 직접적으로 시사하는 바가 있습니다. GEODE의 SubAgentManager가 이미 `branch/return`의 단순 버전을 구현하고 있다는 점입니다. sub-agent가 완료되면 `summary` 필드만 부모에게 전달하고 나머지는 버립니다. P1은 이 패턴을 **대화 이력 전체에** 확장하는 것입니다.

### 2.3 OPTIMA (ACL 2025)

OPTIMA는 멀티 에이전트 시스템의 통신 효율 최적화 프레임워크입니다. Monte Carlo Tree Search로 데이터를 생성하고, DPO/SFT 하이브리드로 훈련합니다. **10% 미만의 토큰으로 2.8배 성능 향상**, 혹은 **90% 토큰 감소에서 동등 성능**을 달성합니다.

GEODE는 단일 에이전트 + sub-agent 구조이므로 OPTIMA를 직접 적용하기는 어렵지만, "통신에 필요한 정보량은 전체의 10% 미만"이라는 발견은 압축의 이론적 근거가 됩니다.

### 비교 정리

| 접근법 | 압축 대상 | 압축 방법 | 비용 스케일링 |
|--------|---------|---------|-------------|
| OpenHands | 전체 대화 | LLM 요약 | Quadratic → Linear |
| Context-Folding | Sub-trajectory | RL 기반 fold/unfold | 10x context 축소 |
| OPTIMA | 에이전트간 메시지 | MCTS + DPO/SFT | 90% 토큰 감소 |
| **GEODE P1** | 전체 대화 | 3-Zone 분할 | Quadratic → Linear |

---

## 3. 설계: 3-Zone Progressive Compression

OpenHands의 "요약 + 최근 유지" 패턴을 기반으로, Context-Folding의 "접기/펼치기" 개념을 결합합니다. 대화 이력을 세 개 Zone으로 나눕니다.

```
전체 메시지 리스트
┌───────────┬────────────────────────┬──────────────────┐
│  Zone C   │       Zone B           │     Zone A       │
│ (Oldest)  │      (Middle)          │    (Recent)      │
│  ~20%     │       ~60%             │     ~20%         │
│           │                        │                  │
│  Archive  │  Budget LLM으로 요약    │  Verbatim 유지   │
│  to disk  │  3-5 msgs → ~200 tok   │  변경 없음        │
│  + recall │  per group             │                  │
└───────────┴────────────────────────┴──────────────────┘
```

**Zone A (Recent 20%)**: 가장 최근 대화입니다. 에이전트가 현재 수행 중인 작업의 맥락이므로, 한 글자도 손대지 않습니다.

**Zone B (Middle 60%)**: 오래되었지만 참조 가능성이 있는 대화입니다. 3-5개 메시지를 하나의 그룹으로 묶어, budget 모델(Haiku)로 요약합니다. 5,000 토큰의 원본이 ~200 토큰 요약으로 압축됩니다.

**Zone C (Oldest 20%)**: 가장 오래된 대화입니다. 디스크에 아카이빙하고 context에서 완전히 제거합니다. `recall_archived_context` 도구로 복원할 수 있습니다.

### 왜 3개 Zone인가

2-Zone(요약 + 최근)도 가능하지만, 3-Zone을 선택한 이유가 있습니다.

OpenHands 방식의 2-Zone은 **전체 이전 대화를 하나의 요약으로** 압축합니다. 30개 메시지가 하나의 요약이 되면, 특정 라운드의 세부 사항을 복원할 방법이 없습니다. 3-Zone은 Zone C를 디스크에 보관하므로 **물리적으로 정보가 사라지지 않습니다**. Zone B는 그룹 단위 요약이므로, 전체 요약보다 세밀도가 높습니다.

트레이드오프는 Zone B의 **요약 비용**입니다. 12개 메시지를 3개 그룹으로 나누면 Haiku를 3번 호출합니다. 하지만 Haiku는 $1/1M input, $5/1M output이고, 그룹당 요약은 ~1K input, ~200 output이므로, 3회 호출의 총 비용은 약 **$0.004**입니다. 이 비용은 원본 12개 메시지를 10라운드 동안 매번 재전송하는 비용(12K × 10 × $5/1M = $0.60)에 비하면 무시할 수 있습니다.

---

## 4. Zone C 구현: 디스크 아카이빙과 recall 경로

Zone C의 메시지는 `.geode/progressive-archive/{session_id}/`에 JSON으로 저장됩니다.

```python
# core/orchestration/progressive_compression.py

def _archive_messages(self, messages: list[dict[str, Any]]) -> str:
    self._session_dir.mkdir(parents=True, exist_ok=True)
    ref = f"archive_{self._archive_counter}"
    self._archive_counter += 1
    payload = {
        "ref": ref,
        "message_count": len(messages),
        "messages": messages,
        "archived_at": time.time(),
    }
    atomic_write_json(self._session_dir / f"{ref}.json", payload, indent=None)
    return ref
```

Context에는 간결한 marker가 남습니다.

```
[Archived: 4 messages, ~8,000 tokens. ref=archive_0]
```

LLM이 아카이빙된 내용이 필요하면 `recall_archived_context(archive_ref="archive_0")`를 호출합니다. P0의 `recall_tool_result`와 동일한 패턴입니다. 이로써 72번 포스트에서 지적한 "masking된 작은 결과는 복원 경로가 없다"는 한계가 해소됩니다 — Zone C에 아카이빙된 메시지는 모든 내용을 recall할 수 있습니다.

---

## 5. Zone B 구현: Budget 모델 요약과 Fallback 전략

Zone B는 메시지를 그룹으로 나누어 요약합니다.

```python
def _summarize_zone_b(self, messages, provider):
    groups = self._split_into_groups(messages)
    summaries = []
    for group in groups:
        text = _build_summary_input(group)  # compaction.py의 기존 인프라 재활용
        summary = self._call_budget_summarize(text, provider)
        if summary:
            summaries.append(summary)
        else:
            summaries.append(self._extract_summary_fallback(group))
    return summaries
```

### Budget 모델 선택

| Provider | 모델 | Input | Output | 선택 이유 |
|----------|------|-------|--------|---------|
| Anthropic | `claude-haiku-4-5-20251001` | $1/M | $5/M | 가장 저렴, 요약 품질 충분 |
| OpenAI | `gpt-4.1-mini` | $0.40/M | $1.60/M | OpenAI fallback 시 |

Anthropic 환경에서는 Haiku를, OpenAI 환경에서는 4.1-mini를 사용합니다. 그룹당 ~1K input, ~200 output이므로 비용은 미미합니다.

### Fallback: LLM 없이도 동작해야 합니다

LLM 호출이 실패하면(API 키 없음, 네트워크 오류 등), fallback 요약기가 동작합니다.

```python
def _extract_summary_fallback(self, messages):
    parts = []
    for msg in messages:
        role = msg.get("role", "")
        # tool 이름, 짧은 텍스트 미리보기 추출
        ...
    return "[Fallback summary] " + " | ".join(parts[:5])
```

이 fallback은 LLM 요약보다 품질이 떨어지지만, **LLM이 없어서 압축 자체가 실패하는 것보다 낫습니다**. GEODE의 설계 원칙 "Graceful Degradation"을 따릅니다 — 모든 LLM provider가 다운되어도(`is_degraded=True`) 파이프라인은 기본값으로 계속 실행됩니다.

### 왜 비동기가 아닌가

`_call_budget_summarize`는 동기 호출입니다. 비동기로 만들면 여러 그룹을 병렬로 요약할 수 있지만, 의도적으로 동기를 선택했습니다.

1. 이 함수는 `_check_context_overflow` 내부에서 호출되며, 이 함수 자체가 AgenticLoop의 LLM 호출 직전에 동기적으로 실행됩니다.
2. 그룹 수가 보통 2-4개이고, Haiku 응답은 ~500ms이므로, 직렬 실행해도 1-2초입니다.
3. 비동기 도입은 `_check_context_overflow`의 호출 체인 전체를 async로 바꿔야 하며, 이는 P1의 범위를 넘어갑니다.

---

## 6. 트리거: 60% 임계치와 기존 방어선의 공존

Progressive compression은 **60% context 사용률**에서 트리거됩니다. 기존 방어선과의 관계는 다음과 같습니다.

```
0%──────60%──────────80%──────95%──────100%
         P1 compress  P0 mask    Emergency
         (3-zone)     +summarize  prune
```

```python
# core/agent/agentic_loop.py — _check_context_overflow

if metrics.is_critical:          # 95%: 기존 emergency prune
    ...
elif metrics.is_warning:         # 80%: P0 masking → summarize
    ...
elif metrics.usage_pct >= 60.0:  # 60%: P1 progressive compression
    compressor = get_compressor()
    if compressor and not compressor.already_compressed:
        compressed = compressor.compress(messages, self._provider)
        messages.clear()
        messages.extend(compressed)
elif metrics.is_ceiling_exceeded: # 200K absolute ceiling
    ...
```

핵심 설계 결정: **`already_compressed` 플래그**. Progressive compression은 세션당 **한 번만** 실행됩니다. 한 번 압축하면 Zone 경계가 무의미해지고(요약된 메시지를 다시 요약하면 정보가 이중으로 손실됩니다), 이후에는 서버측 compaction이나 P0 masking이 충분합니다.

이 "한 번만" 제약은 의식적인 단순화입니다. 반복 압축을 하려면 "이미 요약된 메시지"를 추적하는 메타데이터 레이어가 필요한데, 복잡도 대비 이점이 불명확합니다. 세션이 극단적으로 길어져 두 번째 압축이 필요한 경우, 80%의 기존 방어선(P0 masking + summarize)이 처리합니다.

---

## 7. 트레이드오프: 요약 비용 vs 정보 보존 vs Latency

### 얻는 것

20 라운드 탐색 세션에서의 시뮬레이션입니다. 라운드당 평균 4K 토큰(user + assistant + tool result P0 적용 후)을 가정합니다.

| 라운드 | P0만 적용 | P0 + P1 적용 | 추가 절감 |
|--------|----------|-------------|---------|
| 10 | 70K | 50K | 29% |
| 15 | 105K | 62K | 41% |
| 20 | 120K | 72K | 40% |
| **누적 input** | **~290K** | **~180K** | **38%** |

P0만으로 500K → 290K(42% 절감), P0+P1로 500K → 180K(64% 절감).

비용으로 환산하면 (Opus 4.6, $5/1M input):
- 최적화 전: ~$2.50
- P0만: ~$1.45
- P0+P1: ~$0.90 + ~$0.004 (Haiku 요약)

### 잃는 것

**1. Zone B 요약의 정보 손실.** 5개 메시지를 200 토큰으로 요약하면, 필연적으로 세부 사항이 빠집니다. "아까 분석했던 Berserk의 metacritic 점수가 몇이었는지"라는 질문에 요약만으로는 답하지 못할 수 있습니다. Zone C의 아카이브된 메시지는 recall 가능하지만, Zone B의 요약은 **비가역적**입니다.

이것은 가장 핵심적인 트레이드오프입니다. Zone B를 아카이빙(Zone C처럼)으로 대체하면 정보 손실은 0이 되지만, context에서 60%의 메시지가 완전히 사라지므로 LLM의 연속성 파악이 크게 저하됩니다. 요약은 "무엇을 했는지"의 흐름을 유지하면서 세부사항만 압축하는 절충안입니다.

**2. 요약 Latency.** 3개 그룹 × Haiku ~500ms = ~1.5초의 추가 지연이 한 번 발생합니다. 사용자 체감으로는 "이번 라운드가 좀 느리다" 정도입니다. `already_compressed` 플래그로 인해 이후 라운드에서는 추가 지연이 없습니다.

**3. 한 번만 실행 제약.** 세션이 50라운드 이상 극단적으로 길어지면, 한 번의 compression으로는 부족할 수 있습니다. 이 경우 80%의 P0 masking과 기존 summarize_tool_results가 2차 방어를 수행하지만, 이상적이지는 않습니다. 반복 압축은 향후 개선 사항으로 남겨두었습니다.

### 채택하지 않은 대안

**Anthropic server-side compaction에만 의존하기.** Anthropic의 `compact_20260112`는 80%에서 자동으로 트리거되며, 서버가 요약을 생성합니다. 비용도 무료입니다. 그러나 두 가지 이유로 이것만으로는 부족합니다.

첫째, 80%에 도달하기 전까지 누적되는 재전송 비용을 줄이지 못합니다. 60%에서 미리 압축하면 80% 도달 시점 자체가 늦어집니다.

둘째, OpenAI와 GLM provider에는 서버측 compaction이 없습니다. GEODE는 3-provider fallback을 지원하므로, 클라이언트측 압축이 필요합니다.

**Context-Folding의 RL 기반 fold/unfold.** 이론적으로 가장 우아한 접근이지만, FoldGRPO 훈련을 위한 trajectory 데이터와 RL 인프라가 필요합니다. GEODE의 현재 단계에서는 규칙 기반 3-Zone 분할이 80%의 효과를 20%의 복잡도로 달성합니다.

---

## 8. 마무리: 압축은 단계적으로, 손실은 복원 경로로

P0(Tool Offloading + Observation Masking)과 P1(Progressive Context Compression)을 합치면, GEODE의 context 방어 체계는 5단계가 됩니다.

```
1. [P0] 생산 시점:  tool result > 5K → 파일 오프로드 (recall 가능)
2. [P1] 60% 도달:   3-Zone 분할 — archive / summarize / verbatim
3. [P0] 80% 도달:   오래된 tool result masking (비용 0)
4. [기존] 80%:      summarize_tool_results / server compaction
5. [기존] 95%:      emergency prune
```

이 체계에서 일관된 원칙은 **"저렴한 방법부터 적용하고, 정보 손실에는 복원 경로를 둔다"**입니다.

- P0 offloading: 비용 0, `recall_tool_result`로 복원
- P1 Zone C archiving: 비용 0, `recall_archived_context`로 복원
- P1 Zone B summarization: Haiku ~$0.004, **복원 불가** (의식적 트레이드오프)
- P0 masking: 비용 0, 복원 불가 (한계)

Zone B의 비가역적 요약이 유일한 "진정한 정보 손실" 지점입니다. 이것을 수용한 이유는, 60%의 중간 메시지를 전부 verbatim으로 유지하면 P1의 존재 의미가 사라지기 때문입니다. 요약의 품질을 높이는 것은 ACON(ICLR 2026)의 compression guideline optimization을 적용하는 P3 이후의 과제입니다.

다음 포스트에서는 P2(Semantic Retrieval Layer)를 다룹니다 — lexical 검색을 semantic 검색으로 확장하여, 리서치 태스크에서 관련 context만 선별 주입하는 작업입니다.

### 참고 문헌

- OpenHands, "Context Condensation for More Efficient AI Agents" (2025.11) — quadratic → linear cost scaling
- Context-Folding (arXiv:2510.11967, 2025.10) — branch/return sub-trajectory folding, 10x context 축소
- OPTIMA (ACL 2025, arXiv:2410.08115) — multi-agent communication efficiency, 90% token reduction
- ACON (arXiv:2510.00615, ICLR 2026) — gradient-free compression guideline optimization
- Anthropic, "Compaction API" (`compact_20260112`) — server-side context management
- LangChain, "Context Engineering for Deep Agents" — progressive compression patterns for LangGraph
- GEODE 52번 포스트, "Token Guard — 에이전트의 컨텍스트 예산을 지키는 3중 방어"
- GEODE 72번 포스트, "탐색 에이전트의 토큰 과소비 — Tool Offloading과 Observation Masking"

### 변경 파일

| 파일 | 변경 |
|------|------|
| `core/orchestration/progressive_compression.py` | 신규 — ProgressiveCompressor (3-Zone) + ContextVar DI |
| `core/orchestration/context_monitor.py` | `PROGRESSIVE_THRESHOLD = 60.0` |
| `core/agent/agentic_loop.py` | 60% 구간에 progressive compression 트리거 |
| `core/config.py` | `progressive_compression_enabled`, `progressive_recent_pct`, `progressive_middle_pct` |
| `core/tools/definitions.json` | `recall_archived_context` (58번째 도구) |
| `core/cli/tool_handlers.py` | recall_archived_context 핸들러 |
| `core/runtime_wiring/bootstrap.py` | `build_progressive_compressor` 와이어링 |
| `core/runtime.py`, `core/gateway/shared_services.py` | 양쪽 경로에 와이어링 |
| `tests/test_progressive_compression.py` | 14개 테스트 |

---

*Source: `blog/posts/memory-context/73-progressive-context-compression-3-zone-architecture.md` | Category: [[blog-memory-context]]*

## Related

- [[blog-memory-context]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
