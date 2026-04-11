---
title: Kiki Confidence Scoring — Temporal Decay + 5 Context Modes
type: concept
tags: [kiki, confidence, temporal, profiling]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Confidence Scoring

프로필 신뢰도를 0.0~0.95 범위에서 관리. 새 관측이 기존 패턴을 확인하면 상승, 관측 없으면 감소.

## Scoring Rules

| Event | Effect |
|-------|--------|
| Signal matches existing pattern | confidence += 0.05 (cap 0.95) |
| Signal contradicts | Flag both, keep higher-evidence |
| No new evidence (per cycle) | confidence -= 0.02 (decay) |
| Below 0.3 threshold | Archive profile |

## 5 Temporal Context Modes

| Mode | Trigger | Behavior Change |
|------|---------|-----------------|
| `normal_period` | Default | Regular work rhythm |
| `close_period` | Month-end/quarter-end | Compressed messages, early start |
| `crisis` | Incident response | Rapid decisions, minimal reporting |
| `audit` | Regulatory/external | Formal documentation |
| `planning` | Strategic planning | Longer messages, consensus-heavy |

## Example: CFO Close Period

```
Normal: 140-160 chars, 09:00 start
Close period: 42 chars average (74% compression), 07:05 start (80min early)
Post-close: 148 chars (normal recovery)
```

## Related

- [[kiki-profile-pipeline]]
- [[kiki]]
- [[finance-team]]
