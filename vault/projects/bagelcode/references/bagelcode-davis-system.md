---
title: 베이글코드 DAVIS — 사내 데이터 비서 (멀티 에이전트 사례)
category: references
tags: [bagelcode, davis, multi-agent, slack-bot, genie, databricks, router-agent]
sources:
  - "https://www.bagelcode.com/article/bagelcode-x-ai-genie-기반-사내-데이터-비서-davis-개발기/"
created: 2026-05-01
updated: 2026-05-01
---

# 베이글코드 DAVIS — 사내 데이터 비서 개발기

> 베이글코드 공식 블로그 요약. **AI Genie 기반 사내 데이터 비서 DAVIS** 개발기. 베이글코드의 멀티 에이전트 디자인 + 데이터 거버넌스 철학을 가장 직접적으로 보여주는 1차 자료.

## 한 줄 요약

Slack 봇 하나로 사내 누구나 자연어 질문 → SQL 자동 생성 → Databricks에서 결과 회수. 그 뒤에는 **3종 에이전트(Document/Tableau/Query)와 Router**가 돌고 있다.

## 조직 컨텍스트

- 약 **1만 개 테이블 + 1천+ 대시보드** 관리하는 데이터 중심 조직
- "글로벌 시장에서 다년간 쌓아온 데이터·AI 기술과 마케팅 역량 중심으로 철저한 데이터 기반 의사결정"
- 정기 사내 해커톤 **BagelJam:Dev** — 2일 프로토타이핑 → 점진 고도화

## 시스템 아키텍처

```
Slack
  ↓ (mention)
API Gateway → AWS Lambda
  ↓
Agent Router  ← 사용자 요청을 3종 에이전트 중 하나로 라우팅
  ├─ Document Retrieval Agent  (사내 문서 검색)
  ├─ Tableau Agent             (기존 대시보드 연결)
  └─ Query Agent (Genie 기반)  (Text-to-SQL)
                  └─ Genie Space Router
                        ├─ Studio A Genie Space
                        ├─ Studio B Genie Space
                        └─ ...
```

→ **2단 라우팅**: (1) 어떤 종류의 작업인가 (Document / Tableau / Query) → (2) Query라면 어느 게임 스튜디오 컨텍스트인가.

### Query Agent 진화

- **초기**: AWS Kendra(RAG) → LLM이 SQL 생성 → Databricks 실행. 자체 구축 오버헤드 큼.
- **현재**: Databricks AI/BI **Genie API** 채택. Text-to-SQL을 매니지드로 위임, 자체 구현 부담 제거.

Genie 호출 흐름:
1. `start conversation` — 사용자 요청 수신
2. `get conversation` — SQL 생성 상태 확인
3. `get message attachment` — SQL 결과 회수

## Genie 운영 3원칙

### 원칙 1: Stay Focused (필요한 테이블만)
- 1만 개 테이블 전체 등록 X → **Mart 계층(3-layer: Base/Intermediate/Mart) 중심 선별**
- 한 Genie Space에 너무 많은 테이블 = 정확도/성능 저하 → 분리 운영

### 원칙 2: Plan to Iterate
- **Instructions**: 사내 용어, 비즈니스 정의 명시
- **SQL 샘플 등록**: 빈출 질문 패턴 학습
- 사용자 피드백 루프로 반복 개선 — "한 번에 완성 X, 점진 진화"

### 원칙 3: Build on Well-annotated Tables
- **dbt YAML로 메타데이터 코드화** — 테이블/컬럼 description을 깃 버전 관리
- 새 테이블 생성 시 자동 description 적용
- LLM으로 description YAML 자동 생성 가능성 ← AI가 AI 인프라 만든다

## Space 분리 전략 (Router Agent 핵심)

> "하나의 Genie Space에 테이블을 제한하고, 여러 Genie Space를 활용"

게임 스튜디오마다 Genie Space 분리. Router Agent가 사용자 발화에서 스튜디오 식별 → 해당 Space로 자동 전달. 사용자는 컨텍스트(어느 스튜디오인지) 입력 안 해도 됨.

→ **함의: 멀티 에이전트 = 도메인 격리 + 라우터.** 단일 컨텍스트의 거인 LLM이 아니라, 작은 컨텍스트 다수에 라우팅으로 정확도 확보.

## 가치 강조 포인트

| 관점 | 가치 |
|---|---|
| 사용자(비즈니스팀) | SQL 모르는 사람도 자연어 질문 → 즉답. 의사결정 속도. |
| 분석팀 | 단순 ad-hoc SQL 요청 줄어들고, 핵심 분석 업무 집중. |
| 엔지니어 | Genie로 자체 RAG/SQL 코드 줄임. 운영 부담 감소. |

## 신호로 읽는 팀 성향

- **자체 구축 → 매니지드 전환에 거리낌 없음** (Kendra 자체 RAG → Genie로 갈아탄 결정)
- **2일 해커톤 → 운영 시스템화** — 빠른 프로토타입 + 단계 고도화 = 베이글코드 표준 사이클
- **dbt + YAML로 메타데이터 코드화** — "AI를 위해 데이터부터 정돈" — AI-First가 데이터 거버넌스까지 침투
- **Slack을 사용자 인터페이스로 우선시** — UI 따로 만들지 않고 채팅으로 출발 (= 두 번째 블로그 [[bagelcode-ai-first-culture]]의 "에이전트도 활용 가능한 설계" 일관)

## 과제 함의

| DAVIS 패턴 | 과제에 차용 가능한 형태 |
|---|---|
| Router → 도메인 에이전트 N | Claude/Codex/Gemini를 "도메인" 대신 **"역할"**로 분기 |
| Slack 봇을 사용자 입출력 채널로 | 사용자 개입/관찰을 **채팅 UI** 한 면으로 통합 |
| Genie API = 매니지드 위임 | 코딩 에이전트 자체를 매니지드 능력으로 활용 (재구현 X) |
| dbt YAML = 메타데이터 코드화 | 에이전트 인스트럭션(.md)을 **버전 관리 자산**으로 — 과제 제출 요건과 일치 |

## See also

- [[bagelcode]] — 프로젝트 허브
- [[bagelcode-ai-first-culture]] — AI-First 문화 블로그
- [[bagelcode-team-profile]] — 팀 페르소나 종합
- [[bagelcode-task-direction]] — 과제 방향성
- [[hub-spoke-pattern]] — DAVIS Router-Agents = Hub-Spoke 동형
