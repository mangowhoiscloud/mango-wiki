---
title: Agent Governance Overview
type: synthesis
created: 2026-04-14
updated: 2026-04-14
tags: [governance, synthesis, architecture, complete-loop]
sources: [_raw/global/projects/kiki-identity.md, _raw/global/projects/engineering-team-template.md, _raw/global/projects/engineering-team.md, _raw/global/projects/finance-team.md, _raw/global/projects/diagram-config.md]
---

# Agent Governance Overview

This page synthesizes how all Kiki subsystems work together to form a complete governance loop for LLM agent teams. Each system addresses a different failure mode; together, they create a self-reinforcing cycle where agent quality improves over time.

## The Complete Governance Loop

```
         ┌───────────────────────────────────────────────────────┐
         │                                                       │
    Slack Observation                                     Wiki Knowledge
    (/kiki-observe)                                      (/kiki-export)
         │                                                       ▲
         ▼                                                       │
    Signal Extraction ──────────────────────────────────── Profile Data
    (behavioral signals only)                             (structured JSON)
         │                                                       ▲
         ▼                                                       │
    Profile Compilation ────────> Agent Directives ────> Directive Injection
    (/kiki-refresh)               (/kiki-advise)         (plugin event handler)
                                                                 │
                                                                 ▼
                                                          Paperclip Agents
                                                          (work on issues)
                                                                 │
                                                                 ▼
                                                          Pipeline Guardrails
                                                          (21-crack enforcement)
                                                                 │
                                                                 ▼
                                                          Review Scorecard
                                                          (6-dim quality gate)
                                                                 │
                                                                 ▼
                                                          Scorecard History ──┐
                                                          (trend tracking)    │
                                                                              │
         ┌────────────────────────────────────────────────────────────────────┘
         │
         ▼
    Quality Feedback ──> Profile Refinement ──> Better Directives ──> Improved Work
```

## Five Subsystems

### 1. Behavioral Profiling

**What**: [[behavioral-profiling]] extracts work-style signals from Slack channels -- communication patterns, decision speed, expertise domains, active hours. Never raw text, only behavioral metadata.

**Why**: Agents are generic by default. A system prompt can say "be concise," but it cannot say "this Lead reviews in 4 messages and never implements directly" without observational data. Profiling makes agents context-aware.

**How it connects**: Profiles feed into directive generation (/kiki-advise), which injects per-agent behavioral tuning into Paperclip system prompts. Profiles also export to the wiki for human review.

### 2. Team Provisioning

**What**: The engineering team template (`engineering-team.yaml`) defines team structure, role assignments, routing strategy, grounding policy, and domain skills. Kiki's `/kiki-setup` skill bootstraps the full Paperclip environment from this template.

**Why**: Without a structured template, agent teams emerge ad hoc. Roles blur, responsibilities overlap, and the pipeline has no defined handoff points. The template is the blueprint that makes guardrails possible.

**Team structures observed**:

- **[[engineering-team|Engineering Team]]**: CTO (router) -> PO (spec) + Planner (requirements) -> dual dev squads (Lead + Dev + QA each). 18 domains across 4 groups (attendance, organization, reporting, communication). Targets the [[ttree-project|TTree legacy system]].

- **[[finance-team|Finance Team]]**: CFO (decision/escalation) -> Analyst (data/scenarios) + Accountant (compliance/execution). Close-period behavioral patterns, quarterly rhythms.

### 3. Pipeline Guardrails

**What**: [[pipeline-guardrails]] is a system of 21 identified crack points where agents can silently skip phases. Each crack has a plugin-level event handler that detects violations and auto-reverts state.

**Why**: YAML instructions are suggestions to an LLM, not constraints. An agent can "forget" to post a scorecard, or "decide" that a step is unnecessary. Event-driven enforcement catches these failures after they occur and reverts them automatically.

**Key enforcement points**:
- Spec gate (C2): No Dev work without PO spec
- Scorecard enforcement (C5): No done without quantitative review
- Self-done guard (C8): No bypassing Lead review
- Acceptance gate (C10): No release without PO acceptance
- Load balancing (C18): No single-agent bottlenecks
- Wake enforcement (C11, C21): No orphaned issues

### 4. Review Scorecard

**What**: [[review-scorecard]] provides a 6-dimension scoring system (Requirements, Quality, Consistency, Completeness, Integrity, Originality) applied at two stages (Lead technical review + PO acceptance review).

**Why**: Binary PASS/FAIL reviews are subjective and ungranular. A scorecard makes quality measurable, trackable, and enforceable. The Integrity dimension specifically implements [[karpathy-engineering-principles|P4 (Anti-Deception Ratchet)]] -- detecting deleted tests, added skips, and fake green.

**How it connects**: Scorecard data is stored per-agent in plugin state. Over time, this creates a quality trend profile that feeds back into [[behavioral-profiling|profiling]] -- if an agent consistently scores low on Completeness, its directives can be adjusted to emphasize thorough implementation.

### 5. LLM Wiki

**What**: [[llm-wiki-pattern]] provides a 3-layer knowledge architecture (raw sources -> wiki pages -> schema) where an LLM compiles operational data into an interconnected knowledge base viewable in Obsidian.

**Why**: Agent teams generate enormous volumes of artifacts (specs, reviews, scorecards, signals, profiles). Without compilation, this data is write-only -- no one reads it. The wiki makes it searchable, navigable, and reviewable by humans.

**How it connects**: The wiki is the human interface to the governance system. Operators review compiled profiles, spot quality trends, identify governance gaps, and adjust templates/guardrails accordingly. This closes the loop.

## Foundational Philosophy

All five subsystems are grounded in [[karpathy-engineering-principles|Karpathy Principles P1-P5]]:

| Principle | Subsystem Connection |
|-----------|---------------------|
| P1: Constraints First | Guardrails define CANNOT before CAN; grounding policy leads with prohibitions |
| P2: Explore Before Act | Profiling is exploration of human work patterns; agents explore code before modifying |
| P3: Minimal Viable Change | One issue at a time, one commit per change, reviewable diffs |
| P4: Anti-Deception Ratchet | Scorecard Integrity dimension; no deleted tests, no fake green |
| P5: Git as State Machine | Every claim requires git evidence; raw sources are append-only truth |

## Governance Layers (Defense in Depth)

```
Layer 1 — YAML Instructions (grounding_policy)
  "You SHOULD post a scorecard before marking done"
  Strength: Guides LLM behavior in the common case
  Weakness: Probabilistic — agent may skip under token pressure

Layer 2 — Plugin Event Handlers (21-crack system)
  "If done AND no scorecard → auto-revert"
  Strength: Deterministic enforcement, catches what YAML misses
  Weakness: Can only check events Paperclip emits

Layer 3 — Review Scorecard (quantitative gates)
  "Score < 24/30 or any dimension < 4 → REWORK"
  Strength: Granular quality measurement, trend tracking
  Weakness: Scorecard quality depends on reviewer agent

Layer 4 — Human Review (wiki + dashboard)
  "Operator reviews profiles, scorecards, pipeline health"
  Strength: Ultimate authority, can adjust any layer
  Weakness: Scales with human attention
```

Each layer catches failures that slip through the previous one. No single layer is sufficient alone.

## Data Flow Summary

```
Slack ──signals──> Profiles ──directives──> Agents ──work──> Issues
                                                                │
                                              Guardrails ◄──events──┘
                                                   │
                                              Scorecards ──history──> Trends
                                                   │
                                              Wiki ──pages──> Human Review
                                                                │
                                              Adjustments ◄─────┘
```

## See Also

- [[behavioral-profiling]] -- Subsystem 1 deep dive
- [[pipeline-guardrails]] -- Subsystem 3 deep dive
- [[review-scorecard]] -- Subsystem 4 deep dive
- [[karpathy-engineering-principles]] -- Foundational philosophy
- [[llm-wiki-pattern]] -- Subsystem 5 deep dive
- [[ttree-project]] -- The target project where governance is applied


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
