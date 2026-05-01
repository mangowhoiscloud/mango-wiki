---
title: Kiki AppMaker Superpowers — Plans + Specs Index
category: references
tags: [kiki-appmaker, superpowers, plans, specs, design-docs, slack-bot, scaffold-correctness, deploy-guards]
sources:
  - "kiki-appmaker/docs/superpowers/plans/* (10 plans, 2026-04-08~04-23)"
  - "kiki-appmaker/docs/superpowers/specs/* (13 specs, 2026-04-08~04-28)"
  - "kiki-appmaker/docs/superpowers/reports/* (1 report)"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Superpowers — Plans + Specs Index

`docs/superpowers/` 의 design docs index. plans (실행 계획) + specs (디자인 스펙) + reports (rollout 결과).

## Plans (10) — 실행 계획

| 날짜 | 제목 | 주제 |
|---|---|---|
| 2026-04-08 | handoff-fixes | 초기 handoff 실패 수정 |
| 2026-04-08 | slack-bot-integration | Slack bot 통합 1차 |
| 2026-04-09 | kiki-slack-agent-redesign | Slack agent 재설계 |
| 2026-04-10 | slack-ui-enhancement | Slack UI 개선 |
| 2026-04-12 | diagram-dashboard | Diagram dashboard v1 |
| 2026-04-12 | diagram-dashboard-v2 | v2 — 데이터 모델 개선 |
| 2026-04-12 | diagram-dashboard-v3-excalidraw | v3 — Excalidraw 통합 |
| 2026-04-12 | maintenance-slack-approval | Maintenance 워크플로우 Slack 승인 |
| 2026-04-21 | scaffold-correctness-layer | Scaffold correctness 검증 레이어 |
| 2026-04-23 | stage-transition-guards-wave1 | Stage 간 transition guard 1차 |

## Specs (13) — 디자인 스펙

| 날짜 | 제목 | 핵심 |
|---|---|---|
| 2026-04-08 | slack-bot-integration-design | Slack bot 1차 디자인 |
| 2026-04-09 | kiki-slack-agent-redesign | Slack agent 재설계 디자인 |
| 2026-04-12 | diagram-dashboard-design | Dashboard 아키텍처 |
| 2026-04-12 | dynamic-squad-resolution-design | 동적 squad 할당 (FIFO Lead) |
| 2026-04-15 | credential-rollover-scaffold | container OAuth rotation 스캐폴드 |
| 2026-04-15 | g27-g28-g29-wake-amplification-fix | wake amplification 가드레일 (G27-G29) |
| 2026-04-15 | g35-router-dedup | router dedup 가드레일 (G35) |
| 2026-04-21 | scaffold-correctness-layer-design | Scaffold correctness 디자인 |
| 2026-04-23 | stage-transition-guards-design | Stage transition guards 디자인 |
| 2026-04-24 | autonomous-deploy-guards-design | Autonomous deploy guards |
| 2026-04-24 | installer-workspaces-design | install/workspaces/ 5-stage 구조 |
| 2026-04-24 | pitch-model-byo-ux-design | Pitch BYO model UX |
| 2026-04-28 | pitch-cleanup-audit | pitch cleanup audit + per-§ status |

## Reports (1)

| 날짜 | 제목 |
|---|---|
| 2026-04-28 | pitch-cleanup-rollout |

## 시간순 주요 흐름

### 4월 1주차 (04-08 ~ 04-12) — 기초 통합

- **handoff 실패 수정** → kiki-appmaker가 처음 production에 들어가면서 발견된 issue들
- **Slack bot integration** (1차 → redesign → UI enhancement) — manager-facing inbound 채널
- **Diagram dashboard v1 → v2 → v3** — Excalidraw 통합으로 사용자 친화적 다이어그램
- **Maintenance Slack 승인** — 자율 배포 가드 1차

### 4월 2주차 (04-15) — 가드레일 폭증

3개 design spec 동시 발행 — production 운영 중 발견된 blast radius:
- **credential-rollover-scaffold** — container OAuth 키 만료 → 자동 rotation
- **g27-g28-g29-wake-amplification-fix** — wake amplification (1 wake → N wake 폭증) 차단
- **g35-router-dedup** — 같은 issue가 여러 router에 동시 dispatch 되는 dedup

### 4월 3주차 (04-21 ~ 04-24) — Scaffold Correctness + Deploy

- **scaffold-correctness-layer** — install된 scaffold 가 의도대로 작동하는지 검증
- **stage-transition-guards-wave1** — PDCA stage 간 transition 시 가드 (SPEC, DESIGN_SYSTEM, SELF_CHECK, QA_REPORT 존재 확인)
- **autonomous-deploy-guards** — D-1..D-9 자동 검증
- **installer-workspaces** — `install/workspaces/{10-core,20-patches,30-plugins,40-team,50-dashboards}/` 5-stage 구조 확정
- **pitch-model-byo-ux** — 외부 회사가 자기 LLM 키 가져와서 사용 (bring-your-own-model)

### 4월 4주차 (04-28) — Pitch Cleanup

- **pitch-cleanup-audit** + rollout — pitch 영역 lint/test baseline lock + per-§ status markers + outputs route stream-cancel test

## 주요 가드레일 시리즈

`g27-g35` 등의 가드레일 (`G` 접두) 가 spec 으로 등장. 패턴:
- G-숫자 = 발견된 anti-pattern 의 사후 가드
- 발견 → spec 작성 → install 자동 적용 → 재발 차단

대표 예:
- **G27-G29 wake amplification**: heartbeat가 자기 자신을 깨우는 무한 루프 차단
- **G35 router dedup**: 같은 issue가 multiple router 에 동시 dispatch되는 race 차단

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-pin-system]] — PIN match-3 + pitch deck 시리즈
- [[kiki-appmaker-deployment]] — autonomous deploy guards (D-1..D-9)
- [[kiki-appmaker-orchestration]] — Stage transition guards 의 적용 지점
- [[index]]
