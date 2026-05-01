---
title: "Scaffold ↔ App boundary — kiki vs. kiki-appmaker"
type: concept
created: 2026-04-29
updated: 2026-04-29
tags: [architecture, scaffold, boundary, cross-repo]
sources:
  - KIKI.md
  - .claude/CLAUDE.md
  - app/pnpm-workspace.yaml
provenance:
  extracted: 0.85
  inferred: 0.15
  ambiguous: 0.0
---

# Scaffold ↔ App boundary — kiki vs. kiki-appmaker

## One-line distinction

**kiki** is the *governance scaffold* (rules, skills, plugin source). **kiki-appmaker** is the *operational instance* that runs Paperclip + bkit and provisions a real engineering team against a real codebase.

## What lives where

| Concern | kiki | kiki-appmaker |
|---|---|---|
| Plugin source code (`paperclip-plugin/`) | ✅ canonical | ❌ removed 2026-04-23 (used to drift) |
| Skill library (`.claude/skills/`) | ✅ canonical | mirrors selected ones |
| Governance docs (`KIKI.md`, `CLAUDE.md`) | ✅ | ❌ |
| Design specs / reports (`docs/superpowers/`) | ✅ | mostly here too (per-instance work) |
| Operator scripts (`scripts/bootstrap.sh`, `scripts/doctor.sh`) | ✅ scaffold reproducer | ❌ has its own `install/` |
| Multi-phase install pipeline (`install/`) | ❌ | ✅ |
| Operational state (`memory/profiles`, `signals`, `teams`) | gitignored runtime | gitignored runtime |
| Wiki (`memory/vault/`) | scaffold reference (this) | operational state (entities, journal, project/PIN-*) |
| Diagram dashboard | both | both — independent runtimes |

## How sync works

Kiki-appmaker's `install/workspaces/30-plugins/phases/04-kiki-plugin.sh` is the only source of plugin truth. It:

1. Resolves `KIKI_DIR` (env override → `../kiki` sibling → `~/workspace/kiki` → fresh clone of `mangowhoiscloud/kiki`).
2. `git fetch origin main` + ff-only pull when checkout is on main and clean.
3. `pnpm install --frozen-lockfile && pnpm build` against the kiki workspace.
4. `docker cp` the dist into a versioned container path (`/paperclip/plugins/kiki-paperclip-plugin-<short-sha>`) — see [[versioned-plugin-path]] for why.
5. POST `/api/plugins/install` against the running Paperclip server.

Result: every kiki-appmaker bootstrap pulls fresh plugin code from kiki main; no chance of a stale local copy reverting upstream guards.

## Why the split exists

The 2026-04-23 incident: kiki-appmaker had its own copy of `app/paperclip-plugin/` that had drifted from kiki. Every bootstrap silently shipped the stale copy, undoing newly-merged guards (invoke-dedup, escalator, zombie-sweeper) within minutes of merge. Resolution: delete the kiki-appmaker copy, force the bootstrap to rebuild from kiki. The pnpm-workspace.yaml comment in kiki-appmaker still notes the move.

## Inverse direction (kiki → kiki-appmaker)

The scaffold side has *no* runtime concerns. kiki itself does NOT log into Anthropic, run Paperclip, or hold operational state. When kiki's `scripts/bootstrap.sh` runs phase 0, it only **detects** whether the host has a session — it doesn't bring up Paperclip. That's kiki-appmaker's job (phase 1).

## Cross-repo wiki convention

A page in either wiki may `[[wikilink]]` the other repo's wiki by the absolute label `kiki-appmaker:<page>` or `kiki:<page>`. Anchor every page in the wiki of the repo where the *design* originated. Operational rollouts live in kiki-appmaker; scaffold patterns and plugin design live here.


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
