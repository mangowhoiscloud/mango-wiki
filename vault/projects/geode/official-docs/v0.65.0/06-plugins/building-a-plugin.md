---
title: Building a Plugin
category: plugins
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/domains/loader.py"
  - "core/domains/port.py:18-140"
  - "plugins/game_ip/adapter.py:24-100"
external_refs:
  - url: "https://docs.openclaw.ai/plugins/sdk-overview.md"
    pattern: "Plugin SDK pattern"
---

# Building a Plugin

새 도메인 plugin 만들기. game_ip 참고 구현 따라하면 됨.

## 6 단계

### 1. 디렉터리 + namespace 설정

```bash
mkdir -p plugins/<my_domain>/{nodes,prompts,config,fixtures}
touch plugins/<my_domain>/__init__.py
touch plugins/<my_domain>/adapter.py
```

`plugins/<my_domain>/__init__.py`:

```python
"""<My Domain> 분석 plugin."""
```

### 2. DomainPort 구현 (adapter.py)

16 메서드 구현. game_ip 참고:

```python
from core.domains.port import DomainPort
import yaml

class MyDomain:
    @property
    def name(self) -> str: return "my_domain"
    @property
    def version(self) -> str: return "0.1.0"
    @property
    def description(self) -> str: return "..."

    def get_analyst_types(self) -> list[str]:
        return ["analyst_type_1", "analyst_type_2", "analyst_type_3"]

    def get_analyst_specific(self, analyst_type: str) -> dict:
        return {
            "system_prompt": load_prompt(f"my_domain_{analyst_type}", "system"),
            "user_template": load_prompt(f"my_domain_{analyst_type}", "user"),
            "axes_focus": [...],
        }

    def get_evaluator_types(self) -> list[str]:
        return ["evaluator_1", "evaluator_2"]

    def get_evaluator_axes(self, evaluator_type: str) -> list[str]: ...
    def get_valid_axes_map(self) -> dict[str, list[str]]: ...

    def get_scoring_weights(self) -> dict[str, float]:
        return self._scoring["weights"]

    def get_confidence_multiplier_params(self) -> dict: ...
    def get_tier_thresholds(self) -> dict[str, float]:
        return {"S": 80.0, "A": 60.0, "B": 40.0}

    def get_tier_fallback(self, score: float) -> str: return "C"

    def get_cause_values(self) -> list[str]: ...
    def get_action_values(self) -> list[str]: ...
    def get_cause_to_action(self) -> dict[str, str]: ...
    def get_cause_descriptions(self) -> dict[str, str]: ...
    def get_action_descriptions(self) -> dict[str, str]: ...

    def list_fixtures(self) -> list[str]: ...
    def get_fixture_path(self, name: str) -> Path: ...
```

### 3. 노드 구현 (nodes/)

기존 graph topology를 재사용 — `core/graph.py` 가 도메인-agnostic. 각 노드는 도메인 어댑터를 받아 분기:

```python
# plugins/my_domain/nodes/analyst.py
def analyst_node(state):
    domain = get_domain()  # ContextVar
    config = domain.get_analyst_specific(state["analyst_type"])
    response = llm_adapter.invoke(
        system=config["system_prompt"],
        user=config["user_template"].format(**state),
    )
    return {"analyses": [parse_analyst_response(response)]}
```

`plugins/game_ip/nodes/` 의 코드를 그대로 copy + 도메인 특화 부분만 변경하는 게 권장.

### 4. Prompts (prompts/)

`*.md` 파일에 `=== SYSTEM === / === USER ===` 섹션:

```markdown
=== SYSTEM ===
You are an analyst evaluating <domain>. Use the rubric...

=== USER ===
Target: {target}
Signals: {signals}
```

### 5. Config (config/)

3 YAML 파일:

| 파일 | 내용 |
|---|---|
| `evaluator_axes.yaml` | 14축 (or 도메인별 N축) |
| `cause_actions.yaml` | causes + actions + 매핑 |
| `scoring_weights.yaml` | subscore weights, tier thresholds |

### 6. 등록 (`core/domains/loader.py`)

```python
_BUILTIN_DOMAINS = {
    "game_ip": "plugins.game_ip.adapter:GameIPDomain",
    "my_domain": "plugins.my_domain.adapter:MyDomain",   # 추가
}
```

또는 런타임 등록:

```python
# 외부 .py에서
from core.domains.loader import register_domain
register_domain("my_domain", "plugins.my_domain.adapter:MyDomain")
```

## 7. 테스트

`tests/test_my_domain.py`:

```python
def test_my_domain_loads():
    domain = load_domain_adapter("my_domain")
    assert domain.name == "my_domain"
    assert len(domain.get_analyst_types()) >= 1

def test_my_domain_dry_run():
    set_domain(load_domain_adapter("my_domain"))
    result = run_pipeline("test_target", mode="dry_run")
    assert result.tier in ["S", "A", "B", "C"]
```

`uv run pytest tests/test_my_domain.py -v`.

## 8. CLI 노출

```bash
geode analyze "target" --domain=my_domain --dry-run
```

`core/cli/__init__.py` 의 analyze subcommand가 `--domain` 플래그로 분기.

## Quality Gates

```bash
uv run ruff check core/ tests/ plugins/    # plugins/도 포함
uv run mypy core/ plugins/
uv run pytest tests/ -m "not live"
```

## 다음

- [[domain-port-protocol]] — 16 메서드 상세
- [[overview]] — Plugin 개관
- [[pipeline]] — game_ip 참고 구현
