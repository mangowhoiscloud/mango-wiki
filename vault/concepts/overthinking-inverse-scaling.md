---
title: Overthinking & Inverse Scaling in LLM Reasoning
type: concept
category: llm-reasoning
tags: [reasoning, overthinking, inverse-scaling, test-time-compute, efficiency]
related:
  - "[[deep-thinking-ratio]]"
  - "[[test-time-compute-scaling]]"
  - "[[geode-agentic-loop]]"
sources:
  - "arXiv:2505.17813"
  - "arXiv:2502.07266"
  - "arXiv:2505.00127"
  - "arXiv:2508.17627"
  - "arXiv:2506.08343"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
summary: "LLM이 길게 추론할수록 성능이 하락하는 역 스케일링 현상. 5편의 2025 논문이 독립적으로 입증."
---

# Overthinking & Inverse Scaling

2025년 후반 독립적으로 발표된 5편의 논문이 동일한 현상을 보고: **긴 CoT가 성능을 적극적으로 해침**.

## Key Papers

| Paper | arXiv | Key Finding |
|-------|-------|-------------|
| "Don't Overthink It" | 2505.17813 | 짧은 chain이 긴 것보다 **최대 34.5% 더 정확** |
| "When More is Less" | 2502.07266 | CoT 길이-정확도는 **역 U자 커브**. 능력 높은 모델일수록 짧은 CoT 선호 |
| "Between Under/Overthinking" | 2505.00127 | 쉬운 문제에서 overthink, 어려운 문제에서 underthink — 양방향 비효율 |
| "Evolution of Thought" (RCPD) | 2508.17627 | Reasoning Completion Point 이후 computation은 무의미. **44% 토큰 절감** |
| "NoWait" | 2506.08343 | "Wait", "Hmm" 토큰 억제 → CoT **27-51% 단축**, 성능 유지 (EMNLP 2025) |

## Paradigm Shift

**Before** (2024~2025 초): "추론 성능 = 더 긴 CoT + 더 큰 모델 + 더 많은 samples"

**After** (2025 후반~2026): "추론 성능 = 깊이 > 길이. 불필요한 토큰 제거. 적응적 compute 할당."

## GEODE 적용

[[geode-agentic-loop]]에 overthinking 감지 구현:
- 연속 2+ 라운드에서 tool call 없이 긴 텍스트만 생성 → 경고 + max_tokens/thinking_budget 축소
- `ReasoningMetrics.empty_rounds` — 비행동 라운드 추적
- `ReasoningMetrics.overthinking_detected` — boolean 플래그

## See Also

- [[deep-thinking-ratio]] — DTR 메트릭으로 "깊이" 정량화
- [[test-time-compute-scaling]] — TTC 효율화 연구 생태계
