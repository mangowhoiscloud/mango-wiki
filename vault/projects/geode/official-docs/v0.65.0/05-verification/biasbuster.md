---
title: BiasBuster
category: verification
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/verification/biasbuster.py:24-100"
external_refs:
---

# BiasBuster (6 bias detection)

LLM 분석 결과의 6가지 편향을 통계 + LLM 폴백으로 검출하는 4-step 파이프라인 — RECOGNIZE → EXPLAIN → ALTER → EVALUATE.

## 6 편향

| Bias | 검출 방법 |
|---|---|
| **confirmation_bias** | 같은 evidence를 여러 분석가가 반복 인용 (>= 2회) |
| **recency_bias** | 최근 데이터에 과도하게 의존 (날짜 분포의 skewness) |
| **anchoring_bias** | 분석가들이 너무 비슷한 점수 (CV < 0.05) |
| **position_bias** | 첫 번째 / 마지막 분석가 점수가 극단 |
| **verbosity_bias** | reasoning 길이와 점수 상관 |
| **self_enhancement_bias** | LLM이 자기 reasoning을 과대 평가 |

## Fast path (statistical)

대부분의 케이스는 LLM 호출 없이 통계로 판정 — `core/verification/biasbuster.py:24-100`:

```python
def run_biasbuster(scores, reasoning, dry_run=False):
    # Anchoring: CV (coefficient of variation)
    cv = std(scores) / max(mean(scores), 1)
    if cv < 0.05:
        flags.append(("anchoring_bias", cv))
    elif cv >= 0.10:
        # 충분히 흩어짐 — clean 판정, LLM 호출 skip
        return BiasBusterResult(clean=True, ...)

    # Confirmation: evidence repetition
    evidence_counts = Counter(extract_evidence(reasoning))
    if any(c >= 2 for c in evidence_counts.values()):
        flags.append(("confirmation_bias", ...))

    # Recency, position, verbosity, self-enhancement: similar checks
    ...

    if not flags:
        return BiasBusterResult(clean=True, ...)
    return BiasBusterResult(flags=flags, ...)
```

## LLM fallback

통계 만으로 판정 곤란하면 LLM에 cross-check 위임 (dry_run=False 일 때만):

```
Q. "Below are 4 analyst scores. Are any of these biased?
    Scores: [4.2, 4.1, 4.3, 4.2]
    Evidence: ..."
```

`dry_run=True` (e2e dry-run) 시 LLM 호출 skip — fast path 결과만 반환.

## 결과 객체

```python
@dataclass
class BiasBusterResult:
    clean: bool
    flags: list[tuple[str, Any]]   # (bias_name, evidence)
    confidence: float              # 0.0 (uncertain) ~ 1.0 (high confidence)
    llm_consulted: bool
```

`flags` 가 비어있으면 clean. 각 flag는 다음 단계 (synthesizer) 가 reasoning에 반영.

## 호출 처

`core/graph.py` 의 verification 노드. Guardrails G1-G4 통과 후 BiasBuster.

```
... → Guardrails G1-G4 (PASS) → BiasBuster → Cross-LLM (옵션) → synthesizer
                       │
                       └─ FAIL → skip synthesizer
```

## 다음

- [[guardrails-g1-g4]] — G1-G4 검증
- [[cross-llm]] — Cross-LLM 일관성
- [[decision-tree]] — Cause Classification
