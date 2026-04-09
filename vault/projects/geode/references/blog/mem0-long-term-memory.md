---
title: "Mem0 리서치 증류 — Production-Ready AI Agent Long-Term Memory"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/mem0-long-term-memory.md"
created: 2026-04-08T00:00:00Z
---

# Mem0 리서치 증류 — Production-Ready AI Agent Long-Term Memory

> Date: 2026-03-24 (updated 2026-03-26) | Source: [arXiv 2504.19413](https://arxiv.org/abs/2504.19413) (2025-04-28)
> Authors: Prateek Chhikara, Dev Khant, Saket Aryan, Taranjeet Singh, Deshraj Yadav

---

## 0. 배경: 하네스 시대의 메모리 문제

2026년 3월 기준, 프론티어 에이전트 하네스들은 **루프 + MD 기반 컨텍스트** 패턴으로 수렴하고 있습니다. Claude Code는 `while(tool_use)` 루프와 CLAUDE.md/MEMORY.md를, Codex CLI는 AGENTS.md를, Cursor는 `.cursor/rules/`를 사용합니다. 단일 턴의 연산은 가볍게 가져가되, 각 State에서의 **턴 수를 늘리는** 방향으로 발전하고 있습니다.

1M 토큰 컨텍스트 윈도우 시대에 이 접근은 대부분의 케이스를 커버합니다. 그러나 내부 데이터의 양이 방대하거나, MD 위주의 컨텍스트 체계가 아직 잡히지 않은 경우에는 LLM의 Retrieval 부하가 커집니다. 최근 벤치마크들이 이를 정량적으로 보여주고 있습니다:

- **RULER** (arXiv:2404.06654): GPT-4가 복합 태스크에서 4K → 128K로 갈 때 **96.6% → 81.2%**로 하락합니다. 단순 NIAH(99%+)와 달리, 실제 추론 태스크에서의 하락폭은 유의미합니다.
- **NoLiMa** (arXiv:2502.05167, ICML 2025): 리터럴 매칭이 아닌 잠재적 연관 추론을 테스트합니다. 128K를 지원한다고 주장하는 13개 모델 중 11개가 32K에서 **단문 기준선의 50% 이하**로 떨어졌습니다. GPT-4o조차 99.3% → 69.7%로 하락했습니다.
- **MRCR v2** (8-needle, 2026): 1M 토큰에서 8개 사실을 검색하는 태스크에서 Claude Opus 4.6이 **76%**, Gemini 3 Pro는 **24.5%**를 기록했습니다. 단일 니들(99%+)과의 격차가 큽니다.

**구조화의 영향**도 무시할 수 없습니다. Anthropic의 Contextual Retrieval 연구에 따르면, 컨텍스트를 구조화하면 청크 검색 실패를 **49% 감소**시킬 수 있고, 리랭킹을 추가하면 **67% 감소**까지 가능합니다. 반대로 비구조화된 컨텍스트에서는 LLM의 검색 정확도가 크게 하락합니다.

비용과 레이턴시도 고려 대상입니다. 1M 토큰 full-context 처리는 쿼리당 **$5.00**(Opus 4.6 기준)이며, TTFT는 **30-90초**입니다. RAG 기반 검색(top-10)은 ~$0.02, TTFT <1초입니다. Q3 2025 금융권 사례 연구에서 RAG는 레이턴시 **8x 감소**, 비용 **94% 절감**을 달성했습니다.

이런 맥락에서 Graph RAG의 범용 RAG로서의 ROI는 줄어드는 추이에 있습니다. 엔티티 추출 → 관계 구축 → 커뮤니티 탐지 파이프라인의 구축·유지 비용이 높기 때문입니다. 그러나 **적용 범위가 좁아진 만큼, 해당 범위 내에서의 가치는 오히려 선명해지고 있습니다**: 엔티티 간 관계가 핵심인 도메인, 멀티홉 추론, 장기 메모리의 구조화가 그 영역입니다. Mem0ᵍ(그래프 변종)는 이 영역을 정확히 타겟합니다.

본 리서치는 이 배경 위에서 Mem0의 아키텍처와 벤치마크를 분석합니다. 전체 벤치마크 수치의 출처와 검증은 **Appendix A**를 참조하시기 바랍니다.

---

## 1. 핵심 요약

Mem0는 LLM의 고정 컨텍스트 윈도우 한계를 극복하기 위한 **동적 메모리 아키텍처**입니다. 대화에서 핵심 정보를 추출·통합·검색하여 세션 간 일관성을 유지합니다. 두 가지 변종을 제안합니다:

| 변종 | 메모리 표현 | 토큰 소비 | 강점 |
|------|------------|----------|------|
| **Mem0** | 자연어 텍스트 | ~7k tokens/대화 | 단순 질의, 낮은 레이턴시 |
| **Mem0ᵍ** | 방향성 레이블 그래프 G=(V,E,L) | ~14k tokens/대화 | 시간적 추론, 관계형 질의 |

**LOCOMO 벤치마크** 기준:
- OpenAI 대비 **Overall J 26% 상대 개선** (66.88 vs 52.90)
- Full-context 대비 **p95 레이턴시 91% 감소** (1.44s vs 17.1s)
- **토큰 비용 ~73% 절감** (7k vs 26k raw conversation) [주: 논문 abstract는 "90%+"를 주장하나, 실제 수치(7k/26k)로 계산하면 ~73%]

---

## 2. 문제 정의 — 왜 메모리가 필요한가

### 컨텍스트 윈도우의 근본적 한계

| 모델 | 컨텍스트 길이 |
|------|-------------|
| GPT-4 | 128K tokens |
| Claude 3.7 Sonnet | 200K tokens |
| Gemini | 10M+ tokens |

논문의 핵심 주장: 컨텍스트 확장은 문제를 **지연**시킬 뿐 **해결**하지 못한다.

### 동기 예시

사용자가 "채식주의자이며 유제품 불가"라고 초반에 언급 → 수시간 동안 관련 없는 대화 → 저녁 추천 요청 시 메모리 없는 시스템은 **치킨을 추천**. 이런 "메모리 실패"가 사용자 경험과 신뢰를 훼손한다.

### 필요 조건

AI 에이전트 메모리 시스템은 인간 인지 과정을 모방해야 한다:
1. **선택적 저장**: 중요 정보만 보존
2. **개념 통합**: 관련 개념 연결
3. **적시 검색**: 필요할 때 관련 정보 제공

선행 연구에서 메모리 보강 에이전트가 행동-결과 간 인과관계를 활용해 의사결정을 개선하고, 계층적 메모리 아키텍처와 자율적 메모리 진화가 "다중 대화 세션에 걸친 일관된 장기 추론"을 가능하게 함이 입증됨.

---

## 3. 아키텍처 상세

### 3.1 Mem0 — 텍스트 기반 메모리

**2단계 파이프라인**: Extraction → Update

#### Phase 1: Extraction (추출)

입력 메시지 쌍 `(m_{t-1}, m_t)`에 대해 두 가지 컨텍스트 소스 활용:

1. **대화 요약 S**: DB에서 검색, 전체 대화 이력의 의미적 내용 포착
2. **최근 메시지 시퀀스**: `{m_{t-m}, ..., m_{t-2}}` (m=10, 하이퍼파라미터)

이들을 결합한 프롬프트:
```
P = (S, {m_{t-m}, ..., m_{t-2}}, m_{t-1}, m_t)
```

LLM 기반 추출 함수 `φ(P)`가 후보 메모리 집합 생성:
```
Ω = {ω₁, ω₂, ..., ωₙ}
```

#### Phase 2: Update (갱신)

추출된 각 사실 `ωᵢ ∈ Ω`에 대해:

1. **벡터 임베딩** 기반 top-s 의미적 유사 메모리 검색 (s=10)
2. LLM이 **function-calling**으로 4가지 연산 중 하나 결정:

| 연산 | 조건 | 동작 |
|------|------|------|
| **ADD** | 의미적 동등 메모리 없음 | 새 메모리 생성 |
| **UPDATE** | 기존 메모리와 보완적 | 기존 메모리 보강 |
| **DELETE** | 기존 메모리와 모순 | 모순 메모리 삭제 |
| **NOOP** | 변경 불필요 | 수정 없음 |

#### 구현 사양

| 파라미터 | 값 |
|---------|---|
| 추론 엔진 | GPT-4o-mini |
| 최근 메시지 윈도우 (m) | 10 |
| 유사 메모리 비교 수 (s) | 10 |
| 임베딩 모델 | text-embedding-3-small |
| 요약 생성 | 비동기 모듈, 주기적 갱신 |
| 벡터 DB | Dense embeddings |

### 3.2 Mem0ᵍ — 그래프 기반 메모리

자연어 메모리를 **방향성 레이블 그래프** `G = (V, E, L)`로 확장.

#### 그래프 구조

**노드 (V)**: 엔터티 (예: "Alice", "San_Francisco")
- 엔터티 타입 분류
- 임베딩 벡터 `e_v` (의미적 의미 포착)
- 메타데이터: 생성 타임스탬프 `t_v`

**엣지 (E)**: 관계, 트리플렛 `(v_s, r, v_d)` 형태
- `v_s`: 소스 노드
- `r`: 레이블 엣지 (관계)
- `v_d`: 목적 노드

**레이블 (L)**: 노드에 의미적 타입 부여 (Person, Location, Event 등)

#### 2단계 추출 파이프라인

1. **Entity Extractor**: 비정형 텍스트에서 핵심 정보 단위 식별
2. **Relationship Generator**: 의미 있는 연결 도출 → 트리플렛 구조 생성

LLM 기반 모듈이 언어 패턴과 컨텍스트 단서를 분석.

#### 그래프 갱신 전략

새 관계 트리플에 대해:
1. 소스/목적 엔터티 임베딩 계산
2. 유사도 임계값 `t` 초과 기존 노드 검색
3. 적절한 메타데이터와 함께 관계 설정
4. **충돌 감지**: 잠재적 구식 관계 식별
5. **LLM 기반 해결자**: 구식 관계를 **물리적으로 삭제하지 않고 무효로 표시** → 시간적 추론 가능

#### 이중 검색 메커니즘

| 방식 | 설명 |
|------|------|
| **Entity-centric** | 쿼리 엔터티 식별 → 의미적 유사 그래프 노드 탐색 → 입출력 관계 탐색 |
| **Semantic triplet** | 전체 쿼리를 임베딩으로 인코딩 → 트리플렛 인코딩과 매칭 → 임계값 이상 결과 반환 |

#### 구현 사양

| 파라미터 | 값 |
|---------|---|
| 그래프 DB | Neo4j |
| LLM 추출/갱신 | GPT-4o-mini + function calling |
| 임베딩 | Dense embeddings + semantic encodings |

### 3.3 Mem0 vs Mem0ᵍ 핵심 차이

| 차원 | Mem0 | Mem0ᵍ |
|------|------|-------|
| 메모리 표현 | 자연어 텍스트 | 구조화된 그래프 |
| 토큰 소비 | ~7k/대화 | ~14k/대화 |
| 강점 | 단순 질의 검색 효율 | 시간적 추론, 복합 관계형 질의 |
| 검색 레이턴시 (p50) | 0.148s | 0.476s |
| 추가 인프라 | 벡터 DB | 벡터 DB + Neo4j |

---

## 4. 실험 설계

### 4.1 벤치마크: LOCOMO

| 속성 | 값 |
|------|---|
| 대화 수 | 10개 |
| 대화당 다이얼로그 | ~600개 |
| 대화당 평균 토큰 | ~26,000 |
| 대화당 질문 수 | ~200개 (ground truth 포함) |
| 질문 유형 | Single-hop, Multi-hop, Temporal, Open-domain |
| 구조 | 다수 세션에 걸쳐 분포 |

### 4.2 평가 메트릭

#### 성능 메트릭

| 메트릭 | 설명 |
|--------|------|
| **F1 Score** | 어휘 매칭 기반 정밀도-재현율 조화평균 |
| **BLEU-1** | 1-gram 기반 어휘 유사도 |
| **LLM-as-a-Judge (J)** | 사실 정확성, 관련성, 완전성, 문맥 적절성 평가 |

- J 메트릭: **10회 독립 실행**의 평균 ± 1 표준편차
- 판별 기준: "관대한 채점 — gold answer와 같은 주제에 닿기만 하면 CORRECT"
- 시간 질의: "gold answer와 같은 날짜/기간을 참조하면 CORRECT"
- 출력 형식: 1문장 추론 설명 + CORRECT/WRONG 이진 라벨 (JSON)

#### 배포 메트릭

| 메트릭 | 설명 |
|--------|------|
| **토큰 소비** | cl100k_base 인코딩(tiktoken) 기준 검색 시 추출 토큰 수 |
| **검색 레이턴시** | 메모리/청크 검색 시간 |
| **전체 레이턴시** | 검색 + LLM 응답 생성 (p50, p95) |

### 4.3 베이스라인 — 6개 카테고리

#### 카테고리 1: 기존 LOCOMO 벤치마크 방법

| 방법 | 핵심 접근 |
|------|----------|
| **LoCoMo** | 단기 요약 + 장기 관찰 + 시간적 이벤트 그래프 (인과적으로 연결된 생활 이벤트 추적) |
| **ReadAgent** | Episode Pagination (텍스트 분할) → Memory Gisting (요약) → Interactive Lookup (선택적 검색) |
| **MemoryBank** | Memory Storage + Dual-tower dense model 검색 + 인간 유사 감쇠(decay) 메커니즘 갱신 |
| **MemGPT** | OS 영감 아키텍처: main context (RAM) + external context (디스크), function call로 메모리 계층 관리 |
| **A-Mem** | 에이전트형 시스템: 상호연결 노트 + LLM 생성 키워드/태그, 동적 "메모리 진화"로 기존 노트 개선 |

#### 카테고리 2: 오픈소스 솔루션

| 방법 | 설정 |
|------|------|
| **LangMem** | gpt-4o-mini + text-embedding-3-small |

#### 카테고리 3: RAG 접근

| 청크 크기 | k 값 | 임베딩 |
|----------|------|--------|
| 128, 256, 512, 1024, 2048, 4096, 8192 tokens | k ∈ {1, 2} | text-embedding-3-small |

#### 카테고리 4: Full-Context

전체 대화 이력(~26,000 tokens)을 LLM 컨텍스트 윈도우에 주입.

#### 카테고리 5: 상용 서비스

| 방법 | 설정 |
|------|------|
| **OpenAI ChatGPT Memory** | gpt-4o-mini 사용 |

#### 카테고리 6: 메모리 프로바이더

| 방법 | 특징 |
|------|------|
| **Zep** | 시간적 지식 그래프, 타임스탬프 정보 보존하여 시간적 충실도 유지 |

### 4.4 실험 설정

| 항목 | 값 |
|------|---|
| Temperature | 0 (재현성 극대화) |
| 임베딩 모델 | OpenAI text-embedding-3-small |
| 추론 엔진 | GPT-4o-mini |

---

## 5. 실험 결과

### 5.1 성능 비교 (Table 1)

#### Single-Hop 질의

| 방법 | F1 | BLEU-1 | J (±σ) |
|------|-----|--------|--------|
| LoCoMo | 25.02 | 19.75 | — |
| ReadAgent | 9.15 | 6.48 | — |
| MemoryBank | 5.00 | 4.77 | — |
| MemGPT | 26.65 | 17.72 | — |
| A-Mem | 27.02 | 20.09 | — |
| A-Mem* | 20.76 | 14.90 | 39.79 ± 0.38 |
| LangMem | 35.51 | 26.86 | 62.23 ± 0.75 |
| Zep | 35.74 | 23.30 | 61.70 ± 0.32 |
| OpenAI | 34.30 | 23.72 | 63.79 ± 0.46 |
| **Mem0** | **38.72** | **27.13** | **67.13 ± 0.65** |
| Mem0ᵍ | 38.09 | 26.03 | 65.71 ± 0.45 |

#### Multi-Hop 질의

| 방법 | F1 | BLEU-1 | J (±σ) |
|------|-----|--------|--------|
| A-Mem* | 9.22 | 8.81 | 18.85 ± 0.31 |
| LangMem | 26.04 | 22.32 | 47.92 ± 0.47 |
| Zep | 19.37 | 14.82 | 41.35 ± 0.48 |
| OpenAI | 20.09 | 15.42 | 42.92 ± 0.63 |
| **Mem0** | **28.64** | **21.58** | **51.15 ± 0.31** |
| Mem0ᵍ | 24.32 | 18.82 | 47.19 ± 0.67 |

#### Open-Domain 질의

| 방법 | F1 | BLEU-1 | J (±σ) |
|------|-----|--------|--------|
| A-Mem* | 33.34 | 27.58 | 54.05 ± 0.22 |
| LangMem | 40.91 | 33.63 | 71.12 ± 0.20 |
| **Zep** | 49.56 | 38.92 | **76.60 ± 0.13** |
| OpenAI | 39.31 | 31.16 | 62.29 ± 0.12 |
| Mem0 | 47.65 | 38.72 | 72.93 ± 0.11 |
| Mem0ᵍ | 49.27 | 40.30 | 75.71 ± 0.21 |

#### Temporal 질의

| 방법 | F1 | BLEU-1 | J (±σ) |
|------|-----|--------|--------|
| A-Mem* | 35.40 | 31.08 | 49.91 ± 0.31 |
| LangMem | 30.75 | 25.84 | 23.43 ± 0.39 |
| Zep | 42.00 | 34.53 | 49.31 ± 0.50 |
| OpenAI | 14.04 | 11.25 | 21.71 ± 0.20 |
| Mem0 | 48.93 | 40.51 | 55.51 ± 0.34 |
| **Mem0ᵍ** | **51.55** | **40.28** | **58.13 ± 0.44** |

### 5.2 RAG 구성별 상세 결과 (Table 2)

| 청크 크기 | k | Overall J (%) |
|----------|---|---------------|
| 128 | 1 | 47.77 |
| 128 | 2 | 59.56 |
| 256 | 1 | 50.15 |
| 256 | 2 | 60.97 |
| 512 | 1 | 46.05 |
| 512 | 2 | 58.19 |
| 1024 | 1 | 40.74 |
| 1024 | 2 | 50.68 |
| 2048 | 1 | 37.93 |
| 2048 | 2 | 48.57 |
| 4096 | 1 | 36.84 |
| 4096 | 2 | 51.79 |
| 8192 | 1 | 44.53 |
| 8192 | 2 | 60.53 |

**최적 RAG**: chunk=256, k=2 (J=60.97%) 또는 chunk=8192, k=2 (J=60.53%)

### 5.3 레이턴시 분석 (Table 2)

| 방법 | Search p50 (s) | Search p95 (s) | Total p50 (s) | Total p95 (s) | Overall J (%) |
|------|---------------|---------------|--------------|--------------|---------------|
| **Mem0** | **0.148** | **0.200** | **0.708** | **1.440** | 66.88 ± 0.15 |
| Mem0ᵍ | 0.476 | 0.657 | 1.091 | 2.590 | **68.44 ± 0.17** |
| Full-context | — | — | 9.870 | 17.117 | 72.90 ± 0.19 |
| LangMem | 17.99 | 59.82 | 18.53 | 60.40 | 58.10 ± 0.21 |
| Zep | 0.513 | 0.778 | 1.292 | 2.926 | 65.99 ± 0.16 |
| OpenAI | — | — | 0.466 | 0.889 | 52.90 ± 0.14 |
| A-Mem | 0.668 | 1.485 | 1.410 | 4.374 | 48.38 ± 0.15 |
| Best RAG | ~0.24 | ~0.64 | — | — | 60.53 ± 0.16 |

### 5.4 메모리 오버헤드 분석

| 방법 | 토큰 소비 | 구축 시간 |
|------|----------|----------|
| Mem0 | ~7k tokens/대화 | < 1분 (worst-case) |
| Mem0ᵍ | ~14k tokens/대화 | — |
| Zep | 600k+ tokens/대화 (raw 대화의 20배+) | 수 시간 (비동기) |
| Raw conversation | ~26k tokens | — |

### 5.5 상대적 개선 요약

| 비교 | 상대 개선 | 메트릭 |
|------|----------|--------|
| Mem0 vs RAG | ~10% | J score |
| Mem0ᵍ vs RAG | ~12% | J score |
| Mem0 vs OpenAI (overall) | 26% | Overall J (66.88 vs 52.90) |
| Mem0 vs next-best (single-hop) | ~5% | J score |
| Mem0ᵍ vs next-best (temporal) | ~11% | J score |
| Mem0 vs next-best (multi-hop) | ~7% | J score |
| Mem0ᵍ vs Mem0 (overall) | ~2% | J score |
| Mem0 vs Full-context (latency) | 91% 감소 | p95 latency |
| Mem0 vs Full-context (tokens) | ~73% 절감 | token cost (7k vs 26k) |

---

## 6. Cross-Category 분석

### 핵심 발견

1. **Mem0**는 single-hop과 multi-hop에서 최강 — Dense 자연어 메모리가 단순 질의에 효율적
2. **Mem0ᵍ**는 temporal과 open-domain에서 강세 — 명시적 관계 모델링이 시간적/문맥적 통합 필요 과제에 필수적
3. 두 변종의 **상보적 강점**: 그래프 구조는 nuanced relational context가 요구되는 시나리오에서 유리하며, 단순 검색에서는 불필요
4. **Full-context** (J=72.90%)가 여전히 최고 정확도 — 하지만 p95=17초, 토큰 비용 26k로 프로덕션 비적합
5. Mem0ᵍ는 single-hop에서 Mem0 대비 **미세한 성능 저하** 관찰
6. Mem0ᵍ는 multi-hop에서도 Mem0 대비 **성능 이득 없음**
7. **OpenAI**는 temporal에서 극단적 약세 (J=21.71) — 시간적 추론 능력이 현저히 부족
8. **LangMem**도 temporal에서 매우 낮은 성능 (J=23.43) — Mem0ᵍ(58.13) 대비 약 60% 뒤처짐

### 메모리 시스템의 프로덕션 이점

"Memory-focused approaches like Mem0 and Mem0ᵍ maintain consistent performance regardless of conversation length" — 대화 길이와 무관하게 일정한 성능 유지, 프로덕션 스케일 배포에 실질적으로 적합.

---

## 7. 베이스라인 상세 비교

### Zep 관찰

- Open-domain에서 **최고 성능** (J=76.60) — 시간적 지식 그래프의 강점
- 하지만 **600k+ 토큰** 소비 (raw 대화의 20배+)
- 즉각 메모리 검색 시도 자주 실패
- 구축에 **수 시간** 소요 (비동기 처리 지연)
- 노드 간 중복 캐싱으로 인한 막대한 토큰 오버헤드

### LangMem 관찰

- Multi-hop에서 강세 (J=47.92)
- Open-domain에서 준수 (J=71.12)
- Temporal에서 극단적 약세 (J=23.43) — 시간적 추론 능력 부재
- 검색 레이턴시 극단적으로 높음: **p50=17.99s, p95=59.82s** (search), **total p50=18.53s, p95=60.40s**
- Overall J=58.10 — Mem0(66.88) 대비 상당한 격차

### OpenAI Memory 관찰

- Single-hop에서 준수 (J=63.79)
- Temporal에서 극단적 약세 (J=21.71) — Mem0ᵍ(58.13) 대비 63% 뒤처짐
- Overall J=52.90 — Mem0(66.88) 대비 26% 뒤처짐
- 다만 total latency는 매우 빠름 (p50=0.466s, p95=0.889s)

### A-Mem 관찰

- Multi-hop에서 극단적 약세 (J=18.85) — 다른 메모리 시스템 대비 현저히 낮음
- Overall J=48.38 — 가장 낮은 종합 성능
- 검색 레이턴시 상대적으로 높음 (search p50=0.668s, p95=1.485s)

---

## 8. 프롬프트 설계 (Appendix A)

### LLM-as-a-Judge 프롬프트

- 입력: question, gold answer, generated answer
- 출력: 1문장 추론 설명 + CORRECT/WRONG (JSON)
- "관대한 채점 — 같은 주제에 닿으면 CORRECT"
- 시간 질의: 상대적 시간 참조도 같은 날짜/기간이면 CORRECT

### Mem0 결과 생성 프롬프트

- 모든 메모리를 타임스탬프와 함께 검토
- 상대적 시간 참조를 특정 날짜로 변환
- 모순 시 최신 메모리 우선
- 답변 길이 제한: "5-6 단어 이내"
- 화자별 메모리 섹션: "Memories for user [speaker_1]", "Memories for user [speaker_2]"

### Mem0ᵍ 결과 생성 프롬프트

- 기본 Mem0 프롬프트에 추가: "지식 그래프 관계를 분석하여 사용자의 지식 컨텍스트 이해"
- 메모리 섹션 + "Relations for user [speaker_1/2]" 섹션 추가

### OpenAI ChatGPT 프롬프트

- "대화에서 관련 정보를 추출하여 언급된 각 사용자의 메모리 엔트리 생성"
- 타임스탬프 포함
- "지식 베이스에 저장하여 향후 참조 및 개인화 상호작용에 활용"

---

## 9. 알고리즘 (Appendix B)

**Algorithm 1: Memory Management System Update Operations**

```
Input: 추출된 사실들, 기존 메모리 저장소 M
For each extracted fact:
    1. 의미적 유사 기존 메모리 검색
    2. ClassifyOperation(fact, similar_memories):
        - 의미적 유사 메모리 없음 → ADD
        - 기존 정보 보강 가능 → UPDATE
        - 기존 정보와 모순 → DELETE
        - 변경 불필요 → NOOP
    3. 해당 연산 실행
```

---

## 10. 한계 및 미래 방향

### 관찰된 한계

1. Mem0ᵍ가 single-hop에서 Mem0 대비 미세한 성능 저하
2. Mem0ᵍ가 multi-hop에서 성능 이득 미제공
3. Full-context가 여전히 최고 J score (72.90%) — 메모리 시스템은 아직 정보 손실 존재
4. Zep는 즉각 메모리 검색 시도 자주 실패 + 구축 지연 심각
5. Mem0ᵍ의 그래프 연산 레이턴시 오버헤드 (Mem0 대비 ~1.5배, total p50: 1.091s vs 0.708s)

### 향후 연구 방향

1. **Mem0ᵍ 그래프 연산 최적화** — 레이턴시 오버헤드 감소
2. **계층적 메모리 아키텍처 탐색** — 효율성과 관계적 표현의 결합

---

## 11. 전체 참고문헌 (30편)

| # | 저자 | 제목 | 출처 | 연도 |
|---|------|------|------|------|
| 1 | Anthropic | Model card and evaluations for Claude models | Technical report | 2025 |
| 2 | Assmann, J. | Communicative and cultural memory | Cultural memories, Springer | 2011 |
| 3 | Bulatov, A. et al. | Recurrent memory transformer | NeurIPS 35:11079–11091 | 2022 |
| 4 | Chhikara, P. et al. | Knowledge-enhanced agents for interactive text games | K-CAP 2023, 157–165 | 2023 |
| 5 | Craik, F.I.M. & Jennings, J.M. | Human memory | — | 1992 |
| 6 | Goswami, G. | Dissecting the metrics: Different evaluation approaches for conversational AI | Authorea Preprints | 2025 |
| 7 | Guo, T. et al. | Active-dormant attention heads: Mechanistically demystifying extreme-token phenomena in LLMs | NeurIPS 2024 Workshop | 2024 |
| 8 | Hatalis, K. et al. | Memory matters: The need to improve long-term memory in LLM-agents | AAAI Symposium 2:277–280 | 2023 |
| 9 | He, Z. et al. | Human-inspired perspectives: A survey on AI long-term memory | arXiv:2411.00489 | 2024 |
| 10 | Hurst, A. et al. | GPT-4o system card | arXiv:2410.21276 | 2024 |
| 11 | Jaech, A. et al. | OpenAI o1 system card | arXiv:2412.16720 | 2024 |
| 12 | Lee, K.-H. et al. | A human-inspired reading agent with gist memory of very long contexts | ICML 2024, 26396–26415 | 2024 |
| 13 | Liu, L. et al. | Think-in-memory: Recalling and post-thinking enable LLMs with long-term memory | arXiv:2311.08719 | 2023 |
| 14 | Maharana, A. et al. | Evaluating very long-term conversational memory of LLM agents | ACL 2024, 13851–13870 | 2024 |
| 15 | Majumder, B.P. et al. | CLIN: A continually learning language agent for rapid task adaptation and generalization | CoLM | — |
| 16 | Nelson, E. et al. | Needle in the haystack for memory based large language models | arXiv:2407.01437 | 2024 |
| 17 | Packer, C. et al. | MemGPT: Towards LLMs as operating systems | — | 2023 |
| 18 | Rasmussen, P. et al. | Zep: A temporal knowledge graph architecture for agent memory | arXiv:2501.13956 | 2025 |
| 19 | Sarthi, P. et al. | RAPTOR: Recursive abstractive processing for tree-organized retrieval | ICLR 2024 | 2024 |
| 20 | Shinn, N. et al. | Reflexion: Language agents with verbal reinforcement learning | NeurIPS 36:8634–8652 | 2023 |
| 21 | Singh, P. et al. | An ensemble approach for extractive text summarization | ic-ETITE 2020, IEEE | 2020 |
| 22 | Soni, A. et al. | Evaluating domain coverage in low-resource generative chatbots | ICEECT 2024, IEEE | 2024 |
| 23 | Team, Gemini et al. | Gemini 1.5: Unlocking multimodal understanding across millions of tokens of context | arXiv:2403.05530 | 2024 |
| 24 | Timoneda, J.C. & Vera, S.V. | Memory is all you need: Testing how model memory affects LLM performance in annotation tasks | Authorea Preprints | 2025 |
| 25 | Xu, W. et al. | A-Mem: Agentic memory for LLM agents | arXiv:2502.12110 | 2025 |
| 26 | Yu, Y. et al. | FinMem: A performance-enhanced LLM trading agent with layered memory and character design | AAAI Symposium 3:595–597 | 2024 |
| 27 | Zhang, J. | Guided profile generation improves personalization with LLMs | EMNLP 2024 Findings, 4005–4016 | 2024 |
| 28 | Zhang, J. et al. | A study of zero-shot adaptation with commonsense knowledge | AKBC | 2022 |
| 29 | Zhang, Z. et al. | A survey on the memory mechanism of large language model based agents | arXiv:2404.13501 | 2024 |
| 30 | Zhong, W. et al. | MemoryBank: Enhancing large language models with long-term memory | AAAI 38:19724–19731 | 2024 |

---

## 12. 핵심 인사이트 — 블로그 활용 포인트

### 설계 원칙

1. **"추출 → 비교 → 결정" 3단계 패턴**: 단순하지만 강력한 메모리 관리 파이프라인
2. **4가지 원자적 연산 (ADD/UPDATE/DELETE/NOOP)**: LLM function-calling으로 구조화된 메모리 CRUD
3. **"삭제 대신 무효 표시"**: Mem0ᵍ의 시간적 추론을 위한 soft-delete 전략
4. **비동기 요약 생성**: 실시간 경로와 분리된 요약 갱신

### 프로덕션 트레이드오프

- **정확도 vs 비용**: Full-context(J=72.9%)가 최고지만 17초 레이턴시 + 26k 토큰
- **Mem0(J=66.9%)**: 1.4초, 7k 토큰 (~73% 절감) — 프로덕션에서 실질적 최적해
- **그래프의 대가**: Mem0ᵍ가 2% 더 높지만 레이턴시 ~1.5배 (total p50: 1.091s vs 0.708s), 인프라 복잡도(Neo4j) 추가
- **OpenAI 대비 종합 우위**: Overall J 기준 26% 상대 개선 (66.88 vs 52.90), 단 OpenAI가 latency에서는 유리 (p50=0.466s)

> **[주의] 논문 내 수치 불일치**: 논문 abstract에서 "90%+ token savings"를 주장하나, 실제 보고된 수치(Mem0 ~7k tokens vs raw conversation ~26k tokens)로 계산하면 약 73% 절감. 이 불일치는 원 논문의 문제이며, 본 문서에서는 실제 수치 기반(~73%)으로 기술함.

### 미해결 질문

1. 대화 길이가 LOCOMO(26k tokens)보다 훨씬 긴 실환경에서의 성능은?
2. 멀티유저, 멀티세션 시나리오에서의 메모리 격리와 공유 전략은?
3. 메모리 누적에 따른 장기적 품질 저하(memory bloat) 관리 방안은?
4. GPT-4o-mini 외 다른 LLM에서의 일반화 가능성은?

---

## Appendix A: Long-Context Retrieval 벤치마크 — 검증된 수치

> 본 Appendix는 섹션 0(배경)에서 인용한 수치의 출처와 검증 상태를 기록합니다. 2026-03-26 기준 웹 검색으로 그라운딩을 수행했습니다.

### A.1 확인(Confirmed) — 원본 출처와 정확히 일치

| 수치 | 출처 | 검증 |
|------|------|------|
| RULER: GPT-4 128K에서 **81.2%** | [arXiv:2404.06654](https://arxiv.org/abs/2404.06654) (Hsieh et al., NVIDIA, 2024) | 논문 Table 3 정확 일치 |
| RULER: GPT-4 4K에서 **96.6%** | 동일 | 논문 Table 3 정확 일치 |
| Gemini 1.5 Pro NIAH 1M: **99.7%** | [arXiv:2403.05530](https://arxiv.org/abs/2403.05530) (Google DeepMind, 2024) | 논문 본문 정확 일치 |
| Claude Opus 4.6 가격 **$5.00/M input** | [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing) | 공식 가격표 일치 |
| MRCR v2 8-needle 1M: Opus 4.6 **76%** | [X/@rohanpaul_ai](https://x.com/rohanpaul_ai/status/2019545018051240059) + [Awesome Agents](https://awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard/) | 다수 출처 일치 |
| MRCR v2 8-needle 1M: Gemini 3 Pro **24.5%** | 동일 출처 | 다수 출처 일치 |
| MRCR v2 8-needle 256K: Opus 4.6 **~92-93%** | 동일 출처 | 다수 출처 일치 |

### A.2 확인(Confirmed) — 2025-2026 신규 벤치마크

| 수치 | 출처 | 검증 |
|------|------|------|
| NoLiMa: GPT-4o 단문 **99.3%** → 32K **69.7%** | [arXiv:2502.05167](https://arxiv.org/abs/2502.05167) (Adobe Research, ICML 2025) | 논문 + [dev.to 보도](https://dev.to/falkordb/nolima-gpt-4o-achieve-993-accuracy-in-short-contexts-1k-tokens-performance-degrades-to-697-1pgl) 일치 |
| NoLiMa: 128K 지원 13개 모델 중 **11개가 32K에서 단문 기준선의 50% 이하** | 동일 논문 | Abstract 원문 일치 |
| Anthropic Contextual Retrieval: 검색 실패 **49% 감소**, 리랭킹 추가 시 **67% 감소** | [Anthropic Blog: Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) | 공식 블로그 정확 일치 |
| RAG vs LC Q3 2025 금융 사례: 레이턴시 **8x 감소**, 비용 **94% 절감** | [markaicode.com](https://markaicode.com/vs/rag-vs-long-context/) | 보도 기반 (1차 출처 미확인) |
| HELMET: NIAH는 downstream 성능의 예측자로 **부적합** | [arXiv:2410.02694](https://arxiv.org/abs/2410.02694) (Princeton NLP, ICLR 2025) | 논문 결론 일치 |

### A.3 제거 — 이전 버전에서 사용했으나 검증 실패한 수치

| 이전 인용 수치 | 문제 | 조치 |
|--------------|------|------|
| MRCR 90/80/65/55% 매끄러운 하락 곡선 | 단일 모델과 일치하는 출판 데이터 없음 | 삭제, A.1의 실측값으로 대체 |
| Claude 3 Opus 문서 QA 94%@50K, 87%@200K | 실제 NIAH는 99.4%/98.3%. 과소 보고 | 삭제 |
| LongBench GPT-4T 39.1% | 원본 논문에 GPT-4T 미포함 | 삭제 |
| Lost in Middle 정확한 %p (56%/52%) | 56.1%는 closed-book baseline. Claude 2 미테스트 | 방향성("U-curve, 20-30%p 차이")만 유지 |
| RAG 76% vs LC 53% 교차점 | 이 수치의 출처 논문 없음 | 삭제, 정성적 서술로 대체 |
| 1M TTFT 20-40s | 낙관적. Cold start는 30-90s가 보편적 | 30-90s로 수정 |

### A.4 종합 — 섹션 0 서두에서 인용한 수치의 신뢰도

| 인용 | 신뢰도 | 근거 유형 |
|------|--------|----------|
| RULER 96.6% → 81.2% | **High** | 논문 Table 정확 일치 |
| NoLiMa 99.3% → 69.7%, 11/13 모델 50% 이하 | **High** | ICML 2025 논문 + 복수 보도 |
| MRCR v2 Opus 76%, Gemini 24.5% | **High** | 2026년 리더보드 + 복수 출처 |
| Contextual Retrieval -49%/-67% | **High** | Anthropic 공식 블로그 |
| 비용 $5/query vs $0.02/query | **High** | 공식 가격표 기반 계산 |
| TTFT 30-90s (1M cold) | **Medium** | 복수 보도, 인프라 의존 |
| 금융 사례 8x/94% | **Medium** | 2차 보도 (1차 출처 미확인) |

---

*Source: `blog/research/mem0-long-term-memory.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
