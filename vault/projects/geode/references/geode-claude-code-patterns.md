---
title: Claude Code Patterns in GEODE
type: reference
category: frontier-research
tags: [geode, claude-code, patterns, reference]
related:
  - "[[geode-architecture]]"
  - "[[geode-bidirectional-learning]]"
  - "[[geode-context-guard]]"
  - "[[geode-sandbox-breadcrumb]]"
  - "[[geode-computer-use]]"
  - "[[geode-oauth-policy]]"
sources:
  - "claude-code/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# Claude Code Patterns Adopted by GEODE

Patterns ported from `/Users/mango/workspace/claude-code` codebase.

| Pattern | Claude Code Source | GEODE Implementation |
|---------|-------------------|---------------------|
| Bidirectional feedback | `memdir/memoryTypes.ts:60-72` | [[geode-bidirectional-learning]] |
| MCP token guard | `utils/mcpValidation.ts:16` | [[geode-context-guard]] |
| HTML→MD (Turndown) | `tools/WebFetchTool/utils.ts:454` | `markdownify` in web_tools.py |
| Tool description breadcrumb | `tools/FileReadTool/prompt.ts` | [[geode-sandbox-breadcrumb]] |
| managedBy credential | OAuth token reuse pattern | [[geode-oauth-policy]] |
| extractMemories | `services/extractMemories/` | `llm_extract_learning.py` |
| Prompt toolkit fallback | Terminal restore pattern | `SelectSelector` event loop |
| ConsoleProxy context mgr | Dunder delegation | `__enter__/__exit__` explicit |
| Hook interceptor pattern | `utils/hooks.ts` PreToolUse/PostToolUse | [[geode-hook-production-gap]] (P1 gap) |

## Related

- [[hook-claude-code-comparison]] -- detailed hook system comparison
- [[geode-hook-production-gap]] -- production gap analysis derived from hook comparison
- [[blog-harness-frontier]]
- [[index]]
- [[blog-research]]
- [[geode]]
- [[geode-session-58-retrospective]]
