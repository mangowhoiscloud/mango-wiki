---
title: GEODE Prompt System — Evolution Roadmap
type: concept
category: prompt
tags: [geode, prompt, roadmap, evolution, gap-analysis, anthropic-cache, render-hash, telemetry, security]
related:
  - "[[geode-prompt-system]]"
  - "[[geode-prompt-frontier-comparison]]"
  - "[[geode-prompt-hashing]]"
  - "[[geode-prompt-assembly]]"
sources:
  - "geode/core/llm/prompts/__init__.py"
  - "geode/core/llm/prompt_assembler.py"
  - "geode/CLAUDE.md (CANNOT/CAN)"
  - "openclaw/src/agents/anthropic-payload-policy.ts"
  - "openclaw/src/agents/system-prompt-cache-boundary.ts"
  - "openclaw/src/agents/cache-trace.ts"
  - "claude-code/utils/api.ts"
  - "claude-code/constants/prompts.ts"
  - "hermes-agent/agent/prompt_caching.py"
  - "hermes-agent/agent/prompt_builder.py"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE Prompt System — Evolution Roadmap

[[geode-prompt-system]] 시리즈 Part 5. [[geode-prompt-frontier-comparison]] 에서 식별한 GAP 들을 발전 우선순위로 정리하고, 각 항목에 도입 시나리오 + 예상 비용 + 위험을 명시한다.

## GAP 우선순위 매트릭스

| # | GAP | 영향 영역 | 비용 | 우선순위 |
|---|---|---|---|---|
| 1 | Skill body 도 hash ratchet 으로 끌어올리기 | 무결성 (Karpathy P4 확장) | 작음 | P1 |
| 2 | Messages history 캐싱 (system_and_3 패턴) — system 캐싱은 이미 구현됨 | 비용 (LLM 토큰, multi-turn) | 중간 | P1 |
| 3 | `hash_rendered_prompt()` 활성화 (어셈블 끝) | 관찰성 (재현성 감사) | 작음 | P2 |
| 4 | LangSmith trace 에 어셈블 메타 자동 첨부 | 관찰성 | 중간 | P2 |
| 5 | ~~`_PINNED_HASHES` 18 vs `PROMPT_VERSIONS` 20 비대칭 해소~~ | ~~무결성~~ | ~~작음~~ | **CLOSED** (2026-05-01 false alarm) |
| 6 | `_extra_instructions` 인젝션 스캔 | 보안 | 중간 | P3 |
| 7 | Cache boundary marker 시스템 프롬프트 분할 | 비용 (캐시 히트율) | 중간 | P3 |
| 8 | 재핀 워크플로 자동화 (`geode prompts repin`) | DX | 작음 | P3 |

## P1 — 무결성 / 비용

### 1. Skill body Hash Ratchet

**현재**: 스킬은 `PROMPT_ASSEMBLED` Hook payload 로 해시만 관찰됨. CI gate 는 없다.

**문제**: `.geode/skills/*.md` 의 한 줄 변경이 수십 개 분석 결과의 동작을 바꿀 수 있는데, 변경이 **CI 에 의해 감지되지 않는다**. 머지된 PR 의 git diff 만이 검출 수단.

**제안**:

```python
# core/skills/skill_registry.py 에 추가
_PINNED_SKILL_HASHES: dict[str, str] = {
    "core-gameplay-focus:1.0": "abc123def456",
    "anti-deception-checklist:1.2": "fedcba654321",
    ...
}

def verify_skill_integrity(*, raise_on_drift: bool = False) -> list[str]:
    """Karpathy P4 ratchet for skills (mirrors verify_prompt_integrity)."""
```

**도입 비용**:
- 스킬 갯수 만큼 핀 항목 추가 (현재 `.geode/skills/` 갯수 확인 필요)
- 신규 스킬 추가 PR 마다 핀 1개 수동 갱신
- 기존 hashing 패턴 재사용 가능 — 새 코드 ~30줄

**위험**:
- 스킬은 기존 4 개 핀 항목 (Templates) 보다 빈번히 변경되므로 PR 마찰 증가
- → 완화: priority 가 낮은 (= 중요한) 스킬만 핀, 나머지는 hook 관찰만

### 2. Messages History Caching (system_and_3 / rolling breakpoints)

**현재** (2026-05-01 재확인): **시스템 프롬프트 캐싱은 이미 구현되어 있다** — `system_with_cache()` (router 4 호출 지점) + STATIC/DYNAMIC boundary (`__GEODE_PROMPT_CACHE_BOUNDARY__`, anthropic adapter). 하지만 **messages 배열의 캐싱은 미적용** — Anthropic 의 4 breakpoint 중 1~2 개만 사용. 멀티턴 agentic loop 에서 history 가 매 호출마다 fresh 청구.

**문제**: AgenticLoop 의 멀티턴에서 messages 배열은 매 호출마다 fresh 청구. AgenticLoop 가 30+ 라운드를 도는 long-horizon 태스크에서는 동일한 prefix history 가 반복적으로 계산된다.

**제안 (Hermes system_and_3 패턴 차용)**:

```python
# core/llm/providers/anthropic.py 에 추가
def apply_messages_cache_control(
    messages: list[dict],
    *,
    cache_ttl: str = "5m",
) -> list[dict]:
    """Apply cache_control to last 3 non-system messages.

    Anthropic 은 4 breakpoint 까지 허용 (system 1 + messages 3).
    rolling cache: 새 turn 추가 시 가장 오래된 cache_control 자동 무효.
    """
    marker = {"type": "ephemeral"}
    if cache_ttl == "1h":
        marker["ttl"] = "1h"
    # 마지막 3 user/assistant 메시지에 cache_control 마커 부여
    non_sys = [(i, m) for i, m in enumerate(messages) if m.get("role") != "system"]
    for i, _ in non_sys[-3:]:
        last_block = messages[i]["content"][-1]
        last_block["cache_control"] = marker
    return messages
```

`ClaudeAgenticAdapter._do_call` 에서 `messages = apply_messages_cache_control(messages)` 호출 추가.

**도입 비용**:
- Anthropic 어댑터 코드 ~30줄
- 메시지 content 가 string 인 경우 list[block] 로 정규화 필요 (이미 일부 경로 존재)
- 측정: `usage.cache_read_input_tokens` / `usage.cache_creation_input_tokens` 비율로 효과 측정

**위험**:
- 5분 TTL 사이 호출이 없으면 캐시 미스. AgenticLoop 라운드 간격이 보통 짧으니 문제 적음
- 30+ 라운드 후 가장 오래된 메시지가 캐시 ID 변경으로 재청구 — 이는 정상 동작

## P2 — 관찰성 / 정합성

### 3. `hash_rendered_prompt()` 활성화

**현재**: 함수가 정의되어 있고 `__all__` 에 export 되어 있지만, **호출 지점이 없다**.

**문제**: 템플릿 → 변수 치환 → LLM 호출 사이의 중간 산물 (rendered prompt) 이 관찰되지 않는다. 변수 치환 결과가 의도와 다른 경우 (예: `{ip_name}` 가 `None` 으로 들어가 "Evaluate None." 같은 프롬프트가 만들어지는 케이스) 잡히지 않는다.

**제안**: 어셈블러 Phase 6 에서 `assembled_hash` 옆에 `rendered_hash` 도 함께 계산.

```python
# core/llm/prompt_assembler.py:174 근처
assembled_hash = _hash_prompt(system + user)
rendered_hash = hash_rendered_prompt(system + user)   # 동일 결과지만 의미 분리
# (또는 변수 치환 전후 분리)
```

또는 더 정확하게: 베이스 템플릿이 `.format(**vars)` 로 변수 치환되는 시점에 hash 를 캡처해 hook payload 에 추가.

**도입 비용**: ~10 줄 코드 + hook payload 필드 1개 추가.

**위험**: 거의 없음. 관찰만 추가하므로 동작 변경 없음.

### 4. LangSmith trace 에 어셈블 메타 자동 첨부

**현재**: `maybe_traceable` 데코레이터는 LLM 호출의 input/output 만 trace. **어셈블 단계의 fragment 정보는 hook payload 에만 존재** 하고 LangSmith 와 연결되지 않음.

**문제**: LangSmith UI 에서 trace 를 보면 모델이 받은 메시지는 보이지만, "이 메시지에 어떤 스킬이 주입되었나" 를 알 수 없다. Cross-LLM 검증 시 두 trace 의 차이가 어셈블 단계에서 발생했는지 모델 응답 단계에서 발생했는지 분리 불가.

**제안**: `PROMPT_ASSEMBLED` hook handler 를 추가해 LangSmith run metadata 를 보강.

```python
# core/observability/langsmith_bridge.py (신규)
@register_hook(HookEvent.PROMPT_ASSEMBLED)
def _attach_to_langsmith(event, data):
    if not is_langsmith_enabled():
        return
    from langsmith import get_current_run_tree
    run = get_current_run_tree()
    if run is None:
        return
    run.metadata.update({
        "prompt_assembled_hash": data["assembled_hash"],
        "prompt_base_hash": data["base_template_hash"],
        "prompt_fragments": data["fragments_used"],
        "prompt_skill_hashes": data.get("skill_hashes", {}),
        "prompt_truncation_events": data.get("truncation_events", []),
    })
```

**도입 비용**: 30~50 줄. LangSmith run tree API 학습 필요.

**위험**: LangSmith run tree 가 어셈블 시점에 활성화되지 않을 수 있음 (어셈블 → traceable LLM 호출 사이의 컨텍스트 흐름) — 검증 필요.

### 5. ~~`_PINNED_HASHES` 18 vs `PROMPT_VERSIONS` 20 비대칭~~ — **CLOSED**

**상태**: 2026-05-01 실측으로 false alarm 확인.

```
$ uv run python -c "
from core.llm.prompts import PROMPT_VERSIONS, _PINNED_HASHES
print(len(PROMPT_VERSIONS), len(_PINNED_HASHES))
print('missing:', sorted(set(PROMPT_VERSIONS) - set(_PINNED_HASHES)))
print('extra:',   sorted(set(_PINNED_HASHES) - set(PROMPT_VERSIONS)))
"
20 20
missing: []
extra: []
```

`verify_prompt_integrity()` 도 `[]` 반환 (드리프트 없음). 별도 패치 불필요.

이 GAP 는 초기 탐사 단계에서 카탈로그 카운트 (8 base + 9 extended = 17 + 3 axes = 20 vs 외형상 18줄로 보이는 핀 dict) 의 시각적 오인이었다. 실제로는 모든 항목이 일대일 핀 고정되어 있다.

## P3 — 보안 / DX

### 6. `_extra_instructions` 인젝션 스캔

**현재**: 부트스트랩이 `state["_extra_instructions"]` 큐에 명령어를 푸시. 5 × 100자 캡으로 폭주는 막지만, **콘텐트 자체** 의 위협은 검사하지 않는다.

**문제**: 부트스트랩 코드가 사용자 입력 (예: GEODE.md 또는 사용자 프로필) 에서 `_extra_instructions` 를 채울 가능성이 있는데, 그 입력에 prompt injection 패턴이 들어있으면 어셈블러가 그대로 시스템 프롬프트에 주입한다.

**제안 (Hermes 패턴 차용)**:

```python
# core/llm/prompt_assembler.py:Phase 4 직전
from core.security.injection_scanner import scan_instruction
extra = [
    inst if scan_instruction(inst).safe else f"[BLOCKED: {scan_instruction(inst).reason}]"
    for inst in extra
]
```

스캐너 자체는 Hermes `agent/prompt_builder.py:35-74` 의 11 패턴을 포팅.

**도입 비용**: 신규 모듈 ~150 줄 + 테스트.

**위험**: 정상적인 명령어가 false-positive 로 차단될 수 있음 ("ignore this if X" 같은 자연 표현) — 차단 대신 경고만 하는 모드 옵션 필요.

### 7. Cache Boundary Marker (P1 #2 의 분리 항목)

P1 §2 와 함께 검토. boundary 마커 없이 단순 cache_control 적용도 가능하지만, **어셈블러가 어떤 부분이 정적/동적인지 알고 있다** 는 정보를 활용하면 boundary 위치를 자동 결정할 수 있다.

```
Phase 1 (override) ─ append-only mode 에서는 정적
Phase 2 (skills) ─ skills 변경 빈도에 따라 정적/동적
Phase 3 (memory) ─ 항상 동적
Phase 4 (bootstrap) ─ 항상 동적
─── 자동 boundary ───
```

스킬은 어셈블 시점에 디스커버리되므로 호출 간 변할 수 있음 — boundary 앞에 두면 캐시 미스 위험. 보수적으로는 Phase 1 끝까지를 정적으로 본다.

### 8. 재핀 자동화 (`geode prompts repin`)

**현재**: 재핀 절차는 수동 (편집 → `print(dict(sorted(...)))` → 코드 편집 → 테스트).

**제안**: CLI 명령으로 자동화.

```bash
$ geode prompts repin
Computing live hashes...
Detected drift in 1 entry:
  ANALYST_SYSTEM:  pin=8a325a63b397  now=9f12a3b4c5d6
Apply (y/N)? y
Updated core/llm/prompts/__init__.py:_PINNED_HASHES.
Run: uv run pytest tests/test_karpathy_prompt_hardening.py
```

**도입 비용**: ~80 줄 CLI 코드 + AST 편집 (또는 단순 정규식 치환).

**위험**: AST 편집 실패 시 코드 손상 가능 — git working tree 가 깨끗할 때만 동작하도록 가드.

## 발전 시나리오 — 4 분기 단위

### Q1: 무결성 강화 (P1 #1 + P2 #5)

- Skill body ratchet
- ~~18 vs 20 비대칭 해소~~ (CLOSED 2026-05-01: 실측 결과 비대칭 없음)
- 결과: CI 가 보호하는 표면이 18 → 20+N (스킬) 으로 확장

### Q2: 비용 절감 (P1 #2 + P3 #7)

- Anthropic ephemeral cache + boundary marker
- 측정: 캐시 히트율 + 토큰 절감률
- 결과: 분석 1회 토큰 비용 30~50% 감소 (Hermes 사례 추정)

### Q3: 관찰성 통합 (P2 #3 + P2 #4)

- `rendered_hash` 활성화
- LangSmith run metadata 통합
- 결과: trace UI 에서 "이 호출에 들어간 프래그먼트" 직접 확인 가능

### Q4: 보안 / DX (P3 #6 + P3 #8)

- `_extra_instructions` 인젝션 스캔
- 재핀 자동화 CLI
- 결과: 부트스트랩 입력 신뢰 표면 확장 + 재핀 마찰 감소

## 비-목표 (Out of Scope)

다음은 의도적으로 발전 우선순위에서 제외:

| 항목 | 사유 |
|---|---|
| 프롬프트 자동 압축/요약 | 1M 컨텍스트 모델에서 시스템 프롬프트 4000자는 문제 아님. Karpathy P6 컨텍스트 예산은 별도 시스템 (메모리 컨텍스트) 에서 관리 |
| 다중 언어 프롬프트 자동 생성 | 현재 한글 루브릭이 SSOT. 다국어는 도메인 플러그인 책임 |
| 프롬프트 A/B 테스트 인프라 | 현재 단일 프롬프트 + 모델 다양성 (cross-LLM) 으로 검증. A/B 는 별도 이니셔티브 |
| 프롬프트 임베딩 / 의미 검색 | RAG 도입 시 검토. 현재 200줄 PROJECT.md 로 충분 |

## Related

- [[geode-prompt-system]] — 시리즈 허브
- [[geode-prompt-frontier-comparison]] — GAP 식별의 근거 (수평 비교)
- [[geode-prompt-hashing]] — P1 #1, P2 #5 의 코드 위치
- [[geode-prompt-assembly]] — P1 #2, P2 #3, P2 #4, P3 #6 의 코드 위치
- Karpathy patterns ([[blog-harness-frontier]]) — P4 Ratchet 의 적용 범위 확장
- [[index]]
- [[geode]]

## Open Questions

- P1 #1 (Skill ratchet) 도입 시 PR 마찰 vs 무결성 가치의 균형은? 베타 릴리스 후 측정.
- P1 #2 (Anthropic cache) 의 5분 TTL 이 GEODE 분석 호출 간격에 적합한가? 1시간 TTL 의 비용 트레이드오프 검증 필요.
- P2 #4 (LangSmith run metadata) 가 부분 실패 (run tree 미활성화) 시 graceful degradation 패턴은?
