---
title: "Karpathy P1–P5 (KIKI.md identity)"
category: governance
created: 2026-04-29
updated: 2026-05-01
tags: [karpathy, principles, governance, identity]
sources:
  - "kiki/KIKI.md"
---

# Karpathy P1–P5

The five principles KIKI.md uses as its core identity. Listed verbatim from KIKI.md, with one-line operational implications drawn from how the principles actually constrain decisions across this repo.

| # | Principle | What it means here |
|---|---|---|
| **P1** | Evals first | Every behavioural claim should be verifiable. Plugin guards have vitest coverage; doctor.sh phases are CI-ratcheted; PR descriptions cite test counts and command output, not assertions. |
| **P2** | Simplicity | Default to no abstraction. The plugin runs as a single bundled file; bootstrap is a 184-line shell script (not a framework); skills are markdown — no config, no DSL. |
| **P3** | Verification | Trust git, not memory. CLAUDE.md mandates that every claim of "feature X exists / works" must trace to commit SHA + diff + test result. Memory drift is a known failure mode. |
| **P4** | Reproducibility | One command sets it up on any machine. `scripts/bootstrap.sh --non-interactive --env-file <f> --target <repo>` is the contract. No machine-specific state baked in. |
| **P5** | User-first | Optimise for the operator, not the model. Output explains *why* something failed and *how* to fix it; errors include the next command to run. |

## How they interact with rules in CLAUDE.md

CLAUDE.md's CANNOT/MUST list is an enforcement layer over P1–P5:

- "no fabricated paths/lines" enforces **P3 verification**.
- "no main commits" + "feature branches required" enforces **P4 reproducibility** (every change is reviewable as a unit).
- "all signals are behavioural — never raw text" enforces **P1 evals** (raw text is unverifiable; behavioural patterns can be re-derived).
- "cross-repo sync points must be honoured" enforces **P4** (no orphan local copies).
- "all system prompts in English" enforces **P2 simplicity** (single canonical language in Claude's discovery layer).

## Where these get tested

- [[2026-04-28-session-synthesis]] — pattern thread demonstrates P1 (test-driven additions to ratchet) + P3 (live evidence drove the redesign that fixed PIN-63) + P5 (operator-facing error messages).
- [[pipeline-guardrails]] §C21 (Reassign Without Wake) — the most-relied-on guard's tests are an explicit P1 instance. Also catalogued in [[kiki-scorecard-guards]].


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
