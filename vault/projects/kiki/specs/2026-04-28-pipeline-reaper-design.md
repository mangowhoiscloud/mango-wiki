---
title: "spec — 2026-04-28-pipeline-reaper-design"
type: spec
created: 2026-04-29
updated: 2026-04-29
tags: [specs]
sources:
  - docs/superpowers/specs/2026-04-28-pipeline-reaper-design.md
---

# Pipeline-reaper: portfolio-level recovery for PDCA stalls

> Full document: `docs/superpowers/specs/2026-04-28-pipeline-reaper-design.md`

## Summary (first 150 lines)


**Date:** 2026-04-28
**Status:** design — implementation alongside this PR
**Authoritative implementation site:** `app/paperclip-plugin/src/pipeline-reaper.ts`

---

## TL;DR

`stage-reaper` (this session, #108-#109) handles **per-(agent, issue) stalls**:
the assignee is set, the agent should be working, the agent isn't moving.
That's *trader-level* recovery — fix one position.

`pipeline-reaper` handles **portfolio-level distortions**: the queue itself
is sick (assignees missing, status stuck in backlog despite assignment,
load piled on one agent, blocked-on-resolved-dependency). That's *risk-team-
level* recovery — rebalance the book.

Both layers are necessary. They don't compete: stage-reaper observes
`(agent, issue)` lifecycle, pipeline-reaper observes the queue's *shape*.

This document specifies the shape-level rules, all four of which were
manually executed earlier today against the live pinxlab instance with
documented success (`backlog 6 → 0`, `blocked 5 → 1`).

---

## 1 — Manual evidence

The four rules below are not speculative — they are exactly what was run
by hand on 2026-04-28 against pinxlab, with PATCH-by-PATCH evidence
already in the issue comment trail (`Cleanup A/B/C/D from
pipeline-bottleneck pass`):

| Rule | Manual run today | Result |
|---|---|---|
| R1 | PIN-65, PIN-66 — `backlog → todo` (assignee set, C20 missed) | 2 promoted |
| R2 | PIN-54 / 49 / 51 / 56 — assignee=null → CTO retriage + todo | 4 retriaged |
| R3 | PIN-48 — blocked, dependency PIN-46 done → unblock | 1 dependency satisfied |
| R3' | PIN-58 / 60 — blocked but dependency was a misclassification → unblock with reason | 2 unblocked |
| R4 | PIN-52 — Lead 2 had 3 active vs Lead 1 had 0 → reroute | 1 rebalanced |

Only blocked items still genuinely waiting on upstream work were left in
place (PIN-53 gates on PIN-51, PIN-44 gates on PIN-58). Those will
auto-resolve when their upstream reaches `done`.

The pipeline-reaper codifies the same logic so it runs every cycle
without human intervention.

---

## 2 — Design

### 2.1 Trigger

Periodic job, **every 30 min** (looser than stage-reaper's 2 min — pipeline
shape moves more slowly, and over-aggressive rebalancing thrashes the
queue). Reuses the same `ctx.jobs.register` cron path stage-reaper does.

### 2.2 Rules

```
For each issue I in the company's open issues:

  R1: backlog-with-assignee
    if I.status == "backlog"
       and I.assigneeAgentId != null
       and now - I.updatedAt > BACKLOG_PROMOTE_AGE_SEC (default 600 = 10 min)
    → PATCH I { status: "todo", comment: "auto-promote: backlog→todo (assignee set, C20 missed)" }

  R2: backlog-without-assignee
    if I.status == "backlog"
       and I.assigneeAgentId == null
       and now - I.updatedAt > BACKLOG_RETRIAGE_AGE_SEC (default 1800 = 30 min)
       and I.title does not start with "[MAINT]" or "[DIAGRAM-FLAG]"
    → PATCH I { assigneeAgentId: <CTO id>, status: "todo",
                 comment: "auto-retriage: unassigned backlog routed to CTO" }

  R3: blocked-with-resolved-dependency
    if I.status == "blocked"
       and I has a `Depends on PIN-X` annotation in body / latest BLOCKER comment
       and PIN-X.status == "done"
    → PATCH I { status: "todo", comment: "auto-unblock: dependency PIN-X reached done" }

  R4: load-imbalance (warn-only in v1)
    For each role group (Lead, Developer, QA):
      if any agent in the group has > 2× the median active load of peers
         and at least one peer has < 0.5× the median
    → post a one-time advisory comment to the most-loaded agent's heaviest
      issue: "load advisory: <name> has N active vs peer median M;
               consider rerouting to <peer>"
      (no auto-PATCH in v1 — observe before automating)
```

### 2.3 What it deliberately does NOT do

- **Touch in_progress / in_review.** Those are stage-reaper's domain.
- **Touch blocked items where the blocker is unresolved.** Manual review only.
- **Cancel issues.** Cancellation is operator intent; auto-cancel is
  irreversible and out of scope.
- **Modify assignment for already-active work** (todo / in_progress / in_review).
  R4 is comment-only; no rebalance PATCH in v1.

### 2.4 Idempotence + dedup

- All four PATCHes carry a `comment` containing the rule tag (`R1`/`R2`/etc.).
- The reaper reads recent comments and skips if the same `(rule, issue)`
  fired within the last hour. Backed by `ctx.state` under
  `pipeline-reaper:recent-actions`. Same shape as stage-reaper's wake
  records.

---

## 3 — Pattern attribution

Mirrors TradingAgents (arXiv 2412.20138 § 3.2) at the **portfolio** layer
instead of the trade layer:

| TradingAgents | Stage-reaper (#108) | Pipeline-reaper (this) |
|---|---|---|
| Trader's pending order | Stale assignment | Whole queue's shape |
| Risk team's first check | Try a real wake (PATCH retry) | Promote/route on rule match |
| Risk team's escalation | Lead reroute at cap-hit | Load advisory at imbalance |
| Risk team's final action | Status revert (flagged) | (manual review only) |

`stage-reaper` is the per-trade risk gate. `pipeline-reaper` is the
portfolio-level rebalancer.

---

## 4 — Implementation

### 4.1 Files

| File | Purpose |
|---|---|
| `app/paperclip-plugin/src/pipeline-reaper.ts` | new — pure rule logic, dependency-injected ctx (mirrors stage-reaper.ts shape) |
| `app/paperclip-plugin/src/pipeline-reaper.test.ts` | new — unit tests per rule + dedup |
| `app/paperclip-plugin/src/index.ts` | wire `ctx.jobs.register("pipeline-reaper", ...)`, every 30 min, with concrete listIssues / agents / state injectors |
| `app/paperclip-plugin/src/plugin-config.ts` | `KIKI_PIPELINE_REAPER_*` env knobs (BACKLOG_PROMOTE_AGE_SEC, BACKLOG_RETRIAGE_AGE_SEC, DEDUP_WINDOW_SEC) |
| `.github/ci-baselines.json` | bump `plugin_tests_min` to lock new test cases |

### 4.2 Test plan

```
R1 backlog-with-assignee
  ✓ promotes to todo when age > threshold
  ✓ does NOT promote when age < threshold
  ✓ does NOT promote when status != backlog


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
