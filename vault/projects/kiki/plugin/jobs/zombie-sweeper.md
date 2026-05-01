---
title: "plugin job — zombie-sweeper"
type: plugin-job
created: 2026-04-29
updated: 2026-04-29
tags: [plugin-job, zombie-sweeper]
sources:
  - app/paperclip-plugin/src/manifest.ts
  - app/paperclip-plugin/src/zombie-sweeper.ts
---

# Plugin job — `zombie-sweeper`

**Display name:** Zombie Heartbeat Sweeper

**Schedule:** `*/5 * * * *`

## Description

Every 5 minutes, scan heartbeat_runs for running>15min / queued>10min rows and flag them so stuck agents self-recover without operator intervention.

## Source

Implementation: `app/paperclip-plugin/src/zombie-sweeper.ts` (linked from manifest at `app/paperclip-plugin/src/manifest.ts`).


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
