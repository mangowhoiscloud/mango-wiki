---
title: Resume Kiki Bullet Map
type: reference
category: career
tags: [resume, bullet-map, kiki, agent-governance, ssot]
related:
  - "[[resume-bullet-maps-hub]]"
  - "[[resume-linkedin-narrative]]"
  - "[[kiki]]"
  - "[[kiki-profile-pipeline]]"
  - "[[engineering-team]]"
sources:
  - "/Users/mango/workspace/resume/common/KIKI-BULLET-MAP.md"
created: 2026-05-01T05:00:00Z
updated: 2026-05-01T05:00:00Z
---

# Resume Kiki Bullet Map — AI Agent Governance via Behavioral Profiling

Kiki 코드베이스 + KIKI.md + engineering-team.yaml + index.ts(4,594줄) 기반 매핑.

원본 갱신: **2026-04-14** · 231 라인 · **304 commits, 81 PRs, 27-agent hierarchy, 21 pipeline guardrails, 28 skills, ~10.3K LOC plugin**.

## 카테고리 K-A — Agent Governance (메타-거버넌스)

| ID | 시스템 | 핵심 수치 |
|---|---|---|
| K-A1 | Slack MCP(6 tools), LLM Signal Extraction, Profile→Directive Converter, Skill Sync | 4 프로파일 축(comm/decision/rhythm/expertise), confidence 0.5 시작, **5-signal 자동 보정 주기**, privacy by design (원문 저장 금지) |
| K-A2 | Template Loader, Team Bootstrap, Provision Action | YAML 1파일 → **27-agent** 계층 전체 재구성, **4 budget tiers** (S/M/L/XL), v1→v4 4회 조직 재편 |
| K-A3 | provider-config(155줄), key-rotator(223줄), circuit-breaker(350줄) | **2 providers** (Claude/GLM), key rotation + circuit breaker 3-state, startup model sync |

## 카테고리 K-B — Pipeline Guardrails (21-Crack 거버넌스)

| ID | 시스템 | 핵심 수치 |
|---|---|---|
| K-B1 | CTO Router, PO, Planner, Designer, 7 Domain Leads, per-lead Dev/QA | **3 tiers**, 7 domain leads, **5 strict role types** (router/spec/scope/implement/verify) |
| K-B2 | scorecard parser, findScorecardInComments, auto-revert | **6축** (Req/Quality/Consistency/Completeness/Integrity/Originality) × 0-5점 = **30점**, **24+ threshold** (모든 축 4+), 2-stage (Lead + PO Acceptance) |
| K-B3 | 29 event handlers, 8 unique event types | **21 cracks**, **4,594줄** index.ts. C1(CTO triage), C2(PO spec gate), C5(scorecard <24 revert), C7(PO solo→delegate), C8(Dev self-done block), C11(per-issue wake), C18(load balancing), C20(backlog→todo promote), C21(reassign→wake) |

## 카테고리 K-C — Domain Knowledge Architecture

- **19 domains → 4 그룹** (Attendance/Vacation/Schedule/Admin) 클러스터링.
- **Domain Skills** (에이전트가 아닌 스킬로 지식 주입) — 토큰 비용 선형 증가 회피.
- **Company Skills API** + Template `skills[]` 섹션으로 자동 주입.

## 카테고리 K-D — LLM-Wiki Engine

- **27 raw → 35 wiki pages**, **8 wiki skills** (ingest/query/status/lint/rebuild/export/setup + foundation)
- **3-Layer**: Raw Sources (append-only, content_hash) → Wiki Pages (Obsidian wikilink, frontmatter, provenance marker) → Schema & Skills
- **4-tier cost-aware retrieval** (index → frontmatter → grep → full read)
- Export: graph.json (NetworkX), graph.graphml (Gephi), cypher.txt (Neo4j), graph.html (interactive)
- Karpathy 패턴: "wiki는 compiled artifact, 한 번 합성하고 최신 유지"

## 핵심 수치 인용 라이브러리

> 304 commits, 81 PRs merged, 28 skills, 158 test files, 290 source files. Solo-built.

> 21-crack pipeline guardrail system via plugin event handlers (29 handlers, 4,594 LoC).

> 27-agent 3-tier hierarchy autonomously analyze, spec, implement, review, verify against TTree (19 business domains, Korean Labor Standards Act compliance).

## 한 줄 마무리

> The system doesn't just run agents — it makes them accountable.

## 타겟별 권장 조립

| 타겟 | 권장 항목 | 키 |
|---|---|---|
| Agent-first | K-A1 + K-A2 + K-D | "Slack 행동 프로파일 → 27-agent 자동 거버넌스 + Karpathy LLM Wiki" |
| Platform/Infra | K-A3 + K-B3 | "Multi-provider 라우팅 + 21 plugin event handlers (4,594줄)" |
| Product/Applied | K-B1 + K-B2 | "PO 스펙 게이트 + 6축 30점 scorecard" |

## Related

- [[resume-bullet-maps-hub]] · [[resume-kiki-llm-wiki-reference]]
- [[kiki]] · [[kiki-profile-pipeline]] · [[kiki-scorecard-guards]] · [[kiki-slack-integration]]
- [[engineering-team]] · [[hub-spoke-pattern]] · [[budget-tiers]]
- [[paperclip-integration]]

## Open Questions

- 27-agent 는 v4 기준 — 향후 v5 (도메인 추가) 시 BULLET-MAP 의 자동 갱신 트리거가 있는가?
- K-D LLM-Wiki 의 27 raw / 35 pages 수치가 이 mango-wiki 의 현재 통계 (~119 pages) 와 별개인가? (Kiki 의 별도 wiki 인스턴스 = TTree 도메인)
