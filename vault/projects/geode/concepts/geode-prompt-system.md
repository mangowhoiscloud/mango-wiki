---
title: GEODE Prompt System (Series Hub)
type: concept
category: prompt
tags: [geode, prompt, hashing, drift-detection, karpathy-p4, langsmith, series-hub]
related:
  - "[[geode-prompt-templates]]"
  - "[[geode-prompt-assembly]]"
  - "[[geode-prompt-hashing]]"
  - "[[geode-prompt-frontier-comparison]]"
  - "[[geode-prompt-evolution]]"
  - "[[geode-architecture]]"
  - "[[geode-memory-system]]"
sources:
  - "geode/core/llm/prompts/__init__.py"
  - "geode/core/llm/prompts/axes.py"
  - "geode/core/llm/prompt_assembler.py"
  - "geode/core/llm/router.py"
  - "geode/tests/test_karpathy_prompt_hardening.py"
  - "geode/tests/test_prompt_assembler.py"
  - "hermes-agent/agent/prompt_builder.py"
  - "hermes-agent/agent/prompt_caching.py"
  - "openclaw/src/agents/system-prompt.ts"
  - "openclaw/src/agents/pi-embedded-runner/prompt-cache-observability.ts"
  - "openclaw/src/agents/anthropic-payload-policy.ts"
  - "claude-code/constants/prompts.ts"
  - "claude-code/utils/api.ts"
  - "claude-code/utils/fingerprint.ts"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE Prompt System — Series Hub

GEODE 의 프롬프트 시스템을 **5개의 독립 계층** 으로 분해하고, 동시대 프론티어 하네스 (Hermes Agent, OpenClaw, Claude Code) 와 수평 비교한 시리즈의 진입점.

이 시리즈는 다음 질문에 답한다.

- GEODE 의 프롬프트는 어떻게 **정의** 되고 (템플릿)
- 어떻게 **조립** 되며 (어셈블러 + 훅)
- 어떻게 **고정** 되고 (해시 핀 + 드리프트 감지)
- 어떻게 **관찰** 되며 (LangSmith + Hook payload)
- 다른 프론티어 하네스와 **무엇이 다른가** (수평 비교 + 발전 방향)

## 시리즈 구성

| Part | 페이지 | 핵심 |
|---|---|---|
| 1. Templates | [[geode-prompt-templates]] | `core/llm/prompts/*.md` 17 템플릿 + `evaluator_axes.yaml` 3 축 데이터 카탈로그 |
| 2. Assembly | [[geode-prompt-assembly]] | `PromptAssembler.assemble()` 6단계 + `AssembledPrompt` + `PROMPT_ASSEMBLED` Hook |
| 3. Hashing | [[geode-prompt-hashing]] | SHA-256[:12] + `_PINNED_HASHES` 18개 + `verify_prompt_integrity()` + 재핀(Re-pin) 워크플로 |
| 4. Comparison | [[geode-prompt-frontier-comparison]] | Hermes / OpenClaw / Claude Code / GEODE 4-Way 수평 비교 (해싱·캐시·관찰·주입) |
| 5. Evolution | [[geode-prompt-evolution]] | GEODE 가 향할 만한 4 갭: Anthropic ephemeral cache, 캐시 경계 마커, 렌더 시점 무결성, 텔레메트리 |

## 5계층 아키텍처

```
1. Templates Layer       core/llm/prompts/*.md           — 17 base + 9 extended sections
2. Axes Layer            plugins/game_ip/config/         — 14 평가 축 + 4 분석가 지침
                          evaluator_axes.yaml
3. Hash Versioning       core/llm/prompts/__init__.py    — SHA-256[:12] × 20 핀 항목
   Layer
4. Assembly Layer        core/llm/prompt_assembler.py    — base + skill + memory + bootstrap
                                                          (6 단계, append-only 보안 모드)
5. Skill Injection       core/skills/skill_registry.py   — frontmatter + body 5우선순위 디스커버리
   Layer
```

> 각 계층은 다음 계층의 **불변 입력**으로 전달된다. 어셈블러는 템플릿을 변경하지 않고, 해시 핀은 어셈블 결과가 아니라 **소스 텍스트** 를 검증한다. 두 책임은 분리되어 있다.

## 빠른 참조

| 항목 | 값 | 위치 |
|---|---|---|
| 해시 알고리즘 | SHA-256, 첫 12자리 hex | `core/llm/prompts/__init__.py:80-82` |
| 정규화 | UTF-8 인코딩 only (공백/줄바꿈 보존) | `_hash_prompt()` |
| 축 데이터 정규화 | `json.dumps(..., sort_keys=True)` | `core/llm/prompts/axes.py:54-56` |
| 핀 고정 항목 | 20 (base 8 + extended 9 + axes 3) — `PROMPT_VERSIONS` 와 1:1 | `_PINNED_HASHES` |
| `PROMPT_VERSIONS` 항목 | 20 (base 8 + extended 9 + axes 3) | runtime dict |
| 어셈블 단계 | 6 (override → skill → memory → bootstrap → 관찰성 → 해시·훅) | `prompt_assembler.py:86-206` |
| 어셈블 보안 기본값 | `allow_full_override=False` (append-only) | `prompt_assembler.py:65` |
| Hook 이벤트 | `HookEvent.PROMPT_ASSEMBLED` | `core/hooks/system.py:66` |
| Hook payload (조건부) | `skill_hashes`, `truncation_events` | `prompt_assembler.py:188-204` |
| LangSmith 통합 | `maybe_traceable()` 5개 호출 지점 | `core/llm/router.py:151-181` |
| 핀 갱신 명령 | `python -c "from core.llm.prompts import PROMPT_VERSIONS as V; print(dict(sorted(V.items())))"` | `__init__.py:163-166` |

## 설계 원칙

- **불변(`frozen=True`)** — `AssembledPrompt` 는 dataclass(frozen). 한 번 만들어진 프롬프트는 수정할 수 없다.
- **Append-only override** — `_prompt_overrides` 는 기본적으로 추가만 가능. 전체 교체는 `allow_full_override=True` 명시 필요 (테스트/디버그 용).
- **소스 핀, 렌더 미핀** — 핀은 `.md` 원본 텍스트와 YAML 구조 데이터에 적용. 변수 치환된 최종 프롬프트는 `hash_rendered_prompt()` 로 별도 감사 가능하나 핀의 대상은 아니다.
- **Hook payload 에 원문 미포함** — `node`, `role_type`, 해시 2개, 카운터, fragment 이름만 전송. 외부 관찰 시스템(LangSmith)으로 원본 프롬프트가 새지 않는다.
- **자르기는 로깅** — `max_memory_chars`, `max_skill_chars` 초과 시 `truncation_events` 에 기록되어 Karpathy P6 컨텍스트 예산을 관찰 가능하게 만든다.

## 어디서 읽어야 하는가

- "프롬프트가 어떻게 작동하는지 한 페이지로 알고 싶다" → 본 페이지 + [[geode-prompt-assembly]]
- "내 프롬프트를 한 줄 고치면 CI 가 왜 깨지는가" → [[geode-prompt-hashing]] (재핀 절차)
- "Anthropic prompt caching 은 왜 안 쓰는가" → [[geode-prompt-frontier-comparison]] §캐시
- "이 시스템을 다음 단계로 어떻게 발전시킬 것인가" → [[geode-prompt-evolution]]

## Related

- [[geode-architecture]] — 4계층 스택 안에서 프롬프트 계층의 위치
- [[geode-memory-system]] — 메모리 컨텍스트가 어셈블러로 들어오는 경로
- [[geode-claude-code-patterns]] — Karpathy P4 Ratchet 의 도입 맥락
- [[geode-openclaw-patterns]] — Skill Discovery 5 우선순위 패턴
- [[geode-hook-production-gap]] — `PROMPT_ASSEMBLED` 가 속한 58개 hook 분류
- [[index]]
- [[geode]]

## Open Questions

- Anthropic ephemeral cache 도입 시 `_PINNED_HASHES` 와 `cache_control` boundary 가 어디서 만나야 하는가? (현재는 둘 다 부재)
- `hash_rendered_prompt()` 의 호출 지점이 정의만 되고 사용처가 없다 — 렌더 시점 감사를 어셈블러 끝에서 강제할지 ([[geode-prompt-evolution]] 참조)
- Skill priority 가 동률(tie)일 때의 결정성은 디스커버리 순서(알파벳)에 의존 — 명시적 tiebreaker 가 필요한가?

## Verification Note (2026-05-01)

본 시리즈 초안은 `_PINNED_HASHES` 가 18개이고 `PROMPT_VERSIONS` 20개와의 비대칭이 GAP 라고 기술했으나, 실측 (`uv run python -c "..."`) 결과 **20개로 완전 일치**임을 확인했다. 초기 탐사 보고가 잘못됐고 시리즈 본문은 모두 20으로 정정됨.

