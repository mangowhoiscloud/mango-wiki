---
title: Kiki AppMaker Research Notes
category: references
tags: [kiki-appmaker, research, paperclip, claude-code, llm-wiki, qmd, token-optimization]
sources:
  - "kiki-appmaker/docs/research/2026-04-21-token-optimization.md"
  - "kiki-appmaker/docs/research/claude-code-model-routing.md"
  - "kiki-appmaker/docs/research/llm-wiki-pattern.md"
  - "kiki-appmaker/docs/research/paperclip-best-practices.md"
  - "kiki-appmaker/docs/research/paperclip-ecosystem-analysis.md"
  - "kiki-appmaker/docs/research/qmd-search-engine.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Research Notes

`docs/research/` 의 6개 cross-codebase 연구 노트. AppMaker 디자인 결정의 근거.

## 목록

| 날짜 | 제목 | 주제 |
|---|---|---|
| 2026-04-21 | token-optimization | PIN 시리즈 진행 중 token 폭증 → 절감 전략 |
| (date n/a) | claude-code-model-routing | Claude Code 의 model selection / fallback 패턴 |
| (date n/a) | llm-wiki-pattern | Karpathy LLM Wiki 패턴 (Obsidian 자동 sync) |
| (date n/a) | paperclip-best-practices | Paperclip plugin 작성 best practices |
| (date n/a) | paperclip-ecosystem-analysis | Paperclip 생태계 (issue tracker + agent runtime) 분석 |
| (date n/a) | qmd-search-engine | QMD search engine (Quarto Markdown) 통합 |

## Token Optimization (2026-04-21)

PIN-44 / M3-C 같은 중규모 feature 가 80턴 한도 초과 빈발 → 토큰 절감 연구.

핵심 절감 전략:
- **per-agent effort 다이얼**: 모든 stage 에 `effort: high` 줄 필요 없음 → CTO routing 은 `low`, Dev 만 `high`
- **prompt cache 최대화**: agent system prompt = sandwich 4-section 중 § 1, § 3, § 4 는 공통 → cache hit
- **bkit skill granularity**: `bkit:pdca` 한 번 호출 = 여러 sub-task. skill 안에서만 prompt 재사용
- **GLM-5.1 fallback 옵션**: Anthropic 비용 5x → 같은 task GLM-5.1 로 70% 비용 절감

→ Kiki 코어의 model routing ([[kiki-confidence-scoring|confidence-based 분배]]) 와 결합해 **dual-provider auto-fallback** 적용.

## Claude Code Model Routing

Claude Code 의 `/model` picker + per-task model 선택 패턴 분석. AppMaker 의 [[kiki-appmaker-orchestration|sandwich identity]] 가 stage owner 별로 다른 model 쓰는 패턴은 여기서 영감.

핵심 발견:
- Claude Code 의 model 선택은 user-driven (`/model` slash command)
- 하지만 cost-sensitive task 에선 자동 fallback 도 가능
- AppMaker 는 stage 별 자동 model 매핑 적용:
  - CTO routing → `claude-haiku-4-5` (저비용 routing 결정)
  - PM Lead / Designer → `claude-sonnet-4-6` (균형)
  - Dev / QA → `claude-opus-4-7` (품질)

[[geode-llm-models]] + [[geode-adaptive-thinking]] 의 effort 5단계와 직교하는 axis.

## LLM Wiki Pattern (Karpathy)

[Karpathy LLM Wiki 패턴](https://karpathy.bearblog.dev/llm-wiki/) 분석. 본 mango-wiki 자체가 이 패턴 따라 운영.

핵심 원칙:
- **Compile, don't retrieve** — wiki 는 pre-compiled knowledge. update existing pages, not append-only
- **Single source of truth** — `index.md` + `log.md` + `.manifest.json` 으로 상태 추적
- **Frontmatter required** — title/category/tags/sources/created/updated
- **Wikilinks for connection** — wikilink 문법으로 graph 형성

AppMaker 는 자체 wiki (`app/kiki-wiki/`) 도 같은 패턴 — 외부 회사용 mini-wiki 자동 생성.

## Paperclip Best Practices

Paperclip plugin 작성 시 따라야 할 패턴 (`paperclip-best-practices.md`):

| 영역 | best practice |
|---|---|
| Event handler | idempotent 보장 (재시도 안전) |
| Tool definition | input schema = strict, output schema = lenient |
| State persistence | per-agent dir 분리 (concurrent agent 충돌 방지) |
| Circuit breaker | per-agent + company-wide 양쪽 트리거 |
| Profile injection | agent.created 시점에만, 이후엔 mutation 금지 |

[[kiki-circuit-breaker]] + [[kiki-profile-pipeline]] 가 이 best practice 따라 구현됨.

## Paperclip Ecosystem Analysis

Paperclip 생태계 (issue tracker + agent runtime + plugin system) 의 architecture 분석. AppMaker 가 install pipeline 짤 때 의존하는 boundaries.

분석 대상:
- **issue tracker** = Paperclip 의 routing 단위. PATCH /issues/{id} 가 state machine
- **agent runtime** = heartbeat 기반. heartbeat run = 80턴 max
- **plugin system** = `kiki.profile-injector` + 기타. agent.created / issue.comment_added / agent.run.failed 이벤트 hook

→ AppMaker 의 [[kiki-appmaker-orchestration|sandwich]] 가 plugin system + agent runtime 에 동시 의존.

## QMD Search Engine

Quarto Markdown 통합 가능성 연구. `app/kiki-wiki/` 가 Markdown + Quarto 형식 양쪽 지원하는 가능성 검토.

발견:
- QMD = `.qmd` 확장자, Markdown 상위 호환 + 코드 셀 실행 가능
- Obsidian wiki (`mango-wiki`) 는 plain Markdown 만 → QMD 통합 안 함
- 외부 회사용 `app/kiki-wiki/` 는 QMD 옵션 (코드 데모 셀 가능)

향후 작업으로 미뤄둠.

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-pin-system]] — Token optimization 의 트리거
- [[kiki-appmaker-orchestration]] — Sandwich identity (paperclip-best-practices 의 plugin system 의존)
- [[kiki-research-index]] — kiki repo 의 동일 연구 (sister codebase)
- [[geode-llm-models]] — Cross-provider model routing
- [[index]]
