---
title: GEODE Sandbox Breadcrumb
type: concept
category: safety
tags: [geode, sandbox, breadcrumb, llm-steering, claude-code-pattern]
related:
  - "[[geode-tool-system]]"
  - "[[geode-agentic-loop]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Sandbox Breadcrumb

3-layer LLM steering for path errors. Claude Code validation-pyramid pattern.

| Layer | Role | Mechanism |
|-------|------|-----------|
| Prevention | Tool description | "Must be within the project directory" |
| Correction | _check_sandbox hint | "Use a relative path or omit the path parameter" |
| Fast exit | Recovery chain skip | Non-recoverable → skip RETRY/ALTERNATIVE |

## Related

- [[geode-tool-system]]
- [[geode-agentic-loop]]
- [[geode]]
- [[geode-claude-code-patterns]]
- [[geode-tool-routing]]
- [[index]]
- [[blog-safety]]
