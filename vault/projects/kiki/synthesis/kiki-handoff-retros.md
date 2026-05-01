---
title: Kiki Handoff Retrospectives
category: synthesis
tags: [kiki, retrospective, handoff, paperclip, failure-analysis, session-2, session-3]
sources:
  - "kiki/docs/handoff-2026-04-08-session2.md"
  - "kiki/docs/handoff-2026-04-09-session3.md"
  - "kiki/docs/handoff-failure-analysis.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki Handoff Retrospectives

3 개 handoff 문서 (kiki 측). [[kiki-appmaker-handoff-retros|AppMaker 측 동일 문서]] 와 같은 시기 / 같은 워크스페이스에서 나온 작업이지만 kiki 코드베이스 관점에서 정리.

> **참고**: kiki 와 kiki-appmaker 가 같은 시기 같은 사이클을 공유하지만 [[kiki-appmaker|2026-04-29 코드베이스 경계 확정]] 이후 별개 repo. 이 시기 handoff 는 분리 이전이라 양쪽이 byte-identical.

## Failure Analysis (2026-04-08)

> "89 commits, 18 fixes (20%), 0 reverts. 3 transcript sources yielded 28 distinct failures: 21 resolved, 7 unresolved."

### 주요 실패 패턴 (kiki 관점)

**1. Slack collector MCP — 채널 history 페이징 오류 (5/28)**

Slack API 의 `conversations.history` 가 channel 별로 다른 paging 동작:
- 일반 채널: cursor-based pagination
- private 채널: bot token 권한 필요
- archived 채널: 응답 timeout 빈발

→ retry + circuit breaker 강화. [[kiki-circuit-breaker]] 의 per-channel 트리거 추가.

**2. Profile sync — observable signals vs raw text 경계 흐림 (4/28)**

초기 implementation 에서 raw text 일부가 signal 에 섞여 들어감 (예: "user mentioned X" 의 X 가 raw quote). 보안/PII 위험.

→ schema validation 강화. signal field 는 strict whitelist (count, frequency, response_time 등) 만 허용. raw text 는 필드 자체에 못 들어가게 type-level 차단.

**3. Paperclip platform internals (12/28)**

[[kiki-appmaker-handoff-retros#failure-analysis|AppMaker 측 분석]] 과 공유. 두 codebase 양쪽이 같은 학습 보유.

### Kiki 의 specific 학습

- **`/kiki-observe` skill** 의 첫 implementation 이 8 incremental patches 필요 (E2E 안정까지)
- **Profile schema** v1 → v2 mid-cycle migration (signal field whitelist 강화)
- **MCP server `slack-collector`** 가 stand-alone 으로 동작 가능해야 함 (Paperclip 연동 시점이 아니라 더 일찍)

## Session 2 Handoff (2026-04-08)

> Branch: `feature/workspace-connection`. 77a91fd → ec966f9 (17 commits). ~3시간

[[kiki-appmaker-handoff-retros#session-2-handoff-2026-04-08|AppMaker 측]] 과 같은 commits 묶음. kiki 측 관점:

### Kiki 측 산출

- **Slack collector MCP** workspace connection 안정화
- **Profile schema** v2 으로 migration (signal whitelist)
- **`/kiki-observe` skill** retry + circuit breaker 통합
- **Paperclip plugin** workspace mount race 해결

## Session 3 Handoff (2026-04-09)

> Branch: `main` (direct merge from develop). 7188f4d → a70161a. ~45분

session 2 직후 정리. kiki 측 변경:
- handoff 문서 작성
- session 2 의 18 fix commit 정리 + `develop` 의 잔여 fix branch merge

## Paperclip Rebase Cycle (2026-04-25 ~ 04-30)

[[kiki|kiki repo]] 의 31 commits since 2026-04-15 → 4월 마지막 사이클. 주요 PR:

| PR | 주제 | 영향 |
|---|---|---|
| #78 | feature/bootstrap-v2 — bootstrap 재설계 | install 스크립트 명령 체계 정리 |
| #79 | feature/prompt-caching-reuse — Claude CLI prompt cache 재사용 | heartbeat 비용 절감 |
| #80 | feature/plugin-invoke-dedup — agent invoke 중복 제거 | issue.updated 핸들러 race 차단 |
| #81 | (develop merge) | |
| #82 | feature/bootstrap-cleanup — legacy plugin symlink 제거 | install/lib 정리 + bootstrap health hook 추가 |
| #83 | (develop merge) | |
| #84 | fix(patches) — kiki-patches rebase onto paperclip feat/kiki-lead-role | paperclip upstream 신규 feature 통합 |

### 핵심 결정

**1. Prompt caching reuse 최대화 (PR #79)**

heartbeat 매 wake 마다 Claude CLI 의 prompt cache miss 가 발생 → 토큰 비용 폭증. 해결:
- agent system prompt 의 sandwich 4-section 중 § 1, § 3, § 4 = 공통 → cache hit
- § 2 (per-stage 본문) 만 변동 → cache write 1회 / 후속 wake = cache hit

→ heartbeat 비용 30-50% 절감 (운영 기준).

**2. Plugin invoke dedup (PR #80)**

`issue.updated` 이벤트가 multiple plugin handler 에 dispatch → 같은 agent 가 중복 invoke. 해결:
- handler dedup key = `${issueId}:${eventType}:${updatedAt}`
- 같은 key 가 5초 이내 재발하면 skip
- audit log 에 dedup 횟수 기록

→ AppMaker 의 [[kiki-appmaker-superpowers#g35-router-dedup-2026-04-15|G35 router-dedup spec]] 과 같은 문제 의식 (kiki 측에서 fix 우선 → spec 변환은 AppMaker 측).

**3. Kiki-patches rebase onto paperclip feat/kiki-lead-role (PR #84)**

paperclip upstream 이 `feat/kiki-lead-role` 추가 → 이 위로 kiki-patches rebase. divergence 적었지만 "patches 사이즈 = paperclip drift 측정 지표" 패턴 확인.

## See also

- [[kiki]] — Hub
- [[kiki-appmaker-handoff-retros]] — sister AppMaker 측 동일 시기 handoff
- [[kiki-circuit-breaker]] — failure analysis 의 trigger 강화
- [[kiki-profile-pipeline]] — profile schema v2 migration 결과
- [[kiki-research-index]] — paperclip-best-practices 가 이 학습에서 나옴
- [[kiki-appmaker-superpowers]] — G35 router-dedup spec (같은 문제 AppMaker 측 spec)
- [[index]]
