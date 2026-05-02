---
title: Cross-LLM Verification
category: verification
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/verification/cross_llm.py:1-80"
  - "core/verification/stats.py"
external_refs:
  - url: "https://en.wikipedia.org/wiki/Krippendorff%27s_alpha"
    pattern: "Inter-rater agreement"
---

# Cross-LLM Verification

같은 분석을 두 모델로 돌려 일관성 비교. 단일 LLM의 idiosyncratic 결정을 걸러내는 안전망.

## 사용 시점

```bash
geode analyze "X" --cross-verify=true
```

또는 `state.cross_verify_enabled = True` 설정 시 verification 노드가 두 번째 모델 호출.

## Agreement Coefficient

`core/verification/cross_llm.py:1-80` — `_calc_agreement(scores_a, scores_b)`:

```python
def _calc_agreement(scores_a: list[float], scores_b: list[float]) -> float:
    """
    1.0 = 완전 일치
    0.0 = 최대 불일치 (1-5 scale에서 중복 없음)
    """
    diffs = [abs(a - b) for a, b in zip(scores_a, scores_b)]
    max_diff = 4.0  # 1-5 scale
    return 1.0 - (sum(diffs) / (len(diffs) * max_diff))
```

## 임계값

```python
DEFAULT_AGREEMENT_THRESHOLD = 0.67  # acceptable
HIGH_AGREEMENT_THRESHOLD = 0.80      # strong agreement
```

| 결과 | 의미 |
|---|---|
| ≥0.80 | 두 모델 강한 일치 — 신뢰도 ↑ |
| 0.67-0.80 | acceptable, 사용 가능 |
| <0.67 | 모델별 reasoning 분기 — final_score 신뢰도 표시 |

## Krippendorff Alpha (옵션)

`core/verification/stats.py` 에 Krippendorff Alpha 구현. 같은 분석을 N≥3 모델로 돌릴 때 사용.

## 모델 선정

| Primary | Secondary 후보 |
|---|---|
| Anthropic Claude | OpenAI gpt-5 / gpt-5.5 |
| OpenAI Codex | Anthropic Claude / GLM |
| GLM | OpenAI Codex |

`_derive_model_names(primary)` 가 자동 선정 — 같은 family 모델은 secondary 후보에서 제외.

## 비용

cross-verify 활성화 시 LLM 호출 ≈ 2배. 개발 / calibration / high-stakes 분석에서만 권장.

## 결과 통합

```python
@dataclass
class CrossLLMResult:
    primary_scores: dict[str, float]
    secondary_scores: dict[str, float]
    agreement: float
    flagged_axes: list[str]   # disagreement >= threshold
```

`flagged_axes` 가 비어있지 않으면 final_score에 신뢰도 페널티 적용 (또는 사용자 노출).

## Quick Activation

같은 IP를 두 LLM으로 분석해 일관성 비교. 신뢰도 표시 + flagged_axes 식별.

```bash
# 1. 단발 — flag 추가
geode analyze "Cowboy Bebop" --cross-verify

# 2. 영구 활성화 — config.toml
[verification]
cross_verify_enabled = true
agreement_threshold = 0.67
```

Primary 모델은 active 모델, secondary는 자동 선정 (다른 family — Claude면 Codex, Codex면 Claude). 비용은 ~2배 늘어남.

결과 해석:
- agreement ≥ 0.80 — 강한 일치, 신뢰
- 0.67 ~ 0.80 — acceptable
- < 0.67 — disagreement axes 사용자 노출, final_score 신뢰도 페널티

high-stakes 분석 (의사결정용 IP 평가) 또는 calibration 사이클에서 권장.

## 다음

- [[guardrails-g1-g4]] — verification 게이트 G4 와 연계
- [[biasbuster]] — bias 검출
