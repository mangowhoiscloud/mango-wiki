---
title: Kiki AppMaker Handoff Retrospectives
category: synthesis
tags: [kiki-appmaker, retrospective, handoff, paperclip, failure-analysis, session-2, session-3]
sources:
  - "kiki-appmaker/docs/handoff-2026-04-08-session2.md"
  - "kiki-appmaker/docs/handoff-2026-04-09-session3.md"
  - "kiki-appmaker/docs/handoff-failure-analysis.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Handoff Retrospectives

3 개 handoff 문서 — 2026-04-08 / 04-09 / failure-analysis. AppMaker가 production 진입하면서 발견된 실패 패턴 + 학습.

## Failure Analysis (2026-04-08)

> "89 commits, 18 fixes (20%), 0 reverts. 3 transcript sources yielded 28 distinct failures: 21 resolved, 7 unresolved."

### 주요 실패 패턴

**1. Paperclip platform internals — trial-and-error (12/28 failures)**

Paperclip 의 다음 영역에 public 문서 부재 → 시행착오로만 학습:
- Plugin SDK worker lifecycle
- Workspace connection model
- Skill sync behavior
- Agent status enum
- Retry / circuit-breaker semantics

→ AppMaker 가 [[kiki-appmaker-research|paperclip-best-practices.md]] 작성한 동기. 향후 누가 plugin 작성해도 이 문서 따르면 시행착오 안 겪음.

**2. kiki-setup skill — 8 incremental patches**

E2E 안정 실행까지 8회 패치 필요. 주요 이슈:
- Container/host 경계 혼동
- env var 주입 순서 (PAPERCLIP_API_URL 이 plugin install 전에 set 돼야 함)
- Workspace bind mount 시점

→ [[kiki-appmaker-orchestration|sandwich identity]] 의 "두 가지 모드" 명시 (Paperclip claude_local vs host maintenance) 가 이 학습에서 나옴.

### 21 Resolved Failures

원본 문서에 case-by-case 분류 (간단 카테고리):
- Plugin SDK 사용 미흡 → SDK 문서화로 해결
- Workspace mount race → bootstrap.sh 순서 조정
- Agent status 추적 → Paperclip API 직접 polling
- Skill sync 누락 → install/lib/02e 에서 강제 sync
- Circuit breaker 트리거 미발생 → hook 등록 누락 발견 + 수정

### 7 Unresolved Failures

(원본 문서 §"Unresolved" 참조) — 그 뒤 사이클 (4-15 가드레일 폭증, 4-21 scaffold-correctness, 4-23 stage-transition-guards) 에서 점진 해결.

## Session 2 Handoff (2026-04-08)

> Branch: `feature/workspace-connection`. 77a91fd → ec966f9 (17 commits). ~3시간

### Completed Work
- Workspace connection 모델 정의
- bootstrap.sh 의 stage 순서 결정 (10-core → 20-patches → 30-plugins → 40-team → 50-dashboards)
- claude-creds-sync.sh 1차 implementation
- container/host 경계 명확화

### 핵심 결정

**Container 안에 .env 파일 직접 두지 않음.** 대신 `claude-creds-sync.sh` 가 호스트에서 OAuth 토큰을 가져와 컨테이너 안의 권한있는 위치에 inject. 이유:
- `.env` 파일이 docker image 에 baked 되면 token rotation 시 image 재빌드 필요
- bind mount 로 `.env` 마운트하면 host 의 평문 secret이 컨테이너에 노출
- `claude-creds-sync` 는 host keychain 만 접근, 컨테이너에 inject 시 short-lived

→ 이 패턴이 [[kiki-appmaker-superpowers|credential-rollover-scaffold spec (2026-04-15)]] 의 출발점.

## Session 3 Handoff (2026-04-09)

> Branch: `main` (direct merge from develop). 7188f4d → a70161a. ~45분

### 짧은 cycle 의 배경

session 2 가 17 commits 큰 작업 → session 3는 그 직후 정리 (docs handoff 문서 작성 + 사소한 fix)

### 핵심 결정

**direct merge from develop to main**. develop 에 17 커밋 쌓이면 PR 검토 비용 큼 → 작은 커밋은 paperclip-rebase 같은 "fix only" 라벨이면 develop → main 직접 merge 허용.

이 정책은 [[geode-development-workflow|geode gitflow]] 와 다름 (geode 는 항상 PR ratchet). AppMaker 는 production 초기라 빠른 정리 우선.

## 누적 학습 → spec 으로 변환

failure analysis 의 7 unresolved failures + session 2/3 의 정성적 학습이 그 뒤 4월 사이클의 spec 으로 변환:

| 학습 | 변환된 spec | 시점 |
|---|---|---|
| Paperclip platform internals 시행착오 | paperclip-best-practices.md (research) | 2026-04 mid |
| Slack bot 통합 1차 실패 | kiki-slack-agent-redesign | 2026-04-09 |
| Diagram 시각화 요구 | diagram-dashboard v1 → v2 → v3 | 2026-04-12 |
| OAuth rotation 패턴 | credential-rollover-scaffold | 2026-04-15 |
| wake amplification 폭주 | g27-g28-g29 | 2026-04-15 |
| router dedup 부재 | g35-router-dedup | 2026-04-15 |
| scaffold 의도 검증 부재 | scaffold-correctness-layer | 2026-04-21 |
| stage transition 약점 | stage-transition-guards-wave1 | 2026-04-23 |
| auto deploy 검증 부재 | autonomous-deploy-guards | 2026-04-24 |

→ 4월 한 달 동안 **trial-and-error → spec** 변환이 2-3일 cycle 로 반복. 이 가속도가 AppMaker 의 핵심 운영 방식.

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-superpowers]] — 학습이 변환된 plans + specs index
- [[kiki-appmaker-research]] — paperclip-best-practices 등 연구 정리
- [[kiki-appmaker-orchestration]] — 두 가지 모드 명시 (failure-analysis 학습)
- [[kiki-handoff-retros|sister codebase 의 동일 시기 handoff]]
- [[index]]
