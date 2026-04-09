---
title: "Semantic Retrieval Layer — substring match를 벡터 유사도로 교체하면 리서치 에이전트가 달라집니다"
type: reference
category: blog-post
tags: [blog, memory-context]
source: "blog/posts/memory-context/74-semantic-retrieval-layer-embedding-vector-rag.md"
created: 2026-04-08T00:00:00Z
---

# Semantic Retrieval Layer — substring match를 벡터 유사도로 교체하면 리서치 에이전트가 달라집니다

> "franchise revival potential"을 검색했는데 아무것도 나오지 않습니다.
> 메모리에는 "Berserk가 연재 중단 후 애니메이션으로 부활에 성공했다"는 기록이 있는데,
> "revival"이라는 단어가 없기 때문입니다.
> 이 글은 GEODE의 메모리 검색을 lexical(substring match)에서
> semantic(embedding similarity)으로 확장한 과정과
> 트레이드오프를 기록합니다.

> Date: 2026-04-05 | Author: rooftopsnow | Tags: semantic-search, rag, embeddings, vector-store, adaptive-rag, openai-embeddings, numpy, agentic-retrieval

---

## 목차

1. 문제: 에이전트가 자기 메모리를 못 찾습니다
2. 선행 연구: Agentic RAG의 세 가지 패턴
3. 설계: 왜 자체 벡터 스토어를 만들었는가
4. EmbeddingEngine: 3-backend 전략과 Graceful Degradation
5. SimpleVectorStore: NumPy로 충분한 이유
6. RAGRouter: 쿼리 분류와 하이브리드 검색
7. 와이어링: 기존 MemorySearchTool에 semantic을 얹기
8. 트레이드오프: 비용, Latency, 벡터 DB 없이 어디까지 가능한가
9. 마무리

---

## 1. 문제: 에이전트가 자기 메모리를 못 찾습니다

GEODE의 `MemorySearchTool`은 3-tier 메모리(Session, Project, Organization)를 검색합니다. 검색 방식은 단순합니다.

```python
query_lower = query.lower()
if query_lower in data_str:
    matches.append(...)
```

이것은 `query`가 데이터에 **글자 그대로** 포함된 경우에만 동작합니다. "franchise revival"로 검색하면 "franchise revival"이라는 정확한 문자열이 있어야 합니다. "연재 중단 후 부활", "IP reboot success", "comeback franchise" — 의미적으로 동일한 표현은 모두 놓칩니다.

에이전트가 리서치 작업에서 10라운드 동안 수집한 정보를 Project Memory에 저장해 놓고도, 다음 세션에서 그 정보를 찾지 못하는 상황이 반복되었습니다. 문제는 메모리의 양이 아니라 **검색의 질**이었습니다.

---

## 2. 선행 연구: Agentic RAG의 세 가지 패턴

RAG(Retrieval-Augmented Generation) 분야의 최근 연구를 조사했습니다.

### 2.1 Self-RAG (Asai et al., 2023)

모델이 "지금 검색이 필요한가?"를 스스로 판단하고, 검색 결과의 관련성을 자체 평가합니다. 불필요한 검색을 줄이는 데 효과적이지만, 자체 평가를 위한 추가 LLM 호출이 필요합니다.

### 2.2 A-RAG (arXiv:2602.03442, 2026.02)

계층적 retrieval 인터페이스(keyword search, semantic search, chunk read)를 모델에 직접 노출하는 접근입니다. 모델이 어떤 검색 방법을 사용할지 자율적으로 결정합니다. HotpotQA에서 **94.5%**를 달성했습니다. GEODE의 "도구로서의 검색" 패턴과 가장 잘 맞는 접근입니다.

### 2.3 Adaptive RAG

쿼리 복잡도에 따라 검색 전략을 분기합니다.

- **Simple**: 직접 생성 (검색 불필요)
- **Focused**: 단일 단계 검색
- **Complex**: 다단계 반복 검색 + 자기 수정

이 분류 체계가 GEODE의 RAGRouter 설계에 직접적인 영감을 주었습니다.

### 설계 방향 결정

Self-RAG의 "필요할 때만 검색"은 매력적이지만, 추가 LLM 호출 비용이 P0/P1에서 절감한 효과를 상쇄합니다. A-RAG의 "도구로서의 검색"은 GEODE의 기존 tool_use 패턴과 자연스럽게 결합됩니다. Adaptive RAG의 쿼리 분류는 **LLM 없이 규칙 기반으로** 구현하여 비용 0을 유지할 수 있습니다.

최종 설계: **규칙 기반 쿼리 분류(Adaptive RAG) + 도구로서의 semantic search(A-RAG) + 기존 lexical과 병합(hybrid)**.

---

## 3. 설계: 왜 자체 벡터 스토어를 만들었는가

ChromaDB, FAISS, Qdrant, Pinecone — 벡터 DB 선택지는 많습니다. 하지만 GEODE에 외부 벡터 DB를 도입하지 않은 이유가 있습니다.

**첫째, 규모가 작습니다.** GEODE의 프로젝트 메모리(PROJECT.md + rules)는 수백~수천 개의 청크입니다. 수만 개를 넘기는 경우는 드뭅니다. 이 규모에서는 NumPy 행렬곱(`@` 연산자)이 brute-force cosine similarity를 밀리초 단위로 수행합니다.

**둘째, 의존성 비용입니다.** ChromaDB는 SQLite + click + onnxruntime 등 무거운 의존성을 끌고 옵니다. FAISS는 C++ 빌드가 필요합니다. Qdrant는 별도 서버 프로세스입니다. GEODE는 `uv run geode` 한 줄로 실행되어야 하므로, NumPy(이미 의존성) 외에 추가 설치를 강제하지 않았습니다.

**셋째, 탈출구가 있습니다.** `SimpleVectorStore`의 인터페이스(`add`, `search`, `clear`)는 의도적으로 단순합니다. 규모가 커지면 동일한 인터페이스를 가진 ChromaDB나 Qdrant 어댑터로 교체할 수 있습니다.

ColBERTv2(Santhanam et al., 2022)의 late interaction 방식이나 Jina-ColBERT-v2의 다국어 지원도 검토했지만, 이들은 per-token 단위 임베딩을 생성하므로 저장 비용이 per-document 임베딩의 수십 배입니다. 현재 규모에서는 과잉 설계입니다.

---

## 4. EmbeddingEngine: 3-backend 전략과 Graceful Degradation

임베딩 엔진은 세 가지 backend를 지원합니다.

```python
class EmbeddingEngine:
    def __init__(self, backend="openai", model="text-embedding-3-small", ...):
        # "openai": text-embedding-3-small ($0.02/1M tokens), 1536 dimensions
        # "local":  sentence-transformers all-MiniLM-L6-v2 (무료), 384 dimensions
        # "none":   zero vectors (graceful degradation)
```

### OpenAI backend

기본 backend입니다. `openai` 패키지는 GEODE의 기존 의존성이므로 추가 설치가 불필요합니다. `text-embedding-3-small`은 $0.02/1M 토큰이고, PROJECT.md + 10개 rule = 약 5K 토큰이므로 전체 인덱싱 비용은 **$0.0001**입니다.

### Local backend

`sentence-transformers`를 optional dependency(`[rag]` extra)로 제공합니다. `all-MiniLM-L6-v2`는 384차원으로 OpenAI의 1536차원보다 작지만, 영어 검색에서 충분한 품질을 제공합니다. API 호출이 없으므로 네트워크 의존성이 사라집니다.

### Graceful Degradation

OpenAI 키가 없고 sentence-transformers도 설치되지 않았으면, `backend="none"`으로 폴백합니다. zero 벡터를 반환하므로 search는 항상 빈 결과를 반환하고, `MemorySearchTool`은 기존의 lexical 검색으로만 동작합니다.

이 단계적 폴백은 GEODE의 전체 설계 원칙("모든 LLM provider가 다운되어도 파이프라인은 기본값으로 계속 실행")과 일치합니다.

### 임베딩 캐시

동일 텍스트의 재계산을 방지하기 위해, SHA-256 해시 기반의 파일 캐시를 유지합니다.

```
.geode/embedding-cache/
├── 3a7f2b1c9e4d8f0a.npy   ← "Berserk franchise analysis" 임베딩
├── b2e4c6a8d0f1e3g5.npy   ← "market expansion potential" 임베딩
└── ...
```

두 번째 호출부터는 API를 거치지 않습니다. 프로젝트 메모리가 변경되지 않는 한, 세션마다 임베딩을 재계산할 필요가 없습니다.

---

## 5. SimpleVectorStore: NumPy로 충분한 이유

벡터 스토어의 핵심은 cosine similarity 검색입니다.

```python
# 정규화된 임베딩에 대해, cosine similarity = 내적
normalized = embeddings / norms
query_normalized = query_vec / np.linalg.norm(query_vec)
scores = normalized @ query_normalized  # (N,) vector of similarities
```

1,000개 엔트리에서 이 연산은 **< 1ms**입니다. 10,000개에서도 **< 10ms**입니다. FAISS의 ANN(Approximate Nearest Neighbor)이 필요한 규모는 수십만~수백만 개부터입니다.

디스크 저장은 `.npz` (임베딩) + `.json` (텍스트 + 메타데이터)으로 분리했습니다.

```
.geode/vectors/project/
├── embeddings.npz    ← NumPy compressed array
└── metadata.json     ← {"texts": [...], "metadata": [...]}
```

`add()`할 때마다 디스크에 동기적으로 저장합니다. 비동기 배치 쓰기가 더 효율적이지만, 세션 중 비정상 종료 시 데이터 손실을 방지하기 위해 동기 쓰기를 선택했습니다. 1,000개 엔트리 기준 `.npz` 파일은 약 6MB(1536차원 × 1000 × 4 bytes, 압축 후)이므로 디스크 부담은 미미합니다.

---

## 6. RAGRouter: 쿼리 분류와 하이브리드 검색

### 규칙 기반 분류

LLM 없이 정규식으로 쿼리 복잡도를 분류합니다.

```python
_COMPLEX_PATTERNS = [
    r"\b(compare|versus|differ|common|pattern|trend)\b",
    r"\b(across|between|among|all|every|each)\b",
]
_SIMPLE_PATTERNS = [
    r"\b(what is|who is|when did|how many|define)\b",
    r"\b(score|tier|price|cost|count|version)\b",
]
```

| 분류 | 예시 | 검색 방법 |
|------|------|---------|
| simple | "what is the score of Berserk" | Lexical (기존) |
| focused | "franchise revival potential for dark fantasy" | Semantic (vector) |
| complex | "compare patterns across all analyzed IPs" | Hybrid (lexical + vector) |

Self-RAG처럼 LLM이 분류하면 더 정확하겠지만, 분류 자체에 ~500ms + ~$0.001이 추가됩니다. 규칙 기반은 0ms, $0이고, 대부분의 경우 정확합니다. 틀려도 결과가 아예 없는 것이 아니라 최적이 아닐 뿐이므로, 비용 0의 장점이 더 큽니다.

### 하이브리드 검색

"complex" 쿼리에서는 semantic 결과와 lexical 결과를 결합합니다.

```python
def _hybrid_search(self, store, query, k, lexical_results):
    semantic = store.search(query, k=k * 2)
    # lexical에도 등장한 semantic 결과에 +0.1 boost
    for r in semantic:
        if any(lt in r.text.lower() for lt in lexical_texts):
            r.score = min(r.score + 0.1, 1.0)
    return sorted_and_filtered(...)
```

이 boosting은 단순하지만 효과적입니다. "Berserk"이라는 단어가 lexical로 매칭되면서 동시에 semantic으로도 높은 유사도를 보이는 결과는, 두 신호가 합쳐져 더 높은 순위를 얻습니다.

---

## 7. 와이어링: 기존 MemorySearchTool에 semantic을 얹기

기존 `MemorySearchTool.execute()`의 반환 직전에 semantic 결과를 병합합니다.

```python
# core/tools/memory_tools.py — execute() 끝부분

vs = get_vector_store()
if vs is not None and vs.size > 0:
    router = RAGRouter(vector_store=vs)
    semantic_results = router.retrieve(query, k=limit, lexical_results=matches)
    for sr in semantic_results:
        if not already_in_matches(sr):
            matches.append({
                "tier": "semantic",
                "source": sr.metadata.get("source", "vector_store"),
                "score": round(sr.score, 3),
                "text": sr.text[:500],
            })
```

기존 사용자 코드는 변경 없이 `memory_search` 도구를 호출하면 됩니다. vector store가 없으면 lexical 결과만 반환되고, 있으면 semantic 결과가 추가로 병합됩니다.

별도로 `semantic_search` 도구(59번째)도 등록하여, LLM이 명시적으로 semantic 검색만 수행할 수 있게 했습니다. A-RAG의 "계층적 retrieval 인터페이스" 패턴입니다.

### Bootstrap: 프로젝트 메모리 자동 인덱싱

`build_semantic_layer()`는 세션 시작 시 PROJECT.md와 rules를 자동으로 인덱싱합니다.

```python
def _index_project_memory(store):
    proj = ProjectMemory()
    memory_text = proj.load_memory()
    if memory_text:
        chunks = _chunk_text(memory_text, chunk_size=500, overlap=50)
        store.add(chunks, [{"source": "PROJECT.md"}] * len(chunks))
    for rule in proj.load_rules(""):
        store.add([rule["content"]], [{"source": f"rules/{rule['name']}.md"}])
```

500자 단위로 분할하되 50자 오버랩을 두어, 청크 경계에서 문맥이 끊기는 문제를 완화합니다.

---

## 8. 트레이드오프: 비용, Latency, 벡터 DB 없이 어디까지 가능한가

### 얻는 것

| 시나리오 | 변경 전 | 변경 후 |
|----------|---------|---------|
| "franchise revival" 검색 | 결과 0건 | 의미적으로 관련된 3-5건 |
| 규칙 검색 (10개 rule) | 키워드 매칭만 | 키워드 + 의미 유사도 병합 |
| 리서치 세션 context 주입 | 전체 메모리 dump | 관련 청크만 선별 (~70% 토큰 절감) |

### 비용

| 항목 | 비용 |
|------|------|
| 초기 인덱싱 (PROJECT.md + 10 rules) | ~$0.0001 (OpenAI embedding) |
| 검색당 쿼리 임베딩 | ~$0.000002 (1 query) |
| 디스크 저장 | ~6MB / 1K entries |
| Latency (검색) | ~50ms (API) + < 1ms (similarity) |

### 잃는 것

**1. OpenAI 의존성 심화.** 기본 backend가 OpenAI입니다. Anthropic만 사용하는 환경에서는 `backend="local"` 또는 `backend="none"`으로 전환해야 합니다. local backend는 sentence-transformers 설치가 필요하고, none은 semantic 검색 자체가 비활성화됩니다.

이것이 OpenAI embedding을 기본으로 선택한 이유이기도 합니다. GEODE는 이미 cross-LLM 검증을 위해 OpenAI 키를 보유하고 있습니다. 추가 비용 없이 기존 인프라를 활용합니다.

**2. 스케일 한계.** NumPy brute-force는 10K 엔트리까지 효율적이지만, 그 이상에서는 검색 latency가 선형으로 증가합니다. 50K 엔트리 이상의 대규모 knowledge base가 필요하면 FAISS IVF 인덱스나 외부 벡터 DB로 전환해야 합니다.

현실적으로, GEODE의 프로젝트 메모리가 10K 엔트리를 넘기는 시나리오는 당분간 없습니다. 이 한계를 넘게 되면, 그때가 벡터 DB 도입의 적절한 시점입니다.

**3. 임베딩 모델의 언어 편향.** `text-embedding-3-small`과 `all-MiniLM-L6-v2` 모두 영어에 최적화되어 있습니다. GEODE의 메모리에 한국어가 포함되면 검색 품질이 저하될 수 있습니다. `text-embedding-3-small`은 다국어 지원이 있지만 영어만큼 강하지는 않습니다. Jina-ColBERT-v2(다국어 late interaction)나 multilingual-e5-large 같은 다국어 모델로의 교체는 향후 과제입니다.

### 채택하지 않은 대안

**Corrective RAG (Yan et al., 2024)**: 검색 결과의 관련성을 평가하고, 부적절하면 쿼리를 재구성하여 재검색합니다. 5개의 전문 에이전트(Context Retrieval, Relevance Evaluation, Query Refinement, External Knowledge Retrieval, Response Synthesis)가 협업합니다. 품질은 높지만, 단일 검색에 5회의 LLM 호출은 GEODE의 비용 구조에 맞지 않습니다.

**LangGraph Store의 내장 벡터 검색**: LangGraph 1.1+에 optional in-memory vector search가 포함되어 있습니다. 그러나 GEODE의 메모리 시스템(3-tier ContextAssembler)과 LangGraph Store의 인터페이스가 맞지 않아, 자체 구현이 더 깔끔했습니다.

---

## 9. 마무리

P0(Tool Offloading)과 P1(Progressive Compression)이 **토큰 절감**에 초점이 있었다면, P2(Semantic Retrieval)는 **토큰 품질**에 초점이 있습니다. 같은 양의 토큰을 소비하더라도, 관련 있는 정보만 context에 주입하면 에이전트의 판단 품질이 향상됩니다.

이번 구현에서 가장 중요한 결정은 **"기존 도구에 얹는다"**는 것이었습니다. `memory_search`를 새로운 도구로 교체하는 대신, 기존 lexical 결과에 semantic 결과를 병합했습니다. 에이전트의 기존 행동 패턴을 변경하지 않으면서, 검색 품질만 향상시킵니다.

```
P0: tool result 크기 줄이기     (10:1~30:1 압축)
P1: conversation history 줄이기  (quadratic → linear)
P2: context 품질 높이기          (관련 정보만 선별 주입)
```

다음은 P3(RAPTOR Hierarchical Indexing)입니다. flat vector search는 "이 문서에서 X에 대한 정보를 찾아줘"에는 강하지만, "분석한 모든 IP의 공통 패턴은 무엇인가?"처럼 글로벌 추상화가 필요한 질문에는 약합니다. RAPTOR의 재귀적 클러스터링 + 요약 트리가 이 문제를 해결합니다.

### 참고 문헌

- Self-RAG (Asai et al., arXiv:2310.11511, 2023) — 모델이 검색 필요성을 자체 판단
- A-RAG (arXiv:2602.03442, 2026.02) — 계층적 retrieval 인터페이스, HotpotQA 94.5%
- Corrective RAG (Yan et al., 2024) — 5-agent 검색 결과 자기 수정
- Adaptive RAG — 쿼리 복잡도 기반 전략 분기
- ColBERTv2 (Santhanam et al., arXiv:2112.01488) — late interaction, 6-10x 공간 절감
- Jina-ColBERT-v2 (arXiv:2408.16672, 2024) — 다국어 지원, nDCG@10 53.1 on BEIR
- Agentic RAG Survey (arXiv:2501.09136, 2025.01) — single/multi/hierarchical agent RAG 분류

### 변경 파일

| 파일 | 변경 |
|------|------|
| `core/memory/embeddings.py` | 신규 — EmbeddingEngine (openai/local/none) + 캐시 + ContextVar DI |
| `core/memory/vector_store.py` | 신규 — SimpleVectorStore (NumPy cosine, disk persistence) |
| `core/memory/rag_router.py` | 신규 — RAGRouter (규칙 기반 분류, hybrid search) |
| `core/tools/memory_tools.py` | MemorySearchTool에 semantic 결과 병합 |
| `core/config.py` | `embedding_backend`, `embedding_model`, `semantic_search_enabled`, `semantic_similarity_threshold` |
| `core/tools/definitions.json` | `semantic_search` (59번째 도구) |
| `core/cli/tool_handlers.py` | semantic_search 핸들러 |
| `core/runtime_wiring/bootstrap.py` | `build_semantic_layer` 와이어링 + 자동 인덱싱 |
| `pyproject.toml` | optional `[rag]` extra dependency |
| `tests/test_semantic_retrieval.py` | 23개 테스트 |

---

*Source: `blog/posts/memory-context/74-semantic-retrieval-layer-embedding-vector-rag.md` | Category: [[blog-memory-context]]*

## Related

- [[blog-memory-context]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
