---
title: GEODE Context Guard
type: concept
category: resilience
tags: [geode, context-overflow, token-guard, mcp, glm]
related:
  - "[[geode-agentic-loop]]"
  - "[[geode-tool-system]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Context Guard

MCP tool result 토큰 가드 + HTML→MD + context overflow recovery.

## Layers

| Layer | Limit | Source |
|-------|-------|--------|
| Per-tool result | 25,000 tokens | `max_tool_result_tokens` |
| Tool offload | 15,000 tokens threshold | `tool_offload_threshold` |
| HTML→MD | markdownify conversion | web_fetch results |
| GLM overflow detect | "Prompt exceeds max length" pattern | `errors.py` + `fallback.py` |
| Aggressive recovery | Summarize 5 tool results → compact | `context_monitor.py` |

## GLM Pattern

GLM 200K context window exceeded → `"Prompt exceeds max length"` (code 1261).
Now classified as `context_overflow` → immediate `aggressive_context_recovery`.
Before: blind retry 5x → turn broken.

## Related

- [[geode-agentic-loop]]
- [[geode-tool-system]]
- [[geode-llm-models]]
- [[portfolio-geode]]
- [[mango]]
- [[geode]]
- [[geode-claude-code-patterns]]
- [[blog-memory-context]]
- [[blog-llm-resilience]]
- [[index]]

## Open Questions

- Should per-message aggregate budget (200K) be implemented?
- Is Haiku pre-summarization cost-effective for all MCP results?
