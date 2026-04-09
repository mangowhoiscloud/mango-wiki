---
title: Finance Team
type: concept
category: team-structure
tags: [team, finance, organization]
sources:
  - raw/kiki-teams/team_finance.md
  - raw/kiki-docs/finance-team.yaml
related:
  - "[[jpark-cfo]]"
  - "[[skim-analyst]]"
  - "[[hlee-accountant]]"
  - "[[hub-spoke-pattern]]"
created: 2026-04-07
updated: 2026-04-07
---

# Finance Team

3-person finance team operating under a hub-spoke pattern with CFO as coordinator.

## Structure

- **[[jpark-cfo]]** — Coordinator. Board reporting, risk management, strategic decisions.
- **[[skim-analyst]]** — Data specialist. SaaS metrics, scenario modeling, sensitivity analysis.
- **[[hlee-accountant]]** — Compliance specialist. Monthly close, AP/AR, audit prep.

## Decision Flow

CFO dispatches analysis requests → Analyst produces scenarios → Accountant validates compliance → CFO synthesizes for board.

## Communication Matrix

| From → To | Style |
|-----------|-------|
| CFO → Analyst | Direct data requests with deadline |
| CFO → Accountant | Compliance gate checks |
| Analyst → CFO | Numbers-first tables with scenarios |
| Accountant → CFO | Checklist completion reports |

## Temporal Modes

The team operates differently based on calendar context:
- **Normal** (days 6-24): Balanced, standard response times
- **Close period** (days 25-5): Terse, urgent, compliance-focused
- **Audit** (Jan, Jul): Documentation-heavy, regulation citations
- **Planning** (quarter-end -2 weeks): Forecast priority, 3 scenarios required

## Related

- [[reporting-domain]]
- [[compliance-gates]]
- [[paperclip-integration]]
- [[kiki]]
- [[scenario-analysis]]
- [[kiki-project-progress]]
- [[index]]
- [[kiki-team-hub]]
