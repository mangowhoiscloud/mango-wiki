---
title: GEODE Prompt Templates Catalog
type: concept
category: prompt
tags: [geode, prompt, templates, axes, evaluator, analyst, synthesizer, biasbuster, router, cross-llm]
related:
  - "[[geode-prompt-system]]"
  - "[[geode-prompt-assembly]]"
  - "[[geode-prompt-hashing]]"
  - "[[geode-quality-evaluation]]"
  - "[[geode-domain-plugin]]"
sources:
  - "geode/core/llm/prompts/__init__.py"
  - "geode/core/llm/prompts/analyst.md"
  - "geode/core/llm/prompts/evaluator.md"
  - "geode/core/llm/prompts/synthesizer.md"
  - "geode/core/llm/prompts/biasbuster.md"
  - "geode/core/llm/prompts/router.md"
  - "geode/core/llm/prompts/cross_llm.md"
  - "geode/core/llm/prompts/axes.py"
  - "geode/plugins/game_ip/config/evaluator_axes.yaml"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE Prompt Templates Catalog

[[geode-prompt-system]] 시리즈 Part 1. 모든 프롬프트의 **소스 위치, 구조, 동적 주입점**을 한 곳에서 카탈로그화.

## 1. 프롬프트 저장소 구조

```
core/llm/prompts/
  __init__.py        — 로더 + PROMPT_VERSIONS dict + _PINNED_HASHES + verify_prompt_integrity
  axes.py            — YAML 로드 + AXES_VERSIONS + VALID_AXES_MAP
  analyst.md         — 4 분석가 공통 베이스 (game_mechanics, player_experience, growth_potential, discovery)
  evaluator.md       — 3 평가자 공통 베이스 (quality_judge, hidden_value, community_momentum)
  synthesizer.md     — 원인 분류 + 처방 합성
  biasbuster.md      — 6 편향 검사 (확증/최근/앵커/위치/장황/자기향상)
  router.md          — GEODE 일반 에이전트 시스템 프롬프트 + AGENTIC_SUFFIX
  cross_llm.md       — 교차 LLM 검증 (RESCORE, DUAL_VERIFY)
  commentary.md      — 사용자 향 짧은 마무리 코멘트
  decomposer.md      — 복합 요청 분해
  tool_augmented.md  — ANALYST_TOOLS / SYNTHESIZER_TOOLS suffix

plugins/game_ip/config/
  evaluator_axes.yaml — analyst_specific (4) + evaluator_axes (3) + prospect_evaluator_axes
```

## 2. 17 + 9 + 3 — `PROMPT_VERSIONS` 항목

| 그룹 | 항목 (8 + 9) | 위치 | 주요 동적 변수 |
|---|---|---|---|
| Base | `ANALYST_SYSTEM`, `ANALYST_USER` | `analyst.md` | `{analyst_type}`, `{analyst_specific_prompt}`, IP profile fields |
| Base | `EVALUATOR_SYSTEM`, `EVALUATOR_USER` | `evaluator.md` | `{axes_schema}`, `{rubric_anchors}` |
| Base | `SYNTHESIZER_SYSTEM`, `SYNTHESIZER_USER` | `synthesizer.md` | classified cause, 4 metrics |
| Base | `BIASBUSTER_SYSTEM`, `BIASBUSTER_USER` | `biasbuster.md` | analyst score stats, run order |
| Extended | `ROUTER_SYSTEM`, `AGENTIC_SUFFIX` | `router.md` | tool list, MCP server status |
| Extended | `COMMENTARY_SYSTEM`, `COMMENTARY_USER` | `commentary.md` | user query, executed actions |
| Extended | `CROSS_LLM_SYSTEM`, `CROSS_LLM_RESCORE`, `CROSS_LLM_DUAL_VERIFY` | `cross_llm.md` | provider name, original score |
| Extended | `ANALYST_TOOLS_SUFFIX`, `SYNTHESIZER_TOOLS_SUFFIX` | `tool_augmented.md` | tool descriptions |
| Axes | `EVALUATOR_AXES`, `PROSPECT_EVALUATOR_AXES`, `ANALYST_SPECIFIC` | `axes.py` (from YAML) | rubric anchors per axis |

총 **20 항목** 이 `PROMPT_VERSIONS` 딕셔너리에 SHA-256[:12] 해시로 저장되며, 동일 키 20개가 `_PINNED_HASHES` 에 1:1 핀 고정되어 있다 ([[geode-prompt-hashing]] 참조).

## 3. 핵심 템플릿 디테일

### 3.1 `analyst.md` — 4 분석가 공통 베이스

```
=== SYSTEM ===
역할: {analyst_type} 전문 분석가
출력: 1-5 점수 + 5개 주요 발견(키-증거-가중치-신뢰)
스타일: 측정 가능한 증거 우선

=== USER ===
IP 프로필 + MonoLake 데이터 + 외부 신호
{analyst_specific_prompt}   ← ANALYST_SPECIFIC[analyst_type] 주입점
```

**4 분석가 유형** (= `ANALYST_SPECIFIC` 키):

| Type | 초점 |
|---|---|
| `game_mechanics` | core gameplay loop, combat, progression, replay value |
| `player_experience` | narrative, character depth, world immersion |
| `growth_potential` | community size, engagement, fan-creation, viral signals |
| `discovery` | market positioning, genre fit, competitor landscape, USP |

이 4 키가 `analyst_specific_prompt` 자리에 들어가며, 각 키의 **본문 자체** 는 `evaluator_axes.yaml:5-21` 의 SSOT.

### 3.2 `evaluator.md` — 3 평가자 베이스

세 평가자가 동일한 베이스 템플릿을 공유하지만 `{axes_schema}` / `{rubric_anchors}` 가 평가자별로 달라진다.

| Evaluator | Axes 수 | 합성 공식 |
|---|---|---|
| `quality_judge` | 8 (a/b/c/b1/c1/c2/m/n) | `(sum - 8) / 32 * 100` (0-100 정규화) |
| `hidden_value` | 3 | hidden value per-axis aggregation |
| `community_momentum` | 3 | engagement velocity weighted |

`quality_judge.rubric` 일부 (한글 SSOT):

```yaml
a_score:        # core mechanics potential
  "1": "기본 조작 불량"
  "2": "장르 이하"
  "3": "장르 평균"
  "4": "장르 이상"
  "5": "혁신적 메카닉"
```

루브릭이 한글로 고정되어 있으므로 문자열 한 줄만 바뀌어도 `EVALUATOR_AXES` 해시가 변하고, 그 결과 `_PINNED_HASHES["EVALUATOR_AXES"]` 의 재핀이 강제된다 ([[geode-prompt-hashing]] §재핀 절차).

### 3.3 `synthesizer.md` — 원인 LOCKED 합성

```
=== SYSTEM ===
제약: 원인/행동 LOCKED — 의사결정 트리가 결정한 분류를
       내러티브에서 변경하지 않는다
스타일: ground-truth-first
```

이 템플릿은 [[geode-quality-evaluation]] 의 5계층 검증 중 **합성자 단계**에서 사용된다. 원인 재분류를 명시적으로 금지하는 제약이 있다.

### 3.4 `biasbuster.md` — 6 편향 검사

| 편향 | 트리거 |
|---|---|
| Confirmation | 분석가들이 동일 방향으로 점수 |
| Recency | 최근 신호 과대 가중 |
| Anchoring | CV < 0.05 AND ≥4 분석가 |
| Position | 첫 번째/마지막 평가자 점수 편차 |
| Verbosity | 증거 길이 ↔ 점수 상관 |
| Self-enhancement | 자체 결과 우호적 평가 |

`overall_pass=true` 는 6개 플래그 모두 false 일 때만 가능.

### 3.5 `router.md` — GEODE 라우터 시스템

155 줄로 가장 긴 템플릿. 다음 섹션을 포함:

- 일반 에이전트 정체성 + 핵심 기능 카탈로그
- 도메인 플러그인 안내 ([[geode-domain-plugin]])
- 도구 선택 우선순위 행렬
- MCP 서버 관리 지침
- 금지 규칙 / 명확화 규칙 / 근거 제시 규칙
- `=== AGENTIC_SUFFIX ===` — 완료 기준, 라운드 예산, anti-exploration

라우터는 GEODE 의 일반 에이전트 모드 ([[geode-agentic-loop]]) 의 진입 프롬프트.

### 3.6 `cross_llm.md` — 교차 검증

```
=== SYSTEM ===
검증 에이전트. 1-5 단일 숫자만 출력.

=== RESCORE ===
원 분석가 결과를 재평가. 차이가 ≥2면 BiasBuster 트리거.

=== DUAL_VERIFY ===
최종 합성 결과를 별도 LLM 으로 cross-check.
```

해당 템플릿은 멀티 프로바이더(Anthropic ↔ OpenAI ↔ GLM) 사이에서 점수 일관성을 측정하는 데 사용된다.

## 4. Axes Layer — `evaluator_axes.yaml` SSOT

위치: `plugins/game_ip/config/evaluator_axes.yaml` (v0.64.0 에서 `core/domains/game_ip/config/` 에서 이동)

```yaml
analyst_specific:        # dict[str, str] × 4
  game_mechanics: >- ...
  player_experience: >- ...
  growth_potential: >- ...
  discovery: >- ...

evaluator_axes:          # dict[str, dict] × 3
  quality_judge:
    description: ...
    axes: { a_score: ..., b_score: ..., ... }    # 8 keys
    rubric: { a_score: { "1": "...", ..., "5": "..." }, ... }
    composite_formula: "(axes_sum - 8) / 32 * 100"
  hidden_value: { ... }                           # 3 axes
  community_momentum: { ... }                     # 3 axes

prospect_evaluator_axes: # 미게임화 IP 평가
  prospect_judge:
    axes: { g_score, h_score, i_score, o_score, p_score, ... }  # 9 keys
```

세 키 (`analyst_specific`, `evaluator_axes`, `prospect_evaluator_axes`) 가 각각 SHA-256[:12] 로 해싱되어 `AXES_VERSIONS` 딕셔너리에 저장된다.

```python
# core/llm/prompts/axes.py:54-56
def _hash_axes(data: Any) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:12]
```

`sort_keys=True` 가 핵심 — YAML 파서의 키 순서가 머신마다 달라도 해시가 일정하다.

## 5. Plugin / Domain 프롬프트

GEODE 의 도메인 모델은 [[geode-plugin-namespace]] 로 분리되어 있어, 향후 도메인이 늘면 각 플러그인이 자신의 `prompts/` + `axes.yaml` 을 가진다. v0.64.0 기준 `plugins/game_ip/` 만 존재.

플러그인은 `core/domains/port.py:DomainPort` 인터페이스를 통해 자신의 `valid_axes_map`, `analyst_specific`, `evaluator_axes` 를 주입한다 — `axes.py:get_valid_axes_map()` 이 도메인 어댑터에 위임.

## 6. Skill Layer 와의 차이

[[geode-prompt-assembly]] 에서 다루는 **Skill** 은 본 카탈로그의 템플릿과 다른 계층:

| | Templates | Skills |
|---|---|---|
| 위치 | `core/llm/prompts/*.md` (코드와 함께 배포) | `.geode/skills/*.md` (런타임 디스커버리) |
| 라이프사이클 | 빌드 시 import → 핀 검증 | 어셈블러 호출 시마다 디스커버리 |
| 해시 추적 | `_PINNED_HASHES` (CI gate) | `PROMPT_ASSEMBLED.skill_hashes` (Hook 관찰) |
| 변경 시 영향 | CI 깨짐 (의도적 재핀 필요) | 새 어셈블 결과만 영향 |

## Related

- [[geode-prompt-system]] — 시리즈 허브
- [[geode-prompt-assembly]] — 템플릿이 어떻게 조립되는지
- [[geode-prompt-hashing]] — 템플릿이 어떻게 핀 고정되는지
- [[geode-quality-evaluation]] — Evaluator/Synthesizer/BiasBuster 가 5계층 검증에서 차지하는 역할
- [[geode-domain-plugin]] — `evaluator_axes.yaml` 이 어떤 인터페이스로 코어에 노출되는지
- [[index]]
- [[geode]]

## Open Questions

- `decomposer.md` 는 `PROMPT_VERSIONS` 자체에서 빠져 있다 (`__init__.py` 가 import 하지 않음) — 의도된 제외인가, 향후 추가 대상인가?
- Skill body 가 PROMPT_ASSEMBLED Hook 으로 해시만 전송되지만 동일한 핀 메커니즘은 없다 — 스킬 변경 감지를 CI gate 로 끌어올릴 가치가 있는가?
