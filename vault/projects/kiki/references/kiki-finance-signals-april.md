---
title: Kiki Finance Team — April Signals
summary: 2026-04-01~08 Slack 관찰 데이터 종합. Close period 행동 패턴, 메시지 압축률, 야간 작업, Q2 전환, KPI 대시보드 v1.0 발행.
tags: [kiki, finance, signals, slack, behavioral-analysis]
sources: [raw/kiki-signals/sim_finance_slack_2026-04-01.md, raw/kiki-signals/sim_finance_slack_2026-04-02_03.md, raw/kiki-signals/sim_finance_slack_2026-04-04.md, raw/kiki-signals/sim_finance_slack_2026-04-05.md, raw/kiki-signals/sim_finance_slack_2026-04-06.md, raw/kiki-signals/sim_finance_slack_2026-04-07.md, raw/kiki-signals/sim_finance_slack_2026-04-08.md]
created: 2026-04-15
updated: 2026-05-01
provenance: { extracted: 0.7, inferred: 0.3 }
---

# Finance Team — April 2026 Signal Analysis

2026-04-01~07 기간 Slack 채널 관찰에서 추출한 행동 시그널 종합.

## Timeline

| 날짜 | 메시지 수 | 핵심 이벤트 |
|------|----------|------------|
| 04-01 | 0 | Close period 시작 전 |
| 04-02~03 | 31 | Board Deck v5-FINAL, CFO 07:12 조기 시작, Analyst 22:43 야간 |
| 04-04 | 18 | Post-close 전환, Q2 model v0.1 릴리스, compliance calendar |
| 04-05 | 0 | 주말 (close period 마지막 날) |
| 04-06 | 22 | Q2 normal period W1, Monday review 08:33, SMB NRR 88% |
| 04-07 | 19 | Tuesday 09:12 (39min 후발), KPI dashboard, SMB scenario v1.1 |
| 04-08 | 21 | Wednesday 09:08, **KPI 대시보드 v1.0 발행**, SMB CS 3일차 직접 에스컬레이션, Q1 미결 2번 건 법무 완료 |

## Key Patterns Discovered

### CFO (J.Park) — Close Period Behavior
- **Early start**: 07:05-07:12 (정상 대비 ~90분 조기)
- **Message compression**: 74% (31→8 equivalent) — 핵심만 전달
- **Formal protocol**: v5-FINAL 네이밍, Board Deck 최종 검증
- **Post-close transition**: 같은 날 Q2 모델 v0.1 즉시 릴리스

### Analyst (S.Kim) — Deep Work Pattern
- **Night crunch**: 22:43 close period 야간 작업 확인
- **Afternoon focus**: 14:22-17:38 deep work block (3h16m)
- **Preemptive prep**: Close 완료 전 Q2 scenario 선제 준비
- **SMB tracking**: NRR 88% 2일 연속 추적 (04-06, 04-07)

### Accountant (H.Lee) — Verification Pattern
- **100% checklist**: Revenue recognition 3건 완전 검증
- **Progressive completion**: 0→1→2→3 완료 (04-02~07)
- **Morning focus**: 09:00-12:00 집중 블록
- **Audit readiness**: Close 종료 즉시 compliance calendar 배포

### Team-Level Temporal Patterns
- **Monday vs Tuesday start delta**: 08:33 → 09:12 (39분 차이)
- **Review day effect**: Monday는 전체 review, Tuesday는 실행 중심 ^[inferred]
- **Close → Normal 전환**: 단절 없이 당일 전환 (same-day handoff)

## Confidence Score Deltas

| Agent | Start | End | Delta |
|-------|-------|-----|-------|
| CFO J.Park | 0.82 | 0.91 | +0.09 |
| Analyst S.Kim | 0.74 | 0.89 | +0.15 |
| Accountant H.Lee | 0.82 | 0.90 | +0.08 |

## Open Signals

- SMB NRR 88%: CS 데이터 4/8 3일차 직접 에스컬레이션, 4/9 추적 필요
- Q2 model v0.1: 정확도 검증 미완료
- KPI v1.1: NRR 세분화(월별/코호트별) + 이탈 위험군 세그먼트, 4/11 목표
- Q1 미결 매출 인식: 2번 건 4/9 완결 예정, 3건 전체 4/11 완결 목표

## Daily Detail Pages

- [[kiki-signal-2026-04-02]] — Q1 close kickoff
- [[kiki-signal-2026-04-04]] — Post-close transition
- [[kiki-signal-2026-04-06]] — Q2 W1 Monday review
- [[kiki-signal-2026-04-07]] — Tuesday SMB CS 2일차
- [[kiki-signal-2026-04-08]] — Wednesday KPI 대시보드 v1.0 발행

## Related

- [[jpark-cfo]] — CFO 개인 프로필
- [[skim-analyst]] — Analyst 개인 프로필
- [[hlee-accountant]] — Accountant 개인 프로필
- [[finance-team]] — Finance Team 개요
- [[kiki]] — Kiki 프로젝트 개요
