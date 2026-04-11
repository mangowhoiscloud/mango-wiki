---
title: Kiki Feedback Loop — Issue Comments → Profile Corrections
type: concept
tags: [kiki, feedback, learning, bidirectional]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Feedback Loop

이슈 코멘트를 분석하여 프로필 보정 시그널을 자동 추출. 양방향 학습.

## Signal Types

| Type | Detection Pattern | Confidence |
|------|------------------|------------|
| Approval | `좋아`, `lgtm`, `approved` | 0.8 |
| Correction | `수정`, `fix`, `틀렸` | 0.85 |
| Elaboration | `더 상세`, `elaborate`, `부족` | 0.75 |
| Rejection | `안됨`, `reject`, `다시 해` | 0.9 |
| Praise | `깔끔`, `clear`, `보기 좋` | 0.7 |

## Profile Adjustment Rules

- 2+ elaboration requests → `communication.brevity`: concise → detailed
- 3+ approvals → confidence += 0.01 per signal (reinforcement)
- 2+ rejections → confidence -= 0.05 per signal (penalty)

## Directive Target Detection

```
"포맷|형식" → report_format
"톤|어투" → communication_tone
"숫자|데이터" → data_requirement
"시간|타이밍" → timing
```

## Related

- [[kiki]]
- [[kiki-profile-pipeline]]
- [[kiki-confidence-scoring]]
- [[geode-bidirectional-learning]]
