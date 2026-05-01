---
title: "spec — 2026-04-28-stage-reaper-effective-recovery-design"
type: spec
created: 2026-04-29
updated: 2026-04-29
tags: [specs]
sources:
  - docs/superpowers/specs/2026-04-28-stage-reaper-effective-recovery-design.md
---

# Stage-reaper effective-recovery redesign

> Full document: `docs/superpowers/specs/2026-04-28-stage-reaper-effective-recovery-design.md`

## Summary (first 150 lines)


**Date:** 2026-04-28
**Status:** design — not yet implemented
**Authoritative implementation site:** `app/paperclip-plugin/src/stage-reaper.ts`

---

## TL;DR

The current `stage-reaper.ts` posts a 🔔 comment and calls `ctx.agents.invoke`
(`POST /api/agents/:id/wakeup`) every 2 min when an assigned issue is stale.
Direct evidence from this session:

| | |
|---|---|
| Issue | `PIN-63` (`[PIN-57/D-1] M1-next implementation — Next.js scaffold …`) |
| Assignee | `Infra 1` (`bd24e301-…`) |
| `updatedAt` | 2026-04-25T09:29Z |
| `lastRunAt` | **`null`** (no run has ever started for this agent) |
| `currentRunId` | `null` |
| Reaper wakes fired | ~2,000+ over 67 h (every 2 min) |
| Effect | **none** — Slack and the issue collected ~2,000 🔔 comments. The runner never started. |
| Recovery that actually worked | `kiki-retry-issue PIN-63` → `PATCH /api/issues/:id { assigneeAgentId, comment }` → new run queued within 5 s. |

Two structural failures, both load-bearing:

1. **Wrong mechanism.** `POST /api/agents/:id/wakeup` does not carry issue
   context, so Paperclip's `queueIssueAssignmentWakeup` never fires.
   `PATCH /api/issues/:id` does. The `kiki-retry-issue` skill exists
   *because* this distinction matters — its preamble specifically warns
   "never wake an agent without issue context." The reaper violates that
   invariant on every tick.
2. **No upper bound.** No matter how many ineffective wakes the reaper
   sends, the loop runs forever. There is no per-(agent, issue) streak
   counter, no escalation step, no reroute.

This document specifies a redesign that replaces the bare wakeup with a
PATCH-based retry, adds a streak counter with a max, and adds two
escalation tiers — modeled on TradingAgents'
[Risk Management Team](https://arxiv.org/abs/2412.20138) pattern: a
specialised agent gates final actions when constraints are repeatedly
unmet.

---

## 1 — Background: how Paperclip starts a run

Two code paths exist for "make this agent work on this issue":

### 1a. Server-internal: `queueIssueAssignmentWakeup` *(works)*

Triggered by:

- `PATCH /api/issues/:id` with **any mutation** (the field that lands
  the wakeup is `assigneeAgentId` and/or `comment`).
- POST of a new issue with `assigneeAgentId` set (`issue.created` event).

Effect: Paperclip server creates a `heartbeat_run` row and dispatches the
agent's adapter (`claude_local` for our team) with `issueId` baked into
the prompt context.

This is what `kiki-retry-issue/SKILL.md` documents and what the kiki
plugin's existing C11 handler at `index.ts:714` exploits ("Auto-Wake on
Batch Assignment"). When you see PIN-63 unstick from a kiki-retry-issue
run, this is what fired.

### 1b. Plugin-internal: `ctx.agents.invoke` → `POST /api/agents/:id/wakeup` *(does not unstick PIN-63-class stalls)*

Triggered by:

- `ctx.agents.invoke(agentId, companyId, { prompt })` from any plugin
  handler.

Effect: Paperclip server places a `heartbeat_run` for the agent with
**the prompt only** — no `issueId` hint, no `assigneeAgentId` mutation.
The adapter starts running but is left to introspect its inbox via
prompt text. For an agent with no current `executionRunId` and a stale
state cache, this commonly finds nothing actionable and exits.

`makeInvokeOnce` (`invoke-dedup.ts`) wraps `ctx.agents.invoke` with a
5-second collision dedup. It is **not** a long-window streak guard —
two ticks 2 min apart both pass.

The reaper's current `invokeOnce(...)` call uses path 1b and pays the
price for it.

---

## 2 — Failure mode: PIN-63 timeline

```
2026-04-25 09:23  succeeded run on PIN-63
2026-04-25 09:29  cancelled run, status=in_progress retained
                  Infra 1 status: idle, currentRunId=null, lastRunAt=null
2026-04-25 09:31  reaper tick #1 — invokeOnce(Infra1) → wake; nothing happens
2026-04-25 09:33  reaper tick #2 — invokeOnce(Infra1) → wake; nothing happens
                  …  ~2,000 ticks  …
2026-04-28 04:00  reaper still posting 🔔 every 2 min, agent still idle
2026-04-28 06:25  operator runs kiki-retry-issue PIN-63 manually
2026-04-28 06:26  PATCH /issues/PIN-63 fires queueIssueAssignmentWakeup
2026-04-28 06:26  new heartbeat_run, status=running, agent picks up
```

Three things every tick was failing to do:

1. Cause a run to start.
2. Notice that no run started.
3. Stop trying after the failure pattern was clear.

---

## 3 — Design: three-tier escalation

Modeled on TradingAgents § 3.2 — *Risk Management Team gates execution
when constraints are repeatedly unmet, rather than continuing to act on
stale signal.* For us, the "constraint" is "the wake actually starts a
new heartbeat_run."

### Tier 1: PATCH-based retry (replaces bare wakeup)

When `sinceSignalSec > heartbeatSeconds`, the reaper calls a new ctx
method:

```ts
ctx.repatchAssignment({
  issueId: issue.id,
  assigneeAgentId: issue.assigneeAgentId,
  noteBody: `🔔 stage-reaper retry (${Math.round(sinceSignalSec/60)}m no activity)`,
});
```

Backed by:

```http
PATCH /api/issues/:id
{
  "assigneeAgentId": "<same as current>",
  "comment": "🔔 stage-reaper retry …"
}
```

This is exactly the call kiki-retry-issue makes, manually, today. It
fires `queueIssueAssignmentWakeup` server-side; the heartbeat_run is
issue-aware; the adapter receives `issueId` in context. It works.

### Tier 2: streak counter + cap

Per `(agentId:issueId)` pair the reaper persists:



---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
