---
title: Kiki Decision Log
type: reference
tags: [kiki, decisions, architecture]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-01 | External scaffold (badboss pattern) | Separate sensitive profiles from public code |
| 2026-04-01 | Claude Code as Profiler | Zero infra, existing memory system |
| 2026-04-01 | TypeScript + Paperclip stack | Native plugin SDK compatibility |
| 2026-04-01 | File-based profiles (not PG) | MVP speed, PG migration later |
| 2026-04-01 | Hybrid: Company Skills + Instructions | Skills for team, Instructions for per-agent |
| 2026-04-03 | English-only system prompts | Consistency + pre-commit enforcement |
| 2026-04-07 | Karpathy LLM Wiki adoption | Delta tracking, observation log, Obsidian export |
| 2026-04-07 | Engineering team v2 (Lead != implementor) | Strict scope/review separation |
| 2026-04-07 | CEO preserved as org root | Stable root for Kiki reporting |
| 2026-04-08 | Native WebSocket (no Slack SDK) | Reduce bundle size, control reconnection |
| 2026-04-09 | Scorecard threshold 30/30 → 24/30 | Strict threshold blocked all progress |
| 2026-04-10 | Dashboard v0.3.0 Jira-style kanban | Team visibility into pipeline state |

## Related

- [[kiki]]
- [[kiki-project-progress]]
