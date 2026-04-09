---
title: Kiki
category: project
tags: [kiki, paperclip, attendance, profiler, ai-agents]
source_path: /Users/mango/workspace/kiki
created: 2026-04-01
updated: 2026-04-07
sources:
  - "kiki/memory/"
  - "kiki/docs/"
---

# Kiki

Slack observation-based user work-style profiling → Paperclip agent optimization consultant. Manages a legacy attendance management (근태관리) system with a 12-agent AI team.

## Hubs

- [[kiki-team-hub]] — 에이전트 12명 + Finance 3명 중앙 인덱스
- [[kiki-domain-hub]] — 18개 모듈 → 4개 도메인 그룹 지도
- [[kiki-pipeline-hub]] — Slack → Profile → Directive → Obsidian 파이프라인

## Architecture

```
Slack → Kiki Observe → Profiles → Paperclip Plugin → Agent Directives
                                        ↓
                              Team Template (YAML)
                                        ↓
                              Paperclip Agents (12)
```

## Team Structure (v3)

```
CEO
└── CTO (router)
    ├── PO → Planner + Designer
    ├── Lead 1 → Developer 1 + QA 1
    └── Lead 2 → Developer 2 + QA 2
+ Kiki (profiler)
```

See [[engineering-team]] for details.

## Key Concepts

- [[engineering-team]] — v3: PO-driven dual dev squads (FIFO)
- [[attendance-domain]] — 18-module domain map with labor law rules
- [[finance-team]] — Finance team scenario validation
- [[hub-spoke-pattern]] — Central coordinator + specialists
- [[budget-tiers]] — S/M/L/XL token budget classification
- [[paperclip-integration]] — Kiki ↔ Paperclip architecture

## Key Entities

- [[cto-agent]] · [[po-agent]] · [[planner-agent]] · [[designer-agent]]
- [[lead-1]] · [[developer-1]] · [[qa-1]]
- [[lead-2]] · [[developer-2]] · [[qa-2]]
- [[jpark-cfo]] · [[skim-analyst]] · [[hlee-accountant]]

## Cross-Project

- [[mango]] — Project lead (also leads [[geode]])

## Skills

| Skill | Purpose |
|-------|---------|
| /kiki-setup | Bootstrap team from template |
| /kiki-observe | Slack → behavioral signal extraction |
| /kiki-refresh | Profile update + health check |
| /kiki-advise | Profile → agent directives |
| /kiki-export | Memory → Obsidian vault |

## References

- [[kiki-project-progress]] — Milestones and progress board

## Related

- [[index]]
- [[kiki-team-hub]]
