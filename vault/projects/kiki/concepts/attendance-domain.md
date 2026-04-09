---
title: Attendance Domain
type: concept
category: domain-knowledge
tags: [domain, attendance, labor-law, scheduling, legacy-system]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[engineering-team]]"
  - "[[po-agent]]"
  - "[[planner-agent]]"
  - "[[compliance-gates]]"
created: 2026-04-07
updated: 2026-04-07
---

# Attendance Domain (근태관리)

Core domain knowledge for the legacy attendance management system. Covers 18 modules grouped into 4 domain skills.

## Module Groups

### Attendance (핵심 근태) — 4,713 lines
- **work** (2,732 lines) — core attendance CRUD, check-in/out, status tracking
- **schdul** (1,272 lines) — shift scheduling engine, constraint solver
- **shift** (413 lines) — shift type definitions, rotation rules
- **vcatn** (296 lines) — leave types, accrual rules, approval workflow

### Organization (조직) — 3,847 lines
- **admin** (1,578 lines) — system config, tenant settings, audit log
- **userinfo** (907 lines) — employee profiles, employment type
- **dept** (851 lines) — department hierarchy, cost centers
- **group** (399 lines) — cross-department groups
- **userauth** (112 lines) — SSO, LDAP, session management

### Reporting (보고) — 1,517 lines
- **report** (461 lines) — attendance summary, overtime, payroll export
- **common** (631 lines) — shared utilities, date/time helpers
- **ctmmny** (253 lines) — company settings, work policies, holiday calendar
- **dashboard** (172 lines) — real-time attendance status

### Communication (소통) — 898 lines
- **cmnt** (323 lines) — comments on attendance records
- **orde** (226 lines) — approval workflow (leave, overtime, schedule change)
- **contacts** (139 lines) — employee directory
- **alarm** (90 lines) — notification triggers
- **cnc** (65 lines) — external system connections
- **message** (55 lines) — in-app messaging

## Key Business Rules

- 52-hour workweek limit (근로기준법 제50조)
- Overtime: 1.5x regular, 2.0x holiday
- Night shift premium: 22:00-06:00
- Annual leave: 15 days base + 1 per 2 years
- Time records immutable after payroll export
- Approval chain: employee → manager → HR (configurable)
- Overtime alerts at 40h/48h/52h thresholds

## Related

- [[engineering-team]]
- [[po-agent]]
- [[planner-agent]]
- [[compliance-gates]]
- [[kiki]]
- [[lead-1]]
- [[index]]
- [[qa-1]]
