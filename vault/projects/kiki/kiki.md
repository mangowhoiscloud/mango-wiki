---
title: Kiki — Slack Behavioral Profiling → Paperclip Agent Optimization
type: project
category: project-hub
tags: [kiki, paperclip, slack, profiling, agent-orchestration]
sources:
  - "kiki/KIKI.md"
  - "kiki/README.md"
created: 2026-04-11T00:00:00Z
updated: 2026-05-01T00:00:00Z
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

### 운영
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

### Kiki Identity & Architecture (kiki vault mirror)
- [[karpathy-engineering-principles]] — P1-P5 엔지니어링 (Constraints First, Explore Before Act, MVC, Anti-Deception, Git State)
- [[karpathy-identity-principles]] — KIKI.md 정체성 P1-P5 (Evals, Simplicity, Verification, Reproducibility, User-first)
- [[behavioral-profiling]] — 4축 프로파일 모델 + signals-only 경계
- [[llm-wiki-pattern]] — Karpathy LLM Wiki 3-layer 아키텍처
- [[pipeline-guardrails]] — 21-Crack System: 이벤트 기반 강제 가드
- [[review-scorecard]] — 6차원 0~5 점수, 24/30 임계, Anti-Deception 자동 검출
- [[scaffold-app-boundary]] — kiki(scaffold) ↔ kiki-appmaker(operational) 경계
- [[versioned-plugin-path]] — Paperclip manifest cache 우회: SHA-derived 컨테이너 경로

## References

- [[kiki-decision-log]] — 아키텍처 의사결정 기록
- [[kiki-project-progress]] — 칸반 + 마일스톤
- [[kiki-research-index]] — 5 cross-codebase 연구 (Claude Code routing, LLM Wiki, Paperclip best practices, ecosystem, QMD)
- [[kiki-skills-index]] — Runtime skills + 운영 가이드

## Plugin (Paperclip plugin source — kiki vault mirror)

### Cron Jobs
- [[zombie-sweeper]] — `*/5 * * * *` heartbeat-run lock release
- [[stage-reaper]] — `*/2 * * * *` 3-tier 스테이지 복구 (PATCH wake → cap+cooldown → Lead reroute)
- [[pipeline-reaper]] — `*/30 * * * *` portfolio R1-R4 (backlog promote, retriage, dep unblock, load advisory)
- [[pipeline-health-snapshot]] — `0 0 * * *` 일일 큐 형태 + reaper 활동 digest

### MCP-style Tools
- [[broadcast_maintenance_proposals]] · [[collect_user_signals]] · [[flag_diagram_update]] · [[get_pending_slack_prompt]] · [[query_issue_detail]] · [[query_pipeline_status]] · [[read_target_project]]

## Specs (kiki design history mirror)

- [[2026-04-08-slack-bot-integration-design]] — Slack bot integration 1차 설계
- [[2026-04-09-kiki-slack-agent-redesign]] — Slack agent 재설계
- [[2026-04-12-diagram-dashboard-design]] — Excalidraw 다이어그램 대시보드 설계
- [[2026-04-12-dynamic-squad-resolution-design]] — 런타임 squad 해결 메커니즘
- [[2026-04-28-stage-reaper-effective-recovery-design]] — bare wakeup 실패(PIN-63 67h stall) → PATCH 기반 3-tier escalation
- [[2026-04-28-pipeline-reaper-design]] — TradingAgents §3.2 grounded R1-R4 portfolio rules

## Reports

- [[2026-04-28-session-synthesis]] — 5-layer session 종합 (pitch + TradingAgents + bootstrap + stage-reaper + pipeline-reaper + observability)

## Synthesis

- [[kiki-handoff-retros]] — Failure analysis (28 failures) + Session 2/3 retros + Paperclip rebase cycle (PR #78~84)
- [[kiki-maturity-sprint-april]] — 2026-04-12~14 변곡점: LLM-Wiki 엔진 + 인터랙티브 승인 UI + LAN 인프라 동시 도입, mango Apr-14 7-PR 스프린트로 데이터까지 자기 marking
- [[agent-governance-overview]] — 거버넌스 루프 전체 (Slack→signals→profile→directive→agent runtime→guardrails)
- [[ttree-project]] — ttree 운영 인스턴스의 cross-cut 분석
- [[observation-summary-april]] — 12 signal 크로스-시그널 요약 (Q1 마감 + Q2 전환 + Kiki 성숙 스프린트)

## Sister Codebase

- [[kiki-appmaker]] — Install / lifecycle / multi-agent provisioning (별도 repo, 2026-04-29 경계 확정)

## Related

- [[geode]] — GEODE와 동일한 anti-deception, grounding, temporal tracking 철학
- [[mango]] — Project lead
- [[blog-hub]]
