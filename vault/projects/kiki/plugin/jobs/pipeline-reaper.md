---
title: "plugin job — pipeline-reaper"
type: plugin-job
created: 2026-04-29
updated: 2026-04-29
tags: [plugin-job, pipeline-reaper]
sources:
  - app/paperclip-plugin/src/manifest.ts
  - app/paperclip-plugin/src/pipeline-reaper.ts
---

# Plugin job — `pipeline-reaper`

**Display name:** Pipeline Shape Reaper

**Schedule:** `*/30 * * * *`

## Description

Every 30 minutes, scan the company's open issue queue for shape distortions: backlog stuck with assignee (R1), unassigned backlog (R2), blocked-on-resolved-dep (R3), load imbalance (R4 advisory). Portfolio-level counterpart to stage-reaper.

## Source

Implementation: `app/paperclip-plugin/src/pipeline-reaper.ts` (linked from manifest at `app/paperclip-plugin/src/manifest.ts`).


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
