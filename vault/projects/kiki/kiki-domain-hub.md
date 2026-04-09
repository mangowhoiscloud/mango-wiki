---
title: Kiki Domain Hub
type: concept
category: hub
tags: [hub, domain, attendance-system, legacy]
sources:
  - raw/kiki-docs/engineering-team.yaml
related:
  - "[[kiki]]"
  - "[[attendance-domain]]"
  - "[[kiki-team-hub]]"
created: 2026-04-07
updated: 2026-04-07
---

# Kiki Domain Hub

근태관리 시스템 18개 모듈의 도메인 지식 중앙 인덱스.

## 4 Domain Groups

### Attendance (근태) — 4,713 lines
| Module | Lines | Description |
|--------|-------|-------------|
| work | 2,732 | Core attendance CRUD, check-in/out |
| schdul | 1,272 | Shift scheduling engine |
| shift | 413 | Shift type definitions, rotation |
| vcatn | 296 | Leave types, accrual, approval |

### Organization (조직) — 3,847 lines
| Module | Lines | Description |
|--------|-------|-------------|
| admin | 1,578 | System config, tenant settings |
| userinfo | 907 | Employee profiles, employment type |
| dept | 851 | Department hierarchy, cost centers |
| group | 399 | Cross-department groups |
| userauth | 112 | SSO, LDAP, session |

### Reporting (보고) — 1,517 lines
| Module | Lines | Description |
|--------|-------|-------------|
| report | 461 | Attendance summary, payroll export |
| common | 631 | Shared utilities, date/time |
| ctmmny | 253 | Company settings, holiday calendar |
| dashboard | 172 | Real-time attendance status |

### Communication (소통) — 898 lines
| Module | Lines | Description |
|--------|-------|-------------|
| cmnt | 323 | Comments on attendance records |
| orde | 226 | Approval workflow |
| contacts | 139 | Employee directory |
| alarm | 90 | Notification triggers |
| cnc | 65 | External connections |
| message | 55 | In-app messaging |

## Key Business Rules

See [[attendance-domain]] for full rules.

- 52-hour workweek limit (근로기준법 제50조)
- Overtime: 1.5x regular, 2.0x holiday
- Night shift premium: 22:00-06:00
- Time records immutable after payroll export

## Domain → Team Mapping

| Domain | Primary Lead | Skill |
|--------|-------------|-------|
| Attendance | [[lead-1]] | `attendance-domain` |
| Organization | [[lead-1]] | `organization-domain` |
| Reporting | [[lead-2]] | `reporting-domain` |
| Communication | [[lead-2]] | `communication-domain` |

## Related

- [[attendance-domain]] — Business rules detail
- [[compliance-gates]] — Regulatory checkpoints
- [[kiki-team-hub]] — Agent team
- [[kiki-pipeline-hub]] — Observation pipeline
