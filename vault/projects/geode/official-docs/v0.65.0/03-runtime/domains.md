---
title: Domain Plugins
category: runtime
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/domains/loader.py"
  - "core/domains/port.py:18-140"
  - "plugins/"
external_refs:
---

# Domain Plugins

GEODE 코어는 도메인-agnostic 자율 실행 엔진. *도메인별 분석 파이프라인* 은 별도 plugin 패키지로 분리.

## 디렉터리 구조

```
core/                                  # 도메인-agnostic
  domains/
    loader.py                          # _BUILTIN_DOMAINS registry
    port.py                            # DomainPort Protocol
plugins/                               # 도메인별 (v0.64.0+)
  __init__.py                          # namespace 설명
  game_ip/                             # Game IP 도메인 (참고 구현)
    adapter.py                         # GameIPDomain class
    nodes/                             # graph 노드들
    prompts/                           # analyst/evaluator prompts
    config/                            # YAML rubric, weights
    fixtures/                          # IP fixtures + golden_set
```

## 등록 (`core/domains/loader.py`)

```python
_BUILTIN_DOMAINS = {
    "game_ip": "plugins.game_ip.adapter:GameIPDomain",
}

_RUNTIME_REGISTRY: dict[str, str] = {}  # 사용자 register

def load_domain_adapter(name: str) -> DomainPort:
    qualname = _BUILTIN_DOMAINS.get(name) or _RUNTIME_REGISTRY.get(name)
    if not qualname:
        raise KeyError(f"unknown domain: {name}")
    module_path, class_name = qualname.rsplit(":", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)()

def register_domain(name: str, qualname: str) -> None:
    _RUNTIME_REGISTRY[name] = qualname
```

## ContextVar 활성화

```python
from core.domains.port import set_domain, get_domain, get_domain_or_none

domain = load_domain_adapter("game_ip")
set_domain(domain)  # 이후 ContextVar.get()으로 어디서든 접근

# 노드에서:
domain = get_domain()
analyst_types = domain.get_analyst_types()
```

ContextVar 패턴 → thread-local 격리. sub-agent도 자체 도메인 가능.

## 다중 도메인

현재 (v0.65.0): `game_ip` 단일. 미래 (계획):

| 도메인 | 영역 | 상태 |
|---|---|---|
| game_ip | Game IP 분석 | ✓ v0.64.0 |
| research | 학술 논문 분석 | (계획) |
| ops | 운영 인시던트 분석 | (계획) |

각 도메인은 별도 `plugins/<name>/` 디렉터리, 같은 코어 + 다른 분석 파이프라인.

## CHANGELOG (v0.64.0)

> "E — Game IP domain extracted to `plugins/` namespace. `core/domains/game_ip/` → `plugins/game_ip/` (12 modules + 220 files)."

이 분리로:
- 코어 진화와 도메인 진화가 독립 가능
- 새 도메인 추가가 코어 변경 없이 가능 (등록만)
- 외부 별도 repo 분리도 옵션 (현재는 monorepo)

## 다음

- [[overview]] — Plugins 개관
- [[domain-port-protocol]] — 16-method
- [[building-a-plugin]] — 구현 가이드
