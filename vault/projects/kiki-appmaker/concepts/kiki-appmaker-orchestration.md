---
title: Kiki AppMaker Orchestration — Sandwich Identity + Stage Execution
category: concepts
tags: [kiki-appmaker, orchestration, paperclip, bkit, agent-routing, sandwich, pdca]
sources:
  - "kiki-appmaker/install/sandwich/kiki-orchestration-identity.md"
  - "kiki-appmaker/install/sandwich/stage-execution-footer.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Orchestration — Sandwich Identity + Stage Execution

> AppMaker가 깨운 agent 의 system prompt는 **4-section sandwich**다. Section 1 (Kiki engineering-team contract) + Section 2 (stage template) + Section 3 (bkit L4 footer) + Section 4 (routing enforcement).

## Sandwich 구조

```
AGENTS.md (이 agent 의 메인 instructions)
├── § 1. Kiki engineering-team 워크플로우 contract
│        — 너의 역할 + routing 규칙 (어느 stage owner 인가, 다음에 누구한테 PATCH 하는가)
├── § 2. AppMaker stage template
│        — stage owner 본문 (pm-lead / design-lead / dev-lead / qa-lead 등)
├── § 3. bkit L4 통합 footer
│        — `bkit:` skill 호출 + control-state.json 강제 + audit log
└── § 4. ⛔ 라우팅 enforcement footer
         — Agent/Task tool 금지 + 단계 스킵 금지 + 본인 stage 만 + STOP
```

각 agent마다 sandwich가 다른 콘텐츠로 구성되지만 § 1, § 3, § 4는 공통 footer (인스톨 시 모든 agent 에 자동 주입).

## § 1 — Kiki engineering-team Contract

[[kiki-appmaker-agent-roles|11 agent role]]의 PDCA 워크플로우 권한 + routing rule.

각 agent 는 자기 stage 만 책임지고 다음 stage 로 PATCH:

```
User issue
  → CTO Lead (triage) → PO Lead → PM Lead/Planner → PO Lead (P4)
  → Design Lead → Dev Lead → Developer → QA Lead
  → Dev Lead (SCORECARD) → PO Lead (ACCEPTANCE) → CTO Lead (Release)
  → DevOps Lead → DevOps Worker (D-1..D-9) → DevOps Lead → CTO Lead (final)
```

## § 2 — Stage Template (per-agent body)

각 agent 의 본문은 `agents/<role>.md` 에서 가져옴. 예:
- `cto-lead.md` → CTO routing orchestrator constraints + routing order
- `design-lead.md` → CDO design stage + awesome-design-md collection 기반
- `dev-lead.md` → 80턴 checkpoint-resume + DESIGN_SYSTEM.md 계약 + AI slop 금지
- `qa-lead.md` → 검증 + 불합격 max 3회 재작업

## § 3 — bkit L4 Stage Execution

Paperclip은 multi-agent orchestration (router), bkit은 **stage 내부 로직** (skill invocation).

```
Paperclip (router)
  └─ heartbeat run on assigned issue
       └─ this agent's session
            ├─ bkit:control 로 L4 강제
            ├─ bkit:pdca / bkit:plan-plus / bkit:phase-X / bkit:qa-phase 등
            │   stage 에 맞는 skill 호출 → 산출물 작성
            └─ Bash + curl PATCH 로 다음 agent 에게 reassign + STOP
```

매 wakeup 절차:

1. **bkit 상태 확인 + L4 강제**
   ```bash
   cat /workspaces/kiki-appmaker/.bkit/runtime/control-state.json
   ```
   `level: 4`, `automationLevel: "full-auto"`, `paused: false` 보장. 아니면 `bkit:control` 호출해서 L4 로 설정 (사용자 confirm 즉시 yes).

2. **Stage 에 맞는 bkit skill 호출**

   | Stage | bkit skill |
   |---|---|
   | PO (Plan) | `bkit:plan-plus` |
   | Designer (Design) | `bkit:phase-3-mockup`, `bkit:phase-5-design-system` |
   | Developer (Do) | `bkit:phase-6-ui-integration`, `bkit:phase-4-api` |
   | QA (Check) | `bkit:qa-phase`, `bkit:zero-script-qa` |
   | Lead/CTO/PO acceptance | `bkit:code-review`, `bkit:phase-8-review`, `bkit:audit` |
   | 공통 | `bkit:pdca` (audit log + 체크포인트 + 가드레일 자동 처리) |

3. **산출물 작성**
   - 작업 디렉토리: `/workspaces/kiki-appmaker/`
   - 본인 stage 의 output 파일을 § 2 양식대로 작성
   - bkit 가 `.bkit/audit/<날짜>.jsonl` + `.bkit/state/pdca-status.json` 갱신

4. **Paperclip issue routing — 본인 stage 끝나면 PATCH + STOP**

   본인이 작업한 issue 를 다음 stage agent 에게 reassign:
   ```bash
   curl -s -X PATCH \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
     "$PAPERCLIP_API_URL/issues/{issue_id}" \
     -d '{"assigneeAgentId": "{NEXT_AGENT_ID}", "status": "todo"}'
   ```

   결과 코멘트 (stage 결과 + 다음 agent 가 받는 것 명시):
   ```bash
   curl -s -X POST \
     "$PAPERCLIP_API_URL/issues/{issue_id}/comments" \
     -d '{"body": "## STAGE COMPLETE\n결과 요약..."}'
   ```

5. **STOP** — 절대 본인 stage 끝난 후 다음 stage 작업 시도하지 않음.

## § 4 — Routing Enforcement Footer

⛔ **반드시 지켜야 할 anti-pattern 차단:**

| 금지 사항 | 이유 |
|---|---|
| `Agent` tool / `Task` tool 사용 | sub-agent dispatch는 single stage owner 원칙 위반 |
| 단계 스킵 (예: PO → Dev 직접) | engineering-team 워크플로우 = production path |
| "이미 파일이 있으니 SPEC 스킵" | 파일 존재 ≠ 현재 issue 에 유효 |
| 다음 stage 작업 욕심 | "도와주려는" 동기로 다음 stage 작업 → routing 파괴 |
| Lead 건너뛰고 CTO 직접 보고 | 계층 구조 무시 → 책임 추적 안 됨 |
| Paperclip API 안 쓰고 다른 방법으로 routing | issue 추적 불가, audit log 누락 |

## Karpathy 원칙과 매칭

(§ 1 prefix가 명시) AppMaker sandwich가 따르는 5 원칙:

| 원칙 | 의미 | sandwich 반영 |
|---|---|---|
| **P1: Constraints First** | CANNOT 정의 후 CAN 자유 | § 4 routing enforcement footer = CANNOT 우선 |
| **P2: Explore Before Act** | 파일 read 후 edit, grep 후 reference | bkit:explore-reason-act skill |
| **P3: Minimal Viable Change** | 한 번에 한 가지, 단계마다 verify | stage 단위 분리 = 자연스럽게 강제 |
| **P4: Anti-Deception Ratchet** | fake green 금지, 테스트 case-by-case | bkit:pdca audit log + SCORECARD |
| **P5: Git as State Machine** | commit = evidence, no commit = no work | Paperclip API PATCH = stage state machine |

## 두 가지 모드 차이

| 모드 | cwd | env | sandwich 적용 |
|---|---|---|---|
| **Paperclip claude_local** | 컨테이너 `/workspaces/kiki-appmaker` | `PAPERCLIP_API_URL` + `PAPERCLIP_API_KEY` set | ✓ AGENTS.md sandwich 가 메인 instructions |
| **Host maintenance** | 호스트 머신 kiki-appmaker repo root | env 없음 | ✗ 일반 Claude Code agent 로 동작 (Agent tool OK) |

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-agent-roles]] — 11 agent role 본문
- [[kiki-appmaker-pdca]] — PDCA host-mode 워크플로우
- [[kiki-appmaker-superpowers]] — stage-transition-guards, scaffold-correctness 등 스펙
- [[index]]
