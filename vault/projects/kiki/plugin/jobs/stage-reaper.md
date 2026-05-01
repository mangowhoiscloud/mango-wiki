---
title: "plugin job — stage-reaper"
type: plugin-job
created: 2026-04-29
updated: 2026-04-29
tags: [plugin-job, stage-reaper]
sources:
  - app/paperclip-plugin/src/manifest.ts
  - app/paperclip-plugin/src/stage-reaper.ts
---

# Plugin job — `stage-reaper`

**Display name:** Stage Transition Reaper

**Schedule:** `*/2 * * * *`

## Description

Every 2 minutes, scan open issues for stage-level stalls (no signal > heartbeat, or stage entry > timeout) and re-wake or escalate. Level-triggered complement to C21/C14.

## Source

Implementation: `app/paperclip-plugin/src/stage-reaper.ts` (linked from manifest at `app/paperclip-plugin/src/manifest.ts`).


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
