---
title: GEODE Agentic Loop
type: concept
category: core-engine
tags: [geode, agentic-loop, while-tool-use, claude-code-pattern]
related:
  - "[[geode-architecture]]"
  - "[[geode-tool-system]]"
  - "[[geode-computer-use]]"
  - "[[geode-context-guard]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Agentic Loop

Core primitive: `while(tool_use)` loop. Claude Code, Codex, OpenClaw — all frontier harnesses stand on this primitive.

## Flow

```
User input → LLM call → tool_use? → execute tool → screenshot/result → LLM call → ...
                       → end_turn? → return text
```

## Features

- **Backpressure**: 3+ consecutive tool failures → system hint injection
- **Diversity forcing**: Same tool 5x → diversity hint
- **Convergence detection**: Same error 3x → model escalation
- **Context overflow recovery**: Summarize tool results → compact → retry
- **401 auto-refresh**: OAuth token expired → re-read → client reset → retry

## Error Recovery Chain

```
RETRY → ALTERNATIVE → FALLBACK → ESCALATE
```

Non-recoverable errors (permission) skip RETRY/ALTERNATIVE via [[geode-sandbox-breadcrumb]].

## Related

- [[geode-tool-routing]]
- [[geode-llm-models]]
- [[portfolio-geode]]
- [[blog-orchestration]]
- [[geode]]
- [[blog-llm-resilience]]
- [[index]]

## Open Questions

- Should convergence detection use semantic similarity instead of string matching?
- Is 5-turn LLM extraction interval optimal, or should it adapt to conversation intensity?
