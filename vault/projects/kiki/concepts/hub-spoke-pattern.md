---
title: Hub-Spoke Pattern
type: concept
tags: [architecture, agent-design, token-optimization]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[engineering-team]]"
  - "[[finance-team]]"
created: 2026-04-07
updated: 2026-04-07
---

# Hub-Spoke Pattern

An agent coordination pattern where a central coordinator (hub) delegates work to independent specialists (spokes).

## How It Works

- Hub agent wakes on events, triages, assigns to the right spoke
- Spoke agents only wake when assigned work — zero idle cost
- Each spoke has a narrow context (only their domain's codebase-map)
- Hub has a broad but shallow context (product map, no code)

## Used By

- [[engineering-team]] — CTO as hub, Lead Engineers + Specialists as spokes
- [[finance-team]] — CFO as hub, Analyst + Accountant as spokes
- ClawTeam Capital (Paperclip template) — Portfolio Manager as hub, 6 Analysts as spokes

## Token Benefits

Compared to flat structure (all agents wake on all events):
- ~55-60% token reduction
- Hub: ~5K/event, Spokes: only activated when needed

## Related

- [[kiki]]
- [[app-specialist]]
- [[lead-engineer-a]]
- [[cto-agent]]
- [[lead-engineer-b]]
- [[release-engineer]]
- [[index]]
