---
title: GEODE Prompt Assembly
type: concept
category: prompt
tags: [geode, prompt, assembler, hook, skill-injection, memory-injection, langsmith, observability]
related:
  - "[[geode-prompt-system]]"
  - "[[geode-prompt-templates]]"
  - "[[geode-prompt-hashing]]"
  - "[[geode-memory-system]]"
  - "[[geode-bidirectional-learning]]"
  - "[[geode-hook-production-gap]]"
sources:
  - "geode/core/llm/prompt_assembler.py"
  - "geode/core/skills/skill_registry.py"
  - "geode/core/hooks/system.py"
  - "geode/core/llm/router.py"
  - "geode/tests/test_prompt_assembler.py"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE Prompt Assembly

[[geode-prompt-system]] 시리즈 Part 2. **`PromptAssembler.assemble()`** 의 6 단계 동작과, 그 결과인 `AssembledPrompt`, 그리고 외부 관찰성을 담당하는 `PROMPT_ASSEMBLED` Hook payload 의 구조를 다룬다.

## 1. 호출 진입점

| Caller | 사용처 |
|---|---|
| `core/agent/loop.py` (AgenticLoop) | 라우터/에이전트 노드의 system + user 조립 |
| `plugins/game_ip/pipeline/*` | Analyst / Evaluator / Synthesizer / BiasBuster 노드 |
| `core/llm/cross_llm.py` | 교차 검증 호출 |

모든 노드는 raw `.format()` 대신 `assembler.assemble(base_system=..., base_user=..., state=..., node=..., role_type=...)` 으로 통합 진입한다.

## 2. `AssembledPrompt` (불변 결과)

```python
# core/llm/prompt_assembler.py:29-40
@dataclass(frozen=True)
class AssembledPrompt:
    system: str                 # 최종 시스템 프롬프트
    user: str                   # 최종 사용자 프롬프트
    assembled_hash: str         # SHA-256[:12] of (system + user)
    base_template_hash: str     # SHA-256[:12] of original base_system
    fragment_count: int
    total_chars: int            # len(system) + len(user)
    fragments_used: list[str]   # 추적용 식별자
```

`frozen=True` — 어셈블 후 어떤 코드도 결과를 수정할 수 없다. LLM 호출 직전 변조 위험을 차단.

## 3. 6 단계 어셈블 흐름

```
input: base_system, base_user, state, node, role_type
       ↓
[1] Override (append-only by default)
       ↓
[2] Skill Injection  (priority sort, max 3, body cap 500)
       ↓
[3] Memory Context   (_llm_summary primary, fallback path)
       ↓
[4] Bootstrap Extras (max 5 instructions, 100 chars each)
       ↓
[5] Budget Observability (warn at 4000 chars)
       ↓
[6] Hash + Hook fire
       ↓
output: AssembledPrompt(frozen)
```

### 3.1 Phase 1 — Override

```python
overrides = state.get("_prompt_overrides", {})
system_key = f"{node}_system"
if system_key in overrides:
    if self._allow_full_override:
        system = overrides[system_key]                    # 위험: 전체 교체
        fragments_used.append(f"override:{system_key}")
    else:
        system = base_system + "\n\n" + overrides[system_key]  # 안전: append
        fragments_used.append(f"override-append:{system_key}")
else:
    system = base_system
```

`allow_full_override=False` 가 기본값. 전체 교체는 테스트/디버그에서만 명시적으로 허용된다.

### 3.2 Phase 2 — Skill Injection

```python
skills = self._skills.get_skills(node=node, role_type=role_type)
if skills:
    skills = sorted(skills, key=lambda s: s.priority)[: self._max_skills_per_node]
    skill_block = self._format_skill_block(skills)
    system += "\n\n" + skill_block
    for s in skills:
        fragments_used.append(f"{s.name}:{s.version}")
        skill_hashes[s.name] = _hash_prompt(s.prompt_body)   # 관찰성
```

- 매칭 조건: `node` + (`role_type` OR `*`) + `role="system"`
- 우선순위: 낮은 priority 가 먼저 (낮을수록 중요)
- 최대 3 개 (`max_skills_per_node`)
- 각 스킬 body 가 500자 초과 시 잘림 + `truncation_events.append(f"skill:{name}")`

### 3.3 Phase 3 — Memory Context

```python
memory_ctx = state.get("memory_context")
if memory_ctx and isinstance(memory_ctx, dict):
    memory_block = self._format_memory_block(memory_ctx)
    if memory_block:
        if len(memory_block) > self._max_memory_chars:
            truncation_events.append(f"memory:{len(memory_block)}->{self._max_memory_chars}")
            memory_block = memory_block[: self._max_memory_chars] + "..."
        system += "\n\n" + memory_block
        fragments_used.append("memory-context")
```

- **Primary path**: `memory_ctx["_llm_summary"]` (ContextAssembler 가 미리 요약)
- **Fallback path**: `_org_loaded`/`_project_loaded`/`_session_loaded` 개별 키 조합 (구버전 호환)
- 기본 한도 300 자, 초과 시 잘림 + 이벤트 기록

`_llm_summary` 는 [[geode-memory-system]] 의 5-tier 컨텍스트가 LLM 향으로 압축된 결과.

### 3.4 Phase 4 — Bootstrap Extras

```python
extra: list[str] = state.get("_extra_instructions", [])
if extra:
    extra = extra[: self._max_extra_instructions]                       # 최대 5
    extra = [inst[: self._max_extra_instruction_chars] for inst in extra]  # 각 100자
    system += "\n\n## Additional Instructions\n" + "\n".join(f"- {i}" for i in extra)
    fragments_used.append(f"bootstrap-extra:{len(extra)}")
```

`_extra_instructions` 는 부트스트랩이 동적으로 주입하는 짧은 가이드. 도구 활성화/비활성화, 사용자 선호 등이 들어온다.

### 3.5 Phase 5 — Budget Observability

```python
total_system_chars = len(system)
if total_system_chars > self._prompt_warning_chars:    # 기본 4000
    log.warning("System prompt %d chars exceeds warning threshold %d", ...)
```

**자르지 않는다** — 1M 컨텍스트 모델에서 4000자 자체는 문제가 아니다. 단지 관찰 가능하게 만든다 (Karpathy P6).

### 3.6 Phase 6 — Hash + Hook

```python
assembled_hash = _hash_prompt(system + user)
result = AssembledPrompt(
    system=system,
    user=user,
    assembled_hash=assembled_hash,
    base_template_hash=base_hash,
    fragment_count=len(fragments_used),
    total_chars=len(system) + len(user),
    fragments_used=list(fragments_used),
)

if self._hooks is not None:
    hook_data = {
        "node": node,
        "role_type": role_type,
        "assembled_hash": assembled_hash,
        "base_template_hash": base_hash,
        "fragment_count": len(fragments_used),
        "total_chars": total_chars,
        "fragments_used": list(fragments_used),
    }
    if skill_hashes:
        hook_data["skill_hashes"] = skill_hashes
    if truncation_events:
        hook_data["truncation_events"] = truncation_events
    self._hooks.trigger(HookEvent.PROMPT_ASSEMBLED, hook_data)
return result
```

## 4. `PROMPT_ASSEMBLED` Hook payload

| 필드 | 타입 | 의미 |
|---|---|---|
| `node` | str | "analyst", "evaluator", "synthesizer", "biasbuster", "router" |
| `role_type` | str | "game_mechanics", "quality_judge", "*" 등 |
| `base_template_hash` | str | 베이스 템플릿의 SHA-256[:12] |
| `assembled_hash` | str | 최종 system+user 의 SHA-256[:12] |
| `fragment_count` | int | 주입된 프래그먼트 개수 |
| `total_chars` | int | system+user 문자 수 |
| `fragments_used` | list[str] | 식별자 (예: `core-gameplay-focus:1.0`, `memory-context`) |
| `skill_hashes` | dict[str,str] | (스킬 있을 때만) 스킬명 → body SHA-256[:12] |
| `truncation_events` | list[str] | (자르기 있을 때만) `"memory:512->300"`, `"skill:long-skill"` |

**원본 텍스트는 미포함.** 외부 관찰 시스템 ([[#7 LangSmith 통합]]) 으로 프롬프트 내용이 새지 않는다.

[[geode-hook-production-gap]] 에서는 본 이벤트가 58 hook events 중 **prompt 계열 단일 이벤트** 라고 분류된다.

## 5. Skill Discovery (5 우선순위)

```python
# core/skills/skill_registry.py:_resolve_skill_dirs
[
    root / ".geode" / "skills",          # 1. Bundled (패키지 내)
    Path.home() / ".geode" / "skills",   # 2. 사용자 전역
    cwd / ".geode" / "skills",           # 3. 프로젝트 로컬
    cwd / "skills",                       # 4. 프로젝트 평탄
    *self._extra_dirs,                    # 5. 추가 디렉토리
]
```

이 5 우선순위 패턴은 [[geode-openclaw-patterns]] 의 4 우선순위 디스커버리에서 차용한 것 (project local 을 두 갈래로 분리).

스킬 파일 형식:

```yaml
---
name: core-gameplay-focus
node: analyst
type: game_mechanics            # "*" = all role_types for this node
priority: 50                     # 낮을수록 우선
version: 1.0
role: system                     # "system" or "user"
enabled: true
---

Focus on the core gameplay loop mechanics. Identify unique interaction
patterns and replay value drivers...
```

`SkillRegistry.discover()` 는 `sorted(d.glob("*.md"))` 로 알파벳순 디스커버리 — **결정성 보장**.

## 6. 튜닝 파라미터

| Param | Default | 의미 |
|---|---|---|
| `max_skill_chars` | 500 | 각 스킬 body 최대 문자 |
| `max_skills_per_node` | 3 | 노드 한 번에 주입할 스킬 수 |
| `max_memory_chars` | 300 | 메모리 블록 최대 문자 |
| `max_extra_instructions` | 5 | 부트스트랩 명령어 최대 개수 |
| `max_extra_instruction_chars` | 100 | 명령어 1개 최대 문자 |
| `prompt_warning_chars` | 4000 | 시스템 프롬프트 경고 임계값 |
| `allow_full_override` | False | 오버라이드 보안 모드 |

## 7. LangSmith 통합

```python
# core/llm/router.py:151-181
def is_langsmith_enabled() -> bool:
    tracing = os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true"
    api_key = os.environ.get("LANGCHAIN_API_KEY") or os.environ.get("LANGSMITH_API_KEY")
    return tracing and api_key is not None

def maybe_traceable(*, run_type: str = "llm", name: str | None = None):
    if is_langsmith_enabled():
        from langsmith import traceable
        return traceable(run_type=run_type, name=name)
    return lambda fn: fn   # no-op
```

`maybe_traceable` 데코레이터가 적용된 5 호출 지점:

| Function | run_type |
|---|---|
| `call_llm` | llm |
| `call_llm_parsed` | llm |
| `call_llm_json` | llm |
| `call_llm_with_tools` | chain |
| `call_llm_streaming` | llm |

LangSmith 가 비활성화 (env 미설정) 시 데코레이터는 identity — 런타임 비용 0. LangSmith 활성화 시 LLM 호출이 자동으로 trace 된다. 하지만 어셈블된 프롬프트 자체는 trace payload 에 포함되지 않고, **모델 어댑터가 보내는 메시지 그대로** 가 LangSmith 의 input 으로 캡처된다.

LangSmith / Langchain 로거는 `WARNING` → `ERROR` 로 격상되어 (router.py:141-143) 429 rate-limit 스팸을 차단한다.

## 8. 테스트 — `tests/test_prompt_assembler.py`

10 클래스, 20+ 케이스. 핵심:

| Class | 검증 |
|---|---|
| `TestBasicAssembly` | fragment 0 케이스, 해시 결정성 |
| `TestSkillInjection` | priority 정렬, body cap 자르기 |
| `TestMemoryInjection` | `_llm_summary` primary, fallback 경로, 자르기 이벤트 |
| `TestBootstrapInjection` | 5 명령어 cap, 100 자 cap |
| `TestPromptOverride` | append-only vs full-replace (allow_full_override) |
| `TestTokenBudget` | 4000자 초과 경고만, 자르지 않음 |
| `TestHashing` | base_template_hash != assembled_hash |
| `TestHookEmission` | PROMPT_ASSEMBLED payload 구조, 조건부 필드 |
| `TestCombinedAssembly` | 6 단계 순서 보장 |

## 9. 흐름도 — Pipeline → Assembler → LLM

```
GeodeState (dict)
   │
   ├─ memory_context._llm_summary  ── from ContextAssembler
   ├─ _prompt_overrides            ── from bootstrap
   ├─ _extra_instructions          ── from bootstrap
   │
   ▼
PromptAssembler.assemble(base, state, node, role_type)
   │
   ├─ SkillRegistry.get_skills(node, role_type)
   │     └─ priority sort + cap 3 + body cap 500
   │
   ├─ Memory block (cap 300)
   ├─ Bootstrap block (5 × 100)
   │
   ▼
AssembledPrompt(frozen)  ──► HookEvent.PROMPT_ASSEMBLED
   │
   ▼
core/llm/router.call_llm_*  (@maybe_traceable)
   │
   ▼
provider adapter (anthropic / openai / glm / codex)
```

## Related

- [[geode-prompt-system]] — 시리즈 허브
- [[geode-prompt-templates]] — 베이스 템플릿 카탈로그
- [[geode-prompt-hashing]] — base_template_hash 가 어떻게 핀 검증되는지
- [[geode-memory-system]] — `_llm_summary` 의 출처
- [[geode-bidirectional-learning]] — 부트스트랩 명령어로 들어오는 학습된 패턴
- [[geode-hook-production-gap]] — PROMPT_ASSEMBLED 이벤트가 속한 hook 그룹
- [[geode-openclaw-patterns]] — 5 우선순위 디스커버리 패턴 출처
- [[index]]
- [[geode]]

## Open Questions

- `hash_rendered_prompt()` 함수가 정의만 되고 사용처가 없다 — 어셈블러 끝에서 강제로 호출해 `rendered_hash` 를 hook payload 에 추가할 가치가 있는가?
- `_extra_instructions` 가 부트스트랩 외에 어디서 채워지는지 명시적 문서화가 부재 — 보안 감사 관점에서 enumerate 필요.
- Hook payload 에 `provider` / `model_id` 가 빠져 있어, 동일 어셈블 결과가 다른 모델로 보내질 때 추적이 어려움 (cross-LLM 검증 시).
