---
title: GEODE Prompt Hashing and Drift Detection
type: concept
category: prompt
tags: [geode, prompt, hashing, sha256, drift-detection, karpathy-p4, ratchet, ci-gate, integrity]
related:
  - "[[geode-prompt-system]]"
  - "[[geode-prompt-templates]]"
  - "[[geode-prompt-assembly]]"
  - "[[geode-claude-code-patterns]]"
  - "Karpathy patterns ([[blog-harness-frontier]])"
sources:
  - "geode/core/llm/prompts/__init__.py"
  - "geode/core/llm/prompts/axes.py"
  - "geode/tests/test_karpathy_prompt_hardening.py"
  - "geode/CLAUDE.md (Quality Gates)"
created: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

# GEODE Prompt Hashing and Drift Detection

[[geode-prompt-system]] 시리즈 Part 3. **Karpathy P4 Ratchet** 의 GEODE 구현. 프롬프트가 의도하지 않게 변경되면 CI 가 깨지도록 설계된 **단방향 무결성 게이트**.

## 1. 핵심 아이디어

> 프롬프트 변경은 의식적이고 의도적이어야 한다. 우연히 한 글자가 바뀌어 모델 동작이 달라지는 일은 일어나서는 안 된다.

이 명제를 **CI 가 강제** 하는 방식으로 구현한 것이 GEODE 의 프롬프트 해싱 시스템. 프롬프트를 바꾸려면 다음 두 가지를 동시에 해야 한다.

1. `.md` 파일 (또는 `evaluator_axes.yaml`) 을 편집
2. `_PINNED_HASHES` 딕셔너리의 해당 항목을 **수동으로** 새 해시값으로 갱신

수동 갱신을 빠뜨리면 `verify_prompt_integrity()` 가 드리프트를 보고하고 CI 가 실패한다.

## 2. 해시 함수 정의

### 2.1 `_hash_prompt` — 텍스트 해시

```python
# core/llm/prompts/__init__.py:80-82
def _hash_prompt(text: str) -> str:
    """Return first 12 chars of SHA-256 hash for template versioning."""
    return hashlib.sha256(text.encode()).hexdigest()[:12]
```

- **알고리즘**: SHA-256
- **출력**: 16진수 12자 (= 48 bit, 충돌 확률 극소)
- **정규화**: UTF-8 인코딩만, 공백/줄바꿈/순서 모두 보존

> 정규화를 의도적으로 약하게 둔다 — 한 글자만 바뀌어도 해시가 변해야 의식적 변경을 강제할 수 있다. 자동 정규화가 강할수록 "사고로 변경" 의 감지가 약해진다.

### 2.2 `_hash_axes` — 구조화 데이터 해시

```python
# core/llm/prompts/axes.py:54-56
def _hash_axes(data: Any) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:12]
```

- 입력: dict (YAML 에서 로드된)
- 정규화: `json.dumps(..., sort_keys=True)` — YAML 파서/Python 딕셔너리 순서 의존성 제거
- YAML 의 키 순서가 머신마다 달라도 해시가 일정하다.

### 2.3 `hash_rendered_prompt` — 렌더 시점 해시 (감사용)

```python
# core/llm/prompts/__init__.py:85-88
def hash_rendered_prompt(template: str, **kwargs: Any) -> str:
    """Hash a rendered prompt (not template) for reproducibility auditing."""
    rendered = template.format(**kwargs) if kwargs else template
    return hashlib.sha256(rendered.encode()).hexdigest()[:12]
```

템플릿이 아니라 변수 치환 후의 최종 렌더 결과를 해싱. 현재 코드에서 호출 지점은 없으나 export 되어 있어 외부 감사 도구가 사용할 수 있다 ([[geode-prompt-evolution]] §3 참조).

## 3. `PROMPT_VERSIONS` — 20 항목 라이브 해시

```python
# core/llm/prompts/__init__.py:132-154
PROMPT_VERSIONS: dict[str, str] = {
    # Base templates (8)
    "ANALYST_SYSTEM":     _hash_prompt(ANALYST_SYSTEM),
    "ANALYST_USER":       _hash_prompt(ANALYST_USER),
    "EVALUATOR_SYSTEM":   _hash_prompt(EVALUATOR_SYSTEM),
    "EVALUATOR_USER":     _hash_prompt(EVALUATOR_USER),
    "SYNTHESIZER_SYSTEM": _hash_prompt(SYNTHESIZER_SYSTEM),
    "SYNTHESIZER_USER":   _hash_prompt(SYNTHESIZER_USER),
    "BIASBUSTER_SYSTEM":  _hash_prompt(BIASBUSTER_SYSTEM),
    "BIASBUSTER_USER":    _hash_prompt(BIASBUSTER_USER),
    # Extended (9)
    "ROUTER_SYSTEM":            _hash_prompt(ROUTER_SYSTEM),
    "AGENTIC_SUFFIX":           _hash_prompt(AGENTIC_SUFFIX),
    "COMMENTARY_SYSTEM":        _hash_prompt(COMMENTARY_SYSTEM),
    "COMMENTARY_USER":          _hash_prompt(COMMENTARY_USER),
    "CROSS_LLM_SYSTEM":         _hash_prompt(CROSS_LLM_SYSTEM),
    "CROSS_LLM_RESCORE":        _hash_prompt(CROSS_LLM_RESCORE),
    "CROSS_LLM_DUAL_VERIFY":    _hash_prompt(CROSS_LLM_DUAL_VERIFY),
    "ANALYST_TOOLS_SUFFIX":     _hash_prompt(ANALYST_TOOLS_SUFFIX),
    "SYNTHESIZER_TOOLS_SUFFIX": _hash_prompt(SYNTHESIZER_TOOLS_SUFFIX),
    # Axes (3, merged)
    **AXES_VERSIONS,
}
```

20 항목이 모듈 import 시 자동 계산되어 dict 으로 노출된다.

## 4. `_PINNED_HASHES` — 핀 고정값 (20 항목)

```python
# core/llm/prompts/__init__.py:167-188
_PINNED_HASHES: dict[str, str] = {
    "AGENTIC_SUFFIX":          "79cef71335e8",
    "ANALYST_SPECIFIC":        "5a696a2d5ebb",
    "ANALYST_SYSTEM":          "8a325a63b397",
    "ANALYST_TOOLS_SUFFIX":    "2961fb31d96f",
    "ANALYST_USER":            "e59d00faadd5",
    "BIASBUSTER_SYSTEM":       "07987c709fd9",
    "BIASBUSTER_USER":         "378be01a6310",
    "COMMENTARY_SYSTEM":       "488d8916d958",
    "COMMENTARY_USER":         "2024ac4eba69",
    "CROSS_LLM_DUAL_VERIFY":   "602669128ae2",
    "CROSS_LLM_RESCORE":       "163b08e97d66",
    "CROSS_LLM_SYSTEM":        "bf303f600fce",
    "EVALUATOR_AXES":          "0d82eb1aa5b4",
    "EVALUATOR_SYSTEM":        "e891c0ce27d4",
    "EVALUATOR_USER":          "f6d7f955338d",
    "PROSPECT_EVALUATOR_AXES": "a9954477497b",
    "ROUTER_SYSTEM":           "a03eef47a293",
    "SYNTHESIZER_SYSTEM":      "e01544c0c8d2",
    "SYNTHESIZER_TOOLS_SUFFIX":"c6c65e47e191",
    "SYNTHESIZER_USER":        "30d99edc79a5",
}
```

`PROMPT_VERSIONS` 의 라이브 해시와 `_PINNED_HASHES` 의 핀 값을 비교하는 것이 **무결성 검증의 코어**. 두 dict 의 키 집합은 동일 (20 == 20), 누락 없음 — 2026-05-01 측정.

## 5. `verify_prompt_integrity` — 검증 함수

```python
# core/llm/prompts/__init__.py:191-231
def verify_prompt_integrity(*, raise_on_drift: bool = False) -> list[str]:
    """Re-compute prompt hashes and compare against pinned versions.

    Returns list of drift descriptions (empty = all OK).
    If raise_on_drift=True, raises RuntimeError on first mismatch.
    """
    from core.llm.prompts.axes import AXES_VERSIONS as LIVE_AXES

    drifted: list[str] = []
    current = {
        # Base 8
        "ANALYST_SYSTEM": _hash_prompt(ANALYST_SYSTEM),
        # ... (모든 17 base+extended)
        # Axes 3
        **LIVE_AXES,
    }
    for name, pinned_hash in _PINNED_HASHES.items():
        computed = current.get(name)
        if computed != pinned_hash:
            msg = f"Prompt drift: {name} pin={pinned_hash} now={computed}"
            drifted.append(msg)
            _log.warning(msg)
    if drifted and raise_on_drift:
        raise RuntimeError(f"Prompt drift detected: {', '.join(drifted)}")
    return drifted
```

| 모드 | 동작 |
|---|---|
| `raise_on_drift=False` (기본) | 드리프트 메시지 리스트 반환 (빈 리스트 = 정상) |
| `raise_on_drift=True` | 첫 드리프트 발견 시 즉시 RuntimeError |

CI 게이트는 `raise_on_drift=True` 로 호출해 빌드를 깨뜨린다.

## 6. CI Gate — `tests/test_karpathy_prompt_hardening.py`

총 9 테스트 클래스, 50+ 케이스. 핵심 클래스만:

### 6.1 `TestPromptDriftDetection`

```python
def test_no_drift_on_clean_state(self):
    """Computed hashes should match pinned hashes."""
    drifted = verify_prompt_integrity()
    assert drifted == [], f"Unexpected prompt drift: {drifted}"

def test_raise_on_drift(self):
    """raise_on_drift=True should not raise on clean state."""
    verify_prompt_integrity(raise_on_drift=True)

def test_prompt_versions_count_20(self):
    assert len(PROMPT_VERSIONS) == 20

def test_hashes_are_12_char_hex(self):
    for name, h in PROMPT_VERSIONS.items():
        assert len(h) == 12
        assert all(c in "0123456789abcdef" for c in h)

def test_hash_deterministic(self):
    assert _hash_prompt("test") == _hash_prompt("test")

def test_hash_changes_on_different_content(self):
    assert _hash_prompt("A") != _hash_prompt("B")
```

### 6.2 `TestAxesVersionHashing`

```python
def test_axes_versions_has_3_entries(self):
    assert len(AXES_VERSIONS) == 3

def test_axes_versions_keys(self):
    assert set(AXES_VERSIONS.keys()) == {
        "EVALUATOR_AXES", "PROSPECT_EVALUATOR_AXES", "ANALYST_SPECIFIC"
    }

def test_axes_versions_merged_into_prompt_versions(self):
    for key in AXES_VERSIONS:
        assert PROMPT_VERSIONS[key] == AXES_VERSIONS[key]
```

### 6.3 `TestSkillVersioning` (Karpathy P4 응용)

```python
def test_skill_hashes_in_hook_event(self):
    """PROMPT_ASSEMBLED hook should include skill body hashes."""
    captured = []
    hooks.register(HookEvent.PROMPT_ASSEMBLED, lambda e, d: captured.append(d))
    assembler.assemble(...)
    assert "skill_hashes" in captured[0]
    assert captured[0]["skill_hashes"]["test-skill"] == _hash_prompt(skill.prompt_body)
```

스킬은 핀에 등록되지 않지만 **Hook payload 로 해시가 관찰** 된다 — 외부에서 변경 추이를 trace 가능.

## 7. 재핀(Re-pin) 워크플로

프롬프트를 의도적으로 바꿀 때 따라야 하는 절차.

### Step 1 — 편집

```bash
# 예: ANALYST_SYSTEM 의 한 줄을 바꾼다
$ vi core/llm/prompts/analyst.md
```

### Step 2 — 새 해시 계산

```bash
$ python -c "from core.llm.prompts import PROMPT_VERSIONS as V; \
  import json; print(json.dumps(dict(sorted(V.items())), indent=2))"
{
  "ANALYST_SYSTEM": "9f12a3b4c5d6",   # 변경됨 (이전 8a325a63b397)
  "ANALYST_USER":   "e59d00faadd5",
  ...
}
```

### Step 3 — `_PINNED_HASHES` 갱신

```python
# core/llm/prompts/__init__.py:167-188
_PINNED_HASHES: dict[str, str] = {
    ...
    "ANALYST_SYSTEM": "9f12a3b4c5d6",   # 새 해시로 교체
    ...
}
```

### Step 4 — 테스트

```bash
$ uv run pytest tests/test_karpathy_prompt_hardening.py::TestPromptDriftDetection -q
.....                                                       [100%]
```

### Step 5 — 커밋

프롬프트 변경 + 핀 갱신을 **한 커밋** 에 묶는다. 분리하면 CI 가 깨지는 중간 상태가 git history 에 남는다.

> Anti-pattern: `_PINNED_HASHES` 만 별도 PR 로 갱신하기. 그 PR 의 의미가 모호해지고, 본 변경 PR 은 CI 가 깨진 상태로 리뷰된다.

## 8. 정합성 검증 결과 (2026-05-01)

초기 탐사 보고에는 `_PINNED_HASHES` 18 vs `PROMPT_VERSIONS` 20 비대칭이 있다고 적혀 있었으나, 실측 결과 **둘 다 20 항목으로 완전 일치**.

```
$ uv run python -c "from core.llm.prompts import PROMPT_VERSIONS, _PINNED_HASHES; \
    print(len(PROMPT_VERSIONS), len(_PINNED_HASHES))"
20 20

$ uv run python -c "from core.llm.prompts import verify_prompt_integrity; \
    print(verify_prompt_integrity())"
[]
```

키 차집합 (양방향) 도 비어 있다. 별도 GAP 패치는 불필요하며, 18 vs 20 GAP 항목은 [[geode-prompt-evolution]] 에서 폐기 처리되었다.

`decomposer.md` 와 같이 `core/llm/prompts/` 에 존재하지만 `__init__.py` 가 import 하지 않는 파일은 별개 — 그것은 **현재 라이브 사용 안 됨** 을 의미하지 핀 누락이 아니다.

## 9. 누가 호출하는가 — Test-only

현재 `verify_prompt_integrity()` 의 호출 지점은 다음 두 군데뿐:

1. `tests/test_karpathy_prompt_hardening.py::TestPromptDriftDetection.test_no_drift_on_clean_state`
2. `tests/test_karpathy_prompt_hardening.py::TestPromptDriftDetection.test_raise_on_drift`

런타임에서는 호출하지 않는다 — **빌드 타임 게이트**로만 작동. 이는 의도된 설계:

- 런타임 호출은 매 모듈 import 마다 비용 발생 (해시 18개 재계산)
- CI 가 이미 검증했다면 런타임 재검증은 불필요
- 만약 재배포 사이에 disk 의 `.md` 가 변조되었다면, 그건 별개의 보안 위협 (filesystem integrity)

## 10. 보안 / 위협 모델

| 위협 | 보호 | 한계 |
|---|---|---|
| 의도하지 않은 텍스트 변경 (오탈자, 머지 충돌) | `_PINNED_HASHES` CI gate | 재핀 누락 시 통과 |
| 외부 관찰자에게 프롬프트 누출 | Hook payload 에 원문 미포함 | 프로바이더 어댑터의 trace 가 LangSmith 로 갈 때는 원문 포함 |
| 디스크 변조 | 없음 (런타임 재검증 미수행) | 재배포 신뢰 |
| 핀 우회 | 없음 (테스트가 import 시 해시 재계산) | 테스트 우회는 PR 리뷰 책임 |

## 11. Karpathy P4 Ratchet 과의 연결

Karpathy patterns ([[blog-harness-frontier]]) 의 P4 "Ratchet" 원칙은 다음을 말한다.

> 한 번 통과한 품질 게이트는 그 아래로 내려가지 못하게 만든다. CI 는 모든 비가역 진보의 ratchet wheel 이다.

GEODE 는 이 원칙을 4 가지 영역에 적용한다:

| 영역 | Ratchet |
|---|---|
| 프롬프트 | `_PINNED_HASHES` (본 페이지) |
| 테스트 | 3939+ 테스트 cnt 감소 시 PR 거부 |
| 모듈 | 모듈 cnt 감소 시 의식적 검토 (CHANGELOG 항목 강제) |
| 의존성 | `pyproject.toml` 의 `dependencies` 추가만 가능 (제거는 명시적 사유) |

프롬프트 ratchet 은 텍스트 한 줄을 바꾸는 변경이라도 **PR 본문에 사유** 를 적도록 강제한다 — 핀 갱신 자체가 의식적 행위이기 때문.

## 12. 한계

- **렌더 시점 검증 없음** — 변수 치환 후의 최종 프롬프트는 핀 대상이 아니다. 변수가 LLM-friendly 하지 않게 들어가도 잡지 못한다.
- **스킬은 ratchet 외부** — `core/skills/` 의 변경은 Hook 으로 관찰만 되고 CI gate 는 없다. ([[geode-prompt-evolution]] §1)
- **해시 길이 12자 = 48 bit** — 충돌 확률은 작지만, 적대적 조작자가 의도적 충돌을 만들 수는 있다. 다만 위협 모델상 외부 변조는 가정하지 않음.

## Related

- [[geode-prompt-system]] — 시리즈 허브
- [[geode-prompt-templates]] — 핀의 대상이 되는 템플릿들
- [[geode-prompt-assembly]] — 핀과 어셈블의 분리된 책임
- [[geode-prompt-evolution]] — 렌더 시점 검증, Skill ratchet, Anthropic cache GAP
- Karpathy patterns ([[blog-harness-frontier]]) — P4 Ratchet 출처
- [[geode-claude-code-patterns]] — Claude Code 의 attribution fingerprint 와 비교
- [[index]]
- [[geode]]

## Open Questions

- ~~`_PINNED_HASHES` 18개 vs `PROMPT_VERSIONS` 20개 비대칭~~ — **2026-05-01 실측으로 false alarm 확인. 둘 다 20개 일치.**
- Skill body 도 ratchet 으로 끌어올릴 가치가 있는가? (현재는 Hook 관찰만) → [[geode-prompt-evolution]] P1 #1
- 재핀 절차를 자동화하는 `geode prompts repin --diff-only` CLI 가 가능한가? (편집 → 핀 갱신을 한 커맨드로) → [[geode-prompt-evolution]] P3 #8
