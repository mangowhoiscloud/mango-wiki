---
title: Kiki — Slack Behavioral Profiling → Paperclip Agent Optimization
type: project
tags: [kiki, paperclip, slack, profiling, agent-orchestration]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki

Slack 행동 관측 기반 AI 에이전트 최적화 시스템. 유저의 커뮤니케이션 스타일, 의사결정 패턴, 전문성, 업무 리듬을 관측하고, Paperclip 에이전트 디렉티브로 자동 변환합니다.

## Core Pipeline

```
Slack Channel Observation
  → Behavioral Signal Extraction (원문 미수집, 시그널만)
    → Profile Merge (confidence scoring + temporal decay)
      → Directive Generation (profileToDirectives)
        → Paperclip Company Skills API PATCH
          → Agent System Prompt Injection
```

## Key Numbers

| Metric | Value |
|--------|-------|
| Agents | 12 (Finance 3 + Engineering 9) |
| PRs merged | 60 |
| TS modules | 46 (12,623 LOC) |
| Event handlers | 24 (C1-C21 guardrails) |
| Skills | 16 |
| Slack commands | 9 intent types |
| Dashboard | v0.3.0 (Jira-style kanban) |
| Commits | 184 |

## Architecture

```
SLACK (MCP) → Signal Store → Profile Merge → Directive Gen → Paperclip API → Agent
     ↑                                                              |
     └──────── Feedback Loop (issue.comment → profile correction) ──┘
```

## Concepts

- [[kiki-profile-pipeline]] — Slack → Profile → Directive 전체 파이프라인
- [[kiki-confidence-scoring]] — 신뢰도 점수 + temporal decay + 5가지 컨텍스트 모드
- [[kiki-circuit-breaker]] — Per-agent + company-wide 장애 차단 패턴
- [[kiki-scorecard-guards]] — C1-C21 워크플로우 가드레일 + Lead/PO 품질 게이트
- [[kiki-slack-integration]] — Intent commands, Pipeline notifier, Agent router
- [[kiki-team-bootstrap]] — YAML 템플릿 → 런타임 에이전트 구성
- [[kiki-feedback-loop]] — 이슈 코멘트 → 프로필 보정 양방향 학습
- [[hub-spoke-pattern]] — CTO(라우터) → PO/Planner(스펙) → Lead/Dev/QA(실행)
- [[engineering-team]] — 9 에이전트 dual squad 구조
- [[finance-team]] — CFO, Analyst, Accountant 3인 구조
- [[attendance-domain]] — 근태관리 18모듈 도메인

## References

- [[kiki-decision-log]] — 아키텍처 의사결정 기록
- [[kiki-project-progress]] — 칸반 + 마일스톤

## Related

- [[geode]] — GEODE와 동일한 anti-deception, grounding, temporal tracking 철학
- [[mango]] — Project lead
- [[blog-hub]]
