---
title: Kiki Team Hub
type: concept
category: hub
tags: [hub, team, agents, attendance-system]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[kiki]]"
  - "[[engineering-team]]"
  - "[[finance-team]]"
created: 2026-04-07
updated: 2026-04-07
---

# Kiki Team Hub

Paperclip 에이전트 팀 중앙 인덱스.

## Engineering Team (v3) — 12 agents

```
CEO
└── CTO → [[cto-agent]]
    ├── PO → [[po-agent]]
    │   ├── [[planner-agent]]
    │   └── [[designer-agent]]
    ├── Lead 1 → [[lead-1]]
    │   ├── [[developer-1]]
    │   └── [[qa-1]]
    └── Lead 2 → [[lead-2]]
        ├── [[developer-2]]
        └── [[qa-2]]
+ Kiki (profiler)
```

### PO Team (spec pipeline)
- [[po-agent]] — Spec authority, domain knowledge hub
- [[planner-agent]] — Requirements, labor law, acceptance criteria
- [[designer-agent]] — UI/UX, dashboard, mobile

### Dev Squad 1
- [[lead-1]] — Scope + review (attendance, organization domains)
- [[developer-1]] — Implementation
- [[qa-1]] — Verification, regression

### Dev Squad 2
- [[lead-2]] — Scope + review (reporting, communication domains)
- [[developer-2]] — Implementation
- [[qa-2]] — Verification, regression

### Shared
- [[cto-agent]] — Issue triage, FIFO routing

## Finance Team — 3 agents

- [[jpark-cfo]] — CFO, executive summary style
- [[skim-analyst]] — Financial Analyst
- [[hlee-accountant]] — Accountant

See [[finance-team]] for details.

## Legacy (archived)

- [[lead-engineer-a]] · [[lead-engineer-b]] — replaced by Lead 1/2
- [[app-specialist]] — removed in v2
- [[release-engineer]] — removed in v3

## Related

- [[engineering-team]] — Team structure concept
- [[budget-tiers]] — Agent token budgets
- [[kiki-domain-hub]] — Domain knowledge
- [[kiki-pipeline-hub]] — Observation pipeline
