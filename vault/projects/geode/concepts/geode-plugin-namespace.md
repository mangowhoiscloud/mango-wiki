---
title: GEODE Plugin Namespace (plugins/)
category: concepts
tags: [geode, plugin, plugins, game-ip, domain-extraction, monorepo, namespace, e-cycle]
sources:
  - "geode/plugins/__init__.py"
  - "geode/plugins/game_ip/"
  - "geode/core/domains/loader.py:_DOMAIN_REGISTRY"
  - "geode/CHANGELOG.md (v0.64.0 E)"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE Plugin Namespace

> v0.64.0 (E) — `core/domains/game_ip/` → `plugins/game_ip/`. domain-agnostic core scaffold + domain-specific plugins 분리. monorepo 내 namespace 분리 (option 2). 220 files relocated, 72 import statements rewritten, E2E anchor (Cowboy Bebop A 68.4) 보존.

## 분리 동기

GEODE 가 범용 자율 실행 agent 로 pivot — Game IP 점수 시스템은 한 도메인 사례에 불과. `core/domains/game_ip/` 가 `core/` 에 있으면:
- CLAUDE.md / README 가 `analyze "Cowboy Bebop"` 명령 위주로 보임 → "이 프로젝트는 게임 IP 전용" 오해
- 다른 도메인 (research, ops 등) 추가 시 `core/domains/research/` 도 core 부풀림
- E2E anchor 가 game-IP fixture 에 묶여서 core 회귀 테스트가 도메인 의존

→ 명시적으로 `plugins/` namespace 분리.

## 결정한 옵션 (3 중 옵션 2)

| 옵션 | 내용 | 비용 | 효과 |
|---|---|---|---|
| 1 | 별도 git repo `geode-plugins-game-ip` 만들고 plugin loading API 정형화 | 2-3 사이클, plugin API 디자인 + CI 분리 | 진정한 분리 |
| **2** ✓ | **monorepo 내 `plugins/` 디렉터리 이동** | 1 사이클 (mechanical sed + path 보정) | namespace 분리, plugin loading 점진 도입 |
| 3 | 마킹만 + 기존 위치 유지 | 0 코드 | 의도만 표명, 실효 없음 |

**옵션 2 선택 이유**:
- `core/domains/loader.py` 가 이미 plugin-registry 패턴 (`_DOMAIN_REGISTRY` dict) → plugin loading API 새로 디자인 안 해도 됨
- `git mv` 가 history 보존
- 1 사이클로 끝
- 옵션 1 은 follow-up 으로 보존 — 두 번째 도메인 plugin 또는 외부 publishing 동기 발생 시

## 변경 사항

### 1. 220 files relocate (`git mv`)

```bash
git mv core/domains/game_ip plugins/game_ip
```

→ `core/domains/game_ip/` 삭제 + `plugins/game_ip/` 생성. git history 보존 (rename detection 적용).

12 modules + 220 files (config YAMLs + fixture JSONs + test goldens + sub-packages).

### 2. 72 import statements rewrite

35 caller files + plugin-internal cross-references → mechanical sed:

```bash
sed -i '' 's|core\.domains\.game_ip|plugins.game_ip|g' \
   core/agent/system_prompt.py \
   core/cli/{__init__,batch,commands,ip_names,pipeline_executor,search,tool_handlers}.py \
   core/domains/loader.py \
   core/graph.py \
   core/lifecycle/{adapters,bootstrap}.py \
   core/llm/prompts/axes.py \
   core/mcp/signal_adapter.py \
   core/mcp_server.py \
   core/memory/organization.py \
   core/skills/reports.py \
   core/tools/{analysis,data_tools,signal_tools}.py \
   core/ui/{event_renderer,panels}.py \
   core/verification/calibration.py \
   tests/test_*.py
```

검증: ruff auto-fix + mypy clean + 4360 pytest 통과 (변동 없음).

### 3. 4 hardcoded path references

string 으로 path 박혀있던 곳 보정:

| File | line | 변경 |
|---|---|---|
| `core/llm/prompts/axes.py` | `_YAML_PATH` | `parents[2] / "domains" / "game_ip"` → `parents[3] / "plugins" / "game_ip"` |
| `core/memory/organization.py` | `DEFAULT_FIXTURE_DIR` | `parent.parent / "domains" / "game_ip" / "fixtures"` → `parent.parent.parent / "plugins" / "game_ip" / "fixtures"` |
| `core/verification/calibration.py` | `_GOLDEN_SET_PATH` | 동일 패턴 |
| `tests/test_calibration.py` | `GOLDEN_SET_PATH` | 동일 패턴 |

### 4. `_DOMAIN_REGISTRY` 갱신

```python
# core/domains/loader.py (E 사이클 변경)
_DOMAIN_REGISTRY = {
    "game_ip": "plugins.game_ip.adapter:GameIPDomain",  # 이전: "core.domains.game_ip.adapter:GameIPDomain"
}
```

→ plugin loading API = `load_domain_adapter("game_ip")` 가 새 import path 로 dynamic load.

### 5. `pyproject.toml` 변경

```toml
# Hatchling wheel 이 plugins/ 도 ship
[tool.hatch.build.targets.wheel]
packages = ["core", "plugins"]
```

`pip install geode` 시 `core/` + `plugins/` 양쪽 install.

### 6. `plugins/__init__.py` 신규

namespace doc:
```python
"""GEODE plugin namespace — domain-specific extensions.

Plugins live alongside `core/` rather than under it so the core scaffold
(general-purpose autonomous agent runtime) can evolve independently from
domain-specific code.

Each plugin is registered through `core.domains.loader._DOMAIN_REGISTRY`
which maps a domain name to the importable adapter class.
"""
```

### 7. CLAUDE.md / README quality gate 갱신

| 명령 | 변경 |
|---|---|
| `ruff check core/ tests/` | `ruff check core/ tests/ plugins/` |
| `mypy core/` | `mypy core/ plugins/` |
| Modules 카운트 | 235 → 223 core + 13 plugins = 236 |

## E2E anchor 보존

`uv run geode analyze "Cowboy Bebop" --dry-run` → **A 68.4 unchanged** (변경 전후 동일 점수). 회귀 테스트 통과.

## 옵션 1 (별도 repo) 의 향후 시점

다음 중 하나 발생 시 옵션 1 검토:
- 두 번째 도메인 plugin 추가 (research, ops, ...)
- 외부 publishing 필요 (다른 사용자가 game IP plugin 만 install 가능하게)
- core 의 stable API 정형화 진행

지금은 **YAGNI** — 옵션 2 가 충분.

## 결과 - 4-layer stack 의 도메인 분리

```
geode/
├── core/                    # General-purpose autonomous agent runtime
│   ├── agent/               (AgenticLoop, conversation, tool executor)
│   ├── cli/                 (commands, ipc_client, dispatcher, picker)
│   ├── llm/                 (providers, prompts, agentic_response)
│   ├── domains/loader.py    ← plugin registry
│   └── ... (4-layer stack)
├── plugins/                 # Domain-specific extensions
│   └── game_ip/             # Game IP scoring (220 files)
│       ├── adapter.py       (GameIPDomain class)
│       ├── nodes/           (analyst, evaluator, scoring, signals, synthesizer)
│       ├── config/          (evaluator_axes.yaml, scoring_weights.yaml)
│       ├── fixtures/        (Cowboy Bebop, Berserk, Ghost in the Shell)
│       └── scoring_constants.py
├── experimental/            # Opt-in prototypes (RAPTOR + compression)
│   └── ... ([[geode-experimental-namespace]])
└── tests/                   # Production tests
```

## See also

- [[geode-architecture]] — 4-layer stack (도메인 layer 가 plugins/ 로 이동)
- [[geode-domain-plugin]] — DomainPort Protocol (loader 가 사용)
- [[geode-llm-models]] — `core.llm` 은 도메인-agnostic
- [[geode-experimental-namespace]] — sister directory (`experimental/`)
- [[geode-quality-evaluation]] — `plugins/game_ip/` 의 5-layer verification
- [[index]]
