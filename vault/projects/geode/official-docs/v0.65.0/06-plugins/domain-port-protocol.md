---
title: DomainPort Protocol
category: plugins
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/domains/port.py:18-140"
external_refs:
---

# DomainPort Protocol

`core/domains/port.py:18-140` — 16-method `Protocol` 클래스. 도메인 plugin이 GEODE 코어에 자신을 노출하는 인터페이스.

## 16 메서드

### Identity

```python
@property
def name(self) -> str: ...           # "game_ip"
@property
def version(self) -> str: ...        # "1.0.0"
@property
def description(self) -> str: ...
```

### Analyst Configuration

```python
def get_analyst_types(self) -> list[str]: ...
    # ["game_mechanics", "player_experience", "growth_potential", "discovery"]

def get_analyst_specific(self, analyst_type: str) -> dict: ...
    # {"system_prompt": "...", "user_template": "...", "axes_focus": [...]}
```

### Evaluator Configuration

```python
def get_evaluator_types(self) -> list[str]: ...
    # ["quality_judge", "hidden_value", "community_momentum"]

def get_evaluator_axes(self, evaluator_type: str) -> list[str]: ...
    # 14 축 중 evaluator가 평가하는 부분집합

def get_valid_axes_map(self) -> dict[str, list[str]]: ...
    # {"quality_judge": [...], ...}
```

### Scoring

```python
def get_scoring_weights(self) -> dict[str, float]: ...
    # {"exposure_lift": 0.25, "quality": 0.20, "recovery": 0.18, ...}

def get_confidence_multiplier_params(self) -> dict: ...

def get_tier_thresholds(self) -> dict[str, float]: ...
    # {"S": 80.0, "A": 60.0, "B": 40.0}

def get_tier_fallback(self, score: float) -> str: ...
    # 임계값 매칭 안 될 때 fallback ("C")
```

### Cause-Action Classification

```python
def get_cause_values(self) -> list[str]: ...
    # ["timing_mismatch", "undermarketed", "conversion_failure",
    #  "discovery_failure", "saturation", "demographic_misfit"]

def get_action_values(self) -> list[str]: ...
    # ["Marketing Boost", "Repositioning", "Niche Targeting",
    #  "Wait for Cycle", "Sunset"]

def get_cause_to_action(self) -> dict[str, str]: ...

def get_cause_descriptions(self) -> dict[str, str]: ...
def get_action_descriptions(self) -> dict[str, str]: ...
```

### Fixtures

```python
def list_fixtures(self) -> list[str]: ...
    # ["berserk", "cowboy_bebop", "ghost_in_the_shell"]

def get_fixture_path(self, name: str) -> Path: ...
```

## ContextVar 주입

```python
from core.domains.port import set_domain, get_domain, get_domain_or_none

set_domain(GameIPDomain())   # 활성 도메인 설정
domain = get_domain()         # ContextVar 조회 (없으면 LookupError)
domain = get_domain_or_none() # None 허용
```

ContextVar 패턴 — thread-local 격리. 여러 도메인 동시 활성 시 sub-agent 컨텍스트마다 다른 도메인 가능.

## 등록 흐름

```python
# 1. Plugin 코드 작성
# plugins/<my_domain>/adapter.py
class MyDomain:  # DomainPort Protocol satisfied (runtime_checkable)
    def get_analyst_types(self) -> list[str]:
        return [...]
    # ... 15 more

# 2. 빌트인 등록
# core/domains/loader.py
_BUILTIN_DOMAINS = {
    "game_ip": "plugins.game_ip.adapter:GameIPDomain",
    "my_domain": "plugins.my_domain.adapter:MyDomain",   # 추가
}

# 또는 런타임 등록
register_domain("my_domain", "plugins.my_domain.adapter:MyDomain")

# 3. 활성화
domain = load_domain_adapter("my_domain")
set_domain(domain)
```

## 다음

- [[overview]] — Plugins 전반
- [[building-a-plugin]] — 단계별 가이드
- [[pipeline]] — Game IP 참고 구현
