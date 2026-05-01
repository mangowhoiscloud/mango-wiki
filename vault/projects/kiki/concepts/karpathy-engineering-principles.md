---
title: Karpathy Principles (P1-P5)
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [principles, karpathy, governance, philosophy, constraints]
sources: [_raw/global/projects/kiki-identity.md]
---

# Karpathy Principles (P1-P5)

Five foundational principles that govern all Kiki operations, agent behavior, and system design. Named after the LLM Wiki pattern they were inspired by, these principles are embedded in KIKI.md, injected into every agent's grounding policy, and enforced through [[pipeline-guardrails|plugin-level guardrails]].

## P1: Constraints First

> *Define what CANNOT be done before what can.*

Kiki's CLAUDE.md and grounding policy lead with prohibitions. The CANNOT section comes before MUST. The grounding policy opens with "Absolute Prohibition -- violation = immediate stop."

**Rationale**: Constraints guarantee quality; features don't. A system that says "you should write tests" will sometimes skip them. A system that says "you CANNOT mark done without tests" enforces the behavior.

**Where it appears**:
- CLAUDE.md CANNOT section (7 prohibitions before any MUST rules)
- Grounding policy CANNOT section (injected into every agent system prompt)
- [[pipeline-guardrails|Plugin guardrails]] (hard enforcement layer for critical constraints)
- [[review-scorecard|Review Scorecard]] threshold (any dimension < 4 = mandatory rework)

## P2: Explore Before Act

> *Every code change follows Explore, then Reason, then Act.*

No file is edited without first reading it. No symbol is referenced without grepping for it. No implementation starts without searching project documentation first (QMD or grep fallback).

**The 3-Step Cycle**:

1. **Explore**: QMD search + read target files + grep for symbols + check callers/callees. Do NOT edit a file you have not read.
2. **Reason**: State observation ("I confirmed X"), hypothesis ("root cause is Y"), prediction ("fixing Y resolves A, B, C").
3. **Act**: Apply minimal change, run tests immediately. If new errors, return to Explore.

**Where it appears**:
- Grounding policy MUST section (mandatory for every agent work unit)
- [[behavioral-profiling|Planner agent behavior]] (file:line level precision during impact analysis)
- Pre-implementation QMD document search requirement

## P3: Minimal Viable Change

> *One change at a time. Verify after each step.*

Never batch unrelated changes into a single commit. Small diffs are reviewable diffs. Each commit should be independently understandable and revertable.

**Rationale**: Large, batched changes are the enemy of review quality. When a commit contains 5 unrelated changes, reviewers skim. When it contains 1 focused change, they scrutinize. The [[review-scorecard]] becomes meaningless if applied to a 500-line diff spanning multiple concerns.

**Where it appears**:
- Git workflow rules (conventional commits, feature branches)
- Dev agent work patterns (着手 declaration, implementation, PR -- 3-step cycle)
- [[review-scorecard|Completeness dimension]] (full scope, but only the assigned scope)

## P4: Anti-Deception Ratchet

> *No fake green. Tests passing is not evidence of correctness.*

Coverage must not decrease. No tests deleted. No skips added. No lint rules disabled. Specific test cases with expected vs. actual output are the only valid evidence.

**The Ratchet Metaphor**: Quality can only move forward. Each verification step tightens the ratchet -- it cannot slip backward. If a Dev deletes a failing test to make CI green, the ratchet has been defeated, and the [[review-scorecard|Integrity dimension]] catches it.

**Detection mechanisms**:
- `git diff --name-status | grep ^D` -- detect deleted test files
- Coverage comparison (before vs. after)
- Skip/xit pattern detection in test suites
- [[review-scorecard|Integrity score]] < 5 triggers REWORK

**Where it appears**:
- Grounding policy Anti-Deception section
- [[review-scorecard|Integrity dimension]] (scored 0-5)
- [[pipeline-guardrails|C5]] (scorecard enforcement) and [[pipeline-guardrails|C8]] (Dev self-done guard)

## P5: Git as State Machine

> *Commit = evidence. No commit = no work.*

Every completion report must include `git log`, `git diff --stat`, and test output. Claims without git evidence are rejected. The git history is the single source of truth for what was actually done.

**State transitions**:
```
No commits ──> "No work done" (regardless of claims)
Commit exists ──> "Work done" (verifiable via SHA)
Test output ──> "Work verified" (specific results, not just pass/fail)
```

**Where it appears**:
- CLAUDE.md MUST section: "All agent work reports MUST include git evidence"
- Grounding policy MUST section: "`git log --oneline -3`, `git diff --stat`, test command + result"
- [[pipeline-guardrails]] (every enforcement action is logged and traceable)
- [[review-scorecard|Quality dimension]] (build/lint/test pass required)

## Principles in Practice

The five principles form a coherent system:

```
P1 Constraints First     ──> Define the boundaries
P2 Explore Before Act    ──> Understand within boundaries
P3 Minimal Viable Change ──> Act within boundaries (small steps)
P4 Anti-Deception Ratchet ──> Verify the action was genuine
P5 Git as State Machine  ──> Record the evidence permanently
```

Each principle addresses a specific failure mode of LLM agents:
- P1 prevents hallucinated capabilities
- P2 prevents blind code modification
- P3 prevents unreviewable batches
- P4 prevents fake verification
- P5 prevents unsubstantiated claims

## See Also

- [[pipeline-guardrails]] -- Hard enforcement of P1 constraints
- [[review-scorecard]] -- P4 ratchet implemented as a scoring system
- [[behavioral-profiling]] -- P2 (Explore) visible in Planner behavior
- [[llm-wiki-pattern]] -- Karpathy's original pattern that inspired these principles
- [[agent-governance-overview]] -- How P1-P5 thread through the entire governance system


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
