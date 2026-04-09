---
title: "GEODE v0.20.0 칸반 스냅샷 — 이틀간 37개 태스크 완주 기록"
type: reference
category: blog-post
tags: [blog, logs]
source: "blog/logs/33-geode-v020-kanban-snapshot.md"
created: 2026-04-08T00:00:00Z
---

# GEODE v0.20.0 칸반 스냅샷 — 이틀간 37개 태스크 완주 기록

> Date: 2026-03-19 | Author: geode-team | Tags: kanban, workflow, progress, v0.20.0

---

## 목차

1. 도입
2. 프로젝트 현황
3. 칸반 보드 전체 스냅샷
4. 마무리

---

## 1. 도입

GEODE v0.20.0이 릴리스되었습니다. 2026-03-18~19 이틀 동안 37개 태스크를 완주하고, Backlog 4건을 남겨둔 상태입니다.

이 글은 릴리스 시점의 칸반 보드 전체 스냅샷을 기록합니다. 무엇이 완료되었고, 무엇이 남았으며, 프로젝트의 현재 체력은 어느 정도인지를 숫자로 보여드립니다.

---

## 2. 프로젝트 현황

### Metrics

| 항목 | 값 |
|------|-----|
| **Version** | 0.20.0 |
| **Modules** | 175 |
| **Tests** | 2,873 |
| **Tools** | 46 |
| **MCP Catalog** | 42 |
| **Hook Events** | 36 |
| **Skills** | 18 |

### GAP Registry

| 구분 | 건수 |
|------|------|
| P1 (High) | 0 |
| P2 (Medium) | 2 |
| Resolved | 16 |

> P1 GAP이 0건입니다. 프론티어 하네스(Claude Code, Codex, OpenClaw) 대비 핵심 격차는 모두 해소된 상태입니다. 남은 P2 2건(`gap-atomic-write`, `gap-webhook`)은 운영 안정성 개선 항목으로, 기능 차단 요소는 아닙니다.

---

## 3. 칸반 보드 전체 스냅샷

### Backlog (4건)

| task_id | 작업 내용 | 우선순위 | plan | 비고 |
|---------|----------|:--------:|------|------|
| career-identity | C0 Identity career.toml 로딩 + 시스템 프롬프트 주입 | P1 | geode-context-hub.md Phase E | UserProfile 확장 |
| app-tracker | C4 Plan tracker.json 지원 상태 CRUD + /apply 커맨드 | P1 | geode-context-hub.md Phase F | Vault applications 연동 |
| session-resume | geode resume 커맨드 + AgenticLoop 체크포인트 통합 | P1 | geode-context-hub.md Phase B2-B5 | SessionCheckpoint 활용 |
| context-command | /context 슬래시 커맨드 + Startup 자동 주입 | P2 | geode-context-hub.md Phase C | 전 계층 요약 표시 |

> Backlog 4건 모두 `.geode` Context Hub의 후속 Phase(B2~F)에 해당합니다. Phase A+B는 이미 완료되었고, 남은 항목은 사용자 프로필 로딩(`career-identity`), 지원서 트래커(`app-tracker`), 세션 복원(`session-resume`), 컨텍스트 조회 커맨드(`context-command`)입니다.

### In Progress (0건)

| task_id | 작업 내용 | 담당 | 브랜치 | 시작일 | 비고 |
|---------|----------|------|--------|--------|------|
| — | — | — | — | — | — |

### In Review (0건)

| task_id | 작업 내용 | PR | 담당 | CI | 비고 |
|---------|----------|-----|------|-----|------|
| — | — | — | — | — | — |

### Done — 2026-03-19 (12건)

| task_id | 작업 내용 | PR | 담당 | 완료일 |
|---------|----------|----|------|--------|
| version-bump | v0.20.0 릴리스 — [Unreleased] 버전 확정 + 4곳 동기화 + ABOUT 갱신 | #308→#309 | @mangowhoiscloud | 2026-03-19 |
| readme-update | README 칸반 + .geode/ 구조 + GAP 해소 | #306→#307 | @mangowhoiscloud | 2026-03-19 |
| workflow-hardening | 워크플로우 고도화 — 동기화 검증 + Plan 강제 + 칸반 규칙 강화 | #304→#305 | @mangowhoiscloud | 2026-03-19 |
| report-enrich | IP 보고서 DAG 정보 보강 — 4개 섹션 추가 + 테스트 + 보안 수정 | #298+#301→#300+#303 | @mangowhoiscloud | 2026-03-19 |
| multi-model-gap | 멀티모델 GAP 해소 — .env 자동 생성 + 키 검증 + 테스트 + 보안 수정 | #299+#302→#300+#303 | @mangowhoiscloud | 2026-03-19 |
| geode-system | .geode/ 시스템 구축 — 에이전트 정체성 분리 + 메모리 계층 정비 | #296→#297 | @mangowhoiscloud | 2026-03-19 |
| readme-narrative | README '왜 만들었는가' 내러티브 보강 | #294→#295 | @mangowhoiscloud | 2026-03-19 |
| multi-provider-glm | Multi-Provider GLM + CANNOT 워크플로우 + 모델 최신화 | #291+#292→#293 | @mangowhoiscloud | 2026-03-19 |
| version-sot | 버전 SOT 일원화 + 하네스 디렉토리 탐지 | #289→#290 | @mangowhoiscloud | 2026-03-19 |
| project-local-context | geode init 프로젝트-로컬 컨텍스트 어셈블리 개선 | #287→#288 | @mangowhoiscloud | 2026-03-19 |
| ci-self-hosted | CI self-hosted runner 전환 | #285→#286 | @mangowhoiscloud | 2026-03-19 |
| workflow-reode-sync | REODE 워크플로우 6건 이식 + 칸반 3-checkpoint | #283→#284 | @mangowhoiscloud | 2026-03-19 |

### Done — 2026-03-18 (25건)

| task_id | 작업 내용 | PR | 담당 | 완료일 |
|---------|----------|----|------|--------|
| vault-v0 | Vault (V0) — 산출물 영속 저장소 (profile/research/applications/general) | #279→#280 | @mangowhoiscloud | 2026-03-18 |
| context-hub-ab | .geode Context Hub Phase A+B — Journal + SessionCheckpoint | #277→#278 | @mangowhoiscloud | 2026-03-18 |
| multi-provider | Multi-Provider AgenticLoop — AgenticResponse + OpenAI 경로 | #275→#276 | @mangowhoiscloud | 2026-03-18 |
| write-fallback | WRITE 거부 후 대안 제안 fallback | #275→#276 | @mangowhoiscloud | 2026-03-18 |
| context-overflow | Context Overflow Detection — ContextMonitor + Hook | #273→#274 | @mangowhoiscloud | 2026-03-18 |
| policy-6layer | 6-Layer Policy Chain — Profile + Org 레이어 | #273→#274 | @mangowhoiscloud | 2026-03-18 |
| cost-approval | /cost 대시보드 — 세션/월간/예산 조회 + 예산 설정 | #273→#274 | @mangowhoiscloud | 2026-03-18 |
| model-failover | Model Failover — call_with_failover + circuit breaker | #269→#270 | @mangowhoiscloud | 2026-03-18 |
| mcp-lifecycle | MCP Lifecycle — startup/shutdown + SIGTERM + atexit | #269→#270 | @mangowhoiscloud | 2026-03-18 |
| subagent-announce | Sub-agent Announce — drain queue + conversation 주입 | #269→#270 | @mangowhoiscloud | 2026-03-18 |
| batch-approval | Tiered Batch Tool Approval — 5단계 안전등급 분류 | #269→#270 | @mangowhoiscloud | 2026-03-18 |
| kanban-cleanup | Worktree 누수 3건 + 좀비 브랜치 40건 + Stop Hook 보강 | #269→#270 | @mangowhoiscloud | 2026-03-18 |
| messaging-v019 | Slack/Discord/Telegram + Google/Apple Calendar 통합 (v0.19.0) | #241→#242 | @mangowhoiscloud | 2026-03-18 |
| gateway-wiring | 검증팀 발견 — GatewayPort + runtime 와이어링 수정 | #241 | @mangowhoiscloud | 2026-03-18 |
| openclaw-gap6 | OpenClaw GAP 6건 수정 (Lane Queue, Session Key 등) | #241 | @mangowhoiscloud | 2026-03-18 |
| runtime-wiring5 | 런타임 와이어링 5건 (Gateway, CalendarBridge, Hook) | #241 | @mangowhoiscloud | 2026-03-18 |
| nl-router-remove | NL Router 제거 → AgenticLoop 직행 | #243→#244 | @mangowhoiscloud | 2026-03-18 |
| research-workflow | 프론티어 하네스 리서치 워크플로우 + 스킬 | #245→#246 | @mangowhoiscloud | 2026-03-18 |
| verify-team-wf | 검증팀 워크플로우 배치 | #247→#248 | @mangowhoiscloud | 2026-03-18 |
| verify-team-skill | 검증팀 4인 페르소나 스킬 | #249→#250 | @mangowhoiscloud | 2026-03-18 |
| docs-sync-final | 문서 싱크 + README 수치 + progress.md | #251→#252 | @mangowhoiscloud | 2026-03-18 |
| nl-router-delete | nl_router.py 완전 삭제 + v0.19.1 릴리스 | #255→#256 | @mangowhoiscloud | 2026-03-18 |
| progress-kanban | progress.md 칸반 보드 고도화 + Step 6 | #259→#260 | @mangowhoiscloud | 2026-03-18 |
| dag-research | Claude Code Tasks DAG 리서치 리포트 | #261→#262 | @mangowhoiscloud | 2026-03-18 |
| kanban-design | 칸반 시스템 설계 문서 (Karpathy Dumb Platform) | #261→#262 | @mangowhoiscloud | 2026-03-18 |

> 2026-03-18에 완주한 25건 중 상당수가 배치 PR(#269→#270, #273→#274)로 묶여 있습니다. 이는 동일 세션 내 관련 태스크를 하나의 develop→main PR로 배치 머지한 결과입니다.

### Blocked (0건)

| task_id | 작업 내용 | blocked_by | 사유 |
|---------|----------|-----------|------|
| — | — | — | — |

---

## 4. 마무리

### 핵심 정리

| 항목 | 값 |
|------|-----|
| 릴리스 버전 | v0.20.0 |
| 기간 | 2026-03-18 ~ 2026-03-19 (2일) |
| 완료 태스크 | 37건 (03-18: 25건, 03-19: 12건) |
| 진행 중 | 0건 |
| Backlog | 4건 (Context Hub Phase B2~F) |
| Blocked | 0건 |
| P1 GAP | 0건 (전량 해소) |
| P2 GAP | 2건 (atomic-write, webhook) |
| PR 생성 수 | #241 ~ #309 (69개) |

### 체크리스트

- [x] 프론티어 GAP P1 전량 해소
- [x] Multi-Provider LLM (Anthropic + OpenAI + ZhipuAI) 3사 failover
- [x] .geode Context Hub Phase A+B (Journal + SessionCheckpoint + Vault)
- [x] CANNOT 워크플로우 7단계 (동기화 검증 + Plan 강제 + 칸반 추적)
- [x] 칸반 재설계 (컬럼 통일 + 규칙 12건 + Task 연동)
- [x] CI self-hosted runner 전환
- [x] v0.20.0 릴리스 + 4곳 버전 동기화 + GitHub ABOUT 갱신
- [ ] Context Hub Phase B2~F (session-resume, career-identity, app-tracker, context-command)

---

*Source: `blog/logs/33-geode-v020-kanban-snapshot.md` | Category: [[blog-logs]]*

## Related

- [[blog-logs]]
- [[blog-hub]]
- [[geode]]
