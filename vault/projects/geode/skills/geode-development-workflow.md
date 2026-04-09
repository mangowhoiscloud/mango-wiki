---
title: GEODE Development Workflow
category: skills
tags: [geode, workflow, scaffold, gitflow, quality-gates]
sources:
  - "raw/geode-docs/CLAUDE.md"
created: 2026-04-07T08:21:00Z
updated: 2026-04-07T08:21:00Z
---

# GEODE Development Workflow

How-to guide for contributing to GEODE. Based on [[geode-architecture]] scaffold rules.

## Workflow Steps

```
0. Board + Worktree → 1. GAP Audit → 2. Plan + Socratic Gate
→ 3. Implement+Test → 4. Verify → 5. Docs-Sync → 6. PR → 7. Rebuild → 8. Board
```

## Quality Gates

| Gate | Command | Criteria |
|------|---------|----------|
| Lint | `uv run ruff check core/ tests/` | 0 errors |
| Type | `uv run mypy core/` | 0 errors |
| Test | `uv run pytest tests/ -m "not live"` | 3525+ pass |
| E2E | `uv run geode analyze "Cowboy Bebop" --dry-run` | A (68.4) |

## Gitflow

```
feature/<task> → develop (PR) → main (PR)
```

CI 5/5 required before merge. Never push directly to main.

## Wiring Verification

Before marking complete, verify:
- Read-write parity (every read path has a write path)
- Hook registration in bootstrap.py
- ContextVar set in bootstrap

## Open Questions

- Should the Socratic Gate be automated?
- Is the 8-step workflow too heavy for hotfixes?

## Related

- [[geode-architecture]]
- [[geode]]
- [[mango]]
