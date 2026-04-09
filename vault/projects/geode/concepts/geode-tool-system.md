---
title: GEODE Tool System
type: concept
category: runtime
tags: [geode, tools, mcp, policy-chain, safety]
related:
  - "[[geode-architecture]]"
  - "[[geode-agentic-loop]]"
  - "[[geode-computer-use]]"
  - "[[geode-sandbox-breadcrumb]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Tool System

56 native tools + 16 MCP servers. 4-tier safety classification.

## Safety Tiers

| Tier | Tools | Approval |
|------|-------|----------|
| SAFE | read_file, glob_files, grep_files | Auto |
| STANDARD | analyze_ip, web_search, memory_search | Auto (sub-agent eligible) |
| WRITE | memory_save, profile_update | HITL required |
| DANGEROUS | run_bash, computer | HITL every call |

## MCP Token Guard

Max 25,000 tokens per MCP tool result (Claude Code pattern: `mcpValidation.ts`).
[[geode-context-guard]] prevents GLM 200K overflow from browser_snapshot (90K tokens).

## HTML → Markdown

`markdownify` converts web_fetch HTML to structure-preserving Markdown.
Turndown pattern ported from Claude Code `WebFetchTool/utils.ts`.

## Related

- [[blog-tools-mcp]]
- [[portfolio-geode]]
- [[geode]]
- [[geode-gateway]]
- [[geode-tool-routing]]
- [[index]]
- [[blog-safety]]

## Open Questions

- Should tool definitions migrate from JSON to a type-safe schema?
- Is the 25K MCP token guard too aggressive for data-heavy tools?
- [[career-hub]]
