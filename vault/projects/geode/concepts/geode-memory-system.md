---
title: GEODE Memory System
type: concept
category: memory
tags: [geode, memory, 5-tier, context, learning, vault]
related:
  - "[[geode-architecture]]"
  - "[[geode-bidirectional-learning]]"
  - "[[geode-vault]]"
  - "[[mango]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Memory System

5-Tier Context Hierarchy assembled into every LLM call.

```
Tier 0    GEODE.md         — agent identity + constraints
Tier 0.5  User Profile     — role, expertise, learned patterns
Tier 1    Organization     — cross-project data
Tier 2    Project          — .geode/memory/PROJECT.md (50 insights, LRU)
Tier 3    Session          — in-memory conversation
```

Lower tiers override higher. Budget: SOUL 10% | Org 25% | Project 25% | Session 40%.

## Learning (G3 Slot)

[[geode-bidirectional-learning]] records both corrections AND validations.
UserProfile `learned.md` is the single source — injected via system_prompt G3.

## Vault

[[geode-vault]] stores agent-produced artifacts (reports, research, applications).
Auto-classified by `classify_artifact()` into profile/research/applications/general.

## Related

- [[blog-memory-context]]
- [[portfolio-geode]]
- [[index]]
- [[geode]]

## Open Questions

- When does RAG become necessary vs. 200-line PROJECT.md?
- Should vault artifacts be auto-indexed for semantic search?
