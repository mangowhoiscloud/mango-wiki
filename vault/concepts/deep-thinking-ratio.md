---
title: Deep-Thinking Ratio (DTR)
type: concept
category: llm-reasoning
tags: [reasoning, inference, test-time-compute, google, dtr, thinking-tokens]
related:
  - "[[geode-agentic-loop]]"
  - "[[geode-llm-models]]"
  - "[[test-time-compute-scaling]]"
  - "[[overthinking-inverse-scaling]]"
  - "[[tuned-lens]]"
sources:
  - "arXiv:2602.13517"
  - "Google + U. of Virginia, 2026-02"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
summary: "LLM 추론 품질을 토큰 길이가 아닌 레이어별 계산 깊이(deep-thinking tokens 비율)로 측정하는 메트릭. Think@n으로 inference 비용 50% 절감."
---

# Deep-Thinking Ratio (DTR)

> "LLM이 길게 말한다고 잘 생각하는 게 아니다. 깊이 생각하는지를 봐야 한다."

## Core Claim

토큰 수와 정확도는 **음의 상관** (r = -0.594). 반면 DTR (레이어 깊이 기반)은 **양의 상관** (r = 0.683).

## Definition

Transformer 중간 레이어 hidden state를 unembedding matrix로 투영했을 때, **최종 레이어까지 예측 분포가 계속 수정되는 토큰**의 비율.

```
DTR(S) = (1/T) * sum( 1[settling_depth(t) >= ceil(rho * L)] )
```

- 거리 측정: **Jensen-Shannon Divergence (JSD)** — 대칭, 유계 [0,1]
- Settling threshold `g = 0.5`, Depth fraction `rho = 0.85`
- Training-free: unembedding matrix 직접 사용

## Think@n Strategy

1. n개 candidate response 생성 시작
2. **50 토큰 prefix만으로** DTR 측정
3. DTR 상위만 끝까지 생성 → majority voting
4. 결과: 동일 정확도 + **inference 토큰 ~50% 절감**

| Model | Benchmark | Cons@n | Think@n | Savings |
|-------|-----------|--------|---------|---------|
| OSS-120B | AIME 2025 | 92.7% / 307.6k tok | 94.7% / 155.4k tok | -49% |
| Qwen3-30B | AIME 2025 | 86.7% / 1073.1k tok | 90.0% / 537.5k tok | -50% |

## Theoretical Foundation

| Paper | Year | Contribution |
|-------|------|-------------|
| [[tuned-lens]] (Belrose et al.) | 2023 | 레이어별 affine probe → "coarse guess → iterative refinement" |
| DoLa (Chuang et al.) | 2023 | 레이어 대비 디코딩 → factuality +12-17% (TruthfulQA) |
| **DTR** | 2026 | 동일 신호를 추론 노력 측정 + inference routing으로 확장 |

## Reasoning Level Paradox

GPT-OSS에서 reasoning level을 높이면 DTR은 낮아지지만 정확도는 올라감. 계산 노력이 "깊이"에서 "길이"로 재분배된 것. DTR은 **동일 조건 내 상대적 비교** 지표.

## Limitations

- **Closed API 적용 불가**: 중간 레이어 접근 필요 → open-weight 전용
- **도메인 한정**: 수학/과학에서만 검증
- **모델 간 비교 불가**: DTR 절대값은 아키텍처 종속

## GEODE 적용

DTR 교훈을 [[geode-agentic-loop]]에 반영한 구현 (v0.49.0):

- `ResponseUsage.thinking_tokens` — 추론 토큰 별도 추적
- **Adaptive compute** — 라운드별 max_tokens 조정 + [[overthinking-inverse-scaling|overthinking 감지]]
- `ReasoningMetrics` — thinking_ratio, empty_rounds, cost_per_tool_call hook 발행
- `SubGoal.difficulty` — 난이도별 thinking_budget 차등 배분

## Related

- [[deep-thinking-ratio-reasoning-depth]] — DTR 블로그 포스트 요약

## References

- [arXiv:2602.13517](https://arxiv.org/abs/2602.13517)
- [GitHub: Think-Deep-Not-Long Implementation](https://github.com/compchap/Think-Deep-Not-Long)
