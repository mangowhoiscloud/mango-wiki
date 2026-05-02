---
title: Prompt System
category: runtime-llm
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/prompts/__init__.py:32-100"
  - "core/llm/prompts/axes.py"
  - "core/agent/system_prompt.py"
external_refs:
---

# Prompt System

`core/llm/prompts/` — 마크다운 템플릿 + Python 로더 + SHA256 해시 검증으로 구성된 prompt 관리 체계.

## 템플릿 파일

```
core/llm/prompts/
  __init__.py           # 로더 + hash
  axes.py               # YAML axes/rubric 로더
  *.md                  # === SYSTEM === / === USER === 분리 마크다운
```

각 `.md` 파일:

```markdown
=== SYSTEM ===
You are an analyst evaluating game IPs. Use the 14-axis rubric...

=== USER ===
IP: {ip_name}
Signals: {signals}
Provide your reasoning and 14-axis scores.
```

## 로드 (`prompts/__init__.py:32-58`)

```python
def _load_template(name: str) -> dict[str, str]:
    """Parse '=== SYSTEM ===' / '=== USER ===' sections."""
    text = (PROMPTS_DIR / f"{name}.md").read_text()
    sections = re.split(r"^=== (\w+) ===$", text, flags=re.M)
    return {label.lower(): content.strip()
            for label, content in zip(sections[1::2], sections[2::2])}

def load_prompt(name: str, section: str = "system") -> str:
    return _load_template(name)[section]
```

## SHA256 해시 (drift detection)

```python
def hash_rendered_prompt(template: str, **kwargs) -> str:
    """렌더링 후 SHA256[:12] 해시."""
    rendered = template.format(**kwargs)
    return hashlib.sha256(rendered.encode()).hexdigest()[:12]
```

이 해시를 LangSmith trace에 함께 보내면 prompt 변경 시 trace 전후 비교 가능.

## STATIC + DYNAMIC Split

`core/agent/system_prompt.py:PROMPT_CACHE_BOUNDARY` sentinel 마커로 system prompt를 두 블록으로 나눔:

```
=== SYSTEM ===
[STATIC 부분: GEODE 정체성, 도메인 분석가 정의, 14-axis rubric — 거의 변하지 않음]

<<<PROMPT_CACHE_BOUNDARY>>>

[DYNAMIC 부분: 사용자 working_dir, mode, profile prefs — 세션마다 변화]
```

Anthropic adapter (`core/llm/providers/anthropic.py:152-166`)가 boundary 기준으로 두 블록으로 분할 후 각각 ephemeral cache_control 마킹.

## axes.py — YAML 로더

`plugins/<domain>/config/evaluator_axes.yaml` 의 14-axis rubric을 로드:

```yaml
axes:
  - id: gameplay_depth
    description: "..."
    scale: [1, 5]
  - id: visual_polish
    ...
```

`AXES_VERSIONS` 해시로 변경 검출 — drift시 검증.

## 백워드 호환

```python
# 일부 모듈은 모듈 상수로 import
from core.llm.prompts import ANALYST_SYSTEM, ANALYST_USER
```

내부적으로 `load_prompt("analyst", "system")` / `load_prompt("analyst", "user")` 호출.

## verify_prompt_integrity()

CI guardrail (`prompts/__init__.py`):

```python
def verify_prompt_integrity(raise_on_drift=True):
    """AXES_VERSIONS hash + 모든 .md 템플릿 hash 검증."""
```

GitHub Actions의 `Prompt integrity check` job에서 실행 — 의도치 않은 prompt 변경이 main에 들어가면 차단.

## 다음

- [[prompt-caching]] — Anthropic ephemeral cache
- [[prompt-hashing]] — drift detection 디테일
