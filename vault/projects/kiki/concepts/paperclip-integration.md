---
title: Paperclip Integration
type: concept
tags: [paperclip, kiki, architecture]
sources:
  - raw/kiki-docs/progress.md
related:
  - "[[kiki-project-progress]]"
  - "[[engineering-team]]"
  - "[[finance-team]]"
created: 2026-04-07
updated: 2026-04-07
---

# Paperclip Integration

How Kiki connects to the Paperclip agent orchestration platform.

## Architecture

Kiki runs as a Paperclip plugin (`kiki.profile-injector`) that:
- Listens for `agent.created` events → injects profile directives
- Runs `refresh-profiles` job → periodic Slack signal collection
- Registers tools: `kiki-get-profile`, `kiki-update-profile`
- Syncs profiles to Company Skills via `ctx.http.fetch()`

## Two-Layer Injection

1. **Company Skill** (team-wide) — shared behavioral patterns
2. **Instructions Bundle** (per-agent) — personalized directives based on observed Slack behavior

## Authentication

`PAPERCLIP_API_KEY` is auto-injected by Paperclip runtime (short-lived JWT per heartbeat).

## Related

- [[kiki-project-progress]]
- [[engineering-team]]
- [[finance-team]]
- [[kiki]]
- [[mango]]
- [[index]]
