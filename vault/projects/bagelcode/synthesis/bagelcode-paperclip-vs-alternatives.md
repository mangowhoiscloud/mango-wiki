---
title: 베이글코드 과제 — Paperclip 채택 여부 + 가벼운 대안 비교
category: synthesis
tags: [bagelcode, paperclip, framework, multi-agent, autogen, swarm, crewai, agent-squad, decision]
sources:
  - "https://github.com/paperclipai/paperclip"
  - "https://github.com/openai/swarm"
  - "https://github.com/microsoft/autogen"
  - "https://github.com/crewaiinc/crewai"
  - "https://github.com/2FastLabs/agent-squad"
  - "[[kiki-appmaker]]"
created: 2026-05-01
updated: 2026-05-01
---

# Paperclip 채택 여부 + 가벼운 대안 비교

> 이미 갖고 있는 [[kiki-appmaker]] 가 Paperclip 위에서 도는 시스템이라, "Paperclip 그대로 가져오면 빠르겠다"는 유혹이 있다. 하지만 **README 즉시 동작 + 마감 2일** 제약 아래선 큰 도움이 안 된다는 결론이 무게. 이 페이지는 후보 5개 비교 + 권장.

## 결론 한 줄 (선결정)

**자체 구현 (transcript JSONL + 얇은 Coordinator) 권장.** Paperclip 은 과제 ref 로만 인용. 대안 framework 들도 채택 X. 이유는 §"Trade-off 표" 참조.

## 후보 5개

| # | Framework | 한 줄 | 의존성 무게 | 라이선스 |
|---|---|---|---|---|
| 1 | **Paperclip** | Node.js + React + 임베디드 Postgres orchestration | 무거움 (DB + 웹) | MIT |
| 2 | **OpenAI Swarm** | 핸드오프 추상화만, 클라이언트사이드 stateless | **가장 가벼움** | MIT |
| 3 | **Microsoft AutoGen** | 다층 (Core/AgentChat/Extensions), 유지보수 모드 | 중-무거움 | MIT (CLA 있음) |
| 4 | **CrewAI** | Crews + Flows, Pydantic 기반 정의 | 중간 | MIT |
| 5 | **Agent Squad** | SupervisorAgent 중심 conversation routing | 가벼움 | Apache-2.0 |

## 1. Paperclip ([github.com/paperclipai/paperclip](https://github.com/paperclipai/paperclip))

### 정의
"OpenClaw가 직원이라면 Paperclip은 회사" — Node.js 서버 + React UI + 임베디드 Postgres. heartbeat / issue / agent / routine 4-primitive.

### 강점
- ✅ Issue + 댓글 + 첨부 + audit log → 무거운 multi-agent 회사 운영 가능
- ✅ org chart, 예산, governance, approval flow → 진짜 조직 운영 도구
- ✅ MCP 서버 별도 ([[paperclip-mcp]]) — 외부 에이전트가 자연어로 통제 가능
- ✅ [[kiki-appmaker]] 의 production path 그 자체 (sandwich + 17-agent + bkit)

### 약점 (과제 컨텍스트)
- ❌ **README 즉시 동작 위험 큼** — Node.js 20+ / pnpm 9.15+ / 임베디드 Postgres 부팅 필요
- ❌ **과제 스코프 초과** — 회사 운영 도구를 가져와서 2-에이전트 데모로 쓰는 건 미스매치
- ❌ **베이글코드 톤 부합 X** — 블로그가 강조한 "단순 UI, 3일 빌드, 각 팀 자율" 과 반대 방향
- ❌ **인증/secrets 셋업** — 평가자가 OpenAI/Anthropic 키 + 컨테이너 + DB 셋업 부담
- ❌ "AI 코딩 에이전트로 직접 만들었음" 신호가 약함 — 기성 framework 위에 얇게 얹으면 평가자가 의심할 수 있음

### 차용 가치 (자산만 빌리고 framework 는 X)
- Issue lifecycle 발상 → 우리 transcript `kind` 어휘에 흡수
- Heartbeat scheduler 발상 → 단순 polling loop 로 충분
- Sandwich identity → 이미 [[kiki-appmaker-orchestration]] 에서 추출 완료

## 2. OpenAI Swarm ([github.com/openai/swarm](https://github.com/openai/swarm))

### 정의
교육용 경량 framework. 두 추상화: **Agent (instructions + tools)** + **Handoff (다음 agent 반환)**. 클라이언트사이드, stateless.

### 강점
- ✅ **가장 가벼움** — 한 파일 안에서 데모 가능
- ✅ Stateless 설계 → 우리 transcript JSONL append-only 와 자연스럽게 결합
- ✅ Python 3.10+ 외 의존성 거의 없음

### 약점
- ❌ OpenAI Chat Completions 전용 → Claude/Gemini 호출 추상화 별도 필요
- ❌ "Educational" 명시 — 프로덕션용 아님 → 베이글코드의 "다양한 에이전트 동시 사용" 톤과 반(half)부합

### 차용 가치
- **Handoff 패턴** — 우리 `kind=agent.wake` + `to=<next>` 와 정확히 동형. spec 작성 영감.
- 클라이언트사이드 stateless → 우리 디자인 전제 확정

## 3. Microsoft AutoGen ([github.com/microsoft/autogen](https://github.com/microsoft/autogen))

### 정의
Core / AgentChat / Extensions 3-tier. 비동기 메시지 + GroupChat + human-in-the-loop.

### 강점
- ✅ 멀티 LLM provider 추상화 잘 됨
- ✅ GroupChat → multi-agent debate 패턴 (TradingAgents §4.2 III/IV) 직접 매핑

### 약점
- ❌ **유지보수 모드** (2025년 Microsoft Agent Framework 권장) → 채점자가 "왜 deprecated 라이브러리?" 의심 가능
- ❌ 의존성 트리 큼 (Pydantic v2 + asyncio + 다중 SDK) → README 동작 위험
- ❌ 추상화가 두꺼워서 "직접 만든 것" 신호 약화

## 4. CrewAI ([github.com/crewaiinc/crewai](https://github.com/crewaiinc/crewai))

### 정의
역할극 기반 (Role / Goal / Backstory) + Crews (팀) + Flows (DAG). Pydantic 정의.

### 강점
- ✅ Role-playing 추상화 → kiki engineering-team 12-agent 와 표현력 비슷
- ✅ 기업 사용 사례 (Oracle, Deloitte 등) → 안정성

### 약점
- ❌ **무거움** — 가장 큰 의존성 트리
- ❌ Backstory / Role-playing 추상화 → 베이글코드가 강조한 "단순함" 과 반대 톤
- ❌ Flow DAG → 과제의 단순 핑퐁에 과함

## 5. Agent Squad ([github.com/2FastLabs/agent-squad](https://github.com/2FastLabs/agent-squad))

### 정의
SupervisorAgent 중심 conversation routing. agent-as-tools.

### 강점
- ✅ Lightweight 명시
- ✅ Supervisor → 우리 Coordinator 와 1:1 매핑

### 약점
- ❌ Conversational chatbot 지향 → "코딩 에이전트가 작업 결과 산출" 시나리오 약함
- ❌ 인지도 낮아 평가자에게 untested 인상

## Trade-off 표 (과제 5개 평가 차원)

| | Paperclip | Swarm | AutoGen | CrewAI | Agent Squad | **자체 구현** |
|---|---|---|---|---|---|---|
| README 즉시 동작 | ❌ | ✅ | ⚠ | ⚠ | ✅ | **✅** |
| 의존성 무게 | 重 | 軽 | 重 | 中 | 軽 | **最軽** |
| Multi-LLM (Claude/Codex/Gemini) | 도구 | 약 | ✅ | ✅ | ✅ | **✅ (우리가 짠다)** |
| Transcripts 스키마 자유도 | 제약 | 자유 | 제약 | 제약 | 제약 | **✅ 최대** |
| 베이글코드 톤 부합 | ❌ | ⚠ | ❌ | ❌ | ⚠ | **✅** |
| "AI 코딩 에이전트로 만들었음" 신호 | ❌ | ⚠ | ❌ | ❌ | ⚠ | **✅** |
| 캐싱 제어권 | 약 | ✅ | ⚠ | 약 | ⚠ | **✅** |
| 루브릭 자동 채점 hooking | 약 | ✅ | ⚠ | 약 | ⚠ | **✅** |
| 마감 (2-3일) 안전성 | ❌ | ✅ | ⚠ | ⚠ | ✅ | **✅** |

→ 모든 축에서 **자체 구현 ≥ Swarm > Agent Squad > 나머지**.

## 자체 구현이란 (얼마나 작나)

[[bagelcode-transcripts-schema]] + [[bagelcode-caching-strategy]] + [[bagelcode-rubric-scoring]] 위에 얇은 Coordinator:

```
약 800-1500 LOC 추정
- protocol/schemas/*.json     (~100 LOC, JSON Schema)
- protocol/validator.ts/py    (~100 LOC)
- coordinator.ts/py           (~250 LOC, 라우터 + JSONL writer)
- adapters/{claude,codex,gemini}.ts/py  (~150 LOC each)
- agents/*.md                 (~100 LOC each, sandwich 4섹션)
- ui/tui.ts/py                (~150 LOC, blessed/textual)
- score/rubric.ts/py          (~150 LOC, 차원 채점)
```

→ **Swarm 보다 작을 수 있다** (Swarm 도 OpenAI Chat 추상화 빼면 비슷한 규모).

## Paperclip 을 ref 로만 두는 이유 (제출 시 README 인용)

> "이 도구는 [Paperclip](https://github.com/paperclipai/paperclip) 의 issue/heartbeat/sandwich 패턴에서 영감을 받았으나, **과제 마감과 README 동작 보장**을 위해 framework 자체는 채택하지 않고 **transcript JSONL + 얇은 Coordinator** 로 같은 골격을 깎아냈습니다. Paperclip 의 무게를 그대로 가져오면 평가자가 1분 안에 실행하기 어렵기 때문입니다."

→ 이 한 문단이 **"왜 자체 구현?"** 에 대한 정확한 답. 평가자에게도 의사결정 근거 명료.

## TradingAgents 와의 정합

[[bagelcode-tradingagents-paper]] 도 framework 채택이 아니라 **자체 protocol** 설계. 우리도 같은 길:

| TradingAgents | 우리 |
|---|---|
| MetaGPT 영감 + 자체 protocol | Paperclip 영감 + 자체 transcript |
| ReAct prompting | sandwich + ReAct 변형 |
| Quick/Deep 모델 분리 | Coordinator(Haiku) + Planner(Opus) + Builder(Codex) + Critic(Gemini) |

→ 학술 논문도 framework 안 쓰고 깎아 만든다. 우리도 그 노선.

## 후속 (이 결정 이후)

- [x] Paperclip GitHub 를 references 에 추가 ← 본 페이지가 그 역할
- [ ] Swarm `Agent + Handoff` API 한 번 훑고 우리 `kind=agent.wake` 와 차이점만 흡수
- [ ] CrewAI 의 Role/Goal Pydantic 모델 형식 → 우리 sandwich §1 contract YAML 표현 영감
- [ ] AutoGen 안 본다 (시간 낭비)

## See also

- [[bagelcode]] / [[bagelcode-task-direction]] — 본 결정이 영향
- [[bagelcode-transcripts-schema]] — 자체 구현의 핵심
- [[bagelcode-caching-strategy]] / [[bagelcode-rubric-scoring]] — 자체 구현 위에 올라감
- [[bagelcode-tradingagents-paper]] — 자체 protocol 설계의 학술 근거
- [[kiki-appmaker]] / [[kiki-appmaker-orchestration]] — Paperclip 위 production 사례 (자산만 차용)
