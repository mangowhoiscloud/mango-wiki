---
title: GEODE Quality Evaluation (5-Layer)
category: concepts
tags: [geode, verification, guardrails, bias, cross-llm, confidence]
sources:
  - "raw/geode-docs/GEODE.md"
created: 2026-04-07T07:59:58Z
updated: 2026-04-07T07:59:58Z
---

# GEODE Quality Evaluation (5-Layer)

Game IP [[geode-domain-plugin]] pipeline verification.

## Layers

| Layer | Name | Function |
|-------|------|----------|
| 1 | **Guardrails G1-G4** | Schema, Range, Grounding, 2σ Consistency |
| 2 | **BiasBuster** | 6 bias types (CV < 0.05 → anchoring flag) |
| 3 | **Cross-LLM** | Agreement ≥ 0.67, Krippendorff's α |
| 4 | **Confidence Gate** | ≥ 0.7 → proceed, else loopback (max 5 iter) |
| 5 | **Rights Risk** | CLEAR/NEGOTIABLE/RESTRICTED/EXPIRED/UNKNOWN |

## Scoring Formula

```
Final = (0.25×PSM + 0.20×Quality + 0.18×Recovery + 0.12×Growth + 0.20×Momentum + 0.05×Dev)
        × (0.7 + 0.3 × Confidence/100)

Tier: S≥80, A≥60, B≥40, C<40
```

## Fixture Results

| IP | Tier | Score | Cause |
|----|------|-------|-------|
| Berserk | S | 81.2 | conversion_failure |
| Cowboy Bebop | A | 68.4 | undermarketed |
| Ghost in the Shell | B | 51.7 | discovery_failure |

## Related

- [[geode-domain-plugin]] — Pipeline structure
- [[geode-architecture]] — Verification layer
- [[index]]
- [[geode]]
