---
title: What is GEODE
category: overview
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "GEODE.md"
  - "core/runtime.py:95-223"
  - "core/cli/__init__.py:987-1018"
  - "pyproject.toml:1-7"
external_refs:
  - url: "https://docs.openclaw.ai/concepts/architecture.md"
    pattern: "Gateway-centric (대조)"
  - url: "https://hermes-agent.nousresearch.com/docs/"
    pattern: "Self-learning loop (대조)"
legacy_portfolio_path: /portfolio/geode/docs
---

# What is GEODE

GEODE는 자연어 한 줄을 받아 **장기 자율 실행(long-running autonomous execution)** 으로 풀어내는 에이전트 하네스다. 사용자가 "summarize the latest AI research trends" 같은 단일 명령을 던지면 — 에이전트가 도구를 고르고, 결과를 메모리에 적재하며, 검증 게이트를 통과시키고, 필요하면 스케줄러에 작업을 등록한다 — 한 사이클을 사람이 끼지 않고 끝까지 돌릴 수 있도록 설계된 시스템이다.

## 한 줄 정의

> A general-purpose autonomous execution agent built on LangGraph.
> *(GEODE.md:Identity)*

LangGraph StateGraph를 그래프 기본단위로 채택하고, 그 위에 4-layer 스택(`core/runtime.py:95-223`의 `RuntimeCoreConfig`/`RuntimeAutomationConfig`/`RuntimeMemoryConfig` 3개 dataclass로 의존성 주입)을 쌓아 올렸다.

## 무엇이 다른가

| 차별점 | 위치 | 설명 |
|---|---|---|
| **CANNOT > CAN** 설계 철학 | `CLAUDE.md:79-95` | 자유보다 가드레일이 우선. 위반 시 즉시 중지·교정. |
| **4-layer 스택** | `core/runtime.py` + `core/cli/__init__.py` + `core/agent/loop.py` + `core/graph.py` | Model → Runtime → Harness → Agent 분리. |
| **Thin CLI + Serve daemon** | `core/cli/__init__.py:987-1018` ↔ `core/server/ipc_server/poller.py` | CLI는 입출력만, Serve는 AgenticLoop+MCP+memory 공유. |
| **Guardrails G1-G4** | `core/verification/guardrails.py:13-80` | Schema/Range/Grounding/Consistency 자동 검증. |
| **BiasBuster** | `core/verification/biasbuster.py:24-100` | 6종 편향 통계 + LLM 검출. |
| **DomainPort Protocol** | `core/domains/port.py:18-140` | 16-method protocol로 도메인 특화 파이프라인 주입. |

## 비-목표 (No-goals)

- **General-purpose chatbot** — 단발 대화 가능하나 가치는 장기 실행에 있다.
- **Multi-channel chat router** — Slack 단일 게이트웨이만 (`core/server/supervised/slack_poller.py`). OpenClaw식 15+ 채널 라우팅은 비대상.
- **모델 학습/파인튜닝 플랫폼** — 학습 인프라 아님. 외부 LLM 호출만 (Anthropic/OpenAI Codex/OpenAI PAYG/GLM).

## 인접 시스템과의 위치

OpenClaw는 **gateway-centric**(15+ 채널 라우팅), Hermes는 **self-learning agent**(스킬 자동 생성 + persistent memory) 중심이다. GEODE는:

- **vs OpenClaw**: 채널 다양성 대신 **검증 시스템(G1-G4 + BiasBuster + Cross-LLM)** 과 **도메인 플러그인** 깊이를 우선.
- **vs Hermes**: persistent memory 컨셉은 공유하되 (5-tier context), GEODE는 학습 루프 대신 **Socratic Gate Q1-Q5** 같은 **개발자 워크플로 강제**로 LLM 신뢰성을 확보하는 쪽이다.

자세한 비교는 [[frontier-comparison]] 참조.

## 메트릭 (v0.65.0 측정값)

| 항목 | 값 | 출처 |
|---|---|---|
| Python | >= 3.12 | `pyproject.toml:7` |
| Modules | 236 (core 223 + plugins 13) | `find core/ plugins/ -name "*.py" \| wc -l` |
| Tests | 4380+ passed (1 skipped, 24 deselected) | `uv run pytest tests/ -m "not live"` |
| Hooks | 58 events | `core/hooks/system.py:28-140` |
| Tools | SAFE 27 + WRITE 16 + DANGEROUS 2 | `core/agent/safety.py:11-100` |
| Skills (런타임) | `core/skills/skills.py:123-192` | 4-tier discovery |
| Skills (scaffold) | 24개 `.claude/skills/*/SKILL.md` | 개발자용 |

## 다음

- [[installation]] — 설치
- [[quickstart]] — 첫 실행
- [[4-layer-stack]] — 아키텍처 개관
- [[design-philosophy]] — CANNOT/CAN 철학
