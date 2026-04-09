---
title: GEODE Tool Routing
category: concepts
tags: [geode, tool-routing, agentic-loop, definitions-json]
sources:
  - "raw/geode-docs/GEODE.md"
created: 2026-04-07T07:59:58Z
updated: 2026-04-07T07:59:58Z
---

# GEODE Tool Routing

All free-text input goes directly to [[geode-agentic-loop]]. Claude sees all 56 tool definitions and autonomously selects via tool_use.

## Routing

- `/command` → commands.py slash command dispatch
- Free text → AgenticLoop.run() (while tool_use loop)

## Tool Definitions

Centrally managed in `core/tools/definitions.json` (56 tools).

## Permission Levels

| Level | Scope | Examples |
|-------|-------|---------|
| STANDARD | Read/analysis — sub-agent auto_approve eligible | memory_search, web_search |
| WRITE | State-changing — approval required | memory_save, profile_update |
| DANGEROUS | System access — always HITL | run_bash, computer |

See [[geode-tool-system]] for full safety tier details.
See [[geode-sandbox-breadcrumb]] for path error prevention.

## Related

- [[geode-architecture]]
- [[index]]
- [[geode]]
