---
title: Data Flow (StateGraph)
category: architecture
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/graph.py:1-100"
  - "plugins/game_ip/nodes/"
external_refs:
  - url: "https://langchain-ai.github.io/langgraph/"
    pattern: "StateGraph + Send API"
---

# Data Flow (StateGraph)

GEODE의 도메인 파이프라인은 LangGraph `StateGraph` 로 정의된다. 노드 + 엣지 + reducer 의 고정 DAG.

## 토폴로지 (Game IP plugin 기준)

```
START
  │
  ▼
router               # 입력 파싱 + state 초기화
  │
  ▼
signals              # 외부 신호 수집 (YouTube, Reddit, Steam, Trends)
  │
  ▼  (Send × 4 — 병렬)
analysts             # game_mechanics, player_experience, growth_potential, discovery
  │
  ▼  (reducer: add_sequences)
evaluators           # quality_judge, hidden_value, community_momentum (Send × 3)
  │
  ▼
scoring              # PSM + final score
  │
  ▼
[skip 결정?]         # state.skip_nodes 검사
  │
  ▼
verification         # G1-G4 + BiasBuster + (cross-LLM 옵션)
  │
  ▼
synthesizer          # cause classification + final report
  │
  ▼
END
```

## Send API (병렬 실행)

LangGraph의 `Send` 객체로 동일 노드를 N번 병렬 실행:

```python
from langgraph.graph import Send

def route_after_signals(state):
    return [
        Send("analyst", {**state, "analyst_type": at})
        for at in domain.get_analyst_types()  # 4 종류
    ]
```

각 Send 인스턴스는 별도 LLM 호출. 결과는 reducer에서 N→1 병합.

## Reducer

```python
graph.add_node("analyst", analyst_node, reducer=add_sequences)
```

`add_sequences` — 동일 채널의 list 결과를 concat. analysts 4개 결과 → `state["analyses"]: list[AnalystOutput]` 4개 append.

## Conditional Edge (동적 분기)

```python
graph.add_conditional_edges(
    "scoring",
    route_after_scoring,    # state → next node name
    {
        "verification": "verification",
        END: END,            # 일부 모드는 verification skip
    },
)
```

`route_after_scoring(state)` 가 mode 플래그 검사 후 노드 이름 반환.

## Dynamic Skip (`core/graph.py:13-16`)

```python
if "synthesizer" in state.get("skip_nodes", set()):
    return state                        # passthrough
state.audit_trail.append(("skip", "synthesizer", reason))
return state
```

verification 노드에서 G1-G4 fail 시 `state.skip_nodes.add("synthesizer")` 추가 → graph가 동적 skip + audit trail 기록.

## 도메인 교체

graph 자체는 동일. 노드 구현만 도메인별로 갈아끼움:

```python
domain = get_domain()  # ContextVar
analyst_types = domain.get_analyst_types()
weights = domain.get_scoring_weights()
# ...
```

도메인이 바뀌어도 toplogy 변하지 않음. game_ip → 다른 도메인 시 `plugins/<other>/nodes/` 만 새로 만들면 됨.

## State 객체

```python
class PipelineState(TypedDict):
    # 입력
    target: str                  # IP 이름 또는 분석 대상
    mode: str                    # full_pipeline / dry_run / evaluation / scoring
    # 노드별 채널
    signals: SignalPayload
    analyses: list[AnalystOutput]
    evaluations: list[EvaluatorOutput]
    psm_result: PSMResult
    tier: str
    final_score: float
    cause: str
    action: str
    # 메타데이터
    skip_nodes: set[str]
    audit_trail: list[tuple]
```

## 다음

- [[4-layer-stack]] — L1 Graph 레이어
- [[pipeline]] — Game IP 노드 디테일
- [[guardrails-g1-g4]] — verification 노드
