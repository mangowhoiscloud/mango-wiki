---
title: GEODE Computer Use
type: concept
category: tools
tags: [geode, computer-use, pyautogui, anthropic, openai, desktop-automation]
related:
  - "[[geode-tool-system]]"
  - "[[geode-agentic-loop]]"
  - "[[geode-architecture]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Computer Use

Provider-agnostic desktop automation. One harness, two providers.

## Architecture

```
Anthropic computer_20251124 → ComputerUseHarness.execute() → PyAutoGUI
OpenAI computer_use_preview → ComputerUseHarness.execute() → PyAutoGUI
```

## Actions

screenshot, click, double_click, type, key, scroll, move, drag, wait.
Coordinate scaling: target (1280x800) ↔ screen space (auto).

## Safety

DANGEROUS tier — HITL approval required. Opt-in: `GEODE_COMPUTER_USE_ENABLED=true`.

## Benchmark Context (2026-04)

| Agent | OSWorld |
|-------|---------|
| Claude Opus 4.6 | 72.7% (independent) |
| GPT-5.4 | 75.0% (self-reported) |
| Human | 72.4% |

## Related

- [[geode-tool-system]]
- [[geode-agentic-loop]]
- [[geode-architecture]]
- [[blog-tools-mcp]]
- [[index]]
- [[geode]]
- [[geode-claude-code-patterns]]
- [[mango]]

## Open Questions

- Is PyAutoGUI sufficient or will native macOS bindings be needed?
- How to handle multi-monitor coordinate scaling?
- [[career-hub]]
