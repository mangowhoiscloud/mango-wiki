---
title: PO (Product Owner)
type: entity
category: agent
tags: [agent, pm, product-owner, spec-pipeline, attendance-system]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[engineering-team]]"
  - "[[planner-agent]]"
  - "[[designer-agent]]"
  - "[[cto-agent]]"
  - "[[attendance-domain]]"
created: 2026-04-07
updated: 2026-04-07
---

# PO (Product Owner)

Spec authority and domain knowledge hub for the attendance management system. Reports to [[cto-agent]]. Coordinates [[planner-agent]] and [[designer-agent]].

## Role

- Receives issues from CTO with domain tags
- Loads relevant domain skills (attendance, organization, reporting, communication)
- Delegates to Planner (requirements) and Designer (UI/UX)
- Compiles final spec with acceptance criteria, affected modules, test scenarios
- Returns completed spec to CTO for dev squad routing

## Domain Skills

All 4 domain skills loaded: attendance, organization, reporting, communication. Covers 18 modules across the legacy attendance system.

## Budget

Tier M (100K tokens). 4-hour heartbeat.

## Related

- [[kiki]]
- [[index]]
- [[kiki-team-hub]]
