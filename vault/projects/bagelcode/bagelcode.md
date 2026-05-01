---
title: Bagelcode — 신작팀 AI 개발자 과제 전형
type: project
category: project-hub
tags: [bagelcode, recruitment, multi-agent, task-2026-05]
sources:
  - "베이글코드 채용팀 메일 (2026-05-01)"
  - "https://career.bagelcode.com/ko/o/208045"
  - "https://www.bagelcode.com/article/bagelcode-x-ai-genie-..."
  - "https://www.bagelcode.com/article/ai-first-wiht-bagles-..."
created: 2026-05-01
updated: 2026-05-01
---

# Bagelcode — 신작팀 AI 개발자 과제 전형

> **2026-05-03 23:59 마감**. AI 코딩 에이전트로 멀티 에이전트 협업 도구를 만든다. 기한 내 1회 응시.

## 한 줄

베이글코드 신작팀(모바일 캐주얼) AI 개발자 포지션의 과제 전형. 두 개 이상의 AI 에이전트가 통신하고 사용자가 개입/관찰할 수 있는 도구를 직접 설계·구현해서 코드 + `.md` + 세션 로그/녹화로 제출.

## 핵심 일정

| 항목 | 값 |
|---|---|
| 메일 수신 | 2026-05-01 |
| 마감 | **2026-05-03 23:59 KST** |
| 응시 기회 | 1회 (수정 불가) |
| 실 작업시간 | ~25-30시간 추정 |

## References (1차 근거)

- [[bagelcode-recruitment-task]] — 채용팀 메일 원문 + 평가 신호 추론
- [[bagelcode-job-posting-208045]] — 공고 stub (CSR 페이지 본문 미수집)
- [[bagelcode-davis-system]] — DAVIS 사내 데이터 비서 (멀티 에이전트 사례)
- [[bagelcode-ai-first-culture]] — AI-First 문화 / "에이전트를 위한 에이전트"
- [[bagelcode-tradingagents-paper]] — TradingAgents (arXiv 2412.20138) — communication protocol 학술 근거
- [[bagelcode-frontier-orchestration-2026]] — **2026-05 frontier 사료 11종** (Anthropic / Cognition / Magentic-One / AutoGen 0.4 / LangGraph / ALAS / ICML resilience / CP-WBFT / MAR / MAD survey / Claude Code SDK / Codex)
- [[bagelcode-caching-frontier-2026]] — **캐싱·효율 사료 12종 3-tier** (Anthropic/OpenAI/Gemini docs + APC + Hierarchical + KVCOMM + ACON + Anchored + cautionary)
- [[bagelcode-xml-frontier-2026]] — **XML in LLM 사료 10종** (Anthropic XML 권장 + Claude Code 내부 패턴 + arXiv 2509 grammar-constrained + arXiv 2510 TAG + format-restriction 경고). System prompt = XML / Wire = JSON / Codex = Markdown 정책.

## Concepts (spec 정돈)

- [[bagelcode-transcripts-schema]] — Agent transcripts 스키마 (JSONL append-only, kind 어휘, 사용자 1급 actor)
- [[bagelcode-caching-strategy]] — Anthropic ephemeral cache + sandwich 경계 + 토큰 예산
- [[bagelcode-rubric-scoring]] — 5차원 × 5점 + 토큰 효율 + Karpathy P4 anti-deception 룰
- [[bagelcode-orchestration-topology]] — **Hub-Ledger-Spoke** (PDCA 폐기 → hierarchical hybrid)
- [[bagelcode-fault-tolerance-design]] — F1-F5 실패 분류 × 복구 primitive (연결부/통신/에이전트)

## Synthesis (의사결정)

- [[bagelcode-team-profile]] — 신작팀 페르소나 + 평가 우선순위
- [[bagelcode-kiki-leverage]] — Kiki/AppMaker 에서 가져올 자산 매핑
- [[bagelcode-task-direction]] — 컨셉 + 기술 선택 + 스코프 IN-OUT
- [[bagelcode-paperclip-vs-alternatives]] — Paperclip vs Swarm/AutoGen/CrewAI/Agent Squad/자체 구현
- [[bagelcode-agents-fixed]] — **Claude Code + Codex 고정** + Cross-provider Verifier (Gemini 디폴트)

## 핵심 가설

1. **베이글코드의 multi-agent 협업은 진행형 페인포인트** — 정답이 없으니 톤이 평가
2. **3일 prototype 사이클이 표준** (BagelJam:Dev 2일, TODOS 3일)
3. **사람·에이전트 양면 인터페이스** — CLI/MCP 우선, 화려한 UI 비우선
4. **인스트럭션 (.md) 이 코드만큼 자산** — 제출 요건에 명시
5. **Claude/Codex/Gemini "다 같이"** — 벤더 종속 회피 신호

## 권장 방향 (현재)

**Hub-Ledger-Spoke 토폴로지** ([[bagelcode-orchestration-topology]]) + **Claude Code + Codex 고정** ([[bagelcode-agents-fixed]]) + **Gemini Verifier (cross-provider)** + **F1-F5 fault tolerance** ([[bagelcode-fault-tolerance-design]]).

PDCA pipeline 은 ICML 2025 §F (Resilience-Faulty-Agents) 결과 기반 폐기 — chain 토폴로지 = 10.5% 저하 + Cognition 의 context-fragmentation 경고와 충돌. Hierarchical 5.5% 로 회귀.

## 가져올 자산

[[bagelcode-kiki-leverage]] + 신규 frontier 차용:
- **Sandwich Identity** ([[kiki-appmaker-orchestration]]) → per-agent `.md`
- **Hub-Spoke Routing** ([[hub-spoke-pattern]]) → Orchestrator 토폴로지
- **Slack-style Intent + Pipeline Notifier** ([[kiki-slack-integration]]) → 사용자 개입/관찰
- **Circuit Breaker** ([[kiki-circuit-breaker]]) → adapter 별 health probe
- **Scorecard Guards** ([[kiki-scorecard-guards]]) → C14·C18 가드 차용
- **Magentic-One Task/Progress Ledger** → orchestrator state 객체
- **ALAS local compensation** → 환경 변화 시 부분 retry
- **ICML Challenger/Inspector** → cross-provider Verifier 의 거부권
- **Karpathy 5원칙** — README 평가 신호

## 결정 대기 중

- [ ] Verifier provider 최종 (Gemini 디폴트 vs GLM stretch — 인증 셋업 측정)
- [ ] 시연 녹화 vs 라이브
- [ ] 제출 GitHub public vs zip
- [ ] [[bagelcode-job-posting-208045]] 본문 verbatim 확보 (선택)
- [ ] 게임 도메인 (안 C) 잔존 흔적 — README 도입부 1 case 로 유지할지

## Related

- [[kiki]] — Slack 행동 관측 + 멀티 에이전트 (원본 자산)
- [[kiki-appmaker]] — Install/lifecycle + sandwich identity (원본 자산)
- [[geode]] — Adaptive thinking, agentic loop, prompt system (참고 자산)
- [[mango]] — Project lead
- [[index]]
