---
title: TTree Project Context
type: synthesis
created: 2026-04-14
updated: 2026-04-14
tags: [ttree, target-project, legacy, attendance, domains]
sources: [_raw/global/projects/kiki-identity.md, _raw/global/projects/engineering-team-template.md, _raw/global/projects/diagram-config.md, _raw/global/projects/engineering-team.md]
---

# TTree Project Context

TTree is the target project that Kiki's [[engineering-team|engineering team]] works against. It is a legacy attendance management system (Korean: 근태관리) that provides clock-in/out tracking, shift management, leave management, and organizational administration for enterprise customers.

## Why TTree Was Chosen

TTree represents an ideal test case for [[agent-governance-overview|agent governance]] because it has properties that stress-test every part of the pipeline:

- **Legacy codebase**: Large, established Java codebase with accumulated tech debt. Agents cannot make assumptions -- they must explore before acting ([[karpathy-engineering-principles|P2]]).
- **Regulatory constraints**: Korean labor law (근로기준법) compliance requirements. The PO must cite specific articles (e.g., Article 56 for overtime calculations) in specs. Agents cannot wing it.
- **Domain complexity**: 19 distinct functional domains across 4 domain groups. Agents need domain-specific knowledge to avoid cross-cutting regressions.
- **Real production data patterns**: Night shift overtime splits at 22:00, N+1 query problems with department hierarchies, multi-tenant company management. These are not toy problems.

## Tech Stack

- **Backend**: Java (Spring-based, inferred from class naming conventions like `WorkOvertimeCalculator.java`, `ShiftNightDetector.java`)
- **Architecture**: Domain-driven application modules under `ttree-core/application/`
- **Testing**: JUnit-style tests (test counts reported in QA reviews: "existing 23 tests + 5 added")

## 19 Domains Across 4 Groups

The codebase is organized into 19 functional domains, mapped to 4 domain groups. This mapping drives the engineering team's dual-squad structure and the PO's domain skill routing.

### Attendance Group (4 domains)

| Domain | Slug | Description | Key Patterns |
|--------|------|-------------|-------------|
| Work Management | `work` | Clock-in/out, work time tracking, gate log sync | Largest domain (2732 refs). Night shift overtime calculation (TimeRange.splitAt(22:00)) |
| Schedule Management | `schdul` | Work calendar, staggered/flexible hours, core time | Second largest (1272 refs). Interacts heavily with `work` for night shift detection |
| Shift Rotation | `shift` | Shift groups, worktime masters, auto-schedule | 413 refs. ShiftNightDetector.java manages 22:00 boundary logic |
| Vacation/Leave | `vcatn` | Annual leave, leave request/approval, compensation leave | 296 refs. Labor law Article 56 compliance |

### Organization Group (5 domains)

| Domain | Slug | Description | Key Patterns |
|--------|------|-------------|-------------|
| System Config | `admin` | 3-tier settings, common codes, holidays, RBAC | 1578 refs. Cross-cutting configuration |
| User Info | `userinfo` | User profile, account management | 907 refs |
| Department | `dept` | Department hierarchy, org chart | 851 refs. N+1 query source (50 depts x 30 employees = 1500 queries) |
| Group | `group` | User groups, team management | 399 refs |
| Authentication | `userauth` | Login, session, authority management | 112 refs |

### Reporting Group (4 domains)

| Domain | Slug | Description | Key Patterns |
|--------|------|-------------|-------------|
| Report | `report` | Attendance reports, statistics | 461 refs |
| Common | `common` | Shared utilities, file management | 631 refs. Cross-cutting utility layer |
| Company | `ctmmny` | Company management, multi-tenant | 253 refs |
| Dashboard | `dashboard` | Dashboard statistics, read-only aggregation | 172 refs. Performance-critical (N+1 fix: 1500 to 3 queries, 5.2s to 0.4s) |

### Communication Group (5 domains)

| Domain | Slug | Description | Key Patterns |
|--------|------|-------------|-------------|
| Comment | `cmnt` | Task comments, mentions | 323 refs |
| Order/Request | `orde` | Work orders, task requests | 226 refs |
| Contacts | `contacts` | Employee contacts directory | 139 refs |
| Alarm/Notification | `alarm` | Push notifications, alerts | 90 refs |
| CNC (Compensation) | `cnc` | Overtime compensation leave lookup | 65 refs |
| Message | `message` | Internal messaging | 55 refs |

## Squad Domain Assignment

The [[engineering-team|engineering team]] uses a dual-squad structure with domain partitioning:

- **Squad 1** (Lead 1 + Dev 1 + QA 1): attendance + organization domains
- **Squad 2** (Lead 2 + Dev 2 + QA 2): reporting + communication domains

This partitioning minimizes cross-squad conflicts while ensuring each squad has a coherent domain scope. The PO handles cross-domain specs by delegating to the appropriate squad's Lead.

## How Agents Work Against TTree

### Issue Lifecycle (Observed)

A typical TTree issue follows this path:

```
Bug/feature reported
    -> CTO: domain tagging ("work + schdul domain") + routing (1 msg)
    -> PO: delegates to Planner for impact analysis
    -> Planner: file:line analysis (WorkOvertimeCalculator.java L:142-189)
    -> PO: compiles spec with labor law citations (Article 56)
    -> Lead: scopes to specific files, assigns to Dev
    -> Dev: implements (TimeRange.splitAt(22:00)), reports test counts
    -> Lead: LGTM review with specific technical feedback
    -> QA: structured PASS/FAIL report with regression test counts
    -> Lead: handoff to CTO
    -> CTO: release approval
```

Total: approximately 11 messages to complete an issue.

### Observed Issue Examples

| Issue | Squad | Approach | Result |
|-------|-------|----------|--------|
| Night shift overtime calculation bug | Squad 1 | TimeRange.splitAt(22:00) approach, labor law Article 56 compliance | PASS -- 5 tests added to existing 23 |
| Dashboard performance (N+1 query) | Squad 2 | Root cause: dept x employees = 1500 queries. Fix: batch fetch | 1500 to 3 queries, 5.2s to 0.4s |

### Governance Application

TTree exercises all [[agent-governance-overview|governance subsystems]]:

- **[[behavioral-profiling|Profiling]]**: Agent work patterns on TTree issues (Dev 1's 3-step cycle, Lead 1's never-implement boundary) feed profile data
- **[[pipeline-guardrails|Guardrails]]**: Spec gate (C2) ensures PO writes labor-law-compliant specs before Dev starts. Scorecard (C5) prevents unreviewed overtime logic from shipping.
- **[[review-scorecard|Scorecard]]**: Lead reviews check Completeness (are all edge cases like 22:00 boundary covered?) and Integrity (are the 23 existing tests still passing?)
- **[[llm-wiki-pattern|Wiki]]**: Issue artifacts, agent observations, and domain knowledge compile into navigable wiki pages

## Domain Skills

Rather than creating separate agents per domain (which would be token-wasteful), TTree domain knowledge is encoded as Paperclip Company Skills:

- `attendance` skill: work, schdul, shift, vcatn modules
- `organization` skill: admin, userinfo, dept, group, userauth modules
- `reporting` skill: report, common, ctmmny, dashboard modules
- `communication` skill: cmnt, orde, contacts, alarm, cnc, message modules

PO and Planner consume these skills during spec compilation. Devs and QAs consume them during implementation and verification.

## See Also

- [[engineering-team]] -- The team that works on TTree
- [[pipeline-guardrails]] -- Guardrails enforced during TTree development
- [[behavioral-profiling]] -- Profiles extracted from TTree work patterns
- [[agent-governance-overview]] -- The complete governance loop applied to TTree


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
