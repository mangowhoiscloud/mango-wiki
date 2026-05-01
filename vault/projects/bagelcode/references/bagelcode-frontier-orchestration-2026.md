---
title: 베이글코드 과제 — Frontier multi-agent orchestration 사료 인덱스 (2025-2026 기준)
category: references
tags: [bagelcode, frontier, multi-agent, orchestration, fault-tolerance, research-index, 2026]
sources:
  - "Anthropic Engineering blog (2025)"
  - "Cognition blog (2025-06)"
  - "Microsoft Research / AutoGen 0.4 / Magentic-One"
  - "LangChain LangGraph"
  - "arXiv 2025-2026 multi-agent fault tolerance papers"
created: 2026-05-01
updated: 2026-05-01
---

# Frontier Multi-Agent Orchestration — 2026-05 기준 사료 인덱스

> 베이글코드 과제의 **장애 대응 / 환경 변화 / 통신 견고성** 주안점에 대응하는 frontier 자료 11종. 단일 PDCA 라인은 ICML 2025 resilience 논문 기준으로 **23.7% 성능 저하 (flat peer)** 또는 **10.5% (linear chain)** 발생 → 폐기. **Hierarchical (5.5%)** 으로 회귀 + 검증된 safeguard 차용.

## 1차 사료 (벤더 / 리서처 직접 발화)

### A. Anthropic Engineering — How we built our multi-agent research system (2025)
- URL: https://www.anthropic.com/engineering/multi-agent-research-system
- **결론**: orchestrator-worker 가 단일 에이전트 대비 **+90.2%**, 복잡 쿼리 시간 **-90%**
- **token 비용**: agent 가 chat 대비 4×, multi-agent 가 chat 대비 **15×** → 가치 높은 작업에만
- **장애 처리**: "letting the agent know when a tool is failing and letting it adapt works surprisingly well"
- **상태 유지**: durable execution + resume from error point. "restarts are expensive and frustrating"
- **deployment**: rainbow deployments — 구·신 버전 동시 가동 + 점진 트래픽 이동
- **메모리**: "spawn fresh subagents with clean contexts while maintaining continuity through careful handoffs"
- **filesystem 출력**: "Subagent output to a filesystem to minimize the 'game of telephone'" — **lightweight reference 만 coordinator 로 전달**
- **한계 인정**: 동기 spawn → bottleneck. 코딩 작업처럼 dependency 강한 도메인은 multi-agent 잘 안 맞음.
- **프롬프트가 1차 도구**: "prompt engineering was our primary lever"

### B. Cognition AI — Don't Build Multi-Agents (2025-06)
- URL: https://cognition.ai/blog/dont-build-multi-agents
- **반대 입장**: "running multiple agents in collaboration only results in fragile systems"
- **두 원칙**:
  1. **"Share context, and share full agent traces, not just individual messages"**
  2. **"Actions carry implicit decisions, and conflicting decisions carry bad results"**
- **Claude Code 의 선택**: "Claude Code as of June 2025 is an example of an agent that spawns subtasks but never does work in parallel" — subagent 는 **질문 답변만**, 코드 작성 X
- **#1 job**: "Context Engineering... is effectively the #1 job of engineers building AI agents"
- **단일 스레드 우월성**: "context is continuous"

→ **Anthropic vs Cognition 의 화해**: Anthropic 은 **research/exploration** (병렬 가능), Cognition 은 **coding** (단일 컨텍스트 우월). **우리 과제 = 둘 다**. 화해는 "단일 transcript + 계층적 spawn" ([[bagelcode-orchestration-topology]]).

### C. Microsoft Research — Magentic-One (arXiv 2411.04468)
- URL: https://arxiv.org/abs/2411.04468
- **구조**: Orchestrator + 4 specialist (WebSurfer, FileSurfer, Coder, ComputerTerminal)
- **2개 ledger**: **Task Ledger** (사실/추측 수집) + **Progress Ledger** (각 step self-reflect)
- **재계획 루프**: "plans, tracks progress, and re-plans to recover from errors"
- **Generalist 평가**: GAIA, AssistantBench, WebArena 에서 통계적 경쟁력
- **base**: AutoGen 위에서 구현 (오픈소스)

### D. Microsoft — AutoGen v0.4 (2024-10 preview, 2025 GA)
- URL: https://devblogs.microsoft.com/autogen/autogen-reimagined-launching-autogen-0-4/
- **핵심 변경**: actor model + async event-driven runtime
- **이점**: 다른 process / 다른 언어로 에이전트 분산 가능, 동적 워크플로우, observability
- **3-layer**: Core (actor) + AgentChat (prototyping) + Extensions
- **메시지 분리**: "decouples how messages are delivered between agents from how agents handle them"

### E. LangChain — LangGraph (2025 enterprise)
- URL: https://www.langchain.com/langgraph
- **핵심**: 명시적 state machine, reducer-driven schema (TypedDict + Annotated)
- **patterns**: Branching · Conditional Routing · Supervisor · **Reflection** (cyclic critique)
- **checkpointing**: persistent memory + safe parallel + deterministic replay/audit
- **MCP 결합**: 그래프 구조 / 노드 상태 / 에지 전이 / 메시지 로그 전체 직렬화

## 2차 사료 (학술 — fault tolerance / 복원력)

### F. ICML 2025 — On the Resilience of LLM-Based Multi-Agent Collaboration with Faulty Agents
- URL: https://openreview.net/forum?id=bkiM54QftZ
- **fault 시뮬**: AutoTransform (역할 은밀 변경) + AutoInject (메시지 직접 오류 주입)
- **safeguard 2종**:
  - **Challenger** — 에이전트가 다른 에이전트의 결과 도전
  - **Inspector** — 메시지 검토·수정하는 독립 에이전트
- **회복**: 손실 성능의 **최대 96.4% 회복**
- ★ **topology 별 저하** (이 데이터가 우리 결정의 핵심):

| 구조 | 저하율 |
|---|---|
| **계층형 A→(B↔C)** | **5.5%** (최우수) |
| 선형 chain | 10.5% |
| 평면 peer | **23.7%** (최악) |

→ **PDCA 가 사실 chain 토폴로지** = 10.5% 저하. Hierarchical 로 가야.

### G. arXiv 2511.10400 — Byzantine Fault Tolerance for MAS (CP-WBFT)
- URL: https://arxiv.org/abs/2511.10400
- **CP-WBFT**: confidence probe-based weighted Byzantine FT consensus
- **결과**: **85.7% fault rate** 에서도 안정 동작
- **인사이트**: "LLM 기반 에이전트는 오류 메시지 흐름 처리 시 더 강한 회의적 태도" — 자연스러운 immune system
- **적용**: 우리 Critic 의 weighted voting + abstain 옵션

### H. arXiv 2505.12501 — ALAS: Stateful Multi-LLM Disruption Handling
- URL: https://arxiv.org/abs/2505.12501
- **핵심**: "**history-aware local compensation**" — disruption 발생 시 **전역 재계획 회피**, 연쇄 효과 억제
- **LLM 4가지 결함 해결**: 자체 검증 부재 / 문맥 손실 / 근시안 / 상태 미관리
- **자동 상태 추적**: 각 에이전트가 자기 state 유지, 모듈화 조율
- **결과**: 정적·동적 시나리오 모두 SOTA

### I. arXiv 2512.20845 — MAR: Multi-Agent Reflexion
- URL: https://arxiv.org/abs/2512.20845
- **단일 Reflexion 의 문제**: "degeneration-of-thought" — 같은 결함 추론 반복
- **MAR**: multi-agent self-critique 로 해결
- **결과**: HotPotQA 47% EM, HumanEval 82.7%

### J. ICLR 2025 blog — Multi-Agent Debate Reality Check
- URL: https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/
- **반전 결과**: 5 MAD 프레임워크 × 9 벤치마크 평가에서 **MAD 가 CoT/SC 를 일관되게 못 이김**
- **inference 예산 ↑ 시 scaling 도 안 됨**
- → **경고**: 무지성 debate 추가는 토큰 낭비. debate 는 **debate 가 진짜 도움 되는 곳에만** (사실 검증, 가치 판단).

## 벤더 도구 사료 (우리가 실제로 쓸 것)

### K. Anthropic — Claude Code Agent SDK (renamed 2025-09)
- URL: https://code.claude.com/docs/en/agent-sdk/overview
- **headless mode**: CI/CD 가능 (우리 README 동작 보장)
- **subagent**: `Task` tool 통한 spawn, **depth=1** 제한 (재귀 spawn 금지)
- **버전**: Python 0.1.48 / TS 0.2.71 (2026-03 기준)
- **Swarm Mode (2026 초)**: TeammateTool 13 ops, Sonnet 5 와 동시 출시

### L. OpenAI — Codex Subagents
- URL: https://developers.openai.com/codex/subagents
- **TOML 정의**: `~/.codex/agents/<name>.toml`, 필수 필드 `name/description/developer_instructions`
- **병렬 제한**: `max_threads` 기본 6, `max_depth` 기본 1
- **CSV 배치**: `spawn_agents_on_csv` — 한 row = 한 work item, 결과 자동 집계
- **타임아웃**: `agents.job_max_runtime_seconds` 기본 1800
- **승인 흐름**: "non-interactive flows, ... action that needs new approval fails and Codex surfaces the error back to the parent workflow"

## 선행 사료 (이미 ingest)

- [[bagelcode-tradingagents-paper]] — TradingAgents §4.1-4.2 structured comms protocol
- [[kiki-circuit-breaker]] — per-agent + company-wide circuit breaker (kiki 가 이미 production 운영 중)
- [[kiki-scorecard-guards]] — C14 (10초 후 자동 wake), C18 (least-loaded peer 재배정)
- [[kiki-appmaker-orchestration]] — sandwich §4 routing enforcement footer

## 종합 함의 (요약 5)

1. **단일 transcript + 계층적 spawn** = Anthropic ⊕ Cognition 화해 지점
2. **chain 토폴로지 = 평균 10.5% 저하** → PDCA pipeline 폐기
3. **hierarchical = 5.5% 저하** + Challenger·Inspector = 96.4% 회복
4. **ALAS local compensation** = disruption 발생 시 **부분 재실행만**, 전역 retry 금지
5. **Magentic-One Task/Progress Ledger** = 재계획 가능한 explicit state 객체

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-orchestration-topology]] — 본 사료 기반 topology 결정
- [[bagelcode-fault-tolerance-design]] — 실패 분류 × 복구 primitive
- [[bagelcode-agents-fixed]] — Claude Code + Codex 고정 + cross-provider 검증
- [[bagelcode-tradingagents-paper]] — protocol 의 학술적 1차 근거
- [[bagelcode-paperclip-vs-alternatives]] — framework 비채택 결정 (이 페이지 사료가 그 결정 보강)
