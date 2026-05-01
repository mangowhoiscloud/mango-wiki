---
title: GEODE Lifecycle Commands (/stop, /clean, /uninstall, /status)
category: concepts
tags: [geode, cli, lifecycle, daemon, slash-commands, hermes-precedent, cleanup, uninstall]
sources:
  - "geode/core/cli/cmd_lifecycle.py"
  - "geode/core/cli/__init__.py:295-501"
  - "geode/core/paths.py"
  - "geode/CHANGELOG.md (v0.63.0 D-1)"
  - "hermes-agent/hermes_cli/main.py:cmd_status,cmd_uninstall"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE Lifecycle Commands

> v0.63.0 (D-1) — Hermes-precedent daemon 제어 + 캐시 정리 + 시스템 제거. `/stop`, `/clean`, `/uninstall` 신규 + `/status` 확장. `core/paths.py` 에 9개 path 상수 추가하여 단일 SOT.

## 4 슬래시 명령 매트릭스

| 명령 | 동작 | 플래그 | 비고 |
|---|---|---|---|
| `/stop` | serve daemon SIGTERM (graceful shutdown) | `--force` (SIGKILL) | child PID 자동 정리 + stale artifact 제거 |
| `/clean` | 캐시 정리 | `--scope=all\|project\|global\|build`, `--all-data`, `--force`, `--dry-run`, `--older-than=N` | tier 별 필터링 |
| `/uninstall` | `~/.geode/` 전체 제거 | `--force`, `--dry-run`, `--keep-config`, `--keep-data` | partial 제거 옵션 |
| `/status` (확장) | 모델 + MCP 상태 + **daemon PID + 디렉터리별 disk usage** | `--json` | 기존 `/status` + `cmd_lifecycle.show_status()` |

## Hermes precedent

`hermes_cli/main.py:cmd_status` (line 4144), `cmd_uninstall` (line 4252), `_clear_bytecode_cache` (line 4260) — 같은 패턴. agent CLI 가 가져야 할 primary command surface.

→ Hermes 가 했으니 GEODE 도 해야 한다는 식이 아니라, **운영 중 발견된 페인 포인트** (예: serve daemon kill 못함, `~/.geode/` 디스크 차서 어떤 dir 가 큰지 모름) 를 Hermes 가 같은 식으로 해결한 게 검증 증거.

## 9 path 상수 (core/paths.py)

이전엔 `core/cli/ipc_client.py`, `core/server/ipc_server/poller.py`, `core/mcp/registry.py` 등에 같은 path 가 중복 정의 (예: `Path.home() / ".geode" / "cli.sock"` 가 두 군데).

v0.63.0 에서 단일 SOT 로 통합:

```python
# core/paths.py (v0.63.0 신규)
CLI_SOCKET_PATH      = Path.home() / ".geode" / "cli.sock"
CLI_STARTUP_LOCK     = Path.home() / ".geode" / "cli.startup.lock"
SERVE_LOG_PATH       = Path.home() / ".geode" / "serve.log"
GLOBAL_JOURNAL_DIR   = Path.home() / ".geode" / "journal"
GLOBAL_WORKERS_DIR   = Path.home() / ".geode" / "workers"
MCP_REGISTRY_CACHE   = Path.home() / ".geode" / "mcp-registry-cache.json"
APPROVE_HISTORY      = Path.home() / ".geode" / "approve-history.json"
PROJECT_EMBEDDING_CACHE = Path(".geode") / "embedding-cache"
PROJECT_TOOL_OFFLOAD    = Path(".geode") / "tool-offload"
PROJECT_VECTORS_DIR     = Path(".geode") / "vectors"
```

기존 duplicates (`ipc_client.py` 등) 의 dedup 은 follow-up refactor. 값이 같으니 동작에 영향 없음.

## /clean 의 tier 분리

|Scope | 포함 디렉터리 | 비고 |
|---|---|---|
| `all` | global + project | 디폴트 |
| `project` | `.geode/embedding-cache/`, `.geode/tool-offload/`, `.geode/vectors/`, `.geode/result-cache/`, `.geode/scheduler-logs/` | per-project |
| `global` | `~/.geode/runs/`, `~/.geode/journal/`, `~/.geode/projects/`, `~/.geode/scheduler/`, `~/.geode/usage/`, `~/.geode/workers/` + 단일 파일 (mcp-registry-cache.json, approve-history.json, serve.log) | per-user |
| `build` | wheel/dist/.pytest_cache/.mypy_cache | dev 산출물 |

`--all-data` 가 추가되면 above 모두 + `~/.geode/vault/`, `~/.geode/identity/`, `~/.geode/user_profile/`, `~/.geode/models/` 까지 (위험 — 디폴트 제외).

## /uninstall partial 옵션

| 플래그 | 보존 | 제거 |
|---|---|---|
| (none) | (없음) | `~/.geode/` 전체 |
| `--keep-config` | `~/.geode/config.toml`, `~/.geode/.env` | 나머지 |
| `--keep-data` | `~/.geode/vault/`, `~/.geode/user_profile/` | 나머지 |
| `--keep-config --keep-data` | 위 둘 다 | 나머지 |

`--dry-run` 으로 실제 제거 전 preview 가능.

## 30 invariants (test_lifecycle_commands.py)

테스트 파일이 untracked 로 main 에 있던 걸 v0.63.0 에서 wire 시 import 경로 1개 (`core.cli.ui.console` → `core.ui.console`) 만 수정 → 30/30 통과.

테스트 분류:
- `stop_serve` — not running / running-then-killed / force / timeout (4)
- `show_status` — daemon report / disk usage / JSON output (3)
- `do_clean` — per-scope filtering / dry-run / force / older-than (8)
- `do_uninstall` — full / keep-config / keep-data / dry-run preview (5)
- `_format_size` / `_scan_directory` / `_scan_file` / `_clean_stale_artifacts` 등 helper (10)

## See also

- [[geode-architecture]] — 4-layer stack (lifecycle 도 같은 layer)
- [[geode-development-workflow]] — 개발 워크플로우 (`/stop` + `/clean` 활용)
- [[geode-experimental-namespace]] — `experimental/` parking lot (D-3, 같은 사이클)
- [[geode-plugin-namespace]] — `plugins/` 분리 (E, 다음 사이클)
- [[index]]
