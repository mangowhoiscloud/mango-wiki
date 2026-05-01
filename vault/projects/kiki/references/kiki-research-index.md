---
title: Kiki Research Notes Index
category: references
tags: [kiki, research, paperclip, claude-code, llm-wiki, qmd, model-routing]
sources:
  - "kiki/docs/research/claude-code-model-routing.md"
  - "kiki/docs/research/llm-wiki-pattern.md"
  - "kiki/docs/research/paperclip-best-practices.md"
  - "kiki/docs/research/paperclip-ecosystem-analysis.md"
  - "kiki/docs/research/qmd-search-engine.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki Research Notes Index

`docs/research/` 의 5개 cross-codebase 연구 노트 (2026-04-08 ~ 04-09 집중 연구 주간). [[kiki-appmaker-research|sister AppMaker 의 동일 연구]] 와 byte-identical 또는 divergent.

## 연구 목록 + 출처

| 연구 | 날짜 | 출처 | 목적 |
|---|---|---|---|
| claude-code-model-routing | 2026-04-08 | `~/workspace/claude-code` codebase analysis | per-agent model/provider routing 디자인 |
| llm-wiki-pattern | 2026-04-09 | Karpathy gist + 실제 구현 사례 | Kiki profiling 의 wiki sync 디자인 |
| paperclip-best-practices | 2026-04-09 | Paperclip SDK + GitHub + 공식 docs + community | Kiki plugin architecture 결정 |
| paperclip-ecosystem-analysis | 2026-04-09 | npm + GitHub + MCP spec | harness protocol 방향 + SDK 의존성 전략 |
| qmd-search-engine | 2026-04-09 | Tobi Lütke의 QMD repo + npm | 로컬 search engine 통합 평가 |

## Claude Code Model Routing (2026-04-08)

`~/workspace/claude-code` 의 model 선택 로직 분석 — Kiki 의 per-agent 모델 매핑 설계 근거.

### 핵심 발견

| 측면 | Claude Code | Kiki 적용 |
|---|---|---|
| 모델 선택 메커니즘 | `/model` slash command (사용자 driven) | hardcoded per-agent yaml |
| Per-task 분기 | 없음 (단일 model) | role 별 분기 (CTO=haiku, Designer=sonnet, Dev=opus) |
| Fallback chain | 단일 (Anthropic only) | 3-provider (Anthropic / OpenAI / GLM) |
| Effort dial | `/model` picker 에서 선택 | yaml 의 `effort: high|medium|low` |
| Cost optimization | user 책임 | 자동 (CTO 의 routing 결정엔 cheap model) |

### 적용 결과

Kiki 의 [[kiki-confidence-scoring|confidence-based 분배]] + [[geode-llm-models|GEODE의 fallback chain]] 와 결합해 다층 model 라우팅:
1. **Stage 별 디폴트** — yaml 정의
2. **Confidence 기반 escalation** — 낮은 confidence task → 더 비싼 model
3. **Cost ceiling 도달 시 GLM-5.1 fallback** — 70% cost 절감

## LLM Wiki Pattern (2026-04-09)

[Karpathy gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 분석. 본 mango-wiki 자체가 이 패턴 따라 운영.

### Karpathy 원칙

1. **Compile, don't retrieve** — wiki 는 pre-compiled knowledge. RAG 처럼 매번 query 안 함, 미리 정리해 두고 참조
2. **Single source of truth** — `index.md` (전체 페이지 inventory) + `log.md` (운영 이력) + `.manifest.json` (sync state)
3. **Frontmatter required** — title / category / tags / sources / created / updated 6 필드 필수
4. **Wikilinks for graph** — wikilink 문법으로 페이지 간 연결 → graph traversal 가능

### 실제 구현 사례 분석

- **Karpathy 본인** — Obsidian + custom git sync
- **Tobi Lütke** — Obsidian + QMD (별도 연구 [[#qmd-search-engine]])
- **mango-wiki** — Obsidian + skill-based agent (이 wiki)

### Kiki 적용

Kiki profile sync = `kiki-export` skill → mango-wiki vault 의 `projects/kiki/concepts/` + `entities/` + `references/` 자동 갱신. profile 데이터 변경 시 wiki 페이지 frontmatter 의 `updated` field 만 갱신, content 는 diff merge.

## Paperclip Best Practices (2026-04-09)

Paperclip SDK + 공식 docs + 커뮤니티 분석. plugin 작성 best practice.

### Plugin SDK 패턴

| 영역 | best practice | 근거 |
|---|---|---|
| Event handler | idempotent 보장 (재시도 안전) | Paperclip 의 retry 정책: 같은 event 가 max 3회 재발생 가능 |
| Tool definition | input schema strict, output schema lenient | LLM 이 input 잘못 만들면 reject, output 은 다양한 format 허용 |
| State persistence | per-agent dir 분리 | concurrent agent 충돌 방지 |
| Circuit breaker | per-agent + company-wide 양쪽 트리거 | 한 agent 폭주 → 전체 멈추지 않음 |
| Profile injection | agent.created 시점에만, 이후엔 mutation 금지 | runtime profile 변경은 일관성 깨뜨림 |

### Production readiness checklist

- [ ] event handler 모두 idempotent
- [ ] tool input/output schema 명시
- [ ] per-agent state dir 분리
- [ ] circuit breaker 양쪽 hook 등록
- [ ] profile injection 단발 (mutation 금지)
- [ ] error log → Paperclip stderr 통합
- [ ] heartbeat run 의 80턴 한도 인지 + checkpoint-resume

→ Kiki 의 [[kiki-circuit-breaker]] + [[kiki-profile-pipeline]] 가 이 checklist 따라 구현.

## Paperclip Ecosystem Analysis (2026-04-09)

Paperclip 생태계 전체 매핑 — SDK 의존성 전략 결정 근거.

### 생태계 구성

```
paperclipai/paperclip       (메인 runtime + issue tracker)
    ↑
paperclipai/plugin-sdk      (npm @paperclipai/plugin-sdk)
    ↑
awesome-paperclip           (커뮤니티 plugin 모음)
    ├── kiki.profile-injector  (Kiki 가 작성)
    └── 기타...

mvanhorn/paperclip-plugin-acp  (ACP 통합 - alt agent runtime)

MCP spec                    (model context protocol)
    └── Kiki 가 MCP 서버로 slack-collector 노출
```

### SDK 의존성 전략 결정

옵션:
- **A. SDK 직접 의존** — `@paperclipai/plugin-sdk` 를 plugin 에 import
- **B. ACP 추상화** — `paperclip-plugin-acp` 통해 다른 runtime 도 지원
- **C. 직접 통신** — REST API + raw event handler 만 사용

선택: **A** (현재). 이유:
- Paperclip 이 primary runtime, 다른 runtime 지원 필요 없음
- SDK 가 type-safe 보장
- ACP 추상화는 over-engineering

향후 Paperclip 외 다른 agent runtime 지원 필요해지면 B 로 전환 검토.

## QMD Search Engine (2026-04-09)

[Tobi Lütke의 QMD](https://github.com/tobi/qmd) — 로컬 search engine. Quarto Markdown 형식 + 자체 indexing.

### 평가 결과

| 측면 | QMD | Kiki 의 mango-wiki |
|---|---|---|
| 형식 | `.qmd` (Markdown 상위 호환 + 코드 셀) | plain `.md` |
| Indexing | 자체 search index | Obsidian 기본 search |
| MCP 통합 | 가능 (npm `@tobilu/qmd`) | 없음 |
| 코드 데모 셀 | 가능 | 불가 |

### 결론

Obsidian wiki (`mango-wiki`) 는 plain Markdown 만 → QMD 통합 안 함. 외부 회사용 `app/kiki-wiki/` 는 QMD 옵션 (코드 데모 셀 가능) — 향후 작업으로 미뤄둠.

## See also

- [[kiki]] — Hub
- [[kiki-appmaker-research]] — sister AppMaker 의 동일 연구 (mostly byte-identical)
- [[kiki-appmaker-research]] — sister codebase 의 동일 연구 (mostly byte-identical)
- [[kiki-profile-pipeline]] — paperclip-best-practices 의 profile injection 적용
- [[kiki-circuit-breaker]] — paperclip-best-practices 의 circuit breaker 적용
- [[geode-llm-models]] — Cross-provider model routing 매트릭스
- [[index]]
