---
title: Guardrails G1-G4
category: verification
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/verification/guardrails.py:13-80"
external_refs:
---

# Guardrails G1-G4

`core/verification/guardrails.py` 의 4단계 자동 검증. 파이프라인 출력을 G1→G4 순으로 검사하고, 어느 게이트라도 fail이면 다운스트림(synthesizer/scoring) 차단.

## G1 — Schema (`guardrails.py:13`)

| 검사 | 통과 조건 |
|---|---|
| 필수 필드 존재 | `analyses`, `evaluations`, `psm_result`, `tier`, `final_score` 모두 dict/list 타입 |
| 타입 일치 | 각 필드가 약속된 타입 (e.g. `analyses: list[AnalystOutput]`) |
| 빈 컬렉션 거부 | analyses 4개 미만, evaluations 3개 미만이면 fail |

위반 사례 로그 형식:
```
G1.SCHEMA fail: missing field=psm_result
G1.SCHEMA fail: analyses count=2 (expected 4)
```

## G2 — Range (`guardrails.py:47`)

수치 범위 강제. 도메인의 rubric 기반.

| 항목 | 허용 범위 |
|---|---|
| analyst score | [1, 5] (정수) |
| analyst confidence | [0.0, 1.0] |
| evaluator composite | [0, 100] |
| 14축 axis score | [1, 5] |
| psm_result.att | (제한 없음, 보통 -50% ~ +100%) |
| psm_result.z_value | (제한 없음, 의미: ≥1.645 = 95% sig) |
| psm_result.gamma | [1.0, ∞), 보통 ≤2.0 |
| final_score | [0, 100] |

위반: out-of-range 즉시 fail. 클램핑 안 함 (silent corruption 방지).

## G3 — Grounding (`guardrails.py:60`)

evidence가 *signal 데이터*에 기반했는지 검사. analyst의 reasoning 텍스트와 evidence 필드를 signal_payload와 키워드 + 수치값 매칭.

```python
def _check_evidence_grounding(reasoning, evidence, signals):
    """reasoning에 등장하는 수치/명사가 signals에 존재하는지."""
    for token in extract_numerics(reasoning):
        if not _appears_in(token, signals):
            return False, f"ungrounded numeric: {token}"
    return True, ""
```

대표 패턴:
- analyst가 "YouTube 12M views" 라고 했는데 signals에 youtube_views=12_000_000 없으면 fail
- "Reddit 180K subscribers" → signals.reddit_subscribers 매칭

LLM이 환각으로 만들어낸 숫자를 차단하는 것이 G3의 본질.

## G4 — Consistency

다중 analyst/evaluator 결과 간 모순 검사. 예:
- discovery_axis가 4.5인데 community_momentum이 1.2 → 부조리
- analyst들의 final_inference 와 evaluator's composite tier mismatch

(구현 위치 — 함수명 / 라인은 v0.66.0 docs 재검증에서 확인)

## 결과 객체

```python
@dataclass
class GuardrailResult:
    g1_pass: bool
    g2_pass: bool
    g3_pass: bool
    g4_pass: bool
    failures: list[GuardrailFailure]   # 어느 게이트, 어느 항목, 어떤 위반

    @property
    def all_pass(self) -> bool:
        return all([self.g1_pass, self.g2_pass, self.g3_pass, self.g4_pass])
```

## 파이프라인 통합

`core/graph.py` 의 verification 노드에서 호출:

```
analysts → evaluators → scoring → verification
                                       │
                                       ├─ Guardrails G1-G4
                                       ├─ BiasBuster
                                       └─ Cross-LLM (옵션)
                                       ▼
                                  synthesizer
```

`verification` 노드가 fail 결정하면 `state.skip_nodes.add("synthesizer")` 후 graph가 동적 skip → 파이프라인이 명시적 실패 보고 후 종료.

## 다음

- [[biasbuster]] — 6 bias 검출
- [[cross-llm]] — Cross-LLM 일관성
- [[decision-tree]] — Cause Classification
