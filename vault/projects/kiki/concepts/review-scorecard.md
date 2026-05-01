---
title: Review Scorecard
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [review, scorecard, quality, enforcement, anti-deception]
sources: [_raw/global/projects/kiki-identity.md, _raw/global/projects/engineering-team-template.md]
---

# Review Scorecard

The Review Scorecard is Kiki's answer to [[pipeline-guardrails|Crack 5]] (No Quantitative Review Gate). Instead of binary PASS/FAIL judgments, every review uses a 6-dimension scoring system that produces a numeric total. This score is machine-parseable, trend-trackable, and plugin-enforceable.

## The 6 Dimensions

Each dimension is scored 0-5. The maximum total is 30/30.

| Dimension | What It Measures | 5 = Perfect | 0 = Fail |
|-----------|-----------------|-------------|----------|
| **Requirements** | PO acceptance criteria coverage | All ACs met with evidence | ACs not addressed |
| **Quality** | Build, lint, test pass | Zero warnings, clean output | Build fails |
| **Consistency** | API contract, naming, data mapping alignment | All layers aligned | Mismatches found |
| **Completeness** | Edge cases, error states, full scope coverage | All spec sections implemented | Core features missing |
| **Integrity** | Anti-deception ([[karpathy-engineering-principles|P4 Ratchet]]) | Clean diff, coverage maintained | Tests deleted or skipped |
| **Originality** | No duplicate logic, proper reuse | Unique or properly reused | Copy-paste from other modules |

### Integrity: The Anti-Deception Dimension

The Integrity dimension deserves special attention. It directly implements [[karpathy-engineering-principles|P4 (Anti-Deception Ratchet)]]:

- No tests deleted (`git diff --name-status | grep ^D`)
- No `skip` or `xit` added to test suites
- No lint rules disabled
- Coverage percentage must not decrease
- "Build passes" alone is not evidence of correctness

An Integrity score < 5 signals that the agent may have achieved "fake green" -- tests that pass but do not actually verify the change.

## Threshold and Verdicts

- **All dimensions >= 4 (minimum 24/30)**: **PASS** (Lead stage) or **ACCEPT** (PO stage)
- **Any dimension < 4**: **REWORK** (Lead stage) or **REJECT** (PO stage) -- dimensions scoring below 4 must be fixed

The threshold is designed to prevent both over-permissive reviews (rubber-stamping) and over-strict reviews (blocking on style nits). Any dimension below 4 indicates a substantive gap that warrants rework.

## 2-Stage Review Pipeline

The scorecard is applied at two distinct stages, by two different roles:

### Stage 1: Lead Review (Technical Quality)

After Dev completes implementation, the squad's Lead reviews using the scorecard. The Lead focuses on technical dimensions: does the code meet the spec, does it build, are tests adequate, is the diff clean?

```
Dev completes ──> Lead posts REVIEW SCORECARD
                      │
                  >= 24/30, all dims >= 4 ──> PASS ──> QA assignment
                      │
                  any dim < 4 ──> REWORK ──> back to Dev
```

### Stage 2: PO Acceptance (Requirements Verification)

After QA passes, the PO (spec author) re-reads their original spec and scores the output against it. This catches specification drift -- cases where the implementation diverged from what was originally requested.

```
QA PASS ──> PO posts PO ACCEPTANCE SCORECARD
                      │
                  >= 24/30, all dims >= 4 ──> ACCEPT ──> CTO release
                      │
                  any dim < 4 ──> REJECT ──> back to Lead ──> back to Dev
```

## Plugin Enforcement

The scorecard is not advisory -- it is enforced by the Kiki plugin via [[pipeline-guardrails|multiple crack guards]]:

### Scorecard Parsing (C5)

The `issue.comment.created` handler parses scorecard comments by detecting the `**TOTAL** | **/30**` pattern. If a scorecard is posted with a score below threshold and the issue is simultaneously marked `done`, the plugin auto-reverts to `in_progress`.

### Dev Self-Done Guard (C8)

When an engineer-role agent sets `status=done`, the handler checks for a Lead Scorecard with PASS in the issue comments. If no passing scorecard exists, auto-revert.

### QA Assignment Guard (C9)

When a QA-role agent is assigned an issue, the handler verifies that a Lead Scorecard PASS exists. No passing scorecard = blocked assignment.

### Release Gate (C10)

When an issue with QA PASS is marked `done`, the handler checks for PO Acceptance Scorecard with ACCEPT. Missing acceptance = auto-revert and reassign to PO.

### Auto-Routing After Lead PASS (C19)

When the scorecard handler detects a Lead Scorecard >= 24, it auto-assigns the issue to the least-loaded QA agent and wakes them. This prevents the "Lead PASS but no QA assignment" crack.

## Scorecard History and Trends

Scorecard data is stored per-agent in the Kiki plugin state. This enables:

- **Quality trend tracking**: Is an agent's average score improving or degrading over time?
- **Dimension weakness identification**: Does a specific agent consistently score low on Completeness?
- **Team-level quality metrics**: Aggregate scorecard data for team health assessment

## Scorecard Format (Comment Template)

```markdown
## REVIEW SCORECARD

| Dimension | Score | Notes |
|-----------|-------|-------|
| Requirements | 5 | All 3 ACs met with test evidence |
| Quality | 5 | Build clean, 0 warnings |
| Consistency | 4 | API naming follows convention |
| Completeness | 5 | Edge cases covered |
| Integrity | 5 | No tests deleted, coverage +2% |
| Originality | 5 | Proper reuse of existing utils |
| **TOTAL** | **29/30** | |

**Verdict**: PASS
```

## See Also

- [[pipeline-guardrails]] -- The enforcement system that makes scorecards binding
- [[karpathy-engineering-principles]] -- P4 (Anti-Deception Ratchet) underpins the Integrity dimension
- [[behavioral-profiling]] -- Scorecard trends feed back into agent profiling
- [[agent-governance-overview]] -- Where the scorecard fits in the full governance loop


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
