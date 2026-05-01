---
title: Pipeline Guardrails (21-Crack System)
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [guardrails, cracks, enforcement, pipeline, plugin, paperclip]
sources: [_raw/global/projects/kiki-identity.md, _raw/global/projects/engineering-team-template.md]
---

# Pipeline Guardrails — The 21-Crack System

The Paperclip agent pipeline has 21 identified "crack points" where agents can silently skip phases, bypass reviews, or produce unverified work. Kiki's guardrail system addresses these cracks through **event-driven enforcement** -- not by modifying Paperclip core, but by intercepting events and enforcing invariants at the plugin layer.

## Why YAML Instructions Are Not Enough

The naive approach to agent governance is to put rules in YAML system prompts: "always post a scorecard before marking done." This fails for three reasons:

1. **LLMs are probabilistic**: An instruction in a system prompt is a suggestion, not a constraint. Under token pressure or ambiguous context, agents skip steps.
2. **No enforcement mechanism**: YAML instructions have no way to detect violations after they occur. A Dev who marks an issue `done` without a Lead Scorecard simply gets away with it.
3. **Multi-agent coordination gaps**: Even if Agent A follows its instructions perfectly, Agent B may not react correctly to Agent A's output. The gap between agents is where most cracks appear.

Kiki's approach is **defense in depth**: YAML instructions define the expected behavior (and remain important for guiding the LLM), but plugin event handlers provide hard enforcement that auto-reverts violations.

## Enforcement Architecture

```
Paperclip Events ──> Kiki Plugin Event Handlers ──> Invariant Checks ──> Auto-PATCH/Revert
                                                         │
                                                    Violation Log
                                                    (agent state)
```

Every guardrail follows the same pattern:

1. **Detect**: Listen on a specific Paperclip event (`issue.updated`, `issue.comment.created`, `agent.run.failed`, etc.)
2. **Check**: Verify that the required precondition exists (scorecard posted, spec complete, assignee changed, etc.)
3. **Enforce**: If the precondition is missing, auto-revert the state change and post a violation comment
4. **Log**: Record the violation in agent-scoped state for trend tracking

## Major Cracks

### C1: CTO Comment-Only Triage

**Problem**: CTO writes a routing comment ("assigning to PO") but does not actually PATCH the assignee. Issue stays stuck.

**Fix (YAML)**: CTO instructions require API PATCH, not just comments.
**Fix (Plugin)**: `issue.comment.created` handler detects CTO routing keywords. If assignee has not changed, auto-PATCHes to the target agent.

### C2: PO Spec Phase Bypass

**Problem**: Issues assigned directly to Dev without PO writing a spec. Dev implements against incomplete requirements.

**Fix (Plugin)**: `issue.updated` handler enforces a **PO Spec Gate**: when an engineer-role agent starts work (`in_progress`), the handler checks for a "SPEC COMPLETE" comment from a PM-role agent. If missing, auto-reverts to `todo` and reassigns to PO.

### C5: No Quantitative Review Gate

**Problem**: Lead/QA review is binary PASS/FAIL with subjective judgment. Low-quality work passes, or minor issues cause full rework.

**Fix (YAML)**: Lead and PO instructions include a [[review-scorecard|6-dimension Scorecard]], each scored 0-5.
**Fix (Plugin)**: `issue.comment.created` handler parses scorecard comments. If total < threshold and issue is marked `done`, auto-reverts to `in_progress`. Scorecard history is stored per-agent for trend analysis.

### C7: PO Solo Spec Without Delegation

**Problem**: PO writes SPEC COMPLETE alone on a UI task without Designer input, or on a backend task without Planner input. Spec quality suffers.

**Fix (Plugin)**: `issue.comment.created` detects SPEC COMPLETE from PO. Checks for UI/backend keywords. If UI task lacks Designer comment, or backend task lacks Planner comment, rejects SPEC COMPLETE and reverts with delegation instructions.

### C8: Dev Self-Done Without Lead Scorecard

**Problem**: Dev marks their issue `done` directly via API PATCH, bypassing Lead's review. The entire review phase is skipped.

**Fix (Plugin)**: `issue.updated` handler: when an engineer-role agent sets `status=done`, checks for Lead Scorecard PASS in issue comments. If not found, auto-reverts to `in_progress`. Uses `assigneeAgentId` (not `actorId`) to handle `local_trusted` mode (see C13).

### C11: One-Shot Wake on Batch Assignment

**Problem**: PO batch-creates N sub-issues for Designer. Only 1 wake fires. Designer completes 1 issue and exits. N-1 issues are orphaned.

**Fix (Plugin)**: Second `issue.created` handler: when an issue is created WITH an assignee, auto-wakes that agent via `ctx.agents.invoke`. N issues = N wakes.

### C18: Same-Role Load Imbalance

**Problem**: All QA issues assigned to QA 1 while QA 2 sits idle. QA 1 processes sequentially (one issue per run), creating a bottleneck.

**Fix (Plugin)**: `issue.updated` handler: when an issue is assigned to a balanceable role (qa, engineer), compares active issue count with same-role peers. If the assignee has 2+ more active issues than the least-loaded peer, auto-rebalances.

### C20: Backlog Status Invisible to Agents

**Problem**: Issue created with default status `backlog`. Agents query `status=todo,in_progress` and never find it. Issue sits in backlog indefinitely.

**Fix (Plugin)**: Auto-triage and C11 handlers both include `status: "todo"` in their PATCH operations, promoting backlog issues to visible status.

### C21: Reassign Without Wake

**Problem**: CTO or PO reassigns an issue to a new agent via API PATCH, but the new assignee is never woken. Issue sits in `todo` indefinitely.

**Fix (Plugin)**: `issue.updated` handler: when `assigneeAgentId` changes, auto-invokes the new assignee with context about the issue.

## Additional Cracks (Summary)

| Crack | Name | Event | Fix |
|-------|------|-------|-----|
| C3 | QA Error Without Escalation | `agent.run.failed` | Auto-escalation + fallback to other squad's QA |
| C4 | Orphan Wake | `agent.run.started` | Verify assigned issues exist before run |
| C6 | No PO Acceptance Test | `issue.updated` | PO Acceptance Scorecard gate after QA PASS |
| C9 | QA Assigned Without Lead PASS | `issue.updated` | Block QA assignment without Lead Scorecard |
| C10 | Release Without PO Acceptance | `issue.updated` | Gate CTO release on PO Acceptance 30/30 |
| C12 | Agent Auth on local_trusted | YAML only | grounding_policy "NEVER add Authorization header" |
| C13 | actorId Bypass in local_trusted | C8 extension | Use `assigneeAgentId` instead of `actorId` |
| C14 | Agent Error Without Recovery | `agent.status_changed` | Auto-wake after 10s with retry prompt |
| C15 | YAML Model Not Applied | Plugin startup | Compare yaml vs Paperclip config, auto-PATCH |
| C16 | Scorecard on Wrong Issue | `issue.comment.created` | Body-text inference fallback |
| C17 | Lead No Route After QA | `issue.updated` | Auto-reassign to PO on QA done |
| C19 | Lead PASS Without QA Assignment | Scorecard handler | Auto-assign least-loaded QA |

## Pipeline Enforcement Flow

```
issue.created ──> auto-assign to CTO
                      │
issue.comment.created ──> CTO routing ──> auto-PATCH assignee [C1]
                      │
issue.comment.created ──> SPEC COMPLETE ──> check delegation [C7]
                      │
issue.updated (engineer, in_progress) ──> check SPEC COMPLETE [C2]
                      │
issue.updated (status=done, engineer) ──> check Lead Scorecard [C8]
                      │
issue.updated (assignee=qa) ──> check Lead Scorecard PASS [C9]
                      │
issue.comment.created ──> parse scorecard ──> enforce threshold [C5]
                      │
issue.updated (done, has QA PASS) ──> check PO Acceptance [C10]
                      │
agent.run.failed (qa) ──> escalation + fallback [C3]
                      │
agent.run.started ──> verify assigned issues [C4]
```

## See Also

- [[review-scorecard]] -- The quantitative review mechanism (C5)
- [[karpathy-engineering-principles]] -- P1 (Constraints First) drives the guardrail philosophy
- [[behavioral-profiling]] -- How signals inform directive injection
- [[agent-governance-overview]] -- How guardrails fit the complete governance loop


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
