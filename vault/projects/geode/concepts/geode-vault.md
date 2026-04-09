---
title: GEODE Vault
type: concept
category: storage
tags: [geode, vault, artifact, auto-classify]
related:
  - "[[geode-memory-system]]"
  - "[[geode-architecture]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Vault

Purpose-routed artifact storage under `.geode/vault/`.

## Categories

| Directory | Content |
|-----------|---------|
| profile/ | Career signals, resumes, portfolios |
| research/ | Market research, company analysis, tech comparisons |
| applications/ | Cover letters, tailored resumes per company |
| general/ | Unclassified artifacts |

## Auto-save

`generate_report` and `export_json` tools auto-save to vault via `_save_to_vault()`.
Best-effort — failure never blocks tool execution.

## Related

- [[geode-memory-system]]
- [[geode-architecture]]
- [[index]]
- [[geode]]
- [[geode-session-58-retrospective]]
