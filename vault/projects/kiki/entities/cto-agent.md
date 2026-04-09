---
title: CTO
type: entity
category: agent
tags: [agent, cto, router, triage, attendance-system]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[engineering-team]]"
  - "[[po-agent]]"
  - "[[lead-1]]"
  - "[[lead-2]]"
  - "[[hub-spoke-pattern]]"
created: 2026-04-07
updated: 2026-04-07
---

# CTO

Issue triage and routing for the attendance management system. Reports to CEO.

## Role (v3)

1. New issue → classify: spec-needed or ready-to-implement
2. Spec-needed → assign to [[po-agent]] with domain tag
3. Ready-to-implement → assign to [[lead-1]] or [[lead-2]] (FIFO)
4. After QA pass → mark ready for release

Does NOT implement, review code, or write specs.

## Budget

Tier S (30K tokens). Event-driven, no heartbeat.

## Related

- [[kiki]]
- [[index]]
- [[kiki-team-hub]]
