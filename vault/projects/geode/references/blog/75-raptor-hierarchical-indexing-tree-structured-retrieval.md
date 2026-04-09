---
title: "RAPTOR Hierarchical Indexing — '공통 패턴이 뭐야?'에 답하려면 트리가 필요합니다"
type: reference
category: blog-post
tags: [blog, memory-context]
source: "blog/posts/memory-context/75-raptor-hierarchical-indexing-tree-structured-retrieval.md"
created: 2026-04-08T00:00:00Z
---

# RAPTOR Hierarchical Indexing — "공통 패턴이 뭐야?"에 답하려면 트리가 필요합니다

> "분석한 모든 IP의 공통 패턴은 무엇인가?"
> flat vector search는 이 질문에 답하지 못합니다.
> 개별 문서 청크에서 유사한 것을 찾을 뿐,
> 문서 전체를 관통하는 테마를 추출하지 못하기 때문입니다.
> 이 글은 RAPTOR의 재귀적 클러스터링 + 요약 트리를
> GEODE에 적용하여 다단계 추상화 검색을 구현한 과정을 기록합니다.

> Date: 2026-04-05 | Author: rooftopsnow | Tags: raptor, hierarchical-retrieval, tree-index, clustering, k-means, multi-level-abstraction, iclr-2024, numpy

---

## 목차

1. 문제: flat search가 답하지 못하는 질문
2. RAPTOR 논문: 재귀적 트리의 핵심 아이디어
3. 설계: NumPy k-means + Haiku 요약으로 구현하기
4. 구현: 트리 구축 — 리프에서 루트까지
5. 구현: 다단계 검색 — detail / theme / global / auto
6. 와이어링: P2 위에 P3을 얹는 구조
7. 트레이드오프: 구축 비용 vs 검색 품질 vs 스케일
8. 마무리: 4-Phase 토큰 최적화의 완성

---

## 1. 문제: flat search가 답하지 못하는 질문

74번 포스트에서 구현한 Semantic Retrieval Layer(P2)는 "franchise revival potential"같은 focused 쿼리에 강합니다. 쿼리와 가장 유사한 청크 5개를 반환하고, 에이전트는 이를 바탕으로 판단합니다.

그런데 다른 종류의 질문이 있습니다.

- "분석한 모든 IP에서 반복되는 공통 패턴은?"
- "어떤 장르가 게임화 성공률이 높은가?"
- "전체적으로 가장 큰 리스크 요인은 무엇인가?"

이 질문들은 **개별 문서가 아니라 문서 집합의 테마**를 요구합니다. flat vector search는 쿼리와 유사한 개별 청크를 반환할 뿐, 10개 문서를 관통하는 패턴을 추출하지 못합니다.

Microsoft의 GraphRAG(2024)가 이 문제를 해결하지만, 사용자가 GraphRAG를 제외하고 진행하기로 결정했습니다. 대안으로 RAPTOR(ICLR 2024)가 동일한 문제를 **그래프 없이 트리 구조로** 해결합니다.

---

## 2. RAPTOR 논문: 재귀적 트리의 핵심 아이디어

Sarthi et al.의 RAPTOR(ICLR 2024)는 놀랍도록 단순한 아이디어입니다.

1. 원문을 청크로 분할합니다 (Level 0 리프 노드)
2. 리프 노드를 임베딩하고 **클러스터링**합니다
3. 각 클러스터를 **LLM으로 요약**하여 상위 노드를 만듭니다 (Level 1)
4. 상위 노드를 다시 클러스터링 + 요약합니다 (Level 2)
5. 노드가 충분히 적어질 때까지 반복합니다

결과는 **추상화 레벨에 따라 검색 가능한 트리**입니다.

```
Level 2: [전체 테마 요약]                     ← "공통 패턴은?"
Level 1: [클러스터 A 요약] [클러스터 B 요약]    ← "장르별 특성은?"
Level 0: [청크1] [청크2] [청크3] [청크4] ...    ← "Berserk의 metacritic은?"
```

RAPTOR는 QuALITY 벤치마크에서 GPT-4와 결합 시 **20% 개선**을 보고했습니다. 특히 "문서 전체를 이해해야 답할 수 있는 질문"에서 flat retrieval 대비 큰 차이를 보였습니다.

### GraphRAG와의 차이

| | GraphRAG | RAPTOR |
|--|----------|--------|
| 구조 | Entity knowledge graph + community summaries | Recursive cluster tree |
| 인덱싱 비용 | 높음 (LLM entity extraction) | 중간 (클러스터링 + 요약) |
| 글로벌 쿼리 | Community summary 검색 | 최상위 트리 노드 검색 |
| 의존성 | 그래프 DB (또는 in-memory graph) | NumPy + LLM |

GraphRAG는 entity 관계를 명시적으로 추출하므로 "A와 B의 관계는?"에 더 강합니다. RAPTOR는 의미적 유사성 기반 클러스터링이므로 "비슷한 것끼리 묶어서 패턴 찾기"에 적합합니다. GEODE의 프로젝트 메모리는 entity 관계보다 테마적 유사성이 중요하므로 RAPTOR가 더 적절합니다.

---

## 3. 설계: NumPy k-means + Haiku 요약으로 구현하기

### 왜 sklearn을 쓰지 않는가

k-means 클러스터링에 scikit-learn을 쓸 수도 있지만, 하나의 알고리즘을 위해 무거운 의존성(scikit-learn + joblib + scipy + threadpoolctl)을 추가하는 것은 과합니다. NumPy만으로 k-means를 구현하면 약 30줄이고, GEODE의 규모(수백~수천 노드)에서 성능 차이는 없습니다.

### k-means++ 초기화

순수 랜덤 초기화 대신 k-means++ 초기화를 사용합니다. 기존 centroid에서 먼 점을 다음 centroid로 선택하여, 초기 배치의 품질이 높아집니다.

```python
# K-means++ initialization
centroids[0] = embeddings[random_choice]
for c in range(1, k):
    dists = min_distance_to_existing_centroids(embeddings, centroids[:c])
    probs = dists ** 2 / sum(dists ** 2)
    centroids[c] = embeddings[weighted_random_choice(probs)]
```

### 요약 전략: Haiku → OpenAI mini → Extractive fallback

P1(Progressive Compression)과 동일한 3단계 fallback을 사용합니다.

1. Anthropic Haiku ($1/1M input) — 가장 저렴한 LLM
2. OpenAI gpt-4.1-mini ($0.40/1M input) — Anthropic 불가 시
3. Extractive fallback — LLM 없이 각 청크의 첫 문장 추출

9개 리프 → 3개 클러스터 → 1개 루트의 경우, Haiku 호출 4회(클러스터 3 + 루트 1), 총 비용 약 $0.006입니다.

---

## 4. 구현: 트리 구축 — 리프에서 루트까지

```python
class RAPTORIndex:
    def build(self, texts: list[str]) -> None:
        # Level 0: 리프 노드
        embeddings = self._engine.embed(texts)
        for text, emb in zip(texts, embeddings):
            self._nodes.append(_TreeNode(text=text, level=0, embedding=emb))

        current_level_indices = list(range(len(self._nodes)))

        # 재귀적 상위 레벨 구축
        for level in range(1, self._max_levels + 1):
            if len(current_level_indices) <= self._cluster_size:
                break

            clusters = self._cluster_nodes(current_level_indices)
            next_level_indices = []
            for cluster in clusters:
                cluster_texts = [self._nodes[i].text for i in cluster]
                summary = self._summarize_cluster(cluster_texts, level)
                summary_emb = self._engine.embed_single(summary)
                self._nodes.append(_TreeNode(
                    text=summary, level=level,
                    embedding=summary_emb, children=cluster,
                ))
                next_level_indices.append(len(self._nodes) - 1)

            current_level_indices = next_level_indices
```

9개 리프 텍스트로 `cluster_size=3`을 사용하면:

```
Level 0: [L0] [L1] [L2] [L3] [L4] [L5] [L6] [L7] [L8]   (9 leaves)
Level 1: [C0: L0,L1,L2] [C1: L3,L4,L5] [C2: L6,L7,L8]   (3 clusters)
Level 2: [Root: C0,C1,C2]                                   (1 root)
```

총 13개 노드, 3개 레벨. 트리는 `.geode/raptor/{collection}/`에 `.npz`(임베딩) + `.json`(메타데이터)으로 저장됩니다.

---

## 5. 구현: 다단계 검색 — detail / theme / global / auto

`knowledge_query` 도구는 `detail_level` 파라미터로 추상화 레벨을 지정합니다.

```python
def search(self, query, *, detail_level="auto", k=5):
    target_levels = self._resolve_levels(detail_level)
    # target_levels의 노드만 대상으로 cosine similarity 검색
    for node in self._nodes:
        if node.level in target_levels:
            score = cosine_similarity(query_emb, node.embedding)
            candidates.append((node, score))
    return top_k(candidates)
```

| detail_level | 검색 대상 | 적합한 질문 |
|-------------|---------|-----------|
| `detail` | Level 0 (리프) | "Berserk의 metacritic 점수는?" |
| `theme` | Level 1 (클러스터) | "다크 판타지 IP의 특성은?" |
| `global` | 최상위 레벨 | "전체 분석의 공통 패턴은?" |
| `auto` | 모든 레벨 | LLM이 자율적으로 적절한 레벨의 결과를 선택 |

`auto`가 기본값입니다. 모든 레벨의 노드를 검색하면, 질문의 성격에 따라 자연스럽게 적절한 레벨의 결과가 상위에 노출됩니다. 글로벌 질문은 루트 노드의 유사도가 높고, 디테일 질문은 리프 노드의 유사도가 높습니다.

---

## 6. 와이어링: P2 위에 P3을 얹는 구조

RAPTOR는 P2의 인프라(EmbeddingEngine + SimpleVectorStore) 위에 구축됩니다.

```python
# core/runtime_wiring/bootstrap.py

def build_raptor_index(*, hooks=None):
    if not settings.raptor_enabled:
        return None
    engine = get_embedding_engine()   # P2에서 주입
    store = get_vector_store()        # P2에서 주입
    if engine is None or store is None:
        return None                   # P2 없으면 P3도 불가

    index = RAPTORIndex("project", store, engine, ...)
    set_raptor_index(index)

    if not index.is_built and store.size > 0:
        leaves = store._texts[:]      # P2의 인덱싱된 텍스트를 리프로 사용
        index.build(leaves)
    return index
```

P2의 vector store에 이미 인덱싱된 텍스트가 RAPTOR의 리프 노드가 됩니다. 별도의 인덱싱 과정 없이 P2의 데이터를 재활용합니다.

`raptor_enabled`는 기본적으로 `False`(opt-in)입니다. RAPTOR 구축에는 LLM 호출이 필요하므로, 사용자가 명시적으로 활성화해야 합니다. P2(semantic search)만으로 충분한 경우가 많기 때문입니다.

---

## 7. 트레이드오프: 구축 비용 vs 검색 품질 vs 스케일

### 구축 비용

| 리프 수 | cluster_size | 클러스터 수 | LLM 호출 | 비용 (Haiku) |
|---------|-------------|-----------|---------|------------|
| 10 | 5 | 2 + 1 (root) | 3 | ~$0.004 |
| 50 | 5 | 10 + 2 + 1 | 13 | ~$0.02 |
| 200 | 5 | 40 + 8 + 2 + 1 | 51 | ~$0.07 |

200개 리프까지도 비용은 $0.10 미만입니다. GEODE의 프로젝트 메모리(PROJECT.md + rules)는 보통 10-50개 청크이므로, 구축 비용은 미미합니다.

### 검색 품질

RAPTOR 논문의 QuALITY 벤치마크 결과: flat retrieval 대비 **20% 개선** (GPT-4 기준).

GEODE에서의 기대 효과:
- "전체 패턴" 질문: flat search가 답하지 못하던 것을 답함 (0 → 1)
- "특정 사실" 질문: flat search와 동등 (Level 0 검색 = flat search와 같음)
- "테마" 질문: 클러스터 요약이 원문보다 간결하고 정돈됨

### 잃는 것

**1. 구축 Latency.** 50개 리프 기준 Haiku 13회 호출 × ~500ms = ~6.5초. 세션 시작 시 한 번만 발생하지만, 사용자가 "왜 느리지?"라고 느낄 수 있습니다. 이것이 `raptor_enabled=False`를 기본값으로 둔 이유입니다.

**2. 요약의 정보 손실.** 클러스터 요약은 비가역적입니다. Level 1 검색 결과에서 "이 클러스터의 원래 문서를 보고 싶다"면, children 인덱스를 통해 Level 0 노드를 참조해야 합니다. 현재 구현에서는 children 정보가 메타데이터에 포함되어 있지만, `knowledge_query` 도구가 이를 노출하지는 않습니다.

**3. 전체 재구축.** `update_incremental`은 현재 전체 트리를 재구축합니다. 진정한 incremental rebuild(영향받는 branch만 갱신)는 구현 복잡도가 높아 향후 최적화로 남겨두었습니다. 리프가 추가될 때마다 $0.02-0.07의 재구축 비용이 발생합니다.

### 채택하지 않은 대안

**LazyGraphRAG (Microsoft, 2024.11)**: GraphRAG의 비용 문제를 해결한 변형으로, 인덱싱 비용이 GraphRAG의 0.1%입니다. 그러나 여전히 entity extraction이 필요하고, GEODE의 메모리 구조와의 통합이 RAPTOR보다 복잡합니다. 사용자가 GraphRAG 제외를 결정했으므로, 이 변형도 범위에 포함하지 않았습니다.

---

## 8. 마무리: 4-Phase 토큰 최적화의 완성

P0부터 P3까지 4-Phase가 완성되었습니다.

```
P0: Tool Offloading + Masking      → 개별 tool result 10:1~30:1 압축
P1: Progressive Compression         → 대화 history quadratic → linear
P2: Semantic Retrieval              → 관련 context만 선별 주입
P3: RAPTOR Hierarchical Indexing    → 글로벌 추상화 검색
```

이 체계는 **토큰의 양을 줄이고(P0, P1)** 동시에 **토큰의 질을 높이는(P2, P3)** 이중 전략입니다.

| 방어 레이어 | 트리거 | 방법 | LLM 비용 | 복원 경로 |
|------------|--------|------|---------|---------|
| P0 Offload | tool result > 5K | 파일 저장 + summary | $0 | recall_tool_result |
| P1 Compress | context 60% | 3-Zone 분할 | ~$0.004 | recall_archived_context |
| P0 Masking | context 80% | placeholder 교체 | $0 | 없음 |
| P2 Semantic | 모든 검색 | vector cosine | ~$0.00002/query | - |
| P3 RAPTOR | 모든 검색 | 트리 다단계 | ~$0.02/build | - |

ACON(ICLR 2026)의 "gradient-free compression guideline optimization"과 Context-Folding(2025.10)의 "RL 기반 trajectory folding"은 이 체계 위에서 추가로 적용할 수 있는 고급 최적화입니다. 운영 데이터가 충분히 쌓이면 검토하겠습니다.

### 참고 문헌

- RAPTOR (Sarthi et al., ICLR 2024, arXiv:2401.18059) — 재귀적 트리 구조 검색, QuALITY +20%
- GraphRAG (Microsoft, 2024) — entity knowledge graph + community summaries
- LazyGraphRAG (Microsoft, 2024.11) — GraphRAG 인덱싱 비용의 0.1%
- Lost in the Middle (Liu et al., TACL 2024) — U자형 attention, context 중간부 정보 소실
- GEODE 72번 포스트, "Tool Offloading과 Observation Masking"
- GEODE 73번 포스트, "Progressive Context Compression"
- GEODE 74번 포스트, "Semantic Retrieval Layer"

### 변경 파일

| 파일 | 변경 |
|------|------|
| `core/memory/raptor.py` | 신규 — RAPTORIndex (k-means++ 클러스터링 + 재귀 요약 트리) |
| `core/config.py` | `raptor_enabled`, `raptor_cluster_size`, `raptor_max_levels` |
| `core/tools/definitions.json` | `knowledge_query` (60번째 도구) |
| `core/cli/tool_handlers.py` | knowledge_query 핸들러 |
| `core/runtime_wiring/bootstrap.py` | `build_raptor_index` 와이어링 |
| `tests/test_raptor.py` | 13개 테스트 |

---

*Source: `blog/posts/memory-context/75-raptor-hierarchical-indexing-tree-structured-retrieval.md` | Category: [[blog-memory-context]]*

## Related

- [[blog-memory-context]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
