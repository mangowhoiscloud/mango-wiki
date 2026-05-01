---
title: GEODE Changelog Summary
summary: "GEODE 릴리스 이력 요약. v0.6.0부터 v0.64.0 + Unreleased 까지 주요 마일스톤."
tags: [geode, changelog, release, history]
sources: [raw/geode-docs/CHANGELOG.md]
created: 2026-04-15
updated: 2026-05-01
provenance: { extracted: 0.95, inferred: 0.05 }
---

## Evolution Arc

GEODE는 2026-03-10 ~ 2026-05-01 (약 52일) 동안 v0.6.0에서 v0.64.0+ 까지 64+ 릴리스를 거쳤다. 저평가 IP 발굴 도메인 에이전트에서 범용 자율 실행 에이전트로 진화하고, v0.64.0 에서 game_ip 도메인이 plugins/ 로 분리되어 진정한 도메인 무관성에 도달한 궤적이다.

## Phase 1: Foundation (v0.6.0 ~ v0.9.0) — 2026-03-10 ~ 03-11

- **v0.6.0**: Initial release. LangGraph 7-node pipeline (`router → signals → analyst×4 → evaluator×3 → scoring → verification → synthesizer`). 4 Analysts, 3 Evaluators, 14-Axis PSM Scoring, G1-G4 Guardrails, BiasBuster 6-bias, Cross-LLM validation, 3-Tier Memory, AgenticLoop, BashTool, NL Router, REPL CLI
- **v0.6.1**: `src/geode/` → `core/` 패키지 구조 전환. 프롬프트/도구/도메인 데이터 외부화 (SSOT)
- **v0.9.0**: General Assistant 전환. MCP 클라이언트, Skills 시스템, 9개 신규 도구, NL Router scored matching + fuzzy + multi-intent

## Phase 2: Wiring & Autonomy (v0.10.0 ~ v0.19.0) — 2026-03-12 ~ 03-18

- **v0.10.0**: SubAgent 병렬 실행 완성. SchedulerService 프로덕션 와이어링. NL 자연어 스케줄 E2E. OpenClaw 세션 키 격리. Tests 2077+
- **v0.13.0**: Hook 시스템 도입 (16 events). Profile 자동 학습. Memory tool CRUD
- **v0.16.0**: Thin CLI + Serve daemon 아키텍처. IPC 기반 클라이언트-서버 분리
- **v0.19.0**: Cross-provider failover (Anthropic → OpenAI). Native tool 통합. Profile 영속성

## Phase 3: Multi-Provider & Context (v0.20.0 ~ v0.29.0) — 2026-03-19 ~ 03-26

- **v0.20.0**: Multi-Provider LLM (Anthropic/OpenAI/ZhipuAI 3사 failover). `.geode` Context Hub 5-Layer (C0~C4). Journal 자동 침전. SessionCheckpoint. Vault 산출물 저장소. 6-Layer Policy Chain. Context overflow detection
- **v0.24.0**: Codebase audit + God Object 분해. agentic_loop.py 1800→1400줄
- **v0.29.0**: Provider Module 패턴으로 client.py 분할. Native tools 통합. Action Display

## Phase 4: Architecture Cleanup (v0.30.0 ~ v0.39.0) — 2026-03-27 ~ 03-31

- **v0.30.0**: MCP 카탈로그 단일화. `infrastructure/ports/` 삭제 → co-locate 이동. Registry 삭제. Modules 195→187
- **v0.35.0**: PromptAssembler 도입. 프롬프트 조립 로직 중앙화
- **v0.37.0**: AgenticLoop SRP 분해 1차 (tool_handler 추출)
- **v0.39.0**: IPC pipeline event parity. Gateway context overflow recovery. CJK-aware display

## Phase 5: Production Hardening (v0.40.0 ~ v0.48.0) — 2026-03-31 ~ 04-11

- **v0.40.0**: 200K 절대 토큰 가드. LLM 친화적 에러 메시지 (`tool_error()` 구조화). Graceful serve drain
- **v0.43.0**: IPC HITL 릴레이 — thin CLI에서 WRITE/DANGEROUS 승인 양방향 릴레이
- **v0.45.0**: SessionMetrics (p50/p95 latency). User preferences 시스템 프롬프트 주입. Scoring weights 외부화
- **v0.46.0**: Computer-use 하네스 (PyAutoGUI). OpenAI Codex OAuth 토큰 재사용. Sandbox breadcrumb 3-layer
- **v0.47.0**: Scheduler GAP-close (8 gaps). O_EXCL lock + PID probe. Deterministic jitter. Missed task recovery
- **v0.47.1**: AgenticLoop SRP 분해 2차 (context_manager, convergence 추출). Runtime.create() staged builders
- **v0.48.0**: Hook interceptor pattern (block/modify chain). 6 new HookEvents (49→55). Session cost guard. Sandbox validation module (Claude Code parity, 14/15 GAP 해소). Layer violation 3건 수정

## Phase 6: Reasoning Depth Series (v0.49.0 ~ v0.62.0) — 2026-04-12 ~ 04-28

R1~R9 reasoning depth audit 시리즈. 4개 프로바이더의 reasoning wire kwargs 를 ground truth (Hermes/OpenClaw/Claude Code) 에 맞춰 정렬. 자세한 내용은 [[geode-reasoning-depth-audit]].

- **v0.55.0** (R1): Codex Plus encrypted reasoning replay — `codex_reasoning_items` sidecar + multi-turn `input` array replay
- **v0.56.0** (R4-mini): Anthropic adaptive thinking xhigh on Opus 4.7 — `output_config.effort="xhigh"` + `display="summarized"`. 4.6 / Sonnet 4.6 reject xhigh, downgrade to `max`
- **v0.57.0** (R6): Reasoning summaries → AgenticUI. `reasoning_summary` IPC 이벤트 + sidecar 분리
- **v0.58.0** (R2): GLM thinking 필드 활성화 — `extra_body={"thinking":{"type":"enabled","clear_thinking":False}}` for GLM-4.5+
- **v0.60.0** (R3-mini): PAYG OpenAI Responses parity — `include=[reasoning.encrypted_content]` + `summary="auto"` for gpt-5.x
- **v0.61.0** (R3-mini follow-up): PAYG `store=False` 명시. Codex Plus parity. SDK default(True) 대신 명시
- **v0.62.0** (R9): Live wire test — `tests/test_e2e_live_reasoning_depth.py` 5 cases, marker `-m live`, default-deselected

## Phase 7: Lifecycle + Plugin Split (v0.63.0 ~ v0.64.0) — 2026-04-29

- **v0.63.0** (D-1): Lifecycle commands — `/stop`, `/clean`, `/uninstall`, `/status`. Hermes precedent. 4개 슬래시 명령으로 데몬 상태 관리. ([[geode-lifecycle-commands]])
- **v0.64.0** (E): **Game IP domain plugin namespace split.** `core/domains/game_ip/` → `plugins/game_ip/` (12 모듈, 220 파일 incl config + fixtures). Hatchling wheel ships both `core/` + `plugins/`. 72 imports rewritten across 36 files. 3 hardcoded paths corrected. 4360 tests still pass. ([[geode-plugin-namespace]])

## Unreleased (2026-05-01)

- **feat(llm)**: `apply_messages_cache_control()` in `core/llm/providers/anthropic.py` (Hermes `system_and_3` parity). Last 3 non-system messages get `cache_control: ephemeral` on top of the existing system block STATIC/DYNAMIC split — fills Anthropic's 4 cache breakpoints. Non-mutating helper at `:175`, called at `:501` in `agentic_call._do_call`. 19 new tests. **PR #864 → #865 merged 2026-05-01**. (See `portfolio/geode/docs/runtime/llm/prompt-caching` for site copy.)

## By the Numbers (2026-05-01 실측)

| Metric | v0.6.0 | v0.48.0 | **v0.64.0+** |
|--------|--------|---------|---|
| Modules | ~60 | 215 | **236** (core 223 + plugins 13) |
| Tests | 1823 | 3939+ | **4379** (post PR #864) |
| Tools | 17 | 56 | **57** (registry: 6 always-loaded + 51 deferred) |
| Hook Events | 0 | 55 | **58** |
| Pinned Prompt Hashes | 0 | — | **20** (`_PINNED_HASHES`, CI gate) |
| LLM Providers | 1 | 3 | **4** (Anthropic/OpenAI Responses/Codex Plus/GLM) |
| Releases | 1 | 48 | **64+** |

## Related

- [[geode]] — Project overview
- [[geode-architecture]] — 4-Layer architecture (v0.37 단순화 후)
- [[geode-system-index]] — 모든 서브시스템 색인 (2026-05-01 실측)
- [[geode-claude-code-patterns]] — Claude Code parity patterns
- [[geode-reasoning-depth-audit]] — Phase 6 R1~R9 시리즈 종합
- [[geode-prompt-system]] — 프롬프트 시리즈 5 페이지
- [[geode-lifecycle-commands]] — v0.63.0 D-1
- [[geode-plugin-namespace]] — v0.64.0 E
