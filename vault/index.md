---
title: Wiki Index
---

# Wiki Index

*Auto-maintained. Last updated: 2026-05-01*

## Projects

- [[geode]] — General-Purpose Autonomous Execution Agent (v0.64.0+, 223 core + 13 plugins, 4379 tests, 57 tools, 58 hooks, 20 pinned prompt hashes)
- [[kiki]] — Slack-based work-style profiling → Paperclip agent optimization (12 agents, attendance system)
- [[kiki-appmaker]] — Install / lifecycle / multi-agent provisioning (sister to kiki, 17-agent external-company)
- [[bagelcode]] — 신작팀 AI 개발자 과제 전형 hub (멀티 에이전트 협업 도구, 마감 2026-05-03)

## Bagelcode (recruitment task)

- [[bagelcode-recruitment-task]] — 채용팀 메일 원문 + 평가 신호
- [[bagelcode-job-posting-208045]] — 공고 stub (CSR 본문 미수집)
- [[bagelcode-davis-system]] — DAVIS 사내 데이터 비서 (멀티 에이전트 사례 블로그)
- [[bagelcode-ai-first-culture]] — AI-First / 에이전트를 위한 에이전트 (블로그)
- [[bagelcode-tradingagents-paper]] — TradingAgents (arXiv 2412.20138) communication protocol
- [[bagelcode-frontier-orchestration-2026]] — 2026-05 frontier 사료 11종 (Anthropic / Cognition / Magentic-One / AutoGen 0.4 / LangGraph / ALAS / ICML resilience / CP-WBFT / MAR / Claude Code SDK / Codex)
- [[bagelcode-caching-frontier-2026]] — 캐싱·효율 사료 12종 3-tier (provider docs + APC + Hierarchical + KVCOMM + ACON + cautionary)
- [[bagelcode-xml-frontier-2026]] — XML in LLM 사료 10종 (Anthropic XML 권장 + Claude Code 패턴 + grammar-constrained + TAG + format-restriction 경고)
- [[bagelcode-transcripts-schema]] — Agent transcripts 스키마 (JSONL append-only, 18 kind, 5 actor)
- [[bagelcode-caching-strategy]] — Anthropic ephemeral cache + sandwich 경계 + 토큰 예산
- [[bagelcode-rubric-scoring]] — 5차원 × 5점 + 토큰 효율 + anti-deception 룰
- [[bagelcode-orchestration-topology]] — Hub-Ledger-Spoke (PDCA 폐기 → hierarchical hybrid)
- [[bagelcode-fault-tolerance-design]] — F1-F5 실패 분류 × 복구 primitive (연결부/통신/에이전트)
- [[bagelcode-team-profile]] — 신작팀 페르소나 + 평가 우선순위
- [[bagelcode-kiki-leverage]] — Kiki/AppMaker 자산 활용 매핑
- [[bagelcode-paperclip-vs-alternatives]] — Paperclip vs Swarm/AutoGen/CrewAI 비교 (자체 구현 권장)
- [[bagelcode-agents-fixed]] — Claude Code + Codex 고정 + cross-provider Verifier (Gemini 디폴트)
- [[bagelcode-task-direction]] — 컨셉 + 기술 선택 + 스코프 + PDCA 폐기 결정 기록

## Concepts

### GEODE
- [[geode-architecture]] — 4-layer stack (Model→Runtime→Harness→Agent)
- [[geode-agentic-loop]] — while(tool_use) core primitive + error recovery
- [[geode-tool-system]] — 57 tools (6 always-loaded + 51 deferred), MCP 16 servers, 4-tier safety
- [[geode-memory-system]] — 5-tier context hierarchy + vault
- [[geode-bidirectional-learning]] — Correction + validation (Claude Code pattern)
- [[geode-computer-use]] — Provider-agnostic desktop automation (PyAutoGUI)
- [[geode-oauth-policy]] — Anthropic disabled (ToS), Codex active (GEODE-issued > CLI fallback, Cloudflare bypass)
- [[geode-gateway]] — Thin CLI → IPC → serve daemon
- [[geode-domain-plugin]] — DomainPort Protocol, Game IP pipeline
- [[geode-sandbox-breadcrumb]] — 3-layer LLM path error steering
- [[geode-context-guard]] — MCP 25K token guard + HTML→MD + overflow recovery
- [[geode-vault]] — Purpose-routed artifact storage
- [[geode-llm-models]] — 4 providers × 14 models (Anthropic + OpenAI PAYG + Codex + GLM), depth=1 fail-fast, opus-4-7 / gpt-5.5 / glm-5.1
- [[geode-tool-routing]] — AgenticLoop autonomous tool selection
- [[geode-quality-evaluation]] — 5-Layer verification (Game IP)
- [[geode-hook-production-gap]] — Hook system production GAP analysis (49 events, P0-P3 gaps)
- [[geode-scaffold-production]] — Claude Code 기반 8-step 스캐폴드 (CANNOT/CAN, CI Ratchet, GitFlow)
- [[geode-unified-scaffold]] — Hook-Driven State Machine 통합 워크플로우 enforcement
- [[geode-long-running-safety]] — 장시간 에이전트 안전성 패턴 (Wrap-Up, Ratchet, Triple Termination)
- [[geode-context-overflow-prevention]] — 컨텍스트 오버플로우 5-Layer 방어 모델
- [[geode-session-lane]] — SessionLane per-key Semaphore 설계 (OpenClaw 원본 버그 → GEODE 해결)
- [[geode-lifecycle-commands]] — /stop /clean /uninstall /status (v0.63.0 D-1, Hermes precedent)
- [[geode-experimental-namespace]] — experimental/ parking lot (RAPTOR + progressive compression, opt-in)
- [[geode-plugin-namespace]] — plugins/ namespace (v0.64.0 E, game_ip 분리)
- [[geode-architecture-extras]] — Context lifecycle + Orchestration decision + Observability + Wiring audit

### GEODE System Index
- [[geode-system-index]] — 모든 서브시스템 (4계층 스택, 진입점 색인, docs sitemap)

### GEODE Prompt System
- [[geode-prompt-system]] — Series hub (5계층 아키텍처 + 빠른 참조)
- [[geode-prompt-templates]] — 17 base/extended 템플릿 + 3 axes 데이터 카탈로그
- [[geode-prompt-assembly]] — PromptAssembler 6단계 + PROMPT_ASSEMBLED Hook
- [[geode-prompt-hashing]] — Karpathy P4 ratchet (SHA-256[:12] × 20 핀) + 재핀 워크플로
- [[geode-prompt-frontier-comparison]] — Hermes/OpenClaw/Claude Code/GEODE 4-way 비교
- [[geode-prompt-evolution]] — 8개 GAP 우선순위 (Anthropic cache, render hash, telemetry)

### LLM Reasoning
- [[geode-adaptive-thinking]] — Anthropic 4.6+ 자율 thinking 분배 + GEODE 7단 파이프라인 (effort 5단계, R6 surfacing, 3중 영속화, Opus 4.7 xhigh)
- [[deep-thinking-ratio]] — DTR: 추론 품질 = 토큰 깊이 (r=0.683), Think@n으로 50% 비용 절감
- [[overthinking-inverse-scaling]] — 긴 CoT가 성능을 해치는 역 스케일링 현상 (5편 독립 입증)
- [[test-time-compute-scaling]] — 추론 시점 compute 배분 전략 생태계 (Google trajectory 포함)
- [[tuned-lens]] — Transformer 레이어별 예측 변화 추적 해석 도구

### Kiki
- [[kiki-profile-pipeline]] — Slack → Profile → Directive 5-stage pipeline
- [[kiki-confidence-scoring]] — Confidence scoring + temporal decay + 5 context modes
- [[kiki-circuit-breaker]] — Per-agent + company-wide fault tolerance
- [[kiki-scorecard-guards]] — C1-C21 guardrails + Lead/PO scorecard gates
- [[kiki-slack-integration]] — 9 intent commands + pipeline notifier + agent router
- [[kiki-team-bootstrap]] — YAML template → runtime agent configuration
- [[kiki-feedback-loop]] — Issue comment → profile correction (bidirectional)
- [[engineering-team]] — v3: 12-agent PO-driven team (FIFO dual squads)
- [[attendance-domain]] — 18-module domain map with labor law rules
- [[finance-team]] — 3-person finance team structure
- [[hub-spoke-pattern]] — Central coordinator + specialists
- [[budget-tiers]] — S/M/L/XL token budget
- [[paperclip-integration]] — Kiki ↔ Paperclip architecture
- [[executive-summary-style]] — Two-layer reporting
- [[scenario-analysis]] — Bear/Base/Bull methodology
- [[risk-scenario-analysis]] — Risk assessment framework
- [[compliance-gates]] — Regulatory checkpoints
- [[kiki-close-period-pattern]] — 분기 마감 시 팀 행동 변화 패턴 (압축 모드, Same-Day Handoff)

### Kiki Identity & Architecture (mirror from kiki vault)
- [[karpathy-engineering-principles]] — P1-P5 엔지니어링 (Constraints / Explore / MVC / Anti-Deception / Git State)
- [[karpathy-identity-principles]] — KIKI.md 정체성 P1-P5 (Evals, Simplicity, Verification, Reproducibility, User-first)
- [[behavioral-profiling]] — 4축 프로파일 모델 + signals-only privacy boundary
- [[llm-wiki-pattern]] — Karpathy LLM Wiki 3-layer 아키텍처 (raw → wiki → schema)
- [[pipeline-guardrails]] — 21-Crack System (이벤트 기반 강제, C1-C21)
- [[review-scorecard]] — 6차원 0-5 점수, 24/30 임계, Anti-Deception 자동 검출
- [[scaffold-app-boundary]] — kiki(scaffold) ↔ kiki-appmaker(operational) 경계
- [[versioned-plugin-path]] — Paperclip manifest cache 우회 (SHA-derived path)

### Kiki AppMaker
- [[kiki-appmaker-orchestration]] — Sandwich identity + stage execution footer (4-section AGENTS.md)
- [[kiki-appmaker-pdca]] — PDCA host-mode 워크플로우 (PoC 모드)
- [[kiki-appmaker-deployment]] — D-1..D-9 EC2 + nginx + Certbot 배포 패턴
- [[kiki-appmaker-pin-system]] — PIN match-3 + pitch deck 시리즈 (manager-facing demo)

## Entities

### People
- [[mango]] — Project lead, system architect (GEODE, Kiki, REODE)

### Kiki Agents
- [[cto-agent]] · [[po-agent]] · [[planner-agent]] · [[designer-agent]]
- [[lead-1]] · [[developer-1]] · [[qa-1]] · [[lead-2]] · [[developer-2]] · [[qa-2]]
- [[jpark-cfo]] · [[skim-analyst]] · [[hlee-accountant]]
- [[mango-user]] — Kiki 관찰 대상 유저 프로필 (병렬 프로젝트, 야간 집중)

### Kiki AppMaker Agents (11-role)
- [[kiki-appmaker-agent-roles]] — CTO/PM/PO/Design/Dev/QA Lead + DevOps Lead/Worker + Infra Lead/Local + Quality Standards

## References

### Frontier Research
- [[geode-claude-code-patterns]] — Claude Code patterns adopted by GEODE
- [[geode-openclaw-patterns]] — OpenClaw patterns adopted by GEODE
- [[hook-claude-code-comparison]] — Hook system comparison: Claude Code vs GEODE
- [[geode-research-catchup]] — 4 in-repo research notes (codex-oauth, claude-code-dag, model-ux, defect-scan)
- [[kiki-research-index]] — 5 cross-codebase research (Claude Code routing, LLM Wiki, Paperclip, QMD)
- [[kiki-appmaker-research]] — 6 AppMaker research (token-opt, paperclip, llm-wiki, qmd-search)

### GEODE ADRs + Audit
- [[geode-adr-index]] — 4 ADRs (prompt injection, subagent dry-run, async pipeline, .geode enhancement)
- [[geode-reasoning-depth-audit]] — R1~R9 audit synthesis (v0.55~v0.62)

### Kiki AppMaker Superpowers
- [[kiki-appmaker-superpowers]] — 10 plans + 13 specs + 1 report (slack-bot, dashboard, scaffold-correctness, deploy-guards)
- [[kiki-appmaker-agent-templates]] — Lead/Worker template definitions (yaml + sandwich)
- [[kiki-appmaker-skills-index]] — px-appmaker skill + 4 운영 가이드

### Blog (146 documents indexed, individual graph nodes)
- [[blog-hub]] — Central hub for all 15 blog categories
- [[blog-architecture]] — Architecture deep-dives (13)
- [[blog-tools-mcp]] — Tools & MCP (6)
- [[blog-memory-context]] — Memory, context, learning (13)
- [[blog-harness-frontier]] — Harness & frontier research (13)
- [[blog-orchestration]] — Orchestration, hooks, sub-agents (15)
- [[blog-safety]] — Safety, verification, HITL (10)
- [[blog-technical]] — Unix socket, IPC, ANSI (8)
- [[blog-llm-resilience]] — LLM resilience, fallback, recovery (7)
- [[blog-narrative]] — Case studies, journeys (4)
- [[blog-reode]] — REODE migration project (9)
- [[blog-release]] — Release notes (2)
- [[blog-research]] — Research documents (13)
- [[blog-research-detail]] — Research 13개 상세 인덱스 (프론티어, 메모리, 안전성, ML Infra)
- [[blog-internal]] — Internal evaluations
- [[blog-legacy]] — Legacy architecture & plans
- [[blog-logs]] — Kanban session logs

### Career
- [[career-hub]] — Resume + Portfolio + Blog 중앙 인덱스
- [[resume-targets]] — 21 companies, 45+ positions
- [[resume-bullet-maps-hub]] — 4 bullet maps + 3 narratives 인덱스 (GEODE/Kiki/REODE/Eco2)
- [[resume-linkedin-narrative]] — LinkedIn About + Experience SSOT (Code is a punch card)
- [[resume-geode-bullet-map]] — GEODE 카테고리 A~F (~40 항목, 문제→설계→결과)
- [[resume-kiki-bullet-map]] — Kiki K-A~K-D (27 agents, 21 guardrails, 4,594줄 plugin)
- [[resume-reode-bullet-map]] — REODE 5,523 files / 5h48m / $388
- [[resume-eco2-bullet-map]] — Eco² SeSACTHON 4th/181, K8s 24-node
- [[resume-llm-5-commandments]] — LLM 5계명 (천공카드 비유)
- [[resume-kiki-llm-wiki-reference]] — Kiki LLM-Wiki 엔진 (27 raw → 35 wiki, 8 skills)
- [[portfolio-geode]] — GEODE portfolio deck (10 versions, PPTX/PDF)
- [[nexon-ai-live]] — Nexon AI Live 과제 (GEODE 원점)

### Kiki
- [[kiki-project-progress]] — Kiki system milestones and skills
- [[kiki-finance-signals-april]] — Finance Team April 시그널 분석 (행동 패턴, Confidence Delta, 04-01~08)
- [[kiki-signal-2026-04-02]] · [[kiki-signal-2026-04-04]] · [[kiki-signal-2026-04-06]] · [[kiki-signal-2026-04-07]] · [[kiki-signal-2026-04-08]] — Finance daily signal pages
- [[kiki-signal-2026-04-08-engineering]] — 9-에이전트 첫 end-to-end 핸드오프 관측
- [[kiki-signal-2026-04-10-general]] — Mango 첫 @Kiki 직접 인터랙션
- [[kiki-signal-2026-04-11-null]] — Null observation + confidence decay 12 프로필
- [[kiki-signal-2026-04-15-mango]] — git+LinkedIn fallback (4/14 7-PR 스프린트, LAN, harness 자기 선언)
- [[kiki-signal-2026-04-15-slack]] — Slack-direct (kiki-maintain 가입, 인터랙티브 버튼 UI)
- [[geode-changelog-summary]] — GEODE 릴리스 이력 요약 (v0.6→v0.48, 5 Phase)

## Skills

- [[geode-development-workflow]] — GEODE 개발 워크플로우 (8단계 + Quality Gates)
- [[kiki-skills-index]] — Kiki runtime skills + 운영 가이드
- [[kiki-appmaker-skills-index]] — AppMaker px-skill + 운영 가이드 (codebase-analysis, db-schema, qa-runtime, setup)

## Kiki Plugin (Paperclip plugin source — mirror)

### Cron Jobs
- [[zombie-sweeper]] — `*/5 * * * *` heartbeat-run lock release
- [[stage-reaper]] — `*/2 * * * *` 3-tier 스테이지 복구
- [[pipeline-reaper]] — `*/30 * * * *` portfolio R1-R4 rules
- [[pipeline-health-snapshot]] — `0 0 * * *` 일일 큐 형태 + reaper digest

### Tools
- [[broadcast_maintenance_proposals]] · [[collect_user_signals]] · [[flag_diagram_update]] · [[get_pending_slack_prompt]] · [[query_issue_detail]] · [[query_pipeline_status]] · [[read_target_project]]

## Kiki Specs (design history mirror)

- [[2026-04-08-slack-bot-integration-design]] · [[2026-04-09-kiki-slack-agent-redesign]]
- [[2026-04-12-diagram-dashboard-design]] · [[2026-04-12-dynamic-squad-resolution-design]]
- [[2026-04-28-stage-reaper-effective-recovery-design]] · [[2026-04-28-pipeline-reaper-design]]

## Synthesis

- [[geode-session-58-retrospective]] — OAuth + Computer Use + Learning 교차 분석
- [[geode-reasoning-depth-audit]] — R1~R9 reasoning audit 시리즈 (v0.55~v0.62)
- [[kiki-handoff-retros]] — Failure analysis + Session 2/3 + Paperclip rebase cycle
- [[kiki-maturity-sprint-april]] — 2026-04-12~14 변곡점 (LLM-Wiki 엔진 + 인터랙티브 UI + LAN, mango 7-PR 스프린트)
- [[agent-governance-overview]] — Slack→signal→profile→directive→runtime→guards 전체 거버넌스 루프
- [[ttree-project]] — ttree 운영 인스턴스 cross-cut 분석
- [[observation-summary-april]] — 12 signal 크로스 요약 (Q1 마감 → Q2 전환 → Kiki 성숙)
- [[2026-04-28-session-synthesis]] — pitch + TradingAgents + stage/pipeline-reaper + observability 5-layer 종합
- [[kiki-appmaker-handoff-retros]] — AppMaker session 2/3 + 학습 → spec 변환 트래킹

## Journal

- [[2026-04-07]] — Wiki build + engine + Karpathy pattern 적용
