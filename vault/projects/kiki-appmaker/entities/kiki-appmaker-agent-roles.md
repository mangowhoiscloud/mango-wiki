---
title: Kiki AppMaker Agent Roles
category: entities
tags: [kiki-appmaker, multi-agent, paperclip, agent-roles, pdca, orchestration]
sources:
  - "kiki-appmaker/agents/cto-lead.md"
  - "kiki-appmaker/agents/pm-lead.md"
  - "kiki-appmaker/agents/po-lead.md"
  - "kiki-appmaker/agents/design-lead.md"
  - "kiki-appmaker/agents/dev-lead.md"
  - "kiki-appmaker/agents/qa-lead.md"
  - "kiki-appmaker/agents/devops-lead.md"
  - "kiki-appmaker/agents/devops-worker.md"
  - "kiki-appmaker/agents/infra-lead.md"
  - "kiki-appmaker/agents/infra-local.md"
  - "kiki-appmaker/agents/quality-standards.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Agent Roles

11개 agent 역할 정의 — Kiki AppMaker의 PDCA 워크플로우를 구성하는 lead/worker 조합.

각 agent는 [[kiki-appmaker-orchestration|sandwich identity + stage execution footer]]를 받아서 단일 stage를 책임진다. **`Agent` tool / `Task` tool 사용 금지** — sub-agent dispatch 대신 Paperclip API issue PATCH로 다음 stage에 routing.

## 워크플로우 hierarchy

```
User issue
  ↓
CTO Lead (triage, routing orchestrator)
  ├── PO Lead (spec authority)
  │     ↓
  │   PM Lead / Planner (SPEC.md 작성)
  │     ↓
  │   PO Lead (P4 검증)
  │
  ├── Design Lead (output/<project>/DESIGN.md + DESIGN_SYSTEM.md)
  │     [based on awesome-design-md collection]
  │
  ├── Dev Lead (FIFO 분배)
  │     ↓
  │   Developer (Next.js 구현, 80턴 checkpoint-resume)
  │     ↓
  │   QA Lead (검증, 불합격 시 Dev 재작업 max 3회)
  │     ↓
  │   Dev Lead (SCORECARD 작성)
  │
  ├── PO Lead (ACCEPTANCE)
  │
  ├── CTO Lead (Release decision)
  │
  └── DevOps Lead (Deploy 오케스트레이션)
        ├── DevOps Worker / Infra Lead (D-1..D-9 EC2 배포 런북)
        └── close → CTO Lead final
```

## Agent별 책임 매트릭스

| Agent | Stage | 산출물 | 핵심 제약 |
|---|---|---|---|
| **CTO Lead** | triage / routing / release | 라우팅 결정 + 단계 완주 확인 | 코드/SPEC/DESIGN 직접 작성 금지. 단계 스킵 금지. 파일 존재 ≠ 유효 |
| **PO Lead** | spec authority + ACCEPTANCE | P4 검증, ACCEPTANCE 결정 | SPEC 직접 작성 금지 (Planner에 위임) |
| **PM Lead / Planner** | requirements / labor law | `SPEC.md` | 노동법 의무 사항 빠뜨리지 않음 |
| **Design Lead (CDO)** | UI/UX 디자인 명세 | `output/<project>/DESIGN.md` + `DESIGN_SYSTEM.md` | **awesome-design-md 컬렉션 기반 시작 필수**. AI slop 금지 (보라색 그라데이션, 흰색 카드 격자, slate/gray 무채색) |
| **Dev Lead (CTO Lead Do 단계)** | 풀스택 구현 + SCORECARD | Next.js MVP 프로토타입 | DESIGN_SYSTEM.md = 계약서. AI slop 금지. 실제 동작 (placeholder/mock 금지). **80턴 checkpoint-resume 책임 본인** |
| **QA Lead** | 검증 (Check 단계) | QA report | 불합격 시 Dev 재작업 max 3회 |
| **DevOps Lead** | Deploy 오케스트레이션 | EC2 배포 결과 | 배포 실무 = DevOps Worker. CTO에 직접 보고 금지 (Lead 경유) |
| **DevOps Worker** | D-1..D-9 EC2 클라우드 배포 | 배포 산출물 | `infra-lead.md` 런북 기준. DevOps Lead에만 보고 |
| **Infra Lead** | D-1..D-9 canonical 런북 (2026-04-23 이후 DevOps 1/2 소유) | 클라우드 인프라 명세 | EC2 + Cloudfront + RDS 기준 |
| **Infra Local** | 호스트 머신 환경 진단 | 로컬 docker / network / kernel 점검 | 컨테이너 안에서 호출 금지 |
| **Quality Standards** | 디자인 품질 기준서 (40% 디자인 + 30% 독창성) | 평가 기준 reference | 다른 agent가 읽는 SOT |

## CTO Lead — Routing Orchestrator (대표적 제약)

```
<constraints>
1. 단계를 스킵하지 않는다. Planner, Designer 포함 모든 단계는 필수 경유.
2. SPEC.md를 직접 작성하지 않는다. SPEC = Planner 역할.
3. DESIGN.md / DESIGN_SYSTEM.md를 직접 작성하지 않는다. = Designer 역할.
4. 코드를 작성하거나 수정하지 않는다. = Developer 역할.
5. "이미 파일이 있으니 스킵" 판단하지 않는다. 파일 존재 ≠ 현재 이슈에 유효.
6. 에이전트를 건너뛰고 다음 에이전트에게 직접 전달하지 않는다.
</constraints>
```

→ "라우팅 오케스트레이터" 라는 분리 역할의 모범. CTO가 sub-agent 처럼 직접 작업을 끌어가지 못하게 하는 제약.

## Design Lead — AI slop 방지

LLM이 처음부터 디자인 시스템을 만들면 AI slop으로 수렴 (보라색 그라데이션, 흰색 카드 격자, slate/gray). 해결: **awesome-design-md 컬렉션** 기반 시작.

**절대 하지 않을 것**:
- 디자인 시스템 처음부터 만들기
- 보라색/파란색 그라데이션 배경
- 흰색 카드 격자 레이아웃 (Bootstrap 기본값)
- Tailwind slate/gray만으로 무채색 인터페이스

**반드시 할 것**:
- SPEC.md 서비스 유형에 맞는 컬렉션 선택
- 컬렉션의 DESIGN.md 기반 커스터마이징
- 프로젝트 고유 브랜드 아이덴티티 덧입히기

## Dev Lead — Checkpoint-Resume (turn budget)

heartbeat run 턴 한도 = **80턴** (`adapterConfig.maxTurnsPerRun`). 1턴 = 1 tool-use call.

**문제**: 중규모 feature (예: M3-B "오디오 sprite + iOS unlock + BGM toggle + localStorage")는 ACK/PATCH 루틴 ~10-15턴 포함하면 80턴 쉽게 초과 → `error_max_turns` 실패 + 락 잔존.

**책임 = Dev 본인** (Lead/QA 수습하게 만들지 말 것). 우아하게 끊고 이어받을 수 있게:
- 다음 turn에 처리할 작업을 명시한 checkpoint commit
- PATCH로 issue 상태에 "checkpoint" 마킹
- 다음 heartbeat에서 같은 commit hash로 resume

## Quality Standards — 평가 기준서 (40% 디자인 + 30% 독창성)

다른 agent (특히 QA Lead, Dev Lead)가 읽는 reference. 점수 분포:
- 디자인 품질: **40%**
- 독창성: **30%**
- 기능 완성도: 20%
- 코드 품질: 10%

LLM의 default 행동(보라색/Tailwind slate/Bootstrap 카드)이 디자인 점수 0점 처리되도록 설계.

## Infra Lead — D-1..D-9 EC2 배포 런북

2026-04-23 이후 DevOps 1/2가 owner. 9-step canonical 배포:
- D-1: 인스턴스 프로비저닝
- D-2: 보안 그룹 + key pair
- D-3: 시스템 패키지 + Node.js
- D-4: pm2 + reverse proxy
- D-5: 환경변수 + secrets
- D-6: 코드 deploy + build
- D-7: db migration
- D-8: smoke test
- D-9: cloudfront / DNS / TLS

DevOps Worker는 이 런북 따라 실무. DevOps Lead는 사전 검증 + 사후 검증.

## Infra Local — 호스트 환경 진단

컨테이너 안 호출 금지 (호스트 전용). docker daemon, kernel, network bridge, claude-creds-sync 상태 등 진단.

## 호출 패턴

```
# 정상 routing (Paperclip API)
PATCH /issues/{id} { assignee: "next-stage-agent", state: "open" }

# 금지된 routing
- Agent tool spawn   ← sub-agent dispatch anti-pattern
- Task tool spawn    ← 동일
- 다른 stage agent에 직접 메시지   ← Lead 경유 또는 Lead → CTO 라우팅
```

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-orchestration]] — Sandwich identity + stage execution footer
- [[kiki-appmaker-pdca]] — PDCA host-mode 워크플로우
- [[kiki-appmaker-agent-templates]] — Template definitions (kiki-agents + kiki-worker-agents)
- [[kiki-appmaker-superpowers]] — Stage transition guards + scaffold correctness specs
- [[index]]
