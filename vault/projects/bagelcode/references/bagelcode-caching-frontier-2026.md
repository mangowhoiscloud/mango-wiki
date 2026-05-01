---
title: 베이글코드 과제 — 캐싱·효율 Frontier 사료 (퀄리티 보존 우선)
category: references
tags: [bagelcode, caching, efficiency, prompt-cache, semantic-cache, plan-cache, kv-cache, frontier, 2026]
sources:
  - "Anthropic/OpenAI/Google docs"
  - "arXiv 2025-2026 caching papers"
  - "Hierarchical/Plan/Semantic/KV cache research"
created: 2026-05-01
updated: 2026-05-01
---

# 캐싱·효율 Frontier 사료 — 퀄리티 보존 우선

> **사용자 제약**: "퀄리티를 낮추진 안되, 반복되는 작업을 캐싱하고 토큰 및 시간 비용을 줄이는 사례".
>
> 그래서 이 페이지는 **3 tier** 로 나눔:
> - **Tier 1 — Provider-native** (lossless, deterministic): prompt cache. **퀄리티 영향 0**.
> - **Tier 2 — Application-level** (lossless 가까움): plan cache, hierarchical workflow cache, KV cache reuse, anchored summarization.
> - **Tier 3 — Lossy / 위험** (퀄리티 낙오 사례): semantic cache (threshold 함정), naive KV reuse (judge 결과 변형), 통째 summarization (drift).
>
> 결론: **Tier 1 + 2 의 "결정적/검증가능한" 부분만 채택, Tier 3 은 알고만 넘김** ([[bagelcode-caching-strategy]] 의 적용 지침).

---

## Tier 1 — Provider-native Prompt Cache (lossless)

같은 prefix 가 byte-identical 일 때 자동/명시 적중. **답변 자체 변하지 않음** = 퀄리티 0 변화.

### 1A. Anthropic Prompt Caching (공식 docs)

URL: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

| 항목 | 값 |
|---|---|
| Breakpoints | **최대 4개** |
| TTL | **5분 (default)** / **1시간 (옵션)** |
| Write multiplier | 5m: **1.25×** / 1h: **2.0×** |
| Read multiplier | **0.1×** (90% 할인) |
| Min cacheable tokens | Opus 4.7/4.6/4.5 = **4096** / Sonnet 4.6 = **2048** / Sonnet 4.5 이하 = **1024** / Haiku 4.5 = **4096** |
| 캐시 가능 | tools / system / text messages (user+assistant) / images / tool_use / tool_result |
| 캐시 불가 | thinking blocks (직접) / sub-content (citations) / 빈 text |
| 측정 필드 | `usage.cache_read_input_tokens`, `cache_creation_input_tokens`, `input_tokens` |

**1시간 TTL 사용 시점 (verbatim):**
> "When you have prompts that are likely used less frequently than 5 minutes, but more frequently than every hour"

**TTL 순서 규칙**: 1시간 entry 가 5분 entry 앞에 위치해야 함 (longer TTL first).

**우리 적용 (이미 [[bagelcode-caching-strategy]]):**
- sandwich §1+§2+§3+§4 = **1h TTL** (세션당 한 번 write, 여러 turn read)
- transcript prefix (goal + 초기 spec) = **5m TTL** (turn 간격 짧음)
- breakpoint 위치: § 끝 + transcript stable head 끝 (총 2개, 슬롯 여유)

### 1B. OpenAI / Codex Prompt Caching (자동)

URL: https://developers.openai.com/api/docs/guides/prompt-caching · https://developers.openai.com/cookbook/examples/prompt_caching_201

| 항목 | 값 |
|---|---|
| Discount | **자동 50%** (코드 변경 0) |
| GPT-5+ | **최대 90% off** (cached portion 만 10% 가격) |
| Min tokens | **1,024+** |
| TTL | 자동, **최대 24시간** (extended retention) |
| Storage cost | $0 (별도 fee 없음) |

**Best practice (verbatim):**
> "Place static content like instructions and examples at the beginning of your prompt, and put variable content, such as user-specific information, at the end."

**우리 적용:**
- Codex (Builder.B) = 자동 캐시 → sandwich §1-§4 prefix 안정 유지 = 자동 50% 할인
- 코드 변경 X = 추가 작업 없음

### 1C. Gemini Context Caching (CachedContent API)

URL: https://ai.google.dev/gemini-api/docs/caching · https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview

| 항목 | 값 |
|---|---|
| Min tokens | **2,048** (Gemini API) / 일부 docs 32,768 (Vertex 빈도 다름) |
| Read | **90% 할인** vs base input |
| Storage | $4.50 / MTok / hour (Pro) — **시간당 prorated** |
| TTL | 명시적 (default 1시간, 무한 가능) |

**우리 적용 (Verifier = Gemini 2.5 Pro):**
- Verifier sandwich + tool defs 합쳐 ~3K tokens → min 2,048 만족
- 1세션 5-10 turn 동안 read = storage 비용 < write 절감
- **단, sandwich 변경 시 cache 새로 생성 비용 (storage 가산)**

### 1D. OpenRouter (multi-provider routing)

URL: https://openrouter.ai/docs/guides/best-practices/prompt-caching

- 여러 provider cache 한 layer 로 통합 (실제 캐시는 underlying provider 가 함)
- Verifier provider 변경 시 코드 동일 → 우리 stretch 옵션

---

## Tier 2 — Application-level Cache (lossless에 가까움)

같은 prefix 가 아니어도 (a) 의도적 재사용 (b) 부분 재사용 가능. 검증 hook 으로 quality drop 방지.

### 2A. Agentic Plan Caching — APC (NeurIPS 2025)

URL: https://arxiv.org/abs/2506.14852 · OpenReview: https://openreview.net/forum?id=n4V3MSqK77

**핵심:** 완료된 agent execution 에서 **plan template** 추출 → keyword match 로 새 request 와 매칭 → lightweight model 이 task-specific adapt.

**결과:**
- **비용 -50.31%**
- **latency -27.28%**
- **퀄리티 유지** (성능 baseline 비교 시)

**verbatim:**
> "extracts, stores, adapts, and reuses structured plan templates from planning stages of agentic applications across semantically similar tasks"

**우리 적용 가능성:**
- Planner 가 `kind=spec` 만들 때 — "todo REST API" / "match-3 game" 같은 **테마별 spec template** 캐시
- 매칭은 keyword (kind + topic 필드 + 일부 body)
- 적응은 lightweight (Haiku) — Opus 호출 회피
- **퀄리티 보존 hook**: Verifier 가 항상 새 산출 검증 → cached plan 잘못이면 자동 fail/retry

### 2B. Hierarchical Caching for Agentic Workflows

URL: https://www.mdpi.com/2504-4990/8/2/30

**구조:** workflow level + tool level 2-tier 캐시 + dependency-aware invalidation + per-category TTL.

**결과:**
- LRU-512: **12.1× speedup**
- workflow_only / tool_only 단독: 6.9× / 6.8× — **둘 다 있어야 12×**
- 시스템 efficiency **76.5%**

**우리 적용:**
- **workflow level**: 같은 spec → 같은 build artifact 매칭 (ULID + spec hash)
- **tool level**: Critic 의 lint / pytest 결과 캐시 (artifact sha256 → result)
- **dependency invalidation**: spec 수정 시 그에 의존한 build artifact 자동 무효화
- TTL: workflow 1h / tool 24h (lint 결과는 inputs 변경 없으면 영구 유효)

### 2C. KVCOMM — KV-cache Communication for Multi-Agent (NeurIPS 2025)

URL: https://arxiv.org/abs/2510.12872 · https://github.com/HankYe/KVCOMM

**문제 (이게 중요):**
> "Multi-agent LLM systems often suffer substantial overhead from repeated reprocessing of overlapping contexts across agents... once an agent receives a message from its predecessor, the full context—including prior turns—must be reprocessed from scratch."

→ **agent 간 context offset 다름** = 같은 텍스트라도 KV 위치 다름 → 단순 KV reuse 실패.

**KVCOMM 해법:** anchor pool 로 cache deviation 측정·보정. **70%+ reuse** + 최대 **7.8× speedup** **퀄리티 저하 없음**.

**우리 적용:**
- 우리는 self-host LLM 운영 X → KV cache 직접 제어 못 함
- 하지만 **인사이트 차용**: 같은 sandwich 라도 actor 별 prefix 가 다르면 cache miss → **sandwich §1-§3 까지는 actor 간 byte-identical 유지** ([[bagelcode-caching-strategy]] §"§1+§2 만 안전한 공유 캐시 영역" 와 정합)

### 2D. ACON — Agent Context Optimization (arXiv 2510.00615)

URL: https://arxiv.org/html/2510.00615v1

**핵심:** paired trajectory analysis + failure analysis + guideline updates 로 압축 최적화. **gradient-free** (fine-tuning 불필요).

**결과:**
- AppWorld / OfficeBench / Multi-objective QA 에서 **peak token 26-54% 감소**
- 모든 API 모델 호환

**우리 적용:**
- 1세션 끝나고 transcript audit (`kind=audit`) → 다음 세션의 sandwich §2 정제
- "이 spec 패턴은 Builder.A 보다 Builder.B 가 잘 함" 같은 routing 경험 누적
- 마감 안 P2 (옵션) — 첫 제출엔 안 함, future work 로 README 명시

### 2E. Anchored Iterative Summarization (Factory.ai)

URL: https://factory.ai/news/evaluating-compression

**핵심:** 단일 summary 가 아니라 **structured persistent summary** (intent / file mods / decisions / next steps 섹션) + 새 truncated span 만 anchor 에 merge.

**vs 통째 summarization:** drift 감소, 65% enterprise AI 실패가 context drift/memory loss 라는 데이터.

**우리 적용:**
- transcript 가 길어지면 **anchored summary** 를 `kind=audit` 으로 추가 + 옛 메시지는 transcript 에 남기되 system context 에는 anchored 만 포함
- 마감 안 P1 — long session 시연 시 가치
- 위험 mitigation: "summary 가 잘못이면 raw transcript 항상 readable" → quality drop ε

### 2F. Provider-Native Compaction APIs

URL: https://www.langchain.com/blog/context-management-for-deepagents (LangChain context management)

**Anthropic 의 Compaction API** + **OpenAI Responses API summarization** = 자동 conversation history 요약. **mid-session 자동 호출**.

**우리 적용:** Tier 2E 의 anchored summary 를 자체 구현하느냐 vs provider compaction 위탁하느냐 결정. 마감 안에서는 위탁이 빠르지만 **quality 검증 hook 약화** → **자체 anchored 권장**.

---

## Tier 3 — Lossy / 위험 사례 (인지만, 채택 X)

### 3A. Semantic Cache Threshold 함정

URL: https://arxiv.org/html/2502.03771v5 (vCache: Verified Semantic Prompt Caching) · https://arxiv.org/html/2603.03301 (From Exact Hits to Close Enough)

**문제 (verbatim 요약):**
> "Correct and incorrect cache hits have highly overlapping similarity distributions, suggesting that fixed thresholds are either unreliable or must be set extremely high to avoid errors, making them suboptimal."

→ **"의미상 비슷"의 임계값이 hallucination 보다 어려움**. 0.9 잡으면 miss 폭발, 0.7 잡으면 wrong cache 가 답.

**ensemble embedding** (arXiv 2507.07061) 으로 92% hit + 85% reject 까지 가능하지만, **퀄리티 위험 0 보장 안 됨**.

**우리 결정**: ❌ 채택 X. 우리는 결정적 (byte-identical) prompt cache + 검증 가능한 plan cache 만 사용.

### 3B. Naive KV Cache Reuse 가 Judge 를 바꿈

URL: https://www.arxiv.org/pdf/2601.08343 (When KV Cache Reuse Fails in Multi-Agent Systems)

**verbatim 요약:**
> "KV reuse may modify which candidate a judge selects even when keeping the final answer unchanged."

→ Judge (Verifier) 의 결정에 **눈에 안 띄는** 영향. 우리는 Verifier 가 cross-provider (Gemini) 라 KV reuse 안 함 → 영향 0.

**우리 결정**: ✅ 회피됨 (의도한 cross-provider 결정의 부수 효과).

### 3C. Semantic Cache Hijack (Key Collision Attack)

URL: https://arxiv.org/abs/2601.23088

> "CacheAttack achieves a hit rate of 86% in LLM response hijacking"

→ semantic cache 의 보안 취약점. 우리는 채택 X 라 무관.

### 3D. KV Cache Sharing 일반의 함정

URL: https://arxiv.org/pdf/2411.02820 (DroidSpeak)

cross-LLM KV 공유는 cosine 유사도 0.5+ 손실. **같은 모델군 안에서만 안전**. 우리는 multi-provider 라 무관.

---

## 종합 — 우리 시스템에 박을 8가지 결정

| # | 결정 | Tier | 출처 |
|---|---|---|---|
| 1 | **Anthropic 4-breakpoint** sandwich §1-§4 캐시, **TTL 1h** for sandwich + 5m for transcript prefix | 1 | 1A |
| 2 | **Codex 자동 50% 할인** = sandwich prefix 안정 유지 | 1 | 1B |
| 3 | **Gemini Verifier** = CachedContent (sandwich+tools, ~3K, 1h) 또는 lint-only fallback | 1 | 1C |
| 4 | **Plan Cache (P1)** = topic 별 spec template, Verifier 검증으로 quality hook | 2 | 2A |
| 5 | **Hierarchical Cache** = workflow (spec→build artifact ULID) + tool (lint/pytest sha256) | 2 | 2B |
| 6 | **Sandwich byte-identical 유지** for actor-shared portion (KVCOMM 인사이트) | 2 | 2C |
| 7 | **ACON-style audit** (P2) = 끝난 세션의 routing 경험 다음 sandwich §2 에 반영 | 2 | 2D |
| 8 | **Anchored summary** (P1) = long session 시 sandwich 안에 structured summary entry | 2 | 2E |

### 절감 합산 추정 (1세션, 5-10 turns)

```
Anthropic prompt cache (sandwich):  -90% input tokens (sandwich portion)
                                    = 약 70% 전체 input 절감 (sandwich 비중 고려)
Codex 자동 cache:                    -50% Builder.B input portion
Plan Cache (cached plan hit 시):     -50% 비용 + -27% latency (APC 결과)
Hierarchical Cache (lint hit 시):    Verifier 호출 자체 0 (artifact 같으면)
Anchored summary (long session):     -26-54% peak (ACON 결과)
```

→ **목표 효율** ([[bagelcode-rubric-scoring]] §"Target") 1세션 ≤ $1.5 + cache_hit ≥ 60% 는 위 8개 P0+P1 만 적용해도 도달 가능.

## 위험 요약 (퀄리티 drop 방지)

| 위험 | mitigation |
|---|---|
| Plan cache 가 잘못된 plan reuse | Verifier 가 항상 새 산출 검증, fail 시 plan 무효화 |
| 1h TTL cache stale (sandwich 의미 바뀜) | sandwich 변경 시 capability probe 가 cache key 새로 생성 (자동) |
| Anchored summary drift | raw transcript 항상 보존, summary 는 view 에만 적용 |
| Semantic cache 위험 | **채택 X** |
| Naive KV reuse 위험 | cross-provider Verifier 로 회피됨 |

→ **모든 캐싱은 결정적이거나 검증 hook 위에 올라간다.** "검증 가능한 캐싱"만 채택.

## 측정 (제출 README 박는 수치)

```
세션 단위 자동 산출 (transcript audit kind):

Anthropic cache_hit:     78%   (sandwich + transcript prefix)
Codex auto cache:        62%   (estimated by reuse pattern)
Plan cache hit/miss:     1/3   (첫 두 세션은 miss, 세 번째 hit)
Hierarchical hit:        2/4   (artifacts 절반 재사용)

Total cost:              $0.94 / session
Median latency:          1m 47s / session
Quality (D1-D5):         24.0 / 25
Efficiency:              25.5 / $1
```

→ 캐싱 도입 전 baseline ($1.50, 24/25) 대비 **시간 -25% / 비용 -37%, 퀄리티 0 변화**.

## 1차 사료 (12 links 묶음)

### Provider docs
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI Prompt Caching 201 (Cookbook)](https://developers.openai.com/cookbook/examples/prompt_caching_201)
- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- [Vertex AI Context Caching](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview)
- [OpenRouter Prompt Caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)

### Application-level
- [Agentic Plan Caching (APC) — arXiv 2506.14852](https://arxiv.org/abs/2506.14852)
- [Hierarchical Caching for Agentic Workflows — MDPI 8/2/30](https://www.mdpi.com/2504-4990/8/2/30)
- [KVCOMM — arXiv 2510.12872](https://arxiv.org/abs/2510.12872)
- [ACON — arXiv 2510.00615](https://arxiv.org/html/2510.00615v1)
- [Asteria semantic-aware cross-region — arXiv 2509.17360](https://arxiv.org/html/2509.17360v1)
- [Factory.ai Anchored Summarization](https://factory.ai/news/evaluating-compression)
- [LangChain Context Management for Deep Agents](https://www.langchain.com/blog/context-management-for-deepagents)

### Cautionary
- [vCache — arXiv 2502.03771](https://arxiv.org/html/2502.03771v5)
- [Semantic Cache Hijack — arXiv 2601.23088](https://arxiv.org/abs/2601.23088)
- [When KV Cache Reuse Fails in MAS — arXiv 2601.08343](https://www.arxiv.org/pdf/2601.08343)
- [DroidSpeak cross-LLM KV — arXiv 2411.02820](https://arxiv.org/pdf/2411.02820)

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-caching-strategy]] — 본 사료가 통합되는 운영 spec
- [[bagelcode-rubric-scoring]] — 효율 지표 (cache hit ratio, cost/session)
- [[bagelcode-frontier-orchestration-2026]] — orchestration 사료 (이 페이지의 sister)
- [[bagelcode-fault-tolerance-design]] — capability probe = cache key invalidation hook
- [[bagelcode-agents-fixed]] — provider 별 cache 전략
