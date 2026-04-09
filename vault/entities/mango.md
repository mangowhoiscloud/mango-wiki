---
title: Mango
type: entity
category: person
tags: [person, engineering, lead, ai-agents, architect]
sources:
  - raw/kiki-profiles/user_mango.md
related:
  - "[[geode]]"
  - "[[kiki]]"
  - "[[engineering-team]]"
  - "[[paperclip-integration]]"
created: 2026-04-07
updated: 2026-04-07
---

# Mango

Project lead and system architect. Confidence: 0.85.

## Work Style

- Communication: concise bullets + code blocks, casual tone, Korean conversation + English code
- Decision making: fast, data-driven (benchmarks required), compresses to 2 options
- Focus hours: 22:00-02:00 (night sessions for core architecture work)

## Expertise

AI agents, LangGraph, Python backend, MCP tooling, ML evaluation, CLI architecture, TypeScript.

## Work Patterns

- Parallel multi-project execution (GEODE, REODE, Kiki, LLMART)
- High-intensity sessions (8K-12K messages per session)
- Strict GitFlow (feature → develop → main, PR only)
- Test coverage target: 75%+ (2000+ tests)
- Cost-aware: token budgets and test cost management

## Tools

- Claude Code as primary development harness
- uv + ruff + mypy strict + pytest + bandit pipeline
- MCP server-based tool extension pattern
- Worktree-based parallel branch work

## GEODE

Primary developer and operator of [[geode-architecture]].
Built the 4-layer stack, 56 tools, 48 hooks, 3-provider LLM fallback.
Session 58: OAuth policy compliance, computer-use, bidirectional learning.

### Key Decisions

- [[geode-oauth-policy]]: Anthropic OAuth disabled (ToS), OpenAI Codex maintained
- [[geode-bidirectional-learning]]: Claude Code extractMemories pattern adoption
- [[geode-computer-use]]: PyAutoGUI harness over @ant/computer-use-swift (closed source)
- [[geode-context-guard]]: 25K MCP token guard (Claude Code mcpValidation pattern)

## Related

- [[nexon-ai-live]]
- [[geode-memory-system]]
- [[resume-targets]]
- [[portfolio-geode]]
- [[blog-architecture]]
- [[blog-internal]]
- [[index]]
- [[blog-hub]]
- [[career-hub]]
- [[geode-session-58-retrospective]]
