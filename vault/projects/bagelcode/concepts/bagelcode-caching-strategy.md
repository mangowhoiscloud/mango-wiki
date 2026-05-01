---
title: 베이글코드 과제 — 캐싱 전략 (3-tier, 퀄리티 보존)
category: concepts
tags: [bagelcode, caching, prompt-cache, plan-cache, hierarchical-cache, anthropic, gemini, codex, tokens, cost, quality-preserving]
sources:
  - "[[bagelcode-transcripts-schema]]"
  - "[[bagelcode-tradingagents-paper]]"
  - "[[bagelcode-caching-frontier-2026]]"
  - "[[geode-prompt-system]]"
  - "[[geode-adaptive-thinking]]"
created: 2026-05-01
updated: 2026-05-01
---

# 캐싱 전략 — 3-Tier (퀄리티 보존)

> Multi-agent 시스템의 토큰 폭발 1번 원인 = **모든 에이전트에게 모든 컨텍스트 broadcast**. 해법은 (a) 변하지 않는 부분의 prompt cache + (b) transcript pull-only access. 이 페이지는 **무엇을 어디에 캐시 박을지**의 경계 결정.
>
> **퀄리티 제약 (사용자)**: 캐싱이 답변 quality 를 떨어뜨리면 안 됨. → 3-tier 분류 ([[bagelcode-caching-frontier-2026]]):
> - **Tier 1** Provider-native prompt cache (lossless, byte-identical) ✅
> - **Tier 2** Application-level (Plan/Hierarchical/Anchored) — **검증 hook 필수** ✅
> - **Tier 3** Semantic / KV reuse — 채택 X (퀄리티 risk)

## 핵심 원칙 6개

1. **Static-vs-Dynamic 경계가 곧 캐시 경계** — sandwich §1+§2 = static, transcript = dynamic
2. **Anthropic prompt cache 가 1순위** — sandwich = **TTL 1h** (1세션 ≫ 5min), transcript prefix = **TTL 5m**
3. **Transcripts 는 broadcast 가 아닌 query** — 모든 메시지를 system 에 박지 않는다
4. **에이전트마다 context envelope 분리** — Planner가 Builder의 전체 history를 볼 필요 없음
5. **Sandwich §1-§3 byte-identical for actor-shared portion** — KVCOMM 인사이트
6. **모든 Tier 2 캐시 hit 도 Verifier 검증 통과 의무** — quality drop ε

## Sandwich vs Transcript 의 경계 (재확인)

[[kiki-appmaker-orchestration]] sandwich 4 sections:

```
§1 Engineering-team contract  ─┐
§2 Stage template              ├─ STATIC  → ephemeral cache 대상 (변경 1회/세션 또는 0회)
§3 Tool/skill footer           ─┘
§4 Routing enforcement         ─┐
                               ├─ STATIC  → 캐시
[[Tool definitions]]            ─┘

[[Transcript context]]         ─── DYNAMIC → 캐시 X (또는 짧은 prefix만)
```

→ **시스템 프롬프트 = STATIC 4섹션 + 짧은 메시지 컨텍스트** 구조. 매 turn 마다 재전송하지만 cache hit 으로 read 1/10 가격.

## Provider 별 캐시 메커니즘

### Anthropic Claude (1순위) — 2026-05 정확한 수치

공식 docs 기반 ([[bagelcode-caching-frontier-2026]] §1A):

| 항목 | 값 |
|---|---|
| 메커니즘 | `cache_control: { type: "ephemeral", ttl?: "5m"\|"1h" }` 마커 |
| **최소 prefix** | Opus 4.7/4.6/4.5 = **4,096** / Haiku 4.5 = **4,096** / Sonnet 4.6 = **2,048** / Sonnet 4.5 이하 = **1,024** |
| **TTL** | **5분 (default)** / **1시간 (옵션)** |
| 가격 (5m) | write **1.25×** / read **0.1×** |
| 가격 (1h) | write **2.0×** / read **0.1×** |
| Breakpoints | **최대 4개** |
| TTL 순서 규칙 | 1h entry 가 5m entry **앞** (longer TTL first) |

**우리 적용 (개정):**
- sandwich §1+§2+§3+§4 끝 = **TTL "1h"** (1세션 5-30분, 1h cache 가 절감 큼)
- transcript stable prefix (goal + 초기 spec) 끝 = **TTL "5m"**
- 순서: sandwich(1h) 가 transcript(5m) 앞에 위치 (강제 규칙)
- **Min prefix 충족** (sandwich §1-§4 = 약 3K → Opus 4.7 의 4,096 미달 → 도구 정의까지 끌어올림)

**측정 (`response.usage`):**
```python
total = response.usage.cache_read_input_tokens \
      + response.usage.cache_creation_input_tokens \
      + response.usage.input_tokens
hit_ratio = response.usage.cache_read_input_tokens / total
```

→ 우리 transcript 의 `cache_read` / `cache_write` 필드에 그대로 저장.

### OpenAI Codex / GPT-5.5

| 항목 | 값 |
|---|---|
| 메커니즘 | **자동 prompt caching** (코드 변경 X, prefix 일치 시 자동) |
| 최소 prefix | **1,024 tokens** |
| TTL | 자동 / **최대 24h** (extended retention) |
| 가격 (default) | read **0.5×** input (50% 할인) |
| 가격 (GPT-5/5.5) | read **0.1×** input (90% 할인 — 캐시된 부분만) |

**Best practice (verbatim):** "Place static content like instructions and examples at the beginning of your prompt, and put variable content, such as user-specific information, at the end."

**적용:** sandwich를 system prompt 맨 앞에 두면 자동 캐시. 별도 마커 X. Codex Builder.B 가 같은 sandwich 반복 호출 → 자동 50-90% 할인.

### Google Gemini 2.5 (Verifier provider)

| 항목 | 값 |
|---|---|
| 메커니즘 | **Context Caching API** (CachedContent 객체) |
| 최소 토큰 | **2,048** (Gemini API) — 일부 Vertex docs 32,768 |
| TTL | 명시적 (default 1시간, 무한 가능) |
| 가격 (read) | base input 의 **0.1×** (90% 할인) |
| Storage | $4.50 / MTok / hour (Pro), 시간당 prorated |

**Vertex AI 정책 (verbatim):** "you pay a one-time fee for initial caching... subsequently each time you use cached content you are billed at a 90% discount compared to standard input tokens for Gemini 2.5 or later models"

**적용:** Verifier sandwich (§1-§4) + 도구 정의 합치면 ~3K → 2,048 만족. 1세션 내 5-10 turn read = storage 비용 < write 절감. **단, sandwich 변경 시 cache 무효화 후 재생성 비용 발생** ([[bagelcode-fault-tolerance-design]] F2 capability probe 가 자동 재생성 핸들).

## 에이전트별 토큰 예산 (BC = Best Case, WC = Worst Case)

가정:
- sandwich 4섹션 = ~3,000 tokens
- transcript context window per turn = ~5 최근 메시지 ≈ ~2,000 tokens
- Spec 1개 ≈ 800 tokens
- Build artifact summary ≈ 1,200 tokens

| 에이전트 | turn 당 tokens_in | 캐시 hit 후 effective | 1세션 (10 turns) WC |
|---|---|---|---|
| Coordinator (Haiku) | 3,000 + 500 = 3,500 | 300 + 500 = 800 | ~8K |
| Planner (Opus) | 3,000 + 2,000 = 5,000 | 300 + 2,000 = 2,300 | ~25K |
| Builder (GPT-5.5) | 3,000 + 3,000 = 6,000 | 1,500 + 3,000 = 4,500 (자동 0.5×) | ~45K |
| Critic (Gemini-pro) | 3,000 + 2,500 = 5,500 | (캐시 미적용 가정) ~5,500 | ~55K |

**1세션 합계 추정 (캐시 적용):** ~130K input + ~30K output ≈ **$0.5–1.5 / session** (모델 mix 따라).

## Tier 별 절감 기법 (적용 우선순위)

### Tier 1 — Provider-native (lossless, P0 필수)

#### T1.1 Sandwich prompt cache
- Anthropic: §1-§4 끝 + `cache_control: {type: "ephemeral", ttl: "1h"}` → **read 0.1×**
- Codex: prefix 안정 유지만 → 자동 **50-90% off**
- Gemini: CachedContent 명시 생성 → **read 0.1×** + storage hourly
- 측정: `cache_read` / `cache_write` transcript 에 자동

#### T1.2 Transcript Pull (broadcast 금지)
- Coordinator 가 다음 에이전트에게 보낼 때 **kind 필터** 로 query
- Builder 에게: `kind in {goal, spec, spec.update}` 만. `debate`, `note` 제외
- 평균 **60% 컨텍스트 절감** ([[hub-spoke-pattern]] spoke narrow context)

#### T1.3 Artifact 참조 (lazy load)
- 코드 본문은 system prompt 에 박지 않음 — `artifacts/<file>` 경로만 전달
- 필요 시 read tool 로 lazy load
- Anthropic blog 의 "Subagent output to a filesystem to minimize the 'game of telephone'" 와 정합

#### T1.4 Quick/Deep 모델 분리 (TradingAgents §4.3)
- Coordinator routing = **Haiku 4.5** (10× 쌈)
- Planner/Critic 추론 = **Opus 4.7** / Gemini 2.5 Pro
- Builder 코드 = **GPT-5.5** (Codex)
- 라우팅이 Opus 라면 1세션 비용 3-5× 폭증

### Tier 2 — Application-level (검증 hook 위에, P1 권장)

#### T2.1 Plan Cache — APC NeurIPS 2025 ([[bagelcode-caching-frontier-2026]] §2A)
- Planner spec 산출을 **topic 별 plan template** 으로 추출 → `plans/<topic-hash>.md`
- 새 goal 의 keyword 가 매칭되면 **lightweight Haiku** 가 적응
- 예상: cache hit 시 Planner Opus 호출 -50% / latency -27%
- **퀄리티 hook**: Verifier 가 항상 새 산출 검증 → cached plan 잘못 시 자동 invalidate

```jsonc
// plans/rest-api-todo.md 예
{
  "template_id": "rest-api-todo-v1",
  "keywords": ["rest", "api", "todo", "crud"],
  "plan_skeleton": {
    "ac": ["{verb} /{resource}", ...],
    "questions": ["DB type?", "auth?"]
  }
}
```

#### T2.2 Hierarchical Workflow Cache (MDPI 2025)
- **Workflow level**: spec hash → build artifact ULID 매핑 (같은 spec = 같은 결과)
- **Tool level**: artifact sha256 → lint/pytest 결과 (Verifier 호출 0)
- Dependency-aware invalidation: spec 수정 → 그 자손 artifact 자동 무효
- TTL: workflow 1h / tool 24h
- 예상: hit rate 50% 시 Verifier 호출 -40%

#### T2.3 Anchored Iterative Summarization (Factory.ai)
- Long session (turn 15+) 시 **structured summary entry** 자동 추가:
  ```
  ## Summary (anchored)
  - intent: "REST API for todos"
  - file modifications: app.py (3 turns ago)
  - decisions: in-memory store, no auth
  - next steps: pending verification
  ```
- 옛 메시지는 transcript 에 보존, system context 에는 anchored 만 포함
- 예상: peak token **-26~54%** (ACON 결과)
- 위험 mitigation: raw transcript 항상 readable

### Tier 3 — 채택 안 함 (퀄리티 risk)

| 후보 | 결정 | 이유 |
|---|---|---|
| Semantic cache (embedding 유사도 기반) | ❌ | threshold 함정: correct/incorrect hit 분포 overlap (vCache 논문) |
| Naive KV cache reuse | ❌ | judge 결과 변형 위험 (arXiv 2601.08343) — cross-provider 라 자동 회피 |
| LLM-as-summarizer 통째 압축 | ❌ | 65% enterprise AI 실패가 context drift (anchored 만 채택) |
| RAG / vector DB | ❌ | 과제 스코프 초과, 인프라 의존

## Cache breakpoint 위치 결정

system prompt 구성을 token 순서로 보면:

```
[1] sandwich §1 contract        ←  cache breakpoint 1 직전 (cumulative ~1.5K)
[2] sandwich §2 stage template  ←  ★ cache breakpoint 1 (cumulative ~2.5K)
[3] sandwich §3 tools/skills    ←  ★ cache breakpoint 2 (cumulative ~3K) — 도구 정의 변경 빈도 낮음
[4] sandwich §4 enforcement     ←  같이 [3]에 포함
[5] short transcript prefix     ←  ★ cache breakpoint 3 (선택) — goal + 초기 spec 안정 시
[6] recent messages (rolling)   ←  cache 없음
```

→ Anthropic 4 breakpoint 한도 안. Builder/Critic 처럼 도구 set 다른 에이전트라도 §1+§2 까지는 공유 가능.

## 실측 hook (transcript 에 자동 기록)

[[bagelcode-transcripts-schema]] 의 `Message` 필드 활용:

```jsonc
{
  // ...
  "tokens_in": 5230,
  "tokens_out": 412,
  "cache_read": 4800,    // ← Anthropic 면 input의 ~92% (sandwich 캐시 hit)
  "cache_write": 0,      // ← 첫 턴만 ~3000
  "latency_ms": 1840,
  "cost_usd": 0.0124
}
```

→ 한 세션 끝나고 `jq` 로 합산:
```bash
jq -s 'map(.cost_usd//0)|add' transcript.jsonl  # 총 비용
jq -s '[.[]|.cache_read//0]|add / [.[]|.tokens_in//0]|add' transcript.jsonl  # cache hit ratio
```

→ **루브릭의 "토큰 효율" 차원 데이터 자동 확보** ([[bagelcode-rubric-scoring]] §"토큰 차원").

## 캐시 무효화 사고 시나리오

| 사고 | 결과 |
|---|---|
| 5분 idle 후 다음 turn | TTL 만료 → cache miss → 다시 write 비용 1.25× | 
| sandwich §1 한 글자 수정 | 모든 ephemeral key 무효 → 전 에이전트 cache miss |
| transcript 안정 prefix 안에 메시지 삽입 | breakpoint 3 무효 → 절감 사라짐 |
| 에이전트마다 도구 set 다름 | breakpoint 2 위치 다름 → §1 까지만 공유 |

→ **§1+§2 만 안전한 공유 캐시 영역.** §3 부터는 에이전트별로 따로.

## TradingAgents 와의 정합

[[bagelcode-tradingagents-paper]] 가 **"각 role 이 필요한 것만 query"** 라고 한 부분이 결국 캐싱과 같은 얘기. 다른 표현:
- 논문: "extract or query the necessary information"
- 우리: "transcript pull-only + kind 필터"

→ **transcripts schema 가 TradingAgents §4.1 protocol 의 우리 버전**.

## 비-적용 (배제 결정)

| 후보 | 채택 안 함 | 이유 |
|---|---|---|
| RAG / vector search | X | 과제 스코프 초과. transcript pull 로 충분. |
| 전용 cache 미들웨어 (Redis 등) | X | 인프라 의존. README 동작 위험. |
| Gemini Context Caching API 전용 처리 | X | min 4K 충족 어려움 + provider별 분기 코드 비대 |
| KV cache 직접 관리 | X | LLM provider 추상화 깨짐 |

## 측정 목표 (제출 시 README 에 표기)

### Baseline (캐싱 없음, 가정)
- Total input: ~150K
- Cost: $1.50 / session
- Wall-clock: 2:30
- Quality: 24/25 (D1-D5)

### Target (Tier 1+2 적용)
```
1세션 평균:
  - Total input tokens: ~130K
  - Anthropic cache_read ratio: ≥70%
  - Codex auto cache hit: ≥50%
  - Plan cache hit ratio (P1): ≥30% (3+ 세션 연속 시)
  - Hierarchical tool cache hit (P1): ≥40% (artifacts 안정 시)
  - Total cost: $0.50-1.00 / session  (-37% vs baseline)
  - Wall-clock: 1:45-2:00 (-25% vs baseline)
  - Quality: 24/25 → unchanged (검증 hook 통과 시)
```

→ "토큰 투자 대비 실효성" 의 분모. ([[bagelcode-rubric-scoring]] 의 분자와 합쳐 효율 지표).
→ baseline → target 경로가 곧 README 의 "Cache strategy" 섹션 데이터.

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-caching-frontier-2026]] — **3-tier 사료 12종** (provider docs + APC + Hierarchical + KVCOMM + ACON + cautionary)
- [[bagelcode-transcripts-schema]] — 캐시 경계가 올라가는 schema
- [[bagelcode-rubric-scoring]] — 토큰 효율 차원 측정
- [[bagelcode-tradingagents-paper]] §4.3 quick/deep 분리
- [[bagelcode-fault-tolerance-design]] — F2 capability probe = cache key invalidation
- [[bagelcode-agents-fixed]] — provider 별 cache 동작
- [[geode-prompt-system]] / [[geode-adaptive-thinking]] — Anthropic cache + thinking effort 패턴
