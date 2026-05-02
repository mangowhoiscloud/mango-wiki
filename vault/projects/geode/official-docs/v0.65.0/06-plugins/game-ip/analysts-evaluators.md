---
title: Analysts & Evaluators
category: plugins-game-ip
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "plugins/game_ip/nodes/"
  - "plugins/game_ip/config/evaluator_axes.yaml"
external_refs:
---

# Analysts & Evaluators

Game IP 도메인의 7개 LLM 호출 노드 — 4 analysts + 3 evaluators.

## 4 Analysts

각 analyst는 14축 중 일부에 집중. 모두 1-5 점수 + reasoning + evidence 산출.

### game_mechanics

| 축 | 평가 |
|---|---|
| `gameplay_depth` | 메커니즘 깊이 |
| `combat_system` | 전투 시스템 완성도 |
| `progression_loop` | 진행 루프 |
| `replayability` | 재플레이 가치 |

### player_experience

| 축 | 평가 |
|---|---|
| `narrative_quality` | 스토리 품질 |
| `immersion` | 몰입도 |
| `accessibility` | 접근성 (난이도, UI) |

### growth_potential

| 축 | 평가 |
|---|---|
| `market_size` | 잠재 시장 |
| `genre_fit` | 장르 적합성 |
| `cycle_alignment` | 시장 사이클 |

### discovery

| 축 | 평가 |
|---|---|
| `awareness` | 인지도 |
| `discoverability` | 발견 가능성 |
| `marketing_visibility` | 마케팅 노출 |
| `social_signal` | 소셜 신호 (Reddit, YouTube) |

## 3 Evaluators

각 evaluator는 analysts 결과 + signals를 종합 → composite score [0,100].

### quality_judge

게임 자체 품질. axes: gameplay_depth, combat_system, narrative_quality, immersion, replayability.

```
composite_quality = weighted_avg(axis_scores) × confidence_multiplier
```

### hidden_value

IP 파워 vs 현재 노출 mismatch. axes: market_size, genre_fit, cycle_alignment, awareness.

저평가일수록 hidden_value ↑.

### community_momentum

팬덤 성장세. axes: discoverability, marketing_visibility, social_signal + signal data (YouTube +YoY, Reddit +YoY).

## Confidence Multiplier

```python
def confidence_multiplier(scores: list[float], confidences: list[float]) -> float:
    """낮은 confidence → 점수 보수적으로 줄임."""
    avg_conf = mean(confidences)
    if avg_conf < 0.5:
        return 0.5  # 절반으로
    if avg_conf < 0.7:
        return 0.7
    return 1.0
```

confidence threshold (`organization.get_common_rubric()` → 0.7) 미달 시 점수 신뢰성 저하 표시.

## YAML SOT

`plugins/game_ip/config/evaluator_axes.yaml` 가 14축 + evaluator-axis 매핑 + scoring weights SOT. 파일 변경 시 `AXES_VERSIONS` 해시 갱신 필수 ([[prompt-hashing]]).

## Prompts

`plugins/game_ip/prompts/`:

```
analyst_game_mechanics.md
analyst_player_experience.md
analyst_growth_potential.md
analyst_discovery.md
evaluator_quality_judge.md
evaluator_hidden_value.md
evaluator_community_momentum.md
```

각 파일: `=== SYSTEM === / === USER ===` 형식.

## 다음

- [[pipeline]] — graph 토폴로지
- [[psm-scoring]] — PSM
- [[guardrails-g1-g4]] — 검증
