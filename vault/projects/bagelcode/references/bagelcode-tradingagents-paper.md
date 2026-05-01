---
title: TradingAgents (arXiv 2412.20138) — Multi-Agent LLM Communication Protocol
category: references
tags: [bagelcode, multi-agent, communication-protocol, transcript, react, metagpt, structured-comms]
sources:
  - "https://arxiv.org/abs/2412.20138"
  - "https://arxiv.org/pdf/2412.20138"
  - "raw/bagelcode-research/tradingagents-2412.20138.{pdf,txt}"
created: 2026-05-01
updated: 2026-05-01
---

# TradingAgents — Multi-Agent LLM 통신 프로토콜의 핵심 교훈

> **논문**: Yijia Xiao, Edward Sun, Di Luo, Wei Wang. *TradingAgents: Multi-Agents LLM Financial Trading Framework.* arXiv:2412.20138v7 (2025-06-03). UCLA + MIT + Tauric Research. 코드: https://github.com/TauricResearch/TradingAgents
>
> **이 페이지는 실제 PDF 본문에서 추출한 것.** (이전 WebFetch 보조 요약은 일부 hallucination이 있었음 — 가짜 토큰 수치, 가짜 메타데이터 필드 등은 본 페이지에서 제외.)

## 왜 우리에게 중요한가

베이글코드 과제의 본질은 **여러 LLM 에이전트가 서로 통신하는 방식의 설계**. 이 논문이 보여주는 두 가지 통찰이 직접 적용된다:

1. **순수 자연어 통신은 "전화기 게임" (telephone effect) — 정보 손실 + 컨텍스트 부패**
2. **Structured documents/diagrams + 제한적 자연어 dialogue** 의 혼합이 핵심

§4.1, §4.2 가 우리의 transcripts 스키마 결정의 1차 근거.

## §4.1 Communication Protocol (verbatim 핵심)

논문 verbatim:

> "Most existing LLM-based agent frameworks use natural language as the primary communication interface, typically through structured message histories or collections of agent-generated messages. However, relying solely on natural language often proves insufficient for solving complex, long-term tasks that require extensive planning horizons. In such cases, pure natural language communication can resemble a **game of telephone**—over multiple iterations, initial information may be forgotten or distorted due to context length limitations and an overload of text that obscures critical earlier details."

해법:
> "We draw inspiration from frameworks like **MetaGPT**, which adopt a structured approach to communication. Our model introduces a **structured communication protocol to govern agent interactions**. By clearly defining each agent's state, we ensure that each role only extracts or queries the necessary information, processes it, and returns a completed report."

→ **각 에이전트는 글로벌 상태에서 필요한 것만 query.** 메시지 history 를 통째로 들고 다니지 않는다.

## §4.2 Types of Agent Interactions (5 단계)

| 단계 | 행위자 | 통신 방식 | 산출물 |
|---|---|---|---|
| I | Analyst Team (Fundamental/Sentiment/News/Technical) | **structured report** | 분야별 분석 리포트 |
| II | Traders | **structured report** | decision signal + rationale |
| III | Researcher Team (Bullish vs Bearish) | natural language **debate** (n rounds) → facilitator 가 **structured entry**로 기록 | 토론 결론 |
| IV | Risk Management Team (Risky/Neutral/Conservative) | natural language **debate** (n rounds) → facilitator 정리 | 위험 조정 권고 |
| V | Fund Manager | structured update | 최종 trader 결정 + 리포트 |

**핵심 패턴:**
- **분석/실행 = structured documents**
- **토론/debate = natural language**, 단 결론은 다시 structured entry로 환원
- 모든 자연어 dialogue는 **structured framework 안의 한 entry**로 영속

verbatim:
> "TradingAgents agents communicate primarily through structured documents and diagrams... Agents engage in natural language dialogue exclusively during agent-to-agent conversations and debates."

## §4.3 Backbone LLMs — 모델 분리

논문은 **quick-thinking** 과 **deep-thinking** 모델을 역할별 분리:

| 모델 종류 | 예시 | 담당 |
|---|---|---|
| Quick-thinking | gpt-4o-mini, gpt-4o | summarization, data retrieval, 표→텍스트 변환 |
| Deep-thinking | o1-preview | decision-making, evidence-based report, 분석 |

> "all analyst nodes rely on **deep-thinking** models to ensure robust analysis, while **quick-thinking** models handle data retrieval from APIs and tools for efficiency."

**과제 적용:** Coordinator/router = quick (Haiku/Flash), Planner/Critic = deep (Opus/o1/Gemini-pro). 모델 mix 자체가 베이글코드 "Claude/Codex/Gemini 등" 명시와 부합.

## ReAct Prompting Framework

> "All agents in TradingAgents follow the **ReAct** prompting framework (Yao et al., 2023), which synergizes reasoning and acting."

→ Thought → Action → Observation 루프. 에이전트 system prompt 의 표준 골격.

## §5.1 Performance Metrics (4 지표)

| 지표 | 의미 |
|---|---|
| Cumulative Return (CR) | 누적 수익률 |
| Annualized Return (AR) | 연환산 수익률 |
| Sharpe Ratio (SR) | 위험조정 수익률 |
| Maximum Drawdown (MDD) | 최대 낙폭 |

→ **루브릭 설계 영감**: 도메인 지표 + 위험 지표 + 효율 지표 3차원. 우리 과제용으로는 → **출력 정확도 + 토큰 효율 + 사용자 개입 횟수**로 변환 ([[bagelcode-rubric-scoring]]).

## §5.2 Backtesting Setup

- 기간: 2024-01-01 ~ 2024-03-29
- 종목: AAPL, NVDA, MSFT, META, GOOG (Big Tech 5)
- 베이스라인 5개: Buy-and-Hold, MACD, KDJ+RSI, ZMR, SMA
- look-ahead bias 제거: 각 거래일까지의 데이터만 사용

## 결과 (논문 §6)

| 지표 | TradingAgents | 베이스라인 우위 |
|---|---|---|
| Cumulative Return | 베이스라인 대비 우위 (specific 수치는 종목별) | 모든 자산에서 |
| Sharpe Ratio | 우위 | 모든 자산에서 |
| Max Drawdown | 우위 (낮음 = 좋음) | 대부분 |

> "TradingAgents achieves significant improvements in cumulative returns, Sharpe ratio, and maximum drawdown."

## §6.1.4 Explainability — 우리 과제와의 직결

> "an LLM-based agentic framework offers a transformative advantage: its decisions are accompanied by **detailed reasoning, tool usage, and grounding evidence** through ReAct prompting."

→ 베이글코드가 ".md 파일 포함 + 세션 로그 JSONL" 을 요구한 이유와 정확히 일치. **transcript = explainability.** 평가자가 에이전트의 의사결정을 추적 가능해야 한다.

## 한계 (논문 §6.2 + §7 결론에서 추출)

- 백테스트 기간 짧음 (3개월) → 시장 regime 변화 미반영
- 자산군 한정 (Big Tech 주식 5개)
- LLM hallucination 위험
- 거래 비용·슬리피지 미반영

## 우리 과제로 가져올 5개 핵심 결정

1. **structured-by-default + dialogue-by-exception** — debate/토론만 자연어, 나머지는 schema 박힌 메시지
2. **각 agent 가 query 하는 global state 가 있다** — message history broadcast X, "필요한 것만" pull
3. **자연어 dialogue 도 결국 structured entry 로 영속** — JSONL transcript 의 핵심 원리
4. **모델 분리**: quick (router) / deep (planner+critic)
5. **ReAct 골격** 으로 모든 system prompt 공통화

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-transcripts-schema]] — 본 논문 §4 를 토대로 한 우리 스키마
- [[bagelcode-caching-strategy]] — quick/deep 분리 + 캐시 경계
- [[bagelcode-rubric-scoring]] — §5.1 4-지표를 우리 과제로 변환
- [[geode-prompt-system]] / [[geode-adaptive-thinking]] — 모델 분리 / thinking effort 영감
