---
title: Behavioral Profiling
type: concept
created: 2026-04-14
updated: 2026-04-14
tags: [profiling, signals, privacy, core-loop, observation]
sources: [_raw/global/projects/kiki-identity.md, _raw/global/projects/engineering-team.md, _raw/global/projects/finance-team.md]
---

# Behavioral Profiling

Behavioral profiling is the foundational mechanism of the [[karpathy-engineering-principles|Kiki system]]. Rather than storing what people say, Kiki extracts *how* they work -- communication cadence, decision patterns, expertise signals, and collaboration dynamics -- and encodes these observations into structured profiles that drive agent optimization.

## Core Principle: Signals Only, Never Raw Text

Kiki enforces a strict **privacy-by-design** boundary at every layer:

- **Slack to Kiki**: Only behavioral signals cross this boundary. Raw message text is never persisted, logged, or transmitted beyond the observation window.
- **Kiki to Paperclip**: Only agent directives cross this boundary. User PII is never embedded in system prompts.
- **Kiki to Obsidian**: Only structured profiles cross this boundary. Secrets and tokens are excluded.

This is not a guideline -- it is a CANNOT rule enforced in CLAUDE.md and the [[pipeline-guardrails|grounding policy]].

## The 4-Axis Profile Model

Every user profile is structured around four behavioral axes:

### 1. Communication Patterns

How the person communicates: preferred format (bullet lists, prose, code blocks), message length, tone (formal vs. casual), and response latency. For example, the CTO in the [[engineering-team|engineering team]] uses short bullet messages (3 lines or fewer) with a neutral tone, while the PO uses detailed bullets with formal tone and regulatory citations.

### 2. Decision Patterns

How the person makes decisions: data-driven vs. intuitive, escalation speed, risk tolerance, delegation behavior. The CFO in the [[finance-team|finance team]] demonstrates immediate escalation on risk items (SMB NRR 88% triggered same-day board escalation), while the Analyst presents multiple scenarios with explicit assumptions before any recommendation.

### 3. Work Patterns

How the person structures their work: active hours, cycle time, task sequencing, role boundary adherence. Lead 1 in the engineering team follows a strict 4-message cycle (Scope, Assign, Review, QA handoff) and never implements directly. The finance team's Accountant exhibits a close-period pattern with morning-concentrated work and 100% checklist completion rituals.

### 4. Expertise Signals

What domains and tools the person demonstrates competence in: file-level code knowledge, regulatory expertise, analytical depth. The Planner identifies impact at the file:line level (e.g., `WorkOvertimeCalculator.java L:142-189`), while the Accountant gates every action through compliance verification.

## Observation Pipeline

```
Slack Channels ──/kiki-observe──> Signal Extraction ──/kiki-refresh──> Profile Update
                                       │
                                  Confidence Scores (0.0–1.0)
                                  Context Tags (close_period, normal_period)
                                  Temporal Markers (active hours, response latency)
```

Each observation produces signals tagged with:

- **Signal type**: `work_patterns`, `communication_patterns`, `decision_patterns`, `expertise_signals`
- **Confidence score**: 0.0 to 1.0, reflecting how strongly the evidence supports the signal
- **Context mode**: The situational context during observation (e.g., `q2_initial_observation`, `close_period`, `normal_period`)

Signals are aggregated over time. Confidence scores increase with repeated observation of the same pattern.

## From Profiles to Directives

Profiles are not just documentation -- they drive real-time agent behavior through the [[karpathy-engineering-principles|advise loop]]:

1. `/kiki-refresh` compiles signals into structured profile JSON
2. `/kiki-advise` transforms profiles into per-agent directives
3. Directives are injected into Paperclip agent system prompts at creation time via the `kiki.profile-injector` plugin
4. `/kiki-export` syncs profiles to the Obsidian wiki for human review via the [[llm-wiki-pattern|LLM Wiki pattern]]

## Team Aggregation

Individual profiles are rolled up into team-level aggregates that capture collective dynamics:

- **Communication matrix**: Who prefers what format, at what speed
- **Workflow patterns**: The team's end-to-end issue completion flow
- **Role separation culture**: How strictly role boundaries are maintained
- **Quantification culture**: Whether the team demands numeric evidence

See [[engineering-team]] and [[finance-team]] for concrete examples.

## See Also

- [[pipeline-guardrails]] -- How guardrails enforce signal-only extraction
- [[review-scorecard]] -- How review quality is quantified
- [[agent-governance-overview]] -- The complete governance loop


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
