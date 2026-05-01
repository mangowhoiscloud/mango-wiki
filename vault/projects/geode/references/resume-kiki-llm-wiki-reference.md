---
title: Kiki LLM-Wiki Engine Reference (Resume)
type: reference
category: career
tags: [resume, narrative, kiki, llm-wiki, karpathy, knowledge-architecture]
related:
  - "[[resume-bullet-maps-hub]]"
  - "[[resume-kiki-bullet-map]]"
  - "[[kiki]]"
  - "[[blog-harness-frontier]]"
sources:
  - "/Users/mango/workspace/resume/common/narratives/kiki-llm-wiki-reference.md"
created: 2026-05-01T05:00:00Z
updated: 2026-05-01T05:00:00Z
---

# Kiki LLM-Wiki Engine Reference (2026-04-14 분석)

레주메/커버레터의 Kiki LLM-Wiki 서술 근거. 21 라인 short reference.

## 핵심 수치

| 지표 | 값 |
|---|---|
| Raw sources (append-only) | **27** |
| Compiled wiki pages | **35** |
| Wiki skills | **8** (ingest, query, status, lint, rebuild, export, setup + foundation) |
| Layer 수 | **3** (Raw Sources → Wiki Pages → Schema & Skills) |
| Cost-aware retrieval tiers | **4** (index → frontmatter → grep → full read) |
| Provenance tracking | extracted / inferred / ambiguous 비율 표기 |

## 아키텍처 (Karpathy LLM Wiki 패턴)

> "wiki 는 compiled artifact, 한 번 합성하고 최신 유지"

- **Raw layer**: append-only, content_hash 기반 delta ingest
- **Wiki pages**: Obsidian wikilink, YAML frontmatter, provenance marker
- **Export**: graph.json (NetworkX), graph.graphml (Gephi), cypher.txt (Neo4j), graph.html (interactive)

## 서술 포인트 (레주메용)

- 에이전트 활동을 검색 가능한 institutional memory 로 축적
- 행동 프로파일, 팀 구조, 거버넌스 패턴, 의사결정 근거를 구조화
- 수동 큐레이션이 아닌 LLM 자동 컴파일 → 인간은 리뷰와 쿼리에 집중

## mango-wiki (이 wiki) 와의 관계

본 페이지가 인용하는 27 raw / 35 pages 는 **Kiki 의 별도 LLM-Wiki 인스턴스** (TTree 도메인용) 이고, 이 mango-wiki 는 별개 인스턴스 (전체 프로젝트 통합 ~119 pages):

| 인스턴스 | 도메인 | Raw | Pages | 위치 |
|---|---|---|---|---|
| Kiki LLM-Wiki | TTree (19 도메인 근태) | 27 | 35 | `kiki/wiki/` |
| mango-wiki (현재) | 전체 (geode/kiki/kiki-appmaker/bagelcode) | ~25 | ~119 | `mango-wiki/vault/` |

## 인용 가능한 한 줄

> "에이전트의 활동은 단순히 실행되는 것이 아니라, 검색 가능한 institutional memory 로 distillation 됩니다. 27개 raw 소스가 35개 wiki 페이지로 컴파일되며, 4-tier cost-aware retrieval 로 비용 최적화."

## 사용 컨텍스트

- **Kiki BULLET-MAP K-D** 의 본문 데이터 소스 ([[resume-kiki-bullet-map]] §K-D)
- LinkedIn Experience 의 "Karpathy LLM Wiki engine" 표현의 근거
- 면접에서 "에이전트와 wiki 의 관계" 질문에 대한 토대

## Related

- [[resume-kiki-bullet-map]] — Kiki 전체 bullet map (이 페이지의 K-D 카테고리)
- [[resume-bullet-maps-hub]]
- [[kiki]] · [[kiki-research-index]]
- [[blog-harness-frontier]] — Karpathy 패턴 종합

## Open Questions

- 27 → 35 의 Raw → Pages 비율이 안정적인 메트릭인가? (도메인 추가 시 비례 증가?)
- 이 mango-wiki 의 119 페이지가 Kiki LLM-Wiki 의 35 페이지보다 큰 이유는 도메인 폭(4 프로젝트) 때문 — 단일 프로젝트 비교 시 비슷한 규모인지 검증 필요.
