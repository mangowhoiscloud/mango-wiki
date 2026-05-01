---
title: Kiki AppMaker Agent Templates
category: references
tags: [kiki-appmaker, templates, agent-templates, paperclip, lead, worker, dual-squad]
sources:
  - "kiki-appmaker/docs/templates/kiki-agents.md"
  - "kiki-appmaker/docs/templates/kiki-worker-agents.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Agent Templates

`docs/templates/` 의 두 agent template — `kiki-agents.md` (lead/team agents) + `kiki-worker-agents.md` (worker agents). Paperclip plugin 이 새 회사 / 새 squad 를 provisioning 할 때 사용하는 yaml 템플릿의 markdown 버전.

## kiki-agents.md — Lead/Team agents

[[kiki-appmaker-agent-roles|11 agent role]] 의 lead 8명 정의:
- `cto-lead` — routing orchestrator
- `pm-lead` (= Planner) — SPEC 작성
- `po-lead` — spec authority + ACCEPTANCE
- `design-lead` (= CDO Lead) — DESIGN_SYSTEM.md
- `dev-lead` (= CTO Lead Do 단계) — Next.js 구현 + SCORECARD
- `qa-lead` — Check 단계
- `infra-lead` — D-1..D-9 canonical 런북
- `devops-lead` — Deploy 오케스트레이션

각 lead 는 다음 구조:
```yaml
name: <role>
provider: anthropic
model: claude-sonnet-4-6   # 또는 opus-4-7
effort: high                # 또는 medium / low
systemPromptTemplate: |
  <sandwich Section 2 본문 — agents/<role>.md 에서 가져옴>
tools:
  - bash
  - read
  - write
  - edit
  - paperclip-api          # PATCH /issues/{id} 권한
hooks:
  - on: agent.created
    skill: kiki-profile-injector  # 사용자 profile 기반 directive 주입
budget:
  daily_token_limit: 100000
```

## kiki-worker-agents.md — Worker agents

Worker 3명 + specialty 정의:
- `dev-1`, `dev-2` — Dev FIFO worker (dual squad)
- `qa-1`, `qa-2` — QA FIFO worker (dual squad)
- `devops-worker` — D-1..D-9 실무
- `infra-local` — 호스트 환경 진단 specialty

dual squad 의도: Dev Lead 가 들어온 issue 를 dev-1 / dev-2 에 FIFO 로 분배. 한쪽이 80턴 한도 초과해도 다른 쪽이 계속 작업 가능 → throughput 2배.

Worker template 은 lead 와 다른 점:
- `effort: medium` 디폴트 (lead 는 high)
- `paperclip-api` 권한 제한 (PATCH 는 본인이 받은 issue 만)
- Lead 에게만 보고 (CTO 직접 보고 금지)

## 커스터마이징 포인트

외부 회사 install 시 변경되는 부분:
1. **모델 선택** — 회사 budget 에 따라 Anthropic Opus / Sonnet / GLM-5.1
2. **Effort 다이얼** — cost-sensitive 회사면 medium → low 다운그레이드
3. **Tool 권한** — `bash` 빼거나 `paperclip-api` 만 남기거나
4. **Hooks** — `kiki-profile-injector` 외에 회사 고유 hook 추가
5. **Budget** — daily token limit 회사별

[[kiki-appmaker-research|paperclip-best-practices]] 에 따르면 hook 은 idempotent 보장이 핵심.

## byte-identical 동기화

`docs/templates/finance-team.yaml` + `docs/templates/ttree-engineering-team.yaml` 은 [[kiki|kiki repo canonical]] 에서 sync. AppMaker 쪽 사본을 직접 수정 금지 — kiki 에서 먼저 바꾸고 sync.

`docs/templates/engineering-team.yaml` 은 **divergent purpose**:
- AppMaker = 17-agent external-company provisioning
- kiki = 12-agent self-team (kiki 자체 운영용 subset)

→ 같은 path 지만 sync 하지 않음.

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-agent-roles]] — 11 agent role 본문
- [[kiki-appmaker-orchestration]] — Sandwich 4-section 구조
- [[kiki]] — Sister codebase canonical templates
- [[kiki-profile-pipeline]] — kiki-profile-injector hook
- [[kiki-circuit-breaker]] — agent.run.failed hook
- [[index]]
