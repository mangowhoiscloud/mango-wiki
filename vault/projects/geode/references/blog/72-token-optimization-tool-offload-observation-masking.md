---
title: "탐색 에이전트의 토큰 과소비 — Tool Offloading과 Observation Masking으로 입구에서 끊기"
type: reference
category: blog-post
tags: [blog, memory-context]
source: "blog/posts/memory-context/72-token-optimization-tool-offload-observation-masking.md"
created: 2026-04-08T00:00:00Z
---

# 탐색 에이전트의 토큰 과소비 — Tool Offloading과 Observation Masking으로 입구에서 끊기

> 자율 에이전트가 10라운드 이상 탐색을 수행하면,
> 잊혀야 할 정보가 잊히지 않아서 비용이 제곱으로 불어납니다.
> 이 글은 GEODE에서 발견한 quadratic cost 문제를,
> 프론티어 연구를 참조하여 "생산 시점 차단"과 "축적 시점 마스킹"으로
> 해결한 과정과 트레이드오프를 기록합니다.

> Date: 2026-04-05 | Author: rooftopsnow | Tags: token-optimization, tool-offload, observation-masking, context-compression, agentic-loop, jetbrains-research, acon, swe-pruner

---

## 목차

1. 증상: 20라운드 탐색에서 $2.50이 사라지는 구조
2. 원인 분석: 왜 비용이 제곱으로 증가하는가
3. 선행 연구: 프론티어는 어떻게 하고 있는가
4. 설계 결정: 왜 Offloading + Masking을 선택했는가
5. 구현: 생산 시점에서 끊기 — `_serialize_tool_result`
6. 구현: 축적 시점에서 지우기 — `mask_stale_observations`
7. 와이어링: ContextVar DI의 3지점 문제
8. 트레이드오프: 무엇을 얻고 무엇을 잃는가
9. 마무리: 저렴한 방어선부터 세우십시오

---

## 1. 증상: 20라운드 탐색에서 $2.50이 사라지는 구조

GEODE의 `AgenticLoop`는 Claude의 tool_use 응답이 나오는 한 계속 루프를 돕니다. "Berserk IP에 대해 조사해줘"라는 요청이 들어오면, 에이전트는 web_search를 호출하고, 결과를 읽고, 추가 질문을 던지며 10-20라운드를 소비합니다.

52번 포스트에서 다룬 Token Guard는 이 루프가 컨텍스트 윈도우를 넘지 않도록 보호합니다. 그런데 한 가지 질문이 남아 있었습니다. **오버플로우가 발생하지 않더라도, 비용이 합리적인가?**

추적해 보니, 합리적이지 않았습니다.

```
Round 1:   system(10K) + user(200) + tools(10K)                    = 20.2K input
Round 5:   system(10K) + 10 messages(~40K) + tools(10K)            = 60K input
Round 10:  system(10K) + 20 messages(~80K) + tools(10K)            = 100K input
Round 15:  system(10K) + 30 messages(~120K) + tools(10K)           = 140K input
Round 20:  system(10K) + 40 messages(~160K) + tools(10K)           = 180K input
```

누적 input 합계는 약 500K 토큰이고, Opus 4.6 기준 $2.50입니다. 20라운드가 대단한 숫자처럼 보이지 않지만, 사용자가 "3개 IP를 비교 분석해줘"라고 하면 에이전트는 IP당 7-8라운드, 합산 20라운드를 쉽게 넘깁니다. 그리고 이 비용은 output이 아니라 **input만의** 비용입니다.

---

## 2. 원인 분석: 왜 비용이 제곱으로 증가하는가

원인은 LLM API의 근본적인 제약에 있습니다. Anthropic Messages API든 OpenAI Chat Completions API든, 매 요청마다 **전체 대화 history**를 전송해야 합니다. Round 20에서 Round 1의 web_search 결과 15,000자를 아직도 들고 있을 이유가 거의 없는데, 현재 구조에서는 그렇습니다.

GEODE의 기존 방어 체계를 돌아보면 왜 이 문제가 남아 있었는지 보입니다.

| 방어 | 트리거 시점 | 목적 | 비용 최적화? |
|------|-----------|------|------------|
| `_guard_tool_result` | 생산 직후 | 소형 모델(<200K) 보호 | 1M 모델에는 비활성 |
| `clear_tool_uses` (Anthropic) | 서버측, 자동 | 오래된 tool_use 블록 5개 초과 제거 | 부분적 |
| `summarize_tool_results` | 80% 도달 시 | 2% 초과 블록 텍스트 교체 | 이미 늦음 |
| `adaptive_prune` | 95% 도달 시 | 긴급 메시지 제거 | 정보 소실 큼 |

핵심 문제는 1M 컨텍스트 모델(Opus 4.6, Sonnet 4.6)에서 `max_tool_result_tokens`가 0(무제한)으로 설정되어 있다는 점입니다. 200K 이상 모델은 서버측 `clear_tool_uses`에 의존하도록 설계되어 있었는데, 이 기능은 **tool_use 블록만** 제거하지 **tool_result 블록은 그대로** 둡니다.

즉, 세 가지 병목이 동시에 작용하고 있었습니다.

1. **진입 무방비**: 대형 tool result가 context에 제한 없이 진입
2. **축적 방치**: 80%까지 아무런 압축 없이 누적
3. **사후 대응**: 조치 시점에 이미 수십만 토큰이 쌓여 있음

---

## 3. 선행 연구: 프론티어는 어떻게 하고 있는가

이 문제를 해결하기 전에, 프론티어 시스템과 최근 연구를 조사했습니다. 접근법은 크게 네 가지로 분류됩니다.

### 3.1 Observation Masking — JetBrains Research (2025.12)

JetBrains는 코딩 에이전트의 context management 전략을 체계적으로 비교한 연구를 발표했습니다. 핵심 발견은 놀라울 정도로 단순합니다.

> "Observation masking — 오래된 환경 관측값을 placeholder로 교체하는 것만으로
> solve rate가 +2.6% 개선되고, 비용은 평균 52% 감소했습니다.
> LLM 기반 요약은 masking과 동등한 결과를 냈지만, 에이전트 실행 시간이 ~15% 길었고,
> 요약 생성 자체가 총 비용의 >7%를 차지했습니다."

이 연구가 말하는 바는 명확합니다. **LLM 요약이 반드시 masking보다 나은 것은 아닙니다.** 오래된 tool 결과에서 LLM이 실제로 활용하는 정보는 극히 일부이고, 나머지는 "Token Snowball Effect"를 일으킬 뿐입니다 — 매 턴마다 소량의 불필요한 토큰이 누적되어, 긴 trajectory에서는 거대한 낭비가 됩니다.

### 3.2 Tool Result Offloading — Manus AI, Claude Code

Manus AI와 Claude Code는 공통적으로 "store externally, inject summary" 패턴을 사용합니다. 20K 토큰을 넘는 tool 출력은 파일시스템에 저장하고, context에는 경로 참조와 10줄 미리보기만 남깁니다. Claude Code의 경우 `/compact` 명령이 이 과정을 수동으로도 트리거할 수 있게 합니다.

### 3.3 Neural Pruning — SWE-Pruner (arXiv:2601.16746, 2026.01)

SWE-Agent 팀은 다른 방향을 탐색했습니다. 0.6B 파라미터의 경량 "skimmer" 모델을 훈련시켜, 에이전트가 명시한 목표(예: "에러 핸들링에 집중")에 따라 관련 코드 라인만 선별합니다. 23-54%의 토큰 감소를 달성하면서 성공률은 유지되거나 오히려 향상되었습니다. agent-environment 경계에서 미들웨어로 동작하므로 다른 접근법과 직교적으로 결합할 수 있습니다.

### 3.4 Compression Guideline Optimization — ACON (arXiv:2510.00615, ICLR 2026)

ACON은 더 근본적인 질문을 던집니다. "어떤 정보를 압축하면 안 되는가?" 전체 context에서 성공한 trajectory와 압축 후 실패한 trajectory를 짝지어, LLM이 "이 정보가 없어서 실패했다"를 분석하게 합니다. 이 과정을 반복하면 자연어로 된 압축 가이드라인이 자동 생성됩니다. gradient 없이 동작하므로 Claude나 GPT 같은 closed-source 모델에도 적용 가능합니다.

### 비교 정리

| 전략 | LLM 비용 | 구현 복잡도 | 정보 보존 | 적용 시점 |
|------|---------|-----------|---------|---------|
| Observation Masking | 없음 | 낮음 | 낮음 (placeholder) | 축적 시점 |
| Tool Offloading | 없음 | 낮음 | 높음 (recall 가능) | 생산 시점 |
| Neural Pruning | 추론 비용 | 높음 (모델 훈련) | 중간 (task-aware) | 생산 시점 |
| ACON Guideline | 최적화 비용 | 중간 | 높음 (학습된 규칙) | 설계 시점 |

---

## 4. 설계 결정: 왜 Offloading + Masking을 선택했는가

네 가지 전략 중 처음 두 가지를 선택한 이유는 **비용 대비 효과의 비대칭성** 때문입니다.

Offloading과 Masking은 LLM 호출이 전혀 없습니다. 구현 복잡도가 낮고, 기존 코드에 대한 침투가 최소한입니다. 반면 Neural Pruning은 별도 모델의 훈련과 서빙 인프라가 필요하고, ACON은 trajectory 수집과 반복 최적화 파이프라인이 필요합니다.

"비용 0인 방어선을 먼저 세우고, 부족하면 LLM 기반 방어를 추가한다"는 원칙을 세웠습니다.

```
[NEW] 생산 시점:  Tool result > 5K tokens → 파일 오프로드, 요약만 주입
[NEW] 80% 도달:   최근 3라운드 이전 tool_result → [masked] placeholder
[기존] 80% 도달:  대형 tool result 텍스트 요약 (summarize_tool_results)
[기존] 95% 도달:  Emergency prune (adaptive_prune)
[기존] Anthropic:  Server-side compact_20260112
```

핵심 설계 결정은 **"생산 시점에서 끊는다"**입니다. tool 결과가 `_serialize_tool_result`를 통과하는 순간, 5K 토큰을 넘는 결과는 파일시스템으로 빠집니다. context에는 처음부터 큰 결과가 들어가지 않으므로, 이후 매 라운드의 재전송 비용이 원천적으로 차단됩니다.

```
[Before]  web_search → 15K tokens → context에 그대로 → 이후 19라운드 재전송 = 285K 낭비
[After]   web_search → 15K tokens → .geode/tool-offload/에 저장
          context에는: {_offloaded: true, summary: "...", hint: "..."}
          → ~500 tokens × 19라운드 = 9.5K (30:1 압축)
```

한 가지 열린 질문이 있었습니다. **LLM이 summary만 보고 충분히 판단할 수 있는가?** 이것은 의도적으로 받아들인 트레이드오프입니다. summary로 부족하면 LLM이 `recall_tool_result` 도구를 호출해서 전체 결과를 복원할 수 있습니다. 다만 LLM이 "summary로 부족하다"는 판단을 항상 올바르게 내리지는 않습니다. 이 한계는 섹션 8에서 더 자세히 다루겠습니다.

---

## 5. 구현: 생산 시점에서 끊기 — `_serialize_tool_result`

### ToolResultOffloadStore

파일 기반 저장소입니다. 세션별로 격리되고, TTL(기본 4시간)로 자동 만료됩니다. `atomic_write_json`을 사용하여 프로세스 중단 시에도 파일이 손상되지 않습니다.

```python
# core/orchestration/tool_offload.py

class ToolResultOffloadStore:
    def __init__(self, *, session_id: str, threshold: int = 5000,
                 ttl_hours: float = 4.0, base_dir: Path | None = None):
        self._session_dir = (base_dir or Path(".geode/tool-offload")) / session_id
        self._session_dir.mkdir(parents=True, exist_ok=True)

    def offload(self, ref_id: str, result: Any) -> str:
        payload = {"ref_id": ref_id, "result": result, "offloaded_at": time.time()}
        atomic_write_json(self._session_dir / f"{ref_id}.json", payload, indent=None)
        return ref_id

    def recall(self, ref_id: str) -> dict[str, Any]:
        path = self._session_dir / f"{ref_id}.json"
        if not path.exists():
            return {"error": f"Offloaded result not found: {ref_id}"}
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - float(data.get("offloaded_at", 0.0)) > self._ttl_s:
            path.unlink(missing_ok=True)
            return {"error": f"Offloaded result expired: {ref_id}"}
        return data.get("result", {})
```

### `_serialize_tool_result` 변경

`ToolCallProcessor`의 직렬화 단계에서 오프로드가 수행됩니다. 기존 `_guard_tool_result` (소형 모델 보호) 이후에 실행되므로, 두 가드가 겹치지 않습니다.

```python
# core/agent/tool_executor.py (변경 후, 핵심 부분)

serialized = json.dumps(result, ensure_ascii=False, default=str)
estimated_tokens = len(serialized) // 4

offload_store = get_offload_store()
if offload_store and offload_store.threshold > 0 and estimated_tokens > offload_store.threshold:
    ref_id = offload_store.offload(block_id, result)
    summary = extract_result_summary(result, max_chars=400)
    content = json.dumps({
        "_offloaded": True,
        "_ref_id": ref_id,
        "_original_tokens": estimated_tokens,
        "summary": summary,
        "hint": "Use recall_tool_result(ref_id) to retrieve the full output.",
    }, ensure_ascii=False)
else:
    content = serialized
```

LLM은 `_offloaded: true` 마커를 보면 summary로 판단하고, 전체 내용이 필요할 때 `recall_tool_result` 도구를 호출합니다.

### 요약 추출의 우선순위

`extract_result_summary`는 결과에서 가장 의미 있는 텍스트를 추출합니다. SubAgentResult는 항상 `summary` 필드를 가지므로 1순위로 활용됩니다. 없으면 `text`, `content`, `message`, `output` 등 일반적인 텍스트 필드를 탐색하고, 그마저도 없으면 JSON 키 목록과 직렬화 미리보기를 조합합니다.

이 우선순위에서 의도적으로 빠진 것이 있습니다. **LLM 기반 요약은 하지 않습니다.** 생산 시점에서 LLM을 호출하면 latency가 추가되고, 비용 절감의 이점이 희석됩니다. 요약의 품질이 떨어지더라도, LLM이 필요할 때 recall할 수 있으므로 정보 소실은 아닙니다.

---

## 6. 구현: 축적 시점에서 지우기 — `mask_stale_observations`

Offloading이 "진입 차단"이라면, Masking은 "축적 정리"입니다. Offloading 임계값(5K 토큰) 이하의 tool result는 그대로 context에 들어가는데, 이것도 10라운드 이상 쌓이면 상당한 양이 됩니다.

JetBrains 연구의 핵심 발견을 그대로 적용합니다. **최근 N라운드의 tool_result만 유지하고, 나머지는 placeholder로 교체합니다.**

```python
# core/orchestration/context_monitor.py

def mask_stale_observations(messages, *, keep_recent_rounds=3):
    # assistant 메시지 인덱스로 라운드 경계를 파악합니다
    assistant_indices = [i for i, m in enumerate(messages) if m.get("role") == "assistant"]
    if len(assistant_indices) <= keep_recent_rounds:
        return 0

    cutoff_idx = assistant_indices[-keep_recent_rounds]

    masked = 0
    for i, msg in enumerate(messages):
        if i >= cutoff_idx:
            break  # 최근 라운드 도달 — 중단
        # ... tool_result 블록을 [masked: N tokens] 로 교체 ...
    return masked
```

`_check_context_overflow`에서 **기존 summarize보다 먼저** 실행됩니다. masking은 LLM 호출이 없으므로 비용이 0이고, 이것만으로 80% 이하로 내려가면 summarize는 스킵됩니다.

`keep_recent_rounds=3`의 근거는 JetBrains 연구에서 제시한 "에이전트는 보통 최근 2-3 라운드의 관측만 실질적으로 참조한다"는 발견입니다. GEODE에서는 이 값을 `observation_mask_keep_rounds` 설정으로 노출하여 조정 가능합니다.

---

## 7. 와이어링: ContextVar DI의 3지점 문제

오프로드 store는 세 곳에서 접근해야 합니다.

1. **`tool_executor.py`** — tool result 생산 시 offload 판단
2. **`tool_handlers.py`** — `recall_tool_result` 호출 시 복원
3. **`bootstrap.py`** — 세션 시작/종료 시 lifecycle 관리

이 세 모듈은 서로 직접 import하지 않습니다. GEODE의 기존 패턴(`set_project_memory`, `set_org_memory`, `set_tool_executor`)을 따라 ContextVar DI로 연결합니다.

```python
# core/orchestration/tool_offload.py
_offload_store_ctx: ContextVar[ToolResultOffloadStore | None] = ContextVar(
    "tool_offload_store", default=None
)
```

Bootstrap에서 `set_offload_store(store)`로 주입하면, tool_executor와 tool_handlers 모두 `get_offload_store()`로 접근합니다. Gateway 경로(`shared_services.py`)와 Runtime 경로(`runtime.py`) 양쪽에서 호출하여, IPC 클라이언트와 파이프라인 모두에서 오프로드가 작동합니다.

`SESSION_END` 훅에 cleanup을 등록하여, 세션 종료 시 오프로드 파일이 자동으로 정리됩니다. TTL(4시간)은 비정상 종료 시 orphan 파일의 자연 소멸을 보장합니다.

---

## 8. 트레이드오프: 무엇을 얻고 무엇을 잃는가

### 얻는 것

| 시나리오 | 변경 전 | 변경 후 | 절감 |
|----------|---------|---------|------|
| web_search 결과 (15K tokens) | 15K per round | ~500 tokens summary | 30:1 |
| read_file 결과 (8K tokens) | 8K per round | ~500 tokens summary | 16:1 |
| 20-round 탐색 세션 누적 input | ~500K tokens | ~210K tokens | ~58% |
| 10-round 분석 세션 누적 input | ~250K tokens | ~160K tokens | ~36% |

### 잃는 것

**1. Summary 품질의 불확실성.** `extract_result_summary`는 LLM을 사용하지 않으므로, 복잡한 구조의 tool result에서 핵심을 놓칠 수 있습니다. 예를 들어 web_search가 반환한 10개 검색 결과 중 7번째에 핵심 정보가 있다면, summary는 이를 포착하지 못합니다. `recall_tool_result`로 복원할 수 있지만, LLM이 "이 summary로는 부족하다"는 판단을 항상 정확하게 내리지는 않습니다.

이것은 의식적인 트레이드오프입니다. LLM 기반 요약을 생산 시점에 넣으면 품질은 올라가지만, Haiku 호출 비용 + 300-500ms latency가 매 tool 호출마다 추가됩니다. 20라운드에 평균 3회 tool 호출이면 60회 × 500ms = 30초의 추가 지연입니다. 사용자 경험과 비용 절감 사이에서, 현재는 비용 절감을 우선했습니다.

**2. Masking에 의한 정보 단절.** 3라운드 이전의 tool result가 `[masked]`로 교체되면, LLM은 그 내용을 참조할 수 없습니다. "아까 검색했던 Berserk 판매량이 몇이었지?"라는 질문에 LLM이 답하지 못할 수 있습니다. hint로 `recall_tool_result`를 안내하지만, masking된 블록에는 ref_id가 없으므로 복원이 불가합니다.

이 한계는 P0와 masking의 상호작용에서 발생합니다. 오프로드된 결과는 ref_id로 recall 가능하지만, 오프로드되지 않은 작은 결과가 masking되면 복원 경로가 없습니다. P1(Progressive Compression)에서 Zone C 아카이빙을 도입하면, masking 대신 디스크 저장 + recall 경로가 열려 이 문제가 완화됩니다.

**3. Quadratic 구조 자체는 해결하지 못합니다.** tool result가 줄어도, assistant 메시지와 user 메시지는 여전히 verbatim으로 매 라운드 재전송됩니다. 이 문제는 P1에서 conversation history 전체를 3-Zone으로 분할하여 다룹니다.

### 채택하지 않은 대안

**SWE-Pruner 방식(Neural Pruning)**: 0.6B 경량 모델을 서빙해야 하므로, GEODE의 현재 인프라(LLM API 호출만으로 동작)와 맞지 않습니다. 자체 모델 서빙 인프라를 갖추게 되면 재고할 만합니다.

**ACON 방식(Compression Guideline)**: trajectory pair 수집이 필요한데, GEODE는 아직 충분한 실행 로그를 축적하지 않았습니다. 운영 데이터가 쌓이면 ACON의 gradient-free 최적화를 적용하여 "어떤 tool result의 어떤 부분을 보존해야 하는가"를 학습시킬 수 있습니다.

---

## 9. 마무리: 저렴한 방어선부터 세우십시오

에이전트의 토큰 효율은 "컨텍스트 윈도우가 크니까 괜찮다"로 해결되지 않습니다. 1M 토큰 윈도우를 가진 Opus 4.6도, 20라운드 탐색 세션에서 누적 input이 500K를 넘기면 Anthropic의 200K rate limit pool 경계를 반복적으로 넘게 됩니다.

이번 작업에서 얻은 교훈을 정리하겠습니다.

**생산 시점에서 끊는 것이 가장 저렴합니다.** tool result가 context에 한 번 들어가면, 세션이 끝날 때까지 매 라운드 비용을 발생시킵니다. 15K 토큰 결과가 19라운드 동안 재전송되면 285K 토큰이 낭비됩니다. 진입 자체를 500 토큰 summary로 막으면, 동일 구간에서 9.5K 토큰만 소비됩니다.

**Masking이 Summarization보다 먼저입니다.** JetBrains의 실험이 보여준 것처럼, LLM 요약 없이 placeholder 교체만으로 동등한 solve rate를 얻을 수 있습니다. 비용 0인 방어선을 먼저 배치하고, LLM 기반 압축은 그래도 부족할 때의 2차 방어로 남겨두는 것이 올바른 순서입니다.

**ContextVar DI가 cross-cutting 인프라를 깔끔하게 연결합니다.** 오프로드 store는 생산(tool_executor), 복원(tool_handlers), lifecycle(bootstrap) 세 곳에서 접근해야 합니다. 파라미터 전달 체인 대신 ContextVar로 주입하면, 각 모듈이 서로를 직접 알 필요가 없습니다.

이 글에서 다룬 P0는 4-Phase 토큰 최적화의 첫 단계입니다. 다음 포스트에서는 P1(Progressive Context Compression)을 다룹니다 — conversation history 전체를 3개 Zone으로 분할하여 quadratic cost를 linear로 전환하는 작업입니다.

### 참고 문헌

- JetBrains Research, "Efficient Context Management for Coding Agents" (2025.12) — observation masking vs summarization 비교 실험
- SWE-Pruner (arXiv:2601.16746, 2026.01) — 0.6B neural skimmer, 23-54% task-aware pruning
- ACON (arXiv:2510.00615, ICLR 2026) — gradient-free compression guideline optimization
- SkillReducer (arXiv:2603.29919, 2026.03) — 48% skill description compression, less-is-more effect
- Anthropic, "Context Management API" — `clear_tool_uses_20250919`, `compact_20260112`
- GEODE 52번 포스트, "Token Guard — 에이전트의 컨텍스트 예산을 지키는 3중 방어"

### 변경 파일

| 파일 | 변경 |
|------|------|
| `core/orchestration/tool_offload.py` | 신규 — ToolResultOffloadStore + extract_result_summary + ContextVar DI |
| `core/agent/tool_executor.py` | `_serialize_tool_result` 오프로드 통합 |
| `core/orchestration/context_monitor.py` | `mask_stale_observations` + `PROGRESSIVE_THRESHOLD` |
| `core/agent/agentic_loop.py` | WARNING 분기에 masking 삽입 |
| `core/config.py` | `tool_offload_threshold`, `tool_offload_ttl_hours`, `observation_mask_keep_rounds` |
| `core/hooks/system.py` | `TOOL_RESULT_OFFLOADED` (49번째 이벤트) |
| `core/tools/definitions.json` | `recall_tool_result` (57번째 도구) |
| `core/cli/tool_handlers.py` | recall 핸들러 |
| `core/runtime_wiring/bootstrap.py` | `build_tool_offload` 와이어링 |
| `tests/test_tool_offload.py` | 21개 테스트 |

---

*Source: `blog/posts/memory-context/72-token-optimization-tool-offload-observation-masking.md` | Category: [[blog-memory-context]]*

## Related

- [[blog-memory-context]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
- [[geode-tool-system]]
