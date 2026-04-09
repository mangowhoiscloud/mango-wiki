---
title: GEODE LLM Models
category: concepts
tags: [geode, llm, anthropic, openai, glm, fallback]
sources:
  - "raw/geode-docs/GEODE.md"
created: 2026-04-07T07:59:58Z
updated: 2026-04-07T07:59:58Z
---

# GEODE LLM Models

3-provider fallback chain with cost-aware routing.

## Provider Table

| Provider | Model | Input $/M | Output $/M | Context | Purpose |
|----------|-------|-----------|------------|---------|---------|
| **Anthropic** | claude-opus-4-6 | $5.00 | $25.00 | 1M | Primary |
| Anthropic | claude-sonnet-4-6 | $3.00 | $15.00 | 1M | Fallback |
| Anthropic | claude-haiku-4-5 | $1.00 | $5.00 | 200K | Budget |
| **OpenAI** | gpt-5.4 | $2.50 | $15.00 | 1M | Cross-LLM Secondary |
| OpenAI | gpt-5.2 | $1.75 | $14.00 | 128K | Fallback 1 |
| OpenAI | gpt-4.1 | $2.00 | $8.00 | 1M | Fallback 2 |
| **ZhipuAI** | glm-5 | $0.72 | $2.30 | 200K | GLM Primary |
| ZhipuAI | glm-5-turbo | $0.96 | $3.20 | 200K | GLM Agent |
| ZhipuAI | glm-4.7-flash | Free | Free | 200K | GLM Budget |

## Fallback Chains

- Anthropic: opus-4-6 → sonnet-4-6
- OpenAI: gpt-5.4 → gpt-5.2 → gpt-4.1
- GLM: glm-5 → glm-5-turbo → glm-4.7-flash

## OAuth Policy

[[geode-oauth-policy]] — Anthropic OAuth disabled (ToS), OpenAI Codex active.

## Related

- [[geode-architecture]] — 4-layer stack, Model layer
- [[geode-agentic-loop]] — LLM call with failover
- [[geode-context-guard]] — GLM 200K overflow detection
- [[index]]
- [[geode]]
- [[career-hub]]
