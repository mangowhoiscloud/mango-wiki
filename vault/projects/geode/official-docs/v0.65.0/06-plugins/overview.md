---
title: Plugins Overview
category: plugins
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/domains/loader.py"
  - "core/domains/port.py:18-140"
  - "plugins/__init__.py"
  - "plugins/game_ip/adapter.py:24-100"
external_refs:
  - url: "https://docs.openclaw.ai/plugins/sdk-overview.md"
    pattern: "Plugin SDK 분리 원칙"
---

# Plugins Overview

GEODE 코어는 **도메인-agnostic** 자율 실행 엔진이고, 도메인별 분석 파이프라인은 별도 plugin 패키지로 빠진다. v0.64.0(2026-04-29)에서 `core/domains/game_ip/` 가 `plugins/game_ip/` 로 이전된 게 첫 분리 사례.

## 디렉터리 구조

```
core/                  ← domain-agnostic (223 modules)
  domains/
    loader.py          ← _BUILTIN_DOMAINS registry + dynamic import
    port.py            ← DomainPort Protocol (16-method)
plugins/               ← domain-specific (현재 13 modules)
  __init__.py          ← namespace 설명
  game_ip/             ← Game IP 도메인 plugin (참고 구현)
    adapter.py         ← GameIPDomain class (DomainPort 구현)
    nodes/             ← 파이프라인 노드 (router, signals, analysts, evaluators, scoring, verification, synthesizer)
    prompts/           ← analyst/evaluator system prompts
    config/            ← evaluator_axes.yaml, cause_actions.yaml, scoring_weights.yaml
    fixtures/          ← _golden_set.json, IP fixtures (Berserk, Cowboy Bebop, Ghost in the Shell)
```

## DomainPort Protocol (`core/domains/port.py:18-140`)

16-method Protocol — 새 도메인 plugin을 만들려면 이 모든 메서드 구현 필요.

| 카테고리 | 메서드 | 책임 |
|---|---|---|
| Identity | `name`, `version`, `description` | 도메인 식별 |
| Analyst | `get_analyst_types()`, `get_analyst_specific()` | analyst 종류 + 도메인-특화 prompt |
| Evaluator | `get_evaluator_types()`, `get_evaluator_axes()`, `get_valid_axes_map()` | evaluator + 14축 |
| Scoring | `get_scoring_weights()`, `get_confidence_multiplier_params()`, `get_tier_thresholds()`, `get_tier_fallback()` | 가중치 + tier 임계값 |
| Classification | `get_cause_values()`, `get_action_values()`, `get_cause_to_action()`, `get_cause_descriptions()`, `get_action_descriptions()` | 6 causes → 5 actions |
| Fixtures | `list_fixtures()`, `get_fixture_path()` | 입력 데이터 |

활성 도메인은 ContextVar `_domain_ctx` 에 저장 — `set_domain()` / `get_domain()` / `get_domain_or_none()`.

## 등록 (`core/domains/loader.py`)

```python
_BUILTIN_DOMAINS = {
    "game_ip": "plugins.game_ip.adapter:GameIPDomain",
}

def load_domain_adapter(name: str) -> DomainPort:
    """Dynamic import + 인스턴스화."""
    qualname = _BUILTIN_DOMAINS.get(name) or _RUNTIME_REGISTRY.get(name)
    module_path, class_name = qualname.rsplit(":", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)()

def register_domain(name: str, qualname: str) -> None:
    """런타임에 새 plugin 등록 — 외부 .py 파일에서 활용."""
```

## Game IP plugin (참고 구현)

`plugins/game_ip/adapter.py:24-100` — `GameIPDomain` 클래스. YAML-driven:

```python
class GameIPDomain:
    def __init__(self):
        self._axes = self._load_axes_yaml()           # plugins/game_ip/config/evaluator_axes.yaml
        self._cause_action = self._load_cause_actions_yaml()  # cause_actions.yaml
        self._scoring = self._load_scoring_config()    # scoring_weights.yaml + project override

    def get_analyst_types(self) -> list[str]:
        return ["game_mechanics", "player_experience", "growth_potential", "discovery"]

    def get_evaluator_types(self) -> list[str]:
        return ["quality_judge", "hidden_value", "community_momentum"]

    def get_tier_thresholds(self) -> dict[str, float]:
        return {"S": 80.0, "A": 60.0, "B": 40.0}  # C는 40 미만

    # ... 기타 13 메서드
```

프로젝트 override 우선순위:

```
1. .geode/scoring_weights.yaml          (프로젝트 root)
2. plugins/game_ip/config/scoring_weights.yaml  (plugin default)
```

## 새 plugin 만들기

자세한 절차는 [[building-a-plugin]]. 한 줄 요약:

```
1. plugins/<my_domain>/ 디렉터리 생성
2. plugins/<my_domain>/adapter.py 에 DomainPort 구현 클래스 (16 메서드)
3. plugins/<my_domain>/nodes/ 에 파이프라인 노드 정의
4. plugins/<my_domain>/prompts/ 와 config/ 채우기
5. core/domains/loader.py 의 _BUILTIN_DOMAINS 에 추가
6. CLAUDE.md 의 quality gates: ruff/mypy/pytest 가 plugins/도 검증하도록 이미 설정됨
```

## 다음

- [[domain-port-protocol]] — DomainPort 16-method 상세
- [[building-a-plugin]] — 단계별 가이드
- [[pipeline]] — Game IP 파이프라인
