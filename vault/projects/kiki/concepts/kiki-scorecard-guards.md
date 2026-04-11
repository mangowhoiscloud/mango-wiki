---
title: Kiki Scorecard Guards — C1-C21 Workflow Guardrails
type: concept
tags: [kiki, scorecard, guardrails, workflow, quality]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Scorecard Guards

24개 이벤트 핸들러가 이슈 라이프사이클 전체를 제어. Lead/PO Scorecard로 품질 게이트 강제.

## Key Guards

| Guard | Rule | Trigger |
|-------|------|---------|
| C2 | PO Spec Gate — 모든 이슈는 PO 스펙을 거쳐야 함 | issue.updated |
| C8 | Engineer self-done 차단 — Lead Scorecard PASS 필요 | issue.updated |
| C9 | QA 배정 차단 — Lead Scorecard PASS 없이 QA 불가 | issue.updated |
| C10 | Release 차단 — PO Acceptance Scorecard 없이 릴리스 불가 | issue.updated |
| C14 | Error 자동 복구 — 에러 상태 에이전트 10초 후 auto-wake | agent.status_changed |
| C17 | QA→PO 자동 라우팅 — QA PASS 시 PO Acceptance로 전달 | issue.updated |
| C18 | 로드 밸런싱 — 대상이 2+ 더 바쁘면 least-loaded peer로 재배정 | issue.updated |
| C19 | Lead→QA 자동 라우팅 — Lead Scorecard PASS 시 least-loaded QA 배정 | issue.comment |
| C20 | Backlog 자동 승격 — assignee 있는 backlog를 todo로 | issue.updated |
| C21 | 재배정 시 auto-wake | issue.updated |

## Scorecard Format

```
| Dimension | Score | Evidence |
|-----------|-------|----------|
| Requirements | /5 | Each AC met/unmet |
| Quality | /5 | Code cleanliness |
| Consistency | /5 | Spec data mapping |
| Completeness | /5 | All sections implemented |

Total: >= 24/30 (all >= 4) → PASS
```

## Issue Flow

```
issue.created → CTO triage → PO spec → CTO route
  → Lead scope → Dev implement → Lead scorecard
    → QA test → PO acceptance → Release
```

## Related

- [[kiki]]
- [[hub-spoke-pattern]]
- [[engineering-team]]
