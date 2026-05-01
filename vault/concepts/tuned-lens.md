---
title: Tuned Lens
summary: Transformer 중간 레이어 hidden state를 unembedding으로 투영하여 레이어별 예측 변화를 추적하는 해석 도구.
tags: [llm, interpretability, transformer, reasoning]
sources: [arXiv:2303.08112]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.5, inferred: 0.5 }
---

# Tuned Lens

Transformer의 중간 레이어 hidden state를 **unembedding matrix로 투영**하여, 각 레이어에서 모델이 어떤 토큰을 예측하고 있는지 추적하는 해석 도구.

## Core Idea

- 각 레이어 $l$의 hidden state $h_l$을 vocabulary space로 투영
- 레이어 간 예측 분포 변화를 관찰 → "모델이 언제 마음을 바꾸는지" 시각화
- **Deep-thinking token**: 마지막 레이어까지 예측이 계속 수정되는 토큰 ^[inferred]

## GEODE Relevance

[[deep-thinking-ratio]]에서 DTR 메트릭의 기반 도구로 사용. 토큰의 "사고 깊이"를 측정하는 핵심 메커니즘.

## Related

- [[deep-thinking-ratio]] — DTR 메트릭 (Tuned Lens 기반)
- [[overthinking-inverse-scaling]] — 긴 CoT 역 스케일링
- [[test-time-compute-scaling]] — 추론 시점 compute 배분
