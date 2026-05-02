---
title: Cause Classification Decision Tree
category: verification
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "plugins/game_ip/nodes/synthesizer.py:82-126"
  - "plugins/game_ip/config/cause_actions.yaml"
external_refs:
---

# Cause Classification Decision Tree

Synthesizer 노드에서 evaluator 점수를 받아 6 causes 중 하나로 분류. 각 cause는 5 actions 중 하나로 매핑.

## 6 Causes

`plugins/game_ip/config/cause_actions.yaml`:

| Cause | 의미 |
|---|---|
| `timing_mismatch` | IP 자체는 강하나 타이밍이 맞지 않음 (사이클 어긋남) |
| `undermarketed` | IP 파워 대비 마케팅/노출 절대 부족 |
| `conversion_failure` | 마케팅 잘 됐으나 전환율 낮음 |
| `discovery_failure` | 사용자 자체가 IP를 모르고 있음 |
| `saturation` | 시장 포화 (경쟁 IP 너무 많음) |
| `demographic_misfit` | 타겟층 미스매치 |

## 5 Actions

| Action | 의미 |
|---|---|
| `Marketing Boost` | 마케팅 예산 증액 |
| `Repositioning` | 포지셔닝 재설계 |
| `Niche Targeting` | 특정 세그먼트 집중 |
| `Wait for Cycle` | 사이클 도래 대기 |
| `Sunset` | 정리 |

## Cause → Action 매핑

```yaml
cause_to_action:
  timing_mismatch: Wait for Cycle
  undermarketed: Marketing Boost
  conversion_failure: Repositioning
  discovery_failure: Marketing Boost
  saturation: Niche Targeting
  demographic_misfit: Repositioning
```

## Decision Tree (`synthesizer.py:82-126`)

D, E, F 점수 기반 6-way 분류:

| 변수 | 의미 |
|---|---|
| D | discovery axis 평균 (1-5) |
| E | exposure axis 평균 (1-5) |
| F | conversion / fit axis 평균 (1-5) |

```python
def _classify_cause(D, E, F, timing_signal, demographic_signal):
    if D >= 3 and timing_signal:
        return "timing_mismatch"
    if D >= 3 and E < 3:
        return "undermarketed"
    if D >= 3 and E >= 3 and F < 3:
        return "conversion_failure"
    if D <= 2 and E <= 2 and F <= 2:
        return "discovery_failure"
    if demographic_signal:
        return "demographic_misfit"
    return "saturation"  # default fallback
```

## v0.65.0 dry-run 결과 (Cowboy Bebop)

```
D = 3.8 (discovery)
E = 2.5 (exposure)
F = 4.2 (conversion)
timing_signal = False
→ classified as "undermarketed"
→ action = "Marketing Boost"
```

## Domain Override

`plugins/<other_domain>/config/cause_actions.yaml` 에서 6 causes / 5 actions 자유 정의 가능. 예: 학술 논문 도메인은 cause = (`weak_methodology`, `narrow_audience`, ...) 같은 자체 분류.

`DomainPort` 의 `get_cause_to_action()`, `get_cause_descriptions()`, `get_action_descriptions()` 가 이 YAML을 노출.

## 검증

`tests/test_synthesizer.py` 가 D/E/F 조합 매트릭스 전체 케이스 테스트. v0.65.0에서 변경 없음.

## 다음

- [[guardrails-g1-g4]] — verification 게이트
- [[biasbuster]] — 편향 검출
- [[psm-scoring]] — final_score 계산
