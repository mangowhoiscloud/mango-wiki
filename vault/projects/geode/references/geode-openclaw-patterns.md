---
title: OpenClaw Patterns in GEODE
type: reference
category: frontier-research
tags: [geode, openclaw, patterns, reference]
related:
  - "[[geode-architecture]]"
  - "[[geode-oauth-policy]]"
  - "[[geode-gateway]]"
sources:
  - "openclaw/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# OpenClaw Patterns Adopted by GEODE

Patterns from `/Users/mango/workspace/openclaw` codebase.

| Pattern | OpenClaw Source | GEODE Implementation |
|---------|----------------|---------------------|
| managedBy credential | `auth-profiles/types.ts:44-56` | [[geode-oauth-policy]] |
| Auth profile rotation | `auth-profiles/order.ts:67-208` | `ProfileRotator` (LRU + type priority) |
| Cooldown backoff | `auth-profiles/usage.ts:42-86` | `calculate_cooldown_ms()` (1→5→25→60min) |
| Session key strategy | Gateway session routing | [[geode-gateway]] SessionLane |
| Failure reason priority | `auth > billing > rate_limit` | Generic backoff (partial) |

## Related

- [[blog-harness-frontier]]
- [[index]]
- [[geode]]
- [[geode-session-58-retrospective]]
