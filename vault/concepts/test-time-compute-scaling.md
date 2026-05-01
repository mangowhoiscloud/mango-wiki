---
title: Test-Time Compute Scaling
type: concept
category: llm-reasoning
tags: [reasoning, test-time-compute, scaling, inference, efficiency, self-consistency]
related:
  - "[[deep-thinking-ratio]]"
  - "[[overthinking-inverse-scaling]]"
  - "[[geode-llm-models]]"
sources:
  - "ICLR 2025"
  - "arXiv:2512.02008"
  - "arXiv:2507.02076"
  - "arXiv:2512.19585"
  - "arXiv:2511.12309"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
summary: "추론 시점 compute 배분 전략 생태계. Token budget, self-consistency 효율화, adaptive allocation."
---

# Test-Time Compute Scaling

Inference 시점에 compute를 동적으로 배분하여 추론 성능을 높이는 연구 분야.

## Key Papers

### Foundations
| Paper | Venue | Key Idea |
|-------|-------|----------|
| "Scaling LLM TTC Optimally" | ICLR 2025 | Inference compute scaling > parameter scaling 조건 도출 |
| "The Art of Scaling TTC" | arXiv 2512.02008 | 30B+ 토큰 실험으로 TTS 전략 체계적 비교 |
| "Reasoning on a Budget" (Survey) | arXiv 2507.02076 | Adaptive & controllable TTC 서베이 |

### Efficiency Strategies
| Paper | Key Idea |
|-------|----------|
| "Token-Budget-Aware Reasoning" (ACL 2025) | 난이도별 토큰 예산 → 토큰 67% 절감, 비용 59% 절감 |
| "Plan and Budget" | Sub-question 분해 + 예산 → 정확도 70% 향상, 토큰 39% 절감 |
| "Increasing Budget Not All You Need" | Budget 증가 < self-consistency + reflection 조합 |
| "Optimal Self-Consistency" | Power-law scaling 분석 + Blend-ASC 알고리즘 |

### Reasoning Distillation
| Paper | Key Idea |
|-------|----------|
| "Reasoning Scaffolding" (arXiv 2509.23619) | 추론을 semantic signal로 추상화 → 구조적 distillation |
| "Skip-Thinking" (arXiv 2505.18642) | Chunk 단위 CoT distillation → 소형 모델 가속 |

## Google's Trajectory

외부 스캐폴드 → 모델 내재화 → 적응적 compute 할당:

1. **SELF-DISCOVER** (NeurIPS 2024) — LLM이 자체 추론 구조 생성
2. **Gemini 2.5** (2025) — Thinking Budget 최대 32,768 토큰
3. **[[deep-thinking-ratio]]** (2026) — 깊이 기반 compute routing (Think@n)
4. **Gemini Deep Think** — 동일 모델 + 추론 모드 (별도 모델 X)

## See Also

- [[deep-thinking-ratio]] — DTR: 깊이 > 길이
- [[overthinking-inverse-scaling]] — 길이의 역효과
