---
title: "plugin job — pipeline-health-snapshot"
type: plugin-job
created: 2026-04-29
updated: 2026-04-29
tags: [plugin-job, pipeline-health-snapshot]
sources:
  - app/paperclip-plugin/src/manifest.ts
  - app/paperclip-plugin/src/pipeline-health-snapshot.ts
---

# Plugin job — `pipeline-health-snapshot`

**Display name:** Pipeline Health Snapshot

**Schedule:** `0 0 * * *`

## Description

Once daily at 00:00 UTC (09:00 KST), emit a structured digest of the queue's current shape (status distribution, active load, stalled categories) plus reaper activity since the last snapshot. Forwarded via ctx.logger.info; log scrapers / dashboards consume. Slack output is follow-up work pending notifier hoisting.

## Source

Implementation: `app/paperclip-plugin/src/pipeline-health-snapshot.ts` (linked from manifest at `app/paperclip-plugin/src/manifest.ts`).


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
