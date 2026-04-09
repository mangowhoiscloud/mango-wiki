---
title: GEODE Domain Plugin
type: concept
category: extensibility
tags: [geode, domain, plugin, game-ip, pipeline, langgraph]
related:
  - "[[geode-architecture]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Domain Plugin

Swap analysis pipelines via `DomainPort` Protocol. Game IP is a plugin.

## Pipeline (Game IP)

```
START → router → signals → analyst×4 (Send API)
     → evaluator×3 → scoring → verification
     → [confidence ≥ 0.7?] → synthesizer → END
                            → gather (loopback, max 5 iter)
```

## Scoring Formula

```
Final = (0.25×PSM + 0.20×Quality + 0.18×Recovery + 0.12×Growth + 0.20×Momentum + 0.05×Dev)
        × (0.7 + 0.3 × Confidence/100)
```

Tier: S≥80, A≥60, B≥40, C<40.

Verification: [[geode-quality-evaluation]] — 5-Layer quality gate.

## Related

- [[portfolio-geode]]
- [[nexon-ai-live]]
- [[index]]
- [[geode]]
