---
title: "Versioned plugin path — defeating Paperclip's manifest cache"
type: concept
created: 2026-04-29
updated: 2026-04-29
tags: [plugin, deploy, cache, versioned-path, 2026-04-29]
sources:
  - app/paperclip-plugin/src/manifest.ts
  - scripts/bootstrap.sh
  - install/workspaces/30-plugins/phases/04-kiki-plugin.sh
---

# Versioned plugin path

## The trap

`POST /api/plugins/install` against the same `packageName` returns the previously-cached manifest, even after the bundle file at that path is replaced. Paperclip's plugin loader caches the resolved manifest by packagePath; node's import cache is keyed on resolved file path; nothing invalidates between deploys.

## The symptom that surfaced this

On 2026-04-29 a redeploy of the kiki plugin (PR #110 + #111 had added `pipeline-reaper` and `pipeline-health-snapshot` jobs) shipped fine to disk — `dist/manifest.bundle.js` in the container had all four jobs declared. But the API returned only the old two (`zombie-sweeper`, `stage-reaper`). DELETE → POST loop with the same packageName: same stale 2-job result. Installing from a *different* packageName: instant 4-job result.

## The fix (in bootstrap)

Stage each deploy at `kiki-paperclip-plugin-<short-sha>` so the cache key changes every time:

```bash
KIKI_SHA=$(git -C "$KIKI_DIR" rev-parse --short=12 HEAD)
CONTAINER_PATH="/paperclip/plugins/kiki-paperclip-plugin-${KIKI_SHA}"
docker exec "$CONTAINER" rm -rf "$CONTAINER_PATH"
docker cp "$PLUGIN_SRC" "$CONTAINER:$CONTAINER_PATH"
# ... POST install with packageName=$CONTAINER_PATH
```

After the new path is registered, sweep prior versioned dirs in one `docker exec sh -c` so the container doesn't accumulate.

Both `kiki/scripts/bootstrap.sh:phase_5_plugin_deploy` and `kiki-appmaker/install/workspaces/30-plugins/phases/04-kiki-plugin.sh` use the same SHA-derived path so phases 5 and 5.5 (and partial reruns) target the same dir.

## Adjacent

- The first cut also tried `POST /api/plugins/<id>/upgrade` — that returns 200 but with the cached manifest, so it doesn't help.
- A container restart works (kills the worker, fresh import) but is too disruptive for routine deploys.
- Bumping `version:` in `package.json` was not tested — would have to verify the loader keys cache by package version (it apparently doesn't, since same version + new path *did* work).

## See also

- [[pipeline-reaper]], [[pipeline-health-snapshot]] — the jobs that surfaced this trap because they were brand new
- [[2026-04-28-session-synthesis]] — context on the rollout that hit it


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
