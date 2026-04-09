---
title: GEODE OAuth Policy
type: concept
category: auth
tags: [geode, oauth, anthropic, openai, codex, managed-credentials]
related:
  - "[[geode-architecture]]"
  - "[[mango]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE OAuth Policy

OpenClaw `managedBy` pattern — read external CLI tokens without persisting copies.

## Provider Status (2026-04)

| Provider | OAuth | Policy | GEODE |
|----------|-------|--------|-------|
| Anthropic | Claude Code Keychain | **Prohibited** (ToS 2026-01-09) | Disabled |
| OpenAI | Codex CLI `~/.codex/auth.json` | **Permitted** (officially endorsed) | Active |

## Token Lifecycle

```
Codex CLI OAuth → read_codex_cli_credentials() (TTL 15min + mtime cache)
→ ProfileRotator OAUTH(0) > API_KEY(2) → OpenAI SDK client
→ 401? → re-read + client reset → retry once
```

## web_search Exception

Codex OAuth token lacks `web_search` native tool permission → 401.
`_openai_search` uses `settings.openai_api_key` directly (ProfileRotator bypass).

## Related

- [[geode-architecture]]
- [[mango]]
- [[geode-llm-models]]
- [[geode]]
- [[geode-claude-code-patterns]]
- [[geode-openclaw-patterns]]
- [[index]]

## Open Questions

- Will Anthropic reverse the ToS restriction for coding agents?
- Should GEODE implement its own OAuth flow instead of managed credentials?
- [[geode-session-58-retrospective]]
