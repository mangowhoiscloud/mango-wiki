---
title: Close Period Pattern — Finance Team
summary: 분기 마감(Close Period) 시 팀 행동 변화 패턴. 조기 시작, 메시지 압축, 야간 작업, 당일 전환.
tags: [kiki, finance, pattern, close-period, behavioral]
sources: [raw/kiki-signals/sim_finance_slack_2026-04-02_03.md, raw/kiki-teams/team_finance.md]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.6, inferred: 0.4 }
---

# Close Period Pattern

Finance Team의 분기 마감(Close Period) 시 관찰되는 팀 수준 행동 변화.

## Pattern Definition

Close Period에 진입하면 팀 전체가 **압축 모드**로 전환:

| 차원 | Normal Period | Close Period | Delta |
|------|-------------|-------------|-------|
| 시작 시간 | 08:30-09:00 | 07:00-07:15 | -90min |
| 메시지 밀도 | 보통 | 74% 압축 | ↑ |
| 형식성 | 자유 | v5-FINAL 프로토콜 | ↑ |
| 작업 시간 | 09:00-18:00 | 07:00-23:00 | +7h |
| 의사결정 | 분산 | CFO 중앙집중 | ↑ |

## Temporal Modes

| Mode | 트리거 | 특성 |
|------|--------|------|
| **normal** | Q 시작 | 분산 의사결정, 자유 소통 |
| **close** | Q 마감 D-7 | 중앙집중, 압축, 형식적 |
| **audit** | 외부 감사 | 100% 체크리스트, 규정 인용 |
| **planning** | Q+1 준비 | 시나리오 기반, 선제적 |

## Same-Day Handoff ^[inferred]

Close period 종료와 Q2 kickoff가 **당일 전환**되는 패턴 관찰:
1. Close 최종 확인 (오전)
2. Q2 model v0.1 릴리스 (오후)
3. Compliance calendar 배포 (동시)

단절 없는 전환은 팀의 높은 운영 성숙도를 시사. ^[inferred]

## Related

- [[kiki-finance-signals-april]] — April 시그널 데이터
- [[finance-team]] — Finance Team 개요
- [[jpark-cfo]] — CFO 프로필
- [[skim-analyst]] — Analyst 프로필
- [[hlee-accountant]] — Accountant 프로필
