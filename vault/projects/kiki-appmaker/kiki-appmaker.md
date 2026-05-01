---
title: Kiki AppMaker
category: project-hub
tags: [kiki-appmaker, paperclip, kiki, multi-agent, orchestration, appmaker, install]
sources:
  - "kiki-appmaker/KIKI.md"
  - "kiki-appmaker/README.md"
  - "kiki-appmaker/CLAUDE.md"
  - "kiki-appmaker/START.md"
  - "kiki-appmaker/SELF_CHECK.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker

> **Sister codebase to [[kiki|Kiki]]** — separate repo, separate `main`, no fork relation. AppMaker owns install/lifecycle, container OAuth rotation, agent team definitions, `.bkit/` workflow state, per-project `output/`, and `app/kiki-wiki/`. Kiki owns paperclip-plugin source, Slack collector MCP, profile schema, runtime skills, and the canonical `KIKI.md` identity.

## 정체성

Kiki AppMaker는 [[kiki|Kiki]] 시스템의 **install + lifecycle + multi-agent provisioning** 측면을 담당하는 별도 코드베이스. Slack 관찰 기반 user profiling이 Kiki의 코어라면, AppMaker는:

1. **Bootstrap pipeline** — 새 머신/컨테이너에 Paperclip + Kiki를 install하는 워크플로우 (`install/`)
2. **Agent team scaffolds** — 17-agent external-company provisioning (engineering-team.yaml)
3. **Stage orchestration** — PDCA host-mode 기반 멀티 stage 워크플로우 (CTO → PO → Lead → Dev → QA → Release → DevOps)
4. **External company dashboards** — token tracking, agent activity, diagram visualization
5. **Pitch deck (PIN system)** — match-3 게임 형태의 manager-facing demo (PIN-XX 시리즈)

## 코드베이스 경계 (2026-04-29 확정)

| 소유권 | kiki-appmaker | kiki (canonical) |
|---|---|---|
| Install/lifecycle | ✓ `install/bootstrap.sh`, `install/workspaces/{10-core,20-patches,30-plugins,40-team,50-dashboards}/` | |
| Container OAuth rotation | ✓ `install/tools/claude-creds-sync.sh` | |
| Agent team 정의 | ✓ `agents/` (17-agent) | `docs/templates/` (12-agent self-team) |
| `.bkit/` workflow state | ✓ | |
| `output/` per-project 산출물 | ✓ | |
| `app/kiki-wiki/` | ✓ | |
| paperclip-plugin 소스 | | ✓ |
| Slack collector MCP | | ✓ |
| Profile schema | | ✓ |
| Runtime skills (`.claude/skills/kiki-*`) | | ✓ |
| `KIKI.md` identity | sync only | ✓ |

**Byte-identical sync 대상** (kiki canonical → AppMaker copy, AppMaker 직접 수정 금지):
- `KIKI.md`
- `memory/diagrams/config.json`
- `memory/vault/SCHEMA.md`, `memory/vault/channel-project-map.json`
- `docs/templates/finance-team.yaml`, `docs/templates/ttree-engineering-team.yaml`

**Divergent purpose 동일 path** (양쪽 독립 진화):
- `docs/templates/engineering-team.yaml` — AppMaker 17-agent vs Kiki 12-agent
- `app/dashboard/` — AppMaker 외부 회사 token tracking vs Kiki self-monitoring
- `app/diagram-dashboard/` — 같은 product 이름, 각 repo의 consumer 향해 진화

종합 GAP 분석: `kiki/docs/research/gap-report-2026-04-29-kiki-vs-appmaker.md`.

## 두 가지 사용 모드

AppMaker workspace는 두 모드 중 하나로 동작한다.

### 모드 1: Paperclip claude_local agent (가장 흔한 케이스)

cwd가 컨테이너 안 `/workspaces/kiki-appmaker`이고, env에 `PAPERCLIP_API_URL` / `PAPERCLIP_API_KEY`가 set 돼 있으면 **claude_local agent**.

**행동 원칙:**
1. CLAUDE.md는 메인 instructions가 아님. AGENTS.md (4-section sandwich)가 행동 정의
2. **`Agent` tool / `Task` tool 사용 절대 금지** — 단일 stage owner. routing은 Paperclip API issue PATCH로만
3. **engineering-team 워크플로우 = production path. 단계 스킵 금지**
4. **본인 stage만 처리하고 STOP**
5. **bkit 자동화 L4 (Full-Auto)** — `.bkit/runtime/control-state.json`. 8 가드레일 동작

워크플로우 (production path):
```
User issue → CTO (triage)
  → PO (Planner에게 SPEC 위임) → Planner (SPEC.md) → PO (P4 검증)
  → Designer (output/<project>/DESIGN.md + DESIGN_SYSTEM.md)
  → Lead (FIFO) → Developer (구현) → QA (검증, 불합격 시 Dev 재작업 최대 3회)
  → Lead (SCORECARD) → PO (ACCEPTANCE) → CTO (Release) → DevOps (배포)
```

기술 스택 기본값: Next.js App Router + MySQL + standalone. HTML 단일 파일 금지.

### 모드 2: 호스트 머신 maintenance / install (드문 케이스)

cwd가 호스트의 kiki-appmaker repo root, `PAPERCLIP_API_URL` 없음. install 스크립트 수정, agent role 정의 변경, dashboard 개선 등 maintenance 작업.

이 모드에선 일반 Claude Code agent로 동작 (Agent tool 사용 가능).

## 주요 영역

### Agents — [[kiki-appmaker-agent-roles|11 agent role 정의]]

`agents/` 디렉터리의 17-agent team (lead/worker 조합):
- **Leads** (8): `cto-lead`, `pm-lead`, `po-lead`, `dev-lead`, `qa-lead`, `design-lead`, `infra-lead`, `devops-lead`
- **Workers** (1): `devops-worker`
- **Specialty** (2): `infra-local`, `quality-standards`

각 agent는 [[kiki-appmaker-orchestration|orchestration sandwich]]에 따라 4-section system prompt를 받는다.

### Install Pipeline — `install/`

5-stage workspace bootstrapping:
1. `10-core` — Paperclip core install
2. `20-patches` — kiki-patches rebase onto paperclip
3. `30-plugins` — kiki-plugin (현재 sibling clone, 향후 GitHub Release tarball로 전환 예정)
4. `40-team` — agent team provisioning
5. `50-dashboards` — token tracking + diagram dashboards

### Stage Orchestration — [[kiki-appmaker-pdca|PDCA host-mode]]

Plan-Do-Check-Act 사이클이 multi-stage 워크플로우 위에서 동작. CTO routing → PO planning → Lead allocation → Dev/QA execution → Release/DevOps deploy.

### PIN System — [[kiki-appmaker-pin-system|match-3 게임 데모]]

Manager-facing pitch deck. PIN-36 (daily challenge), PIN-44 (daily seed + share URL), PIN-48 (M2 howto-gen), PIN-59/60 (audio unlock + sprite), M3-A/B/C (match-3 게임 진화).

### Superpowers — [[kiki-appmaker-superpowers|plans + specs index]]

10+ 디자인 plans + 13 specs (2026-04-08 ~ 2026-04-28). slack-bot, diagram-dashboard, scaffold-correctness, stage-transition-guards, autonomous-deploy-guards, installer-workspaces, pitch-cleanup 등.

## 외부 자료

| 문서 | path | 위키 페이지 |
|---|---|---|
| Identity | `KIKI.md` | (sync from kiki) [[kiki]] |
| Boot guide | `START.md` + `SELF_CHECK.md` | 본 hub |
| Boundary spec | `CLAUDE.md` | 본 hub §"코드베이스 경계" |
| Stage orchestration | `docs/PDCA-ORCHESTRATOR-host-mode.md` | [[kiki-appmaker-pdca]] |
| Deployment | `docs/deployment-requirements.md` | [[kiki-appmaker-deployment]] |
| Sandwich identity | `install/sandwich/kiki-orchestration-identity.md` | [[kiki-appmaker-orchestration]] |
| Stage execution | `install/sandwich/stage-execution-footer.md` | [[kiki-appmaker-orchestration]] |
| Px-AppMaker skill | `docs/skills/px-appmaker/SKILL.md` | [[kiki-appmaker-skills-index]] |

## Related

- [[kiki]] — Sister codebase: Slack observation + profiling core
- [[kiki-appmaker-orchestration]] — Sandwich identity + stage execution
- [[kiki-appmaker-pdca]] — PDCA host-mode 워크플로우
- [[kiki-appmaker-pin-system]] — PIN match-3 game series
- [[kiki-appmaker-superpowers]] — plans + specs index
- [[kiki-appmaker-research]] — 6 research notes (token-opt, claude-code-routing, paperclip, llm-wiki, qmd-search)
- [[index]]
