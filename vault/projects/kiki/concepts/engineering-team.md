---
title: Engineering Team
type: concept
category: team-structure
tags: [team, engineering, attendance-system, fifo, po-driven, legacy]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[cto-agent]]"
  - "[[po-agent]]"
  - "[[planner-agent]]"
  - "[[designer-agent]]"
  - "[[lead-1]]"
  - "[[lead-2]]"
  - "[[developer-1]]"
  - "[[developer-2]]"
  - "[[qa-1]]"
  - "[[qa-2]]"
  - "[[hub-spoke-pattern]]"
  - "[[budget-tiers]]"
  - "[[attendance-domain]]"
  - "[[mango]]"
created: 2026-04-07
updated: 2026-04-07
---

# Engineering Team (v3)

12-agent team for a legacy attendance management (근태관리) system. PO-driven spec pipeline with dual dev squads operating in FIFO mode.

## Structure

```
CEO
└── CTO (router)
    ├── PO (pm) ── spec authority
    │   ├── Planner (pm) ── requirements, labor law
    │   └── Designer (designer) ── UI/UX
    ├── Lead 1 (lead) ── Dev Squad 1
    │   ├── Developer 1 (engineer)
    │   └── QA 1 (qa)
    └── Lead 2 (lead) ── Dev Squad 2
        ├── Developer 2 (engineer)
        └── QA 2 (qa)
+ Kiki (profiler) ── CEO direct
```

## Workflow (FIFO Pipeline)

1. Issue created → [[cto-agent]] triages: spec-needed or ready-to-implement
2. Spec-needed → [[po-agent]] → [[planner-agent]] (requirements) + [[designer-agent]] (UI)
3. Spec complete → CTO assigns to [[lead-1]] or [[lead-2]] (FIFO: whichever is less loaded)
4. Lead scopes (codebase-map) → assigns to Developer → reviews diff
5. Review pass → Lead assigns to QA (same squad)
6. QA pass → Lead returns to CTO → release

## Domain Map (18 modules → 4 skills)

| Domain | Modules | Lines |
|--------|---------|-------|
| Attendance | work, schdul, shift, vcatn | ~4,713 |
| Organization | admin, userinfo, dept, group, userauth | ~3,847 |
| Reporting | report, common, ctmmny, dashboard | ~1,517 |
| Communication | cmnt, orde, contacts, alarm, cnc, message | ~898 |

See [[attendance-domain]] for business rules.

## Token Estimation

~1.4M tokens/day (~$4-6/day) for 8 issues/day.

## Scaling

Base 5 (CTO + PO + Planner + Designer + Kiki) + 3 per squad (Lead + Dev + QA).
Squads: 2→12, 3→15, 4→18.

## History

- v1: Hub-spoke with App Specialist (Superpowers pattern)
- v2: Lead = scope+review only, FE/BE Engineers under Lead
- v3: PO-driven spec pipeline, dual dev squads, attendance domain focus

## Legacy (v1/v2)
- [[lead-engineer-a]] — replaced by Lead 1 in v3
- [[lead-engineer-b]] — replaced by Lead 2 in v3
- [[app-specialist]] — removed in v2
- [[release-engineer]] — removed in v3

## Related

- [[kiki]]
- [[index]]
- [[paperclip-integration]]
- [[reporting-domain]]
- [[kiki-team-hub]]
