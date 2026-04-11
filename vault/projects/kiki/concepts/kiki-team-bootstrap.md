---
title: Kiki Team Bootstrap — YAML Template → Runtime Agents
type: concept
tags: [kiki, bootstrap, template, yaml, paperclip]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Team Bootstrap

YAML 팀 템플릿을 파싱하여 런타임 에이전트 구성 + 프로필 시드 + 라우팅 맵 생성.

## Template Structure

```yaml
team:
  name: Engineering
  slug: engineering
  output_language: ko

grounding_policy: |
  ## CANNOT
  - NEVER fabricate file paths
  - NEVER claim work without git evidence

agents:
  - name: CTO
    role: cto
    reports_to: null
    budget_tier: S
    routing:
      model: claude-opus-4-6
    wake:
      trigger: issue.created
    profile_seed:
      communication:
        brevity: concise
    instructions_hint: |
      You are the CTO. Route all issues...
```

## Bootstrap Output

1. **Team Directive Markdown** — 계층 구조 + 라우팅 규칙 + 예산 표
2. **Per-Agent Role Directives** — 역할, 지시사항, 예산, 라우팅
3. **Routing Map** — `Map<agentName, RoutingEntry>` (에이전트 쿼리 도구용)
4. **Profile Seeds** — `profileSeedToUserProfile()` 초기 프로필 생성

## Budget Tiers

| Tier | Max Tokens | Use Case |
|------|-----------|----------|
| S | 5,000 | Router triage (CTO) |
| M | 20,000 | PM/spec/review |
| L | 100,000 | Developer implementation |
| XL | 200,000 | Complex refactor |

## Related

- [[kiki]]
- [[hub-spoke-pattern]]
- [[engineering-team]]
- [[finance-team]]
