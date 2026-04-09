---
title: "GEODE 칸반 로그 종합 — 2026-03-18 ~ 03-22"
type: reference
category: blog-post
tags: [blog, logs]
source: "blog/logs/geode-kanban-log-20260318-0322.md"
created: 2026-04-08T00:00:00Z
---

# GEODE 칸반 로그 종합 — 2026-03-18 ~ 03-22

> v0.19.0 → v0.24.0 (5일간 76건 완료, 4개 릴리스)
> 184 모듈 / 3,055 테스트 / 46 도구 + 86 MCP 도구 / 25 스킬

---

## 파트 개요

| # | 파트 | 완료 건수 | 핵심 키워드 |
|---|------|:--------:|-----------|
| 1 | Gateway / 메시징 통합 | 17 | Slack, Discord, Telegram, geode serve, 멘션 게이트 |
| 2 | MCP 인프라 | 4 | 싱글턴, 병렬 시작, 라이프사이클, 카탈로그 |
| 3 | Multi-Provider LLM | 9 | GLM-5, OpenAI, Failover, 퍼지 매칭, 날짜 주입 |
| 4 | Context Hub / 예산 관리 | 8 | 5-Layer, Vault, Token Guard, clear_tool_uses |
| 5 | 보안 / 샌드박스 | 4 | PolicyChain, Batch Approval, Secret Redaction |
| 6 | 하네스 패턴 / 세션 | 9 | HITL, Escalation, Backpressure, Session Resume |
| 7 | Agentic 인프라 | 4 | NL Router 제거, Sub-agent Announce, /cost |
| 8 | 문서 / 칸반 / 릴리스 | 14 | 칸반 시스템, CI, README, 버전 SOT |
| 9 | 버그 수정 / 안정화 | 7 | GLM URL, keepalive, 로그 노이즈, 테스트 격리 |

---

## Part 1: Gateway / 메시징 통합 (17건)

Slack/Discord/Telegram 채널 연동 → Gateway 양방향 소통 → headless 데몬(`geode serve`).

### 3/18 — 기반 구축 (v0.19.0)

| task_id | 작업 내용 | PR |
|---------|----------|-----|
| messaging-v019 | Slack/Discord/Telegram + Google/Apple Calendar 통합 | #241→#242 |
| gateway-wiring | GatewayPort + runtime 와이어링 수정 | #241 |
| openclaw-gap6 | OpenClaw GAP 6건 수정 (Lane Queue, Session Key 등) | #241 |
| runtime-wiring5 | 런타임 와이어링 5건 (Gateway, CalendarBridge, Hook) | #241 |

**요약**: OpenClaw Gateway 패턴을 GEODE에 이식. ChannelManager + Poller(3채널) + ChannelBinding + Session Key + Lane Queue. NotificationPort/CalendarPort/GatewayPort 3개 Protocol 신설. 테스트 105개 추가.

### 3/22 — 양방향 소통 + headless 데몬 (v0.24.0)

| task_id | 작업 내용 | PR |
|---------|----------|-----|
| geode-serve | geode serve — headless Gateway 데몬 모드 | main direct |
| gateway-bidirectional | Gateway 양방향 소통 — 로깅, ts seeding, 독립 context, 에러 가시성 | #354→#355 |
| gateway-exclusive | Gateway를 geode serve 전용 분리 — REPL 이중 폴링 제거 | #372→#373 |
| serve-full-capability | geode serve processor REPL 동등 역량 — MCP 86 + SubAgent + Skills | main direct |
| slack-poller-fix | SlackPoller channel→channel_id + MCP JSON wrapper 파싱 + bot_id 필터 | main direct |
| slack-adapter-fix | Slack MCP tool 이름 정합성 + kwargs 전달 + content wrapper 파싱 | main direct |
| slack-echo-fix | Slack Gateway 사용자 메시지 반복 에코 제거 + 리액션 인디케이터 | #359→#360 |
| mention-gate | @멘션 전용 응답 게이트 + 멘션 태그 제거 | #363→#364 |
| slack-mention-botid | Slack Bot ID 멘션 인식 + 리액션 눈알 이모지 | main direct |
| slack-reaction-ux | Slack 리액션 UX — 모래시계 + 체크마크, 파라미터 수정 | #370→#371 |
| slack-reaction-mention | Slack 리액션을 @멘션 메시지에만 추가 | main direct |

**요약**: `geode serve` 커맨드로 headless 데몬화. 5건의 복합 결함을 순차 해결 (MCP tool 이름, JSON 래퍼, os.environ 격리, 다중 인스턴스, Bot ID 패턴). Reaction UX(👀→✅), Echo 억제, 멘션 게이트 완성.

### 블로그 활용

- **50편** `geode-serve-headless-gateway.md` — 이 파트 전체를 커버

---

## Part 2: MCP 인프라 (4건)

MCPServerManager 싱글턴화 → 병렬 시작(110s→15s) → 로그 정리.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | mcp-lifecycle | MCP Lifecycle — startup/shutdown + SIGTERM + atexit | #269→#270 |
| 3/22 | mcp-singleton | MCPServerManager 싱글턴 — 좀비 프로세스 근절 | main direct |
| 3/22 | mcp-parallel-startup | MCP 병렬 연결 — 순차 110s→~15s (ThreadPoolExecutor) | #361→#362 |
| 3/22 | mcp-log-noise | MCP startup 로그 warning→debug | #345→#346 |

**요약**: MCP 서버 관리의 전체 진화. 라이프사이클(SIGTERM+atexit) → 싱글턴(좀비 54→11개) → 병렬(110s→15s) → UX(로그 노이즈 제거). 42개 카탈로그 엔트리, Auto-Discovery 패턴, 도구 정규화(camelCase→snake_case).

### 블로그 활용

- **51편** `mcp-parallel-startup-singleton-optimization.md` — 싱글턴 + 병렬 시작 deep-dive

---

## Part 3: Multi-Provider LLM (9건)

3사(Anthropic/OpenAI/ZhipuAI) 멀티 프로바이더 + Failover + 퍼지 매칭.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | multi-provider | Multi-Provider AgenticLoop — AgenticResponse + OpenAI 경로 | #275→#276 |
| 3/18 | model-failover | Model Failover — call_with_failover + circuit breaker | #269→#270 |
| 3/18 | glm5-500-retry | LLM 500 에러 retry 미동작 수정 | #265→#266 |
| 3/19 | multi-provider-glm | Multi-Provider GLM + CANNOT 워크플로우 + 모델 최신화 | #291→#293 |
| 3/19 | multi-model-gap | 멀티모델 GAP 해소 — .env 자동 생성 + 키 검증 | #299→#303 |
| 3/22 | model-match | switch_model 퍼지 매칭 — GLM5→glm-5 등 | #369→#371 |
| 3/22 | glm-failover-noise | Failover 로그 warning→debug + timeout 90s→120s | #357→#358 |
| 3/22 | glm-url-fix | GLM base URL api.z.ai→open.bigmodel.cn + keepalive 30s | #343→#344 |
| 3/22 | date-injection | 시스템 프롬프트 현재 날짜 주입 | #353→#356 |

**요약**: Anthropic 단일 프로바이더에서 3사 멀티 프로바이더로 확장. AgenticResponse 정규화 레이어, circuit breaker, cross-provider escalation(GLM→OpenAI→Anthropic). 퍼지 매칭으로 모델 전환 UX 개선. 날짜 주입으로 knowledge cutoff 오류 방지.

### 블로그 활용

- 기존 **49편** cross-provider escalation과 연결
- 퍼지 매칭 + 날짜 주입은 독립 소재로는 약함 → Part 1(Gateway) 또는 Part 2(MCP)에 흡수 가능

---

## Part 4: Context Hub / 예산 관리 (8건)

5-Layer Context Hub + Vault + Token Guard + clear_tool_uses 위임.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | context-hub-ab | .geode Context Hub Phase A+B — Journal + SessionCheckpoint | #277→#278 |
| 3/18 | vault-v0 | Vault (V0) — 산출물 영속 저장소 | #279→#280 |
| 3/18 | context-overflow | Context Overflow Detection — ContextMonitor + Hook | #273→#274 |
| 3/19 | geode-system | .geode/ 시스템 구축 — 에이전트 정체성 분리 + 메모리 계층 정비 | #296→#297 |
| 3/19 | project-local-context | geode init 프로젝트-로컬 컨텍스트 어셈블리 | #287→#288 |
| 3/22 | context-overflow-fix | Context overflow 방지 — Token Guard 4000 + tool_result 절삭 | #365→#366 |
| 3/22 | context-claude-align | Context management Claude Code 정합 — 80% compaction 제거, -54줄 | #367→#368 |
| 3/22 | web-fetch-hardcap | web_fetch max_chars 하드캡 10000 | main direct |

**요약**: 두 축의 작업. (1) Context Hub: 5-Layer(C0 Identity → C1 Project → C2 Journal → C3 Session → C4 Plan) + Vault(V0) 영속 저장소. (2) Token Guard: 3중 방어 — web_fetch hardcap(입구) → ContextMonitor 80%/95%(감시) → Emergency Prune(긴급). 80% LLM 요약 제거, clear_tool_uses 서버사이드 위임으로 수렴.

### 블로그 활용

- **52편** `token-guard-context-budget-defense.md` — Token Guard 3중 방어 deep-dive
- Context Hub는 기존 `posts/context-hub-agent-context-management.md` + research와 연결

---

## Part 5: 보안 / 샌드박스 (4건)

6-Layer PolicyChain + 배치 승인 + 비밀 마스킹 + WRITE 거부 대안.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | policy-6layer | 6-Layer Policy Chain — Profile + Org 레이어 | #273→#274 |
| 3/18 | batch-approval | Tiered Batch Tool Approval — 5단계 안전등급 분류 | #269→#270 |
| 3/18 | write-fallback | WRITE 거부 후 대안 제안 fallback | #275→#276 |
| 3/21 | sandbox-hardening | 샌드박스 보안 경계 4건 — PolicyChain L1-2, SubAgent denied_tools, Bash setrlimit, Secret Redaction | #338→#340 |

**요약**: OpenClaw의 Policy Chain을 6-Layer로 확장 (Profile→Org→Mode→Project→Session→Runtime). 도구를 5등급(SAFE/MCP/EXPENSIVE/WRITE/DANGEROUS)으로 분류하여 배치 승인. SubAgent에 denied_tools로 민감 도구 차단. Bash에 setrlimit(CPU 30s, FSIZE 50MB). 8개 API 키 패턴 자동 마스킹.

### 블로그 활용

- 기존 블로그에서 PolicyChain(36편), HITL(17편) 관련 포스트와 연결
- sandbox-hardening은 49편(샌드박스)과 연결

---

## Part 6: 하네스 패턴 / 세션 (9건)

REODE 역수입 패턴 + 세션 관리 + 검증팀 체계.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | research-workflow | 프론티어 하네스 리서치 워크플로우 + 스킬 | #245→#246 |
| 3/18 | verify-team-wf | 검증팀 워크플로우 배치 (안 C) | #247→#248 |
| 3/18 | verify-team-skill | 검증팀 4인 페르소나 스킬 | #249→#250 |
| 3/19 | workflow-hardening | 워크플로우 고도화 — 동기화 검증 + Plan 강제 + 칸반 규칙 | #304→#305 |
| 3/19 | workflow-reode-sync | REODE 워크플로우 6건 이식 + 칸반 3-checkpoint | #283→#284 |
| 3/21 | reode-skill-port | REODE 역수입 스킬 5건 — explore-reason-act, anti-deception 등 | #341→#342 |
| 3/21 | harness-patterns | REODE 하네스 패턴 7건 — HITL 0/1/2, Session approval, Escalation 등 | #339→#340 |
| 3/21 | session-resume | Session resume — per-turn checkpoint + /resume CLI | #334 |
| 3/21 | test-isolation | 테스트 세션 격리 — conftest.py tmp 리다이렉트 | #334 |

**요약**: REODE(fork 프로젝트)에서 검증된 패턴을 GEODE로 역수입. 7개 하네스 패턴(HITL Level, Session Approval, Model/Cross-Provider Escalation, Backpressure, Convergence Detection, Model-first Inference). 5개 품질 스킬(explore-reason-act, anti-deception, code-review, dependency-review, kent-beck-review). Session resume로 중단 세션 복원.

### 블로그 활용

- 하네스 패턴은 기존 48편(Socratic 게이트), 47편(harness engineering)과 연결
- Session resume는 독립 소재 가능 (앏음)

---

## Part 7: Agentic 인프라 (4건)

NL Router 제거, Sub-agent Announce, 비용 대시보드.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | nl-router-remove | NL Router 제거 → AgenticLoop 직행 | #243→#244 |
| 3/18 | nl-router-delete | nl_router.py 완전 삭제 + v0.19.1 릴리스 | #255→#256 |
| 3/18 | subagent-announce | Sub-agent Announce — drain queue + conversation 주입 | #269→#270 |
| 3/18 | cost-approval | /cost 대시보드 — 세션/월간/예산 조회 + 예산 설정 | #273→#274 |

**요약**: NL Router 이중 라우팅 제거 → 모든 자유 텍스트가 AgenticLoop 직행 (1,224줄 레거시 삭제). OpenClaw Spawn+Announce 패턴으로 Sub-agent 결과 비동기 주입. /cost 커맨드로 세션/일간/월간 비용 + 예산 대시보드.

### 블로그 활용

- NL Router 제거는 아키텍처 진화 소재 (기존 5편 NL Routing과 대조)
- Sub-agent Announce는 21편(Subagent Design)과 연결

---

## Part 8: 문서 / 칸반 / 릴리스 (14건)

칸반 시스템 구축, CI, README 정비, 버전 관리.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | progress-kanban | progress.md 칸반 보드 고도화 | #259→#260 |
| 3/18 | dag-research | Claude Code Tasks DAG 리서치 리포트 | #261→#262 |
| 3/18 | kanban-design | 칸반 시스템 설계 문서 (Karpathy Dumb Platform) | #261→#262 |
| 3/18 | kanban-blog | GEODE 칸반 기술 블로그 (14,517자) | #261→#262 |
| 3/18 | pr-body-align | PR body 규칙 geode-gitflow 스킬 정렬 | #261→#262 |
| 3/18 | cli-audit | CLI 점검 감사 (코드 레벨) | 리서치 |
| 3/18 | gap-detection | Claude Code/Codex/OpenClaw GAP 탐지 | 리서치 |
| 3/18 | kanban-cleanup | Worktree 누수 3건 + 좀비 브랜치 40건 정리 | #269→#270 |
| 3/18 | docs-sync-final | 문서 싱크 + README 수치 + progress.md | #251→#252 |
| 3/19 | version-bump | v0.20.0 릴리스 — [Unreleased]→[0.20.0] + 4곳 동기화 | #308→#309 |
| 3/19 | readme-update | README 칸반 + .geode/ 구조 + GAP 해소 | #306→#307 |
| 3/19 | readme-narrative | README '왜 만들었는가' 내러티브 보강 | #294→#295 |
| 3/19 | version-sot | 버전 SOT 일원화 + 하네스 디렉토리 탐지 | #289→#290 |
| 3/19 | ci-self-hosted | CI self-hosted runner 전환 | #285→#286 |

**요약**: progress.md 기반 마크다운 칸반 시스템 구축. Claude Code Tasks DAG와 비교 리서치 후 Karpathy "Dumb Platform" 원칙으로 마크다운 채택. 11개 거버넌스 규칙 + 3-Checkpoint 갱신 프로토콜. CI self-hosted runner 전환. 버전 SOT 일원화.

---

## Part 9: 버그 수정 / 안정화 (7건)

GLM 인프라, 연결 안정성, 테스트 격리.

| 일자 | task_id | 작업 내용 | PR |
|------|---------|----------|-----|
| 3/18 | glm5-500-retry | LLM 500 에러 retry 미동작 수정 (LLMInternalServerError) | #265→#266 |
| 3/21 | manage-auth-hint | manage_auth WRITE_FALLBACK_HINTS 누락 수정 | #334 |
| 3/22 | glm-url-fix | GLM base URL api.z.ai→open.bigmodel.cn + keepalive 30s | #343→#344 |
| 3/22 | mcp-log-noise | MCP startup 로그 warning→debug | #345→#346 |
| 3/22 | glm-failover-noise | Failover 로그 warning→debug + timeout 90s→120s | #357→#358 |
| 3/22 | date-injection | 시스템 프롬프트 현재 날짜 주입 | #353→#356 |
| 3/21 | test-isolation | 테스트 세션 격리 — conftest.py tmp 리다이렉트 | #334 |

---

## 릴리스 타임라인

| 버전 | 날짜 | 핵심 테마 |
|------|------|----------|
| v0.19.0 | 3/18 | 외부 메시징 + 캘린더 통합 (OpenClaw Gateway) |
| v0.19.1 | 3/18 | NL Router 완전 제거 + 검증팀 체계화 |
| v0.20.0 | 3/19 | Multi-Provider LLM + .geode Context Hub + CANNOT 워크플로우 |
| v0.21.0 | 3/19 | 모델 거버넌스 + 세션 관리 + 컨텍스트 압축 |
| v0.22.0 | 3/21 | Sandbox Hardening + REODE 하네스 패턴 역수입 |
| v0.23.0 | 3/22 | Gateway Adapter Pattern — 멀티프로바이더 안정화 |
| v0.24.0 | 3/22 | Slack Gateway 양방향 + MCPServerManager 싱글턴 |

---

## 프로젝트 수치 변화

| 지표 | 3/18 시작 | 3/22 종료 | 변화 |
|------|----------|----------|------|
| 버전 | 0.19.0 | 0.24.0 | +5 릴리스 |
| 모듈 | ~160 | 184 | +24 |
| 테스트 | ~2,500 | 3,055 | +555 |
| 도구 | 46 | 46 (+MCP 86) | MCP 86개 추가 |
| MCP 카탈로그 | 39 | 42 | +3 |
| 스킬 | 18 | 25 | +7 |
| HookEvent | 30 | 36 | +6 |
| LLM 프로바이더 | 1 (Anthropic) | 3 (+ OpenAI, ZhipuAI) | +2 |

---

## GAP 해소 현황

| 기간 | 해소 건 | 주요 항목 |
|------|:-------:|----------|
| 3/18 | 14 | Gateway, Lane Queue, Session Key, Failover, Announce, MCP Lifecycle, Policy, Multi-Provider 등 |
| 3/21 | 3 | Session Resume, Test Isolation, manage_auth_hint |
| 잔여 P2 | 2 | gap-atomic-write (tmp+rename), gap-webhook (HTTP endpoint) |

---

## 블로그 매핑

| 블로그 편 | 커버하는 파트 |
|----------|-------------|
| 50편 (geode serve) | Part 1 전체 |
| 51편 (MCP 병렬 시작) | Part 2 전체 |
| 52편 (Token Guard) | Part 4 예산 관리 |
| 기존 49편 (언어/샌드박스/승인) | Part 5 일부 |
| 기존 36편 (PolicyChain) | Part 5 일부 |
| 기존 30편 (칸반 시스템) | Part 8 일부 |

### 미커버 소재 후보

| 순위 | 소재 | 파트 | 비고 |
|------|------|------|------|
| 1 | NL Router 제거 → AgenticLoop 직행 진화 | Part 7 | 아키텍처 진화 스토리 |
| 2 | REODE 역수입 — fork에서 upstream으로 패턴 환류 | Part 6 | 프로젝트 간 패턴 이식 |
| 3 | Multi-Provider LLM — 3사 failover + 퍼지 매칭 | Part 3 | 49편 확장 가능 |
| 4 | Session Resume — 중단된 세션 복원 | Part 6 | 단독으로는 얇음 |

---

*Source: `blog/logs/geode-kanban-log-20260318-0322.md` | Category: [[blog-logs]]*

## Related

- [[blog-logs]]
- [[blog-hub]]
- [[geode]]
