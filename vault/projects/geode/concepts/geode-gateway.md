---
title: GEODE Gateway
type: concept
category: infrastructure
tags: [geode, gateway, slack, ipc, thin-cli, serve]
related:
  - "[[geode-architecture]]"
  - "[[geode-tool-system]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Gateway

Thin-Only Architecture: `geode` CLI → Unix socket IPC → `geode serve` daemon.

## Pollers

| Poller | Mode | HITL | Time Budget |
|--------|------|------|-------------|
| CLIPoller | IPC | 0 (WRITE allowed, DANGEROUS blocked) | unlimited |
| Gateway (Slack/Discord) | DAEMON | 0 | 300s |
| Scheduler | SCHEDULER | 0 | 300s |

## SessionLane

Same session key → serial. Different keys → parallel. Max 256 sessions.

## Related

- [[geode-architecture]]
- [[geode-tool-system]]
- [[portfolio-geode]]
- [[blog-orchestration]]
- [[geode]]
- [[blog-technical]]
- [[geode-openclaw-patterns]]
- [[index]]
