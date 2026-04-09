---
title: GEODE Architecture
type: concept
category: system-architecture
tags: [geode, architecture, 4-layer, langgraph, agent]
related:
  - "[[geode-agentic-loop]]"
  - "[[geode-tool-system]]"
  - "[[geode-memory-system]]"
  - "[[geode-gateway]]"
  - "[[geode-domain-plugin]]"
  - "[[mango]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Architecture

4-Layer Stack (Model → Runtime → Harness → Agent) + orthogonal Domain.

```
AGENT:    AgenticLoop, SubAgentManager, CLIPoller, Gateway
HARNESS:  SessionLane, LaneQueue(global:8), PolicyChain, TaskGraph, HookSystem(49)
RUNTIME:  ToolRegistry(56), MCP(16), Skills, Memory(4-Tier), Reports
MODEL:    ClaudeAdapter, OpenAIAdapter, GLMAdapter (3-provider fallback)
─────────────────────────────────────────────────────────────────
⊥ DOMAIN: DomainPort Protocol, GameIPDomain (cross-cutting)
```

## Key Design Decisions

- **Sub-Agent Inheritance**: Children inherit all parent tools/MCP/skills/memory
- **Token Guard**: Mandatory preservation of `summary` field in SubAgentResult
- **Domain Plugin**: Pipelines swappable via [[geode-domain-plugin]] implementations
- **Send API Clean Context**: Analysts receive state WITHOUT `analyses` to prevent anchoring

## Gateway Runtime

All execution routes through [[geode-gateway]]:

```
geode (thin CLI) → Unix socket IPC → geode serve (unified daemon)
                                        ├── CLIPoller   → SessionMode.IPC
                                        ├── Gateway     → SessionMode.DAEMON
                                        └── Scheduler   → SessionMode.SCHEDULER
```

See also [[geode-llm-models]], [[geode-tool-routing]], [[geode-quality-evaluation]].

Built by [[mango]] as a general-purpose autonomous execution agent.

## Related

- [[nexon-ai-live]]
- [[blog-architecture]]
- [[blog-narrative]]
- [[blog-logs]]
- [[geode-oauth-policy]]
- [[blog-release]]
- [[geode-computer-use]]
- [[geode-bidirectional-learning]]
- [[geode-vault]]
- [[resume-targets]]
- [[blog-legacy]]
- [[portfolio-geode]]
- [[blog-technical]]
- [[blog-orchestration]]
- [[geode-claude-code-patterns]]
- [[blog-harness-frontier]]
- [[geode]]
- [[blog-reode]]
- [[blog-research]]
- [[geode-openclaw-patterns]]
- [[index]]

## Hook System

The Harness layer includes a 49-event [[geode-hook-production-gap|HookSystem]] using a priority-based synchronous observer pattern. For a detailed comparison with Claude Code's interceptor-based hook system, see [[hook-claude-code-comparison]]. Key production gaps include missing tool execution hooks (PreToolUse/PostToolUse), no interceptor pattern, and no hook timeout.

## Open Questions

- How should the 4-layer stack evolve for multi-agent orchestration?
- Is the current hook count (49) sustainable, or should events be grouped?
- [[2026-04-07]]
- [[blog-hub]]
- [[career-hub]]
- [[geode-session-58-retrospective]]
