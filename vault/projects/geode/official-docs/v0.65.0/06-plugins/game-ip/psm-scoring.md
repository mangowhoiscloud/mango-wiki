---
title: PSM Scoring
category: plugins-game-ip
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "plugins/game_ip/nodes/scoring.py:1-100"
  - "plugins/game_ip/scoring_constants.py:1-70"
external_refs:
  - url: "https://en.wikipedia.org/wiki/Propensity_score_matching"
    pattern: "Rosenbaum & Rubin 1983"
---

# PSM Scoring

Propensity Score Matching — 통계 기반 인과 추론으로 IP의 *마케팅 boost 시 lift* 추정.

## 핵심 메트릭 3종

| 메트릭 | 의미 | 임계값 |
|---|---|---|
| **ATT** | Average Treatment Effect on the Treated | (제한 없음) |
| **Z-value** | Welch's t-statistic | ≥1.645 = 95% sig |
| **Γ (Gamma)** | Rosenbaum sensitivity | ≤2.0 = causal robustness |

## 계산 흐름 (`scoring.py:1-100`)

### 1. Logistic propensity

```python
def _logistic_propensity(features: list[dict]) -> list[float]:
    """각 IP의 'treatment 받을 확률' 추정."""
    # logistic regression: P(treatment) = σ(β·features)
    return propensities
```

features = (genre, market_size, cycle_alignment, ...)

### 2. NN match with caliper

```python
def _nn_match_with_caliper(treated, control, caliper=0.2) -> list[tuple]:
    """
    treated의 각 IP에 대해 control 중 가장 가까운 propensity를 매칭.
    caliper 이내만 받아들임 (그 이상이면 unmatched).
    """
    matched_pairs = ...
    return matched_pairs
```

### 3. ATT 계산

```python
att = mean([y_treated[i] - y_control[matched[i]] for i in range(N)])
```

### 4. Z + Γ

`core/verification/stats.py` 의 통계 함수.

## Tier 임계값 (`scoring_constants.py`)

```python
TIER_THRESHOLDS = {
    "S": 80.0,
    "A": 60.0,
    "B": 40.0,
    # C는 40 미만
}

DEFAULT_WEIGHTS = {
    "exposure_lift": 0.25,    # PSM ATT가 양수일수록 ↑
    "quality": 0.20,           # quality_judge composite
    "recovery": 0.18,           # 회복 가능성
    "growth": 0.12,             # growth_potential
    "momentum": 0.20,           # community_momentum
    "developer": 0.05,          # 개발자 역량
}
```

## final_score 계산

```python
final_score = sum(weight * subscore for weight, subscore in zip(DEFAULT_WEIGHTS.values(), subscores))
final_score = clamp(final_score, 0, 100)
tier = next(t for t, threshold in TIER_THRESHOLDS.items() if final_score >= threshold)
```

## 6 Subscore 산출 룰

| Subscore | 산출 |
|---|---|
| `exposure_lift` | PSM ATT 정규화 (0-100) |
| `quality` | quality_judge composite 직접 |
| `recovery` | hidden_value × cycle_alignment factor |
| `growth` | growth_potential composite |
| `momentum` | community_momentum composite |
| `developer` | (옵션) developer track record signal |

## v0.65.0 dry-run (Cowboy Bebop)

```
PSM:
  ATT = +31.2%      # 마케팅 boost 시 31% lift 추정
  Z = 2.67          # ✓ >1.645 (95% sig)
  Γ = 1.8           # ✓ ≤2.0 (causal robust)

Subscores:
  exposure_lift = 18.0 (weight 0.25 → 4.5)
  quality = 72 (× 0.20 → 14.4)
  ... (계산)

Final score = 68.4 → Tier A
```

## 프로젝트 override

`.geode/scoring_weights.yaml` 가 plugin default를 override. 사용자가 도메인별 weight 조정 가능 — 예: developer weight를 0.05 → 0.10 으로 (developer track record 더 중시).

## 다음

- [[pipeline]] — 전체 graph
- [[analysts-evaluators]] — 4+3 노드
- [[decision-tree]] — cause classification
