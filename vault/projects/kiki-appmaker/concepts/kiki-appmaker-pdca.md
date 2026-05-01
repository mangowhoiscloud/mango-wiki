---
title: Kiki AppMaker PDCA Host-Mode
category: concepts
tags: [kiki-appmaker, pdca, orchestration, host-mode, awesome-design-md, sub-agent]
sources:
  - "kiki-appmaker/docs/PDCA-ORCHESTRATOR-host-mode.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker PDCA Host-Mode

> Host-mode 워크플로우 — 사용자 한 줄 프롬프트를 받아 4개 리더십 agent(PM Lead, CDO Lead, CTO Lead, QA Lead)가 PDCA 사이클로 자동 실행. Design 단계에서 awesome-design-md 컬렉션을 기반으로 디자인 시스템 선택 + 커스터마이징.

## 차이: host-mode vs Paperclip claude_local

| 항목 | host-mode (이 페이지) | Paperclip claude_local ([[kiki-appmaker-orchestration]]) |
|---|---|---|
| 실행 위치 | 호스트 머신 (kiki-appmaker repo root) | 컨테이너 안 (`/workspaces/kiki-appmaker`) |
| Routing 방식 | **Agent tool** 로 sub-agent 호출 | Paperclip API issue PATCH (Agent tool 금지) |
| 주체 | Claude Code agent 자체가 오케스트레이터 | 외부 Paperclip 이 오케스트레이터, 이 agent 는 stage owner |
| 사이클 길이 | 1 사용자 prompt 내 PDCA 1회전 | 1 issue 가 여러 stage 거치며 multi-agent 협업 |
| 사용 시점 | maintenance / 단발 PDCA 작업 | production multi-agent workflow |

→ **host-mode 는 PoC + 데모 용도**. 본격 운영은 Paperclip mode.

## PDCA 실행 흐름 (host-mode)

```
[사용자 프롬프트]
       |
  [Plan] PM Lead 서브에이전트
     → SPEC.md 생성 (기능 설계 + 서비스 유형 분류 + 디자인 컬렉션 추천)
       |
  [Plan→Design 전환] 디자인 컬렉션 설치 (오케스트레이터 직접 실행)
     → npx getdesign@latest add [컬렉션명]
     → DESIGN.md 설치됨 (컬렉션 원본)
       |
  [Design] CDO Lead 서브에이전트
     → DESIGN.md 참조 + 커스터마이징
     → DESIGN_SYSTEM.md 생성 (9섹션 구조)
       |
  [Do] CTO Lead 서브에이전트
     → output/ 생성 + SELF_CHECK.md 작성
       |
  [Check] QA Lead 서브에이전트
     → QA_REPORT.md 작성
       |
  [Act] 판정 (오케스트레이터의 자동 판정 로직)
     ├─ 합격     → PDCA 사이클 완료 → 배포/보고
     └─ 불합격   → [Do] 로 복귀하여 피드백 반영 (max 3회 반복)
```

## 단계별 sub-agent 호출 패턴

각 단계는 **독립 컨텍스트** sub-agent. 단계별 책임자 분리가 핵심.

### Plan — PM Lead

```
agents/pm-lead.md 파일을 읽고, 그 지시를 따라라.
agents/quality-standards.md 파일도 읽고 참고하라.

사용자 요청: [사용자가 준 프롬프트]

반드시 "서비스 유형" 섹션을 포함하여 주 유형, 추천 디자인 컬렉션, 선택 근거를 명시하라.

결과를 SPEC.md 파일로 저장하라.
```

→ SPEC.md 생성. "서비스 유형" 섹션 필수 (다음 단계의 컬렉션 install이 이를 읽음).

### Plan→Design 전환 — 컬렉션 install

오케스트레이터가 직접 실행 (sub-agent 아님):
```bash
npx getdesign@latest add [컬렉션명]
```

→ `DESIGN.md` (컬렉션 원본) 프로젝트 루트에 생성. CDO Lead 가 참조.

[awesome-design-md](https://github.com/awesome-design-md) 컬렉션은 검증된 디자인 시스템들 (Linear, Stripe, Vercel 등 실제 브랜드에서 추출). LLM 이 처음부터 디자인 만들면 AI slop 으로 수렴 → 컬렉션 기반 시작 강제.

### Design — CDO Lead

CDO Lead가 받는 지시:
```
agents/design-lead.md 파일을 읽고, 그 지시를 따라라.

DESIGN.md (컬렉션 원본) 을 참조해서 프로젝트 고유 브랜드를 덧입혀라.

DESIGN_SYSTEM.md 9섹션 구조로 작성:
1. 색상 토큰
2. 타이포그래피
3. 컴포넌트 스펙
4. 레이아웃 시스템
5. 모션/인터랙션
6. 아이콘 시스템
7. 데이터 시각화
8. 폼 시스템
9. 접근성
```

### Do — CTO Lead

`output/<project>/` 디렉터리 생성 + Next.js 구현 + SELF_CHECK.md 자체 점검 보고서.

### Check — QA Lead

QA_REPORT.md 작성. 디자인 품질 (40%) + 독창성 (30%) + 기능 (20%) + 코드 (10%) 채점.

### Act — 판정 (오케스트레이터)

자동 판정 로직:
- **합격**: 합산 점수 80+ → PDCA 종료, 배포/보고
- **조건부**: 70-79 → Do 로 복귀, max 3회 반복
- **불합격**: 70 미만 → Do 로 복귀, max 3회 반복

3회 반복 후에도 80 미만 → escalation (사용자 개입 요청).

## awesome-design-md 컬렉션의 역할

LLM이 처음부터 디자인 시스템 만들면 AI slop:
- 보라색/파란색 그라데이션 배경
- 흰색 카드 격자 (Bootstrap 기본값)
- Tailwind slate/gray 무채색

해결: **검증된 디자인 시스템에서 시작**. 컬렉션은 실제 세계적 브랜드 (Linear, Stripe, Vercel 등)에서 추출한 색상 토큰 + 타이포 + 컴포넌트 spec.

CDO Lead 의 책임 = 그 컬렉션 위에 프로젝트 고유 브랜드 덧입히기 (zero-to-one 디자인 금지).

## 산출물 구조

```
project-root/
├── SPEC.md              ← PM Lead (Plan)
├── DESIGN.md            ← getdesign add (컬렉션 원본)
├── DESIGN_SYSTEM.md     ← CDO Lead (Design)
├── output/
│   └── <project>/
│       ├── (Next.js 코드)
│       ├── SELF_CHECK.md   ← CTO Lead (Do)
│       └── QA_REPORT.md    ← QA Lead (Check)
└── (PDCA 종료 후 배포 산출물)
```

## host-mode 의 한계

| 한계 | 영향 |
|---|---|
| 단발 PDCA 1회 (issue tracking 없음) | 멀티 issue 동시 진행 불가 |
| Sub-agent 호출 = 같은 LLM 컨텍스트 | 독립 컨텍스트 격리는 sub-agent prompt 로만 |
| Paperclip API 미사용 | audit log + state machine 약함 |
| Lead-only 4 단계 | Worker (Dev 1/Dev 2, QA 1/QA 2 dual squad) 미사용 |

→ 본격 production은 Paperclip claude_local 모드 ([[kiki-appmaker-orchestration]]).

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-orchestration]] — Paperclip 모드 sandwich
- [[kiki-appmaker-agent-roles]] — 11 agent role
- [[index]]
