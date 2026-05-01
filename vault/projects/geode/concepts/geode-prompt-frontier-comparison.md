---
title: GEODE Prompt System — Frontier Comparison
type: concept
category: prompt
tags: [geode, prompt, comparison, frontier, hermes, openclaw, claude-code, hashing, caching, observability]
related:
  - "[[geode-prompt-system]]"
  - "[[geode-prompt-hashing]]"
  - "[[geode-prompt-assembly]]"
  - "[[geode-prompt-evolution]]"
  - "[[geode-claude-code-patterns]]"
  - "[[geode-openclaw-patterns]]"
sources:
  - "geode/core/llm/prompts/__init__.py"
  - "geode/core/llm/prompt_assembler.py"
  - "hermes-agent/agent/prompt_builder.py"
  - "hermes-agent/agent/prompt_caching.py"
  - "openclaw/src/agents/system-prompt.ts"
  - "openclaw/src/agents/pi-embedded-runner/prompt-cache-observability.ts"
  - "openclaw/src/agents/anthropic-payload-policy.ts"
  - "openclaw/src/agents/system-prompt-cache-boundary.ts"
  - "openclaw/src/agents/cache-trace.ts"
  - "claude-code/constants/prompts.ts"
  - "claude-code/utils/api.ts"
  - "claude-code/utils/fingerprint.ts"
  - "claude-code/services/api/dumpPrompts.ts"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE Prompt System — Frontier Comparison

[[geode-prompt-system]] 시리즈 Part 4. **GEODE / Hermes / OpenClaw / Claude Code** 4 시스템의 프롬프트 처리 방식을 수평 비교. 비교 축은 6 개: 정의 위치, 조립 책임, 해싱·무결성, 캐싱 전략, 관찰성, 보안.

## 1. 한 줄 요약

| System | 한 줄 |
|---|---|
| **GEODE** | YAML/MD 템플릿 + Karpathy P4 hash ratchet + LangSmith opt-in. 캐싱은 미구현 |
| **Hermes** | 10-layer 빌더 + frozen snapshot + Anthropic system_and_3 ephemeral cache (LRU 8). 해싱은 mtime/size manifest 만 |
| **OpenClaw** | 모듈식 60+ param 빌더 + cache boundary marker + SHA-256 systemDigest/toolDigest + JSONL trace |
| **Claude Code** | 다층 우선순위 (override > coordinator > agent > custom > default) + dynamic boundary + global/org cache scope + 3-char attribution fingerprint |

## 2. 정의 위치

| Axis | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| 1차 정의 | `core/llm/prompts/*.md` | `agent/prompt_builder.py` (Python 상수) | `src/agents/system-prompt.ts` | `constants/prompts.ts` |
| 메타 데이터 | `evaluator_axes.yaml` (SSOT) | inline Python | inline TS | inline TS |
| 사용자 메모리 | `~/.geode/memory/*` (5-tier) | `~/.hermes/memory.json` (frozen snapshot) | workspace `HEARTBEAT.md` + memory hooks | `CLAUDE.md` (managed → user → project → local) |
| 빌드 시점 | import 시 (모듈 로드) | 세션 시작 시 1회 | 매 호출 시 모듈식 조립 | 매 턴 동적 섹션 재계산 |

**관찰**: GEODE 만 프롬프트를 `.md` 파일로 외부화. 나머지 3개는 코드 내 문자열. 이 차이가 **GEODE 가 hash ratchet 을 도입할 수 있었던 구조적 이유** — 텍스트 파일이 변경 단위가 되면 hashlib 가 자연스럽게 의미를 가진다.

## 3. 조립 책임 (Assembly)

| Axis | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| 어셈블러 | `PromptAssembler.assemble()` 6단계 | `_build_system_prompt()` 10 layer | `buildAgentSystemPrompt()` 60+ param | `splitSysPromptPrefix()` + `buildSystemPromptBlocks()` |
| 결과 타입 | `AssembledPrompt(frozen=True)` | `str` (cached `_cached_system_prompt`) | `string` 반환 (immutable by convention) | `TextBlockParam[]` 배열 |
| Skill 주입 | `## Skill: <name>` markdown block | `<available_skills>` XML | `<available_skills>` XML | XML-style + capability registry |
| Memory 주입 | `## Context from Memory` block | frozen snapshot (mid-session 고정) | `MEMORY` 섹션 | `MEMORY_INSTRUCTION_PROMPT` + concat |
| Override 정책 | `allow_full_override=False` (append-only) | `system_message` param 으로 추가 | `extraSystemPrompt` 추가 | 5단계 priority chain |
| 단편 카운터 | `fragment_count`, `fragments_used[]` | `prompt_parts[]` 리스트 | `SystemPromptReport` 객체 | `cacheBreak` 플래그 + 섹션 카운트 |
| 자르기 정책 | 메모리 300, 스킬 500, 부트스트랩 5×100 | 컨텍스트 파일 20K (head 70%/tail 20%) | 스킬 30K char + 256K bytes | 자르지 않음 (모델 컨텍스트 윈도우 신뢰) |

**관찰**: 모든 4 시스템이 어셈블러 패턴을 채택했지만, **결과의 불변성 보장은 GEODE 만 명시적**. Python `frozen=True` dataclass 가 그것이고, 다른 셋은 컨벤션 의존.

## 4. 해싱·무결성 (Hashing & Integrity)

| Axis | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| 해시 알고리즘 | SHA-256[:12] | (없음) | SHA-256 (full hex) | SHA-256[:3] (3자) |
| 해시 대상 | 17 base/extended templates + 3 axes (총 20) | — | systemPromptDigest + toolDigest | (model, toolNames, sysLen) tuple |
| 핀 고정 | `_PINNED_HASHES` (20, 1:1 with PROMPT_VERSIONS) — CI gate | (없음) | `prompt-cache-observability.ts` 변경 감지 | (없음 — 추적용) |
| 정규화 | UTF-8 only / json.dumps sort_keys | mtime + size manifest | `normalizeStructuredPromptSection()` (CRLF/trailing space) + `normalizePromptCapabilityIds()` (sorted, lowercase, dedup) | model+toolNames+sysLen 튜플 |
| CI 게이트 | `verify_prompt_integrity(raise_on_drift=True)` | (없음) | (변경 감지만 — 비강제) | (없음) |
| 사용 목적 | drift detection (강제) | snapshot validity | cache invalidation 감지 | attribution (백엔드 검증) |

**관찰**: **무결성 강제 (CI 게이트)** 를 명시적으로 구현한 것은 GEODE 가 유일하다. 나머지는:

- **Hermes**: 해시 자체를 안 쓰고, mtime/size manifest 로 snapshot 유효성 검증 (스킬에만)
- **OpenClaw**: 변경을 **감지** 하지만 **차단** 하지 않음. 캐시 무효화 신호로만 사용
- **Claude Code**: 해시는 attribution 용 (3자 = 12 bit 만 — 충돌이 흔함, 보안 목적 아님). 변경 감지 메커니즘은 cacheBreak 플래그로 별개

GEODE 의 20 핀은 Karpathy patterns ([[blog-harness-frontier]]) P4 Ratchet 의 가장 엄격한 적용.

## 5. 캐싱 전략 (Caching)

| Axis | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| Anthropic ephemeral | ✅ `system_with_cache()` (4 router 호출) + STATIC/DYNAMIC 분할 (agentic adapter) | `apply_anthropic_cache_control(system_and_3)` | `resolveAnthropicEphemeralCacheControl(short/long)` | `cache_control: { type: 'ephemeral', scope: 'global'\|'org', ttl: '5m'\|'1h' }` |
| Breakpoint 수 | 1~2 (system 단일 또는 STATIC+DYNAMIC) — messages 히스토리 캐싱 미적용 | 4 (system + last 3 non-system) | 동적 (boundary 분할 결과 + last user) | 동적 (boundary 분할 + tool blocks) |
| Cache boundary marker | ✅ `__GEODE_PROMPT_CACHE_BOUNDARY__` | (없음) | `<!-- OPENCLAW_CACHE_BOUNDARY -->` | `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` |
| Boundary 위치 | system prompt 내 1회 (build_system_prompt 자동 삽입) | — | system prompt 내 1회 | system prompt 내 1회 |
| TTL 옵션 | — | `5m` (default), `1h` (opt-in) | `1h` only on api.anthropic.com (long retention) | `5m` (default), `1h` (선택) |
| 메모리 LRU | (없음) | 8 entries (skill prompt) | (캐시 안 함) | (코드 내 `memoize`) |
| 디스크 캐시 | (없음) | `.skills_prompt_snapshot.json` | (없음) | (없음) |

**관찰** (2026-05-01 정정): 초기 보고와 달리 GEODE 도 Anthropic ephemeral cache 를 **이미 사용 중**. 두 가지 형태:

1. **단일 블록 캐시** — `core/llm/router.py:481, 582, 749, 901` (4 호출 지점) 가 `system_with_cache(system)` 으로 시스템 전체를 단일 ephemeral 블록으로 보냄
2. **STATIC/DYNAMIC 분할** — `core/llm/providers/anthropic.py:411-433` 이 `__GEODE_PROMPT_CACHE_BOUNDARY__` 마커에서 분할해 두 블록 (앞만 cache_control) 으로 보냄. 마커는 `core/agent/system_prompt.py:35` 에 정의되고 `build_system_prompt()` 가 자동 삽입

여전한 진짜 GAP:

- **Messages history 캐싱 부재** — Hermes 의 system_and_3 (last 3 non-system 메시지에도 cache_control) 미적용. Anthropic 은 4개 breakpoint 까지 허용하지만 GEODE 는 1~2개만 사용.
- **OpenAI/GLM 어댑터에는 boundary 분할 미적용** — OpenAI 는 자동 캐싱이고 GLM 은 자체 캐싱이라 어댑터 코드 변경은 불필요할 수 있으나 검증 필요.

→ [[geode-prompt-evolution]] §2 에서 messages 캐싱 도입 시나리오로 갱신.

## 6. 관찰성 (Observability)

| Axis | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| 1차 채널 | `HookEvent.PROMPT_ASSEMBLED` payload | `logger.info("Using ephemeral system prompt: %s", preview[:60])` | `cache-trace.ts` JSONL (stage별 9 단계) | `logEvent('tengu_sysprompt_*')` |
| LangSmith / OTEL | LangSmith opt-in (`maybe_traceable`, 5 호출 지점) | (없음) | (없음 — 자체 trace) | (자체 telemetry) |
| 원문 노출 | 미노출 (해시·메타만) | session DB 에 full 저장 (`sessions.system_prompt`) | systemDigest/messagesDigest 만 (env로 원문 활성화 가능) | (telemetry 에 미노출) |
| 추적 키 | (node, role_type, hashes, fragments) | (sessionId, prompt_preview) | (sessionId, seq, stage, digests, fingerprints[]) | (sessionId, blockCount, scope, cacheHit) |
| 자르기 이벤트 | `truncation_events` 조건부 | logger only | `SystemPromptReport.entries` | (별도 추적 없음) |
| 로그 격상 | LangSmith/Langchain WARNING→ERROR | (없음) | (없음) | (없음) |

**관찰**: 4 시스템 모두 관찰성을 갖췄지만 **세분도** 가 다르다.

- **OpenClaw 가 가장 정교** — JSONL stage별 trace + 메시지 단위 fingerprint
- **GEODE 는 hook payload 단일** — payload 가 hook 시스템에 종속되어 있어 hook handler 가 없으면 관찰 불가
- **Hermes 는 가장 단순** — 60자 프리뷰만, 외부 시스템 통합 부재
- **Claude Code 는 telemetry 강조** — 메트릭(이벤트 카운트, 캐시 히트율) 우선

GEODE 의 LangSmith 통합은 호출 단위 trace 는 가능하지만, **어셈블 단계별 단편 정보** 는 hook payload 에만 있고 LangSmith 와 자동 연결되지 않는다. → [[geode-prompt-evolution]] §4 GAP.

## 7. 보안 / 인젝션 보호

| Axis | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| 프롬프트 인젝션 스캔 | (없음) | 11개 정규식 + 무형 유니코드 ([_CONTEXT_THREAT_PATTERNS]) | (sanitize via path/url checks) | (없음 — 사용자 의도 신뢰) |
| 차단 메커니즘 | — | `[BLOCKED: prompt_injection]` 마커 치환 | (path traversal 검사) | (hook 으로 추가 가능) |
| Frozen snapshot | `AssembledPrompt(frozen)` | `_system_prompt_snapshot` (memory) | XML escape (`escapeXml`) | (immutable by convention) |
| Override 보안 | `allow_full_override=False` 기본 | `system_message` append only | `extraSystemPrompt` append only | priority chain (override > default) |

**관찰**: **인젝션 방어는 Hermes 가 가장 강력** — 컨텍스트 파일을 11개 패턴으로 스캔하고 무형 유니코드까지 차단. GEODE 는 어셈블 결과 불변성으로 변조는 막지만 인젝션 컨텐트 자체의 검사는 없다.

GEODE 의 `_extra_instructions` 는 기본 5 × 100자 캡으로 폭주를 막지만, **누가 이 큐를 채울 수 있는지** 의 enumerate 가 명시되어 있지 않은 GAP 가 있다.

## 8. 4-시스템 통합 비교 매트릭스

| | GEODE | Hermes | OpenClaw | Claude Code |
|---|---|---|---|---|
| 프롬프트 외부화 | ✅ `.md` files | ❌ inline | ❌ inline | ❌ inline |
| Hash ratchet (CI gate) | ✅ `_PINNED_HASHES` 20 | ❌ | ⚠ 감지만 | ❌ |
| Frozen result | ✅ `frozen=True` | ⚠ 컨벤션 | ⚠ 컨벤션 | ⚠ 컨벤션 |
| Anthropic ephemeral cache | ✅ system block + STATIC/DYNAMIC | ✅ system_and_3 | ✅ boundary marker | ✅ scope (global/org) |
| Cache boundary marker | ✅ `__GEODE_PROMPT_CACHE_BOUNDARY__` | ❌ | ✅ HTML 코멘트 | ✅ token marker |
| Messages history cache | ❌ (last-N rolling 미적용) | ✅ system_and_3 (last 3) | ✅ last user message | ✅ last user blocks |
| LangSmith / OTEL | ✅ opt-in | ❌ | ❌ | ❌ (자체) |
| 인젝션 스캔 | ❌ | ✅ 11 patterns | ⚠ XML escape | ❌ |
| Frozen memory snapshot | ⚠ ContextAssembler | ✅ `_system_prompt_snapshot` | ⚠ HEARTBEAT.md | ✅ memoized |
| Hook 기반 관찰 | ✅ `PROMPT_ASSEMBLED` | ❌ | ❌ | ✅ events |
| 도구 디스커버리 우선순위 | 5-tier (skills) | (없음 - explicit list) | 4-tier (workspace) | (없음 - registry) |
| Skill / Plugin XML | ⚠ markdown blocks | ✅ XML | ✅ XML | ✅ XML registry |
| Override 보안 모드 | ✅ append-only default | ⚠ append only | ⚠ append only | ✅ priority chain |
| Truncation event log | ✅ `truncation_events` | ❌ (logger only) | ⚠ report 객체 | ❌ |

✅ 명시적 구현, ⚠ 부분적 또는 컨벤션 의존, ❌ 부재.

## 9. 누가 무엇을 차용했는가

| 패턴 | 출처 | GEODE 차용 | 위치 |
|---|---|---|---|
| Skill discovery 4-tier | OpenClaw `workspace.ts` | 5-tier (project local 분리) | `core/skills/skill_registry.py:_resolve_skill_dirs` |
| Hash ratchet | Karpathy `autoresearch` (P4) | 20 핀 + CI gate | `core/llm/prompts/__init__.py:_PINNED_HASHES` |
| Frozen snapshot | Hermes memory | `AssembledPrompt(frozen)` (확장 적용) | `prompt_assembler.py:29` |
| System reminder pattern | Claude Code | (미차용 — Hook payload 로 대체) | n/a |
| Cache boundary marker | OpenClaw + Claude Code | (미차용) | n/a → [[geode-prompt-evolution]] §2 |
| LangSmith opt-in | LangChain 생태계 | `maybe_traceable` | `core/llm/router.py:161` |

## 10. 핵심 관찰 — 왜 GEODE 만 ratchet 을 했는가

세 시스템 (Hermes, OpenClaw, Claude Code) 모두 프롬프트를 **코드 내 인라인 문자열** 로 정의한다. 이런 구조에서 hash ratchet 은 자연스럽지 않다:

- 인라인 문자열은 IDE 자동 포맷터, ESLint/Prettier, 머지 충돌 해결 도중 의도하지 않게 변할 수 있다
- 그 변경은 git diff 만으로 충분히 의식적 — 이미 코드 리뷰 단계에서 잡힌다
- 추가로 hash 비교를 도입하면 노이즈 (포매터 vs 의미 변경) 분리가 어렵다

GEODE 는 프롬프트를 `.md` 텍스트 파일로 외부화하면서 다음을 얻었다:

- **파일이 변경의 단위가 됨** — hashlib 가 자연스러운 의미 단위
- **포매터 영향 미미** — markdown 자동 포매터가 빈번히 다루지 않음
- **YAML axes 데이터 분리** — 구조화 데이터에 대한 별도 해시 체계 (`json.dumps(sort_keys=True)`) 가능

이 구조적 차이 덕분에 Karpathy patterns ([[blog-harness-frontier]]) P4 Ratchet 이 **유의미하게 적용** 될 수 있었다.

## Related

- [[geode-prompt-system]] — 시리즈 허브
- [[geode-prompt-hashing]] — GEODE ratchet 의 디테일
- [[geode-prompt-assembly]] — 어셈블러 책임 분리
- [[geode-prompt-evolution]] — 부재 항목 (cache, 인젝션 스캔, render hash) 의 도입 시나리오
- [[geode-claude-code-patterns]] — Claude Code 차용 패턴 종합
- [[geode-openclaw-patterns]] — OpenClaw 차용 패턴 종합
- Karpathy patterns ([[blog-harness-frontier]]) — P1-P10 원칙 출처
- [[index]]
- [[geode]]

## Open Questions

- OpenClaw 의 `cache-trace.ts` 9 단계 stage 추적은 GEODE 의 단일 PROMPT_ASSEMBLED 보다 풍부한가? 가치 대비 복잡도는?
- Hermes 의 11-pattern 인젝션 스캔을 GEODE `_extra_instructions` 큐에 적용할 가치가 있는가?
- Claude Code 의 5-priority override chain (override > coordinator > agent > custom > default) 이 GEODE 의 단일 append-only override 보다 나은가?
