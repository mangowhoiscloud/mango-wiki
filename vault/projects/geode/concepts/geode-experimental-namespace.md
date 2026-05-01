---
title: GEODE Experimental Namespace (experimental/)
category: concepts
tags: [geode, experimental, prototypes, raptor, rag, progressive-compression, parking-lot, opt-in]
sources:
  - "geode/experimental/README.md"
  - "geode/experimental/memory/{embeddings,vector_store,rag_router,raptor}.py"
  - "geode/experimental/orchestration/progressive_compression.py"
  - "geode/CHANGELOG.md (v0.63.0 D-3)"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE Experimental Namespace

> v0.63.0 (D-3) — 새 top-level `experimental/` 디렉터리. 작동하는 프로토타입이지만 product fit 미검증 → 기본 quality gate 에서 제외 (opt-in). RAPTOR 시맨틱 메모리 + 3-zone progressive compression 등 6 모듈 + 50 tests parking lot.

## 왜 만들었나

**문제**: 6.5K 라인의 untracked 메모리/오케스트레이션 모듈이 working tree 에 떠 있었음. 50 tests 통과하지만 production code (`core/`) 에서 import 0건 — 완전 orphan.

**옵션**:
- **(a) Drop**: 50 working tests 손실. 향후 RAG 요구 재발 시 재구현 비용
- **(b) 직접 통합**: 3-codebase consensus 0/3 (academic + OpenHands citation 만) → frontier 미검증
- **(c) Defer to `experimental/`** ← 선택. working code 보존 + opt-in 명시 + 통합 기준 문서화

## 디렉터리 구조

```
experimental/
├── __init__.py
├── README.md              ← 운영 가이드 (opt-in usage + 통합 기준)
├── memory/
│   ├── __init__.py
│   ├── embeddings.py      (~400 lines, OpenAI / local sentence-transformers / no-op)
│   ├── vector_store.py    (~250 lines, simple cosine + on-disk persist)
│   ├── rag_router.py      (~350 lines, heuristic + vector hybrid)
│   └── raptor.py          (~900 lines, Sarthi et al. ICLR 2024)
├── orchestration/
│   ├── __init__.py
│   └── progressive_compression.py  (~320 lines, 3-zone)
└── tests/
    ├── __init__.py
    ├── test_progressive_compression.py
    ├── test_raptor.py
    └── test_semantic_retrieval.py
```

## Default-excluded from quality gates

| Gate | 기본 동작 | 이유 |
|---|---|---|
| `pytest tests/` | `experimental/tests/` 미수집 | `pyproject.toml:testpaths = ["tests"]` |
| `ruff check` | `experimental/` 미검사 | `pyproject.toml:[tool.ruff] src = ["core", "tests"]` |
| `mypy` | `mypy core/` (cmd-line 인자) | command 에 `experimental/` 안 넣음 |

→ CI 가 `experimental/` 변경 무시. 기본 metric 에 포함 안 됨.

## Opt-in usage

```bash
# 명시적으로 experimental 테스트 실행
uv run pytest experimental/tests/ -v

# experimental 코드 lint (수동)
uv run ruff check experimental/
```

production 통합 시 `core/` 로 이동 → 자동으로 default gate 에 들어옴.

## 6 모듈 상세

### memory/embeddings.py (~400 lines)

Pluggable text embedding + content-hash caching. 3 backends:
- `openai` — `text-embedding-3-small` via OpenAI dependency
- `local` — `sentence-transformers` (optional `[rag]` extra, ~500MB model)
- `none` — no-op fallback

API: `EmbeddingEngine.embed(text) -> np.ndarray`.

### memory/vector_store.py (~250 lines)

Simple cosine-similarity vector store + on-disk persistence. JSON serialization.

API: `SimpleVectorStore.add(text, metadata)`, `.search(query, top_k) -> list[SearchResult]`.

### memory/rag_router.py (~350 lines)

Heuristic + vector hybrid query router. simple heuristics (keyword match, recency) + cosine similarity 점수 결합.

API: `RAGRouter.retrieve(query, top_k) -> list[SearchResult]`.

### memory/raptor.py (~900 lines)

[Sarthi et al., RAPTOR ICLR 2024](https://arxiv.org/abs/2401.18059). 재귀 abstractive tree 를 vector store 위에 구축. search 시 root 에서 leaf 로 traverse → 적절한 abstraction level 반환.

API: `RAPTORIndex.build(vector_store)`, `.search(query, top_k) -> list[RAPTORResult]`.

### orchestration/progressive_compression.py (~320 lines)

OpenHands 2025.11 패턴. 3-zone graduated compression:
- **Zone A (Recent 20%)** — verbatim, 압축 안 함
- **Zone B (Middle 60%)** — LLM-summarized (3-5 messages → ~200 tokens)
- **Zone C (Oldest 20%)** — archived to filesystem, marker 로 대체

Trigger: 60% context usage (WARNING 80% 이전 미리). quadratic → linear 비용 변환.

## 왜 deferred 인가 (frontier consensus 부재)

| 모듈 군 | Hermes | OpenClaw | Claude Code | 결론 |
|---|---|---|---|---|
| RAPTOR-style 시맨틱 stack | ✗ | ✗ | ✗ | 0/3 — 학술 paper-driven |
| Progressive compression | ✗ | ✗ | ✗ | 0/3 — OpenHands citation only |

GEODE 의 [[geode-context-overflow-prevention|기존 200K guard]] 와 영역 중복 — 두 시스템 책임 boundary 정리 후에 통합 가능.

## 통합 기준 (promotion criteria)

`experimental/README.md` 명시. 다음 모두 true 일 때 `experimental/` → `core/` 승격:

1. **Concrete production caller** — 가설이 아닌 실제 호출자 존재
2. **Product trade-off 문서화** — latency / cost / accuracy / UX 영향 측정값
3. **3-codebase ground truth** — Hermes / OpenClaw / Claude Code 중 1+ 가 같은 패턴
4. **Integration test** — `tests/` 에 production 호출 path 검증 테스트

## 제거 기준 (removal criteria)

- 6+ months idle (production caller 없음)
- 다른 production code 가 같은 문제를 더 단순히 해결
- 학술/외부 영감이 obsolete (RAPTOR 후속 paper 가 GEODE 적용 가능)

## See also

- [[geode-architecture]] — 4-layer stack (experimental 은 별도)
- [[geode-context-overflow-prevention]] — 기존 200K guard (영역 중복)
- [[geode-memory-system]] — 현재 production memory (RAPTOR 통합 여지)
- [[geode-lifecycle-commands]] — `/clean` 으로 experimental 산출물 제거 가능
- [[geode-plugin-namespace]] — sister directory `plugins/` (도메인 plugin)
- [[deep-thinking-ratio]] — RAPTOR 와 같은 그룹의 academic 논문
- [[index]]
