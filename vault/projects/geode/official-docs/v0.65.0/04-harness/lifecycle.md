---
title: Lifecycle Commands
category: harness
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/cli/cmd_lifecycle.py:191-628"
  - "core/paths.py:27-82"
external_refs:
  - url: "https://hermes-agent.nousresearch.com/docs/"
    pattern: "stop / status precedent"
---

# Lifecycle Commands

GEODE serve daemon + 캐시 + 전체 시스템을 안전하게 정리하는 4 슬래시 명령. v0.63.0(2026-04-29) 도입.

## /stop — Serve daemon 종료

`core/cli/cmd_lifecycle.py:191-275` — `stop_serve()`:

```bash
geode /stop                    # SIGTERM (graceful)
geode /stop --force            # SIGKILL (즉시)
```

흐름:
1. `~/.geode/serve.pid` 또는 `pgrep "geode serve"` 로 PID 확인
2. SIGTERM → 30s timeout 대기
3. timeout 도달 → `--force` 였다면 SIGKILL, 아니면 에러 보고

## /status — Daemon + 디스크 사용량

`cmd_lifecycle.py:295-359` — `show_status()`:

| 정보 | 출처 |
|---|---|
| serve daemon PID + uptime | `~/.geode/serve.pid` + ps |
| 활성 모델 | `geode about` |
| 등록 profile 수 | ProfileStore |
| Memory 사용량 (Org / Project / Vault) | 디렉터리 du |
| 캐시 사용량 (build / journal / mcp / embedding) | 각 캐시 dir du |

JSON 출력 옵션 (`--json`).

## /clean — 선택적 캐시 정리

`cmd_lifecycle.py:447-627` — `do_clean()`:

```bash
geode /clean --scope=build     # build 캐시만 (.uv/, .ruff_cache, .pytest_cache)
geode /clean --scope=project   # 프로젝트 .geode/* (PROJECT.md 보존)
geode /clean --scope=global    # ~/.geode/* (auth.toml 보존)
geode /clean --scope=all       # 모두 (기본)
geode /clean --all-data        # PROJECT.md, auth.toml 까지 (위험)
geode /clean --dry-run         # 계획만 표시
geode /clean --older-than=30d  # 30일 이상 된 파일만
```

## /uninstall — 전체 제거

`cmd_lifecycle.py:628+` — `do_uninstall()`:

```bash
geode /uninstall                  # ~/.geode/ 전체 삭제 (확인 prompt)
geode /uninstall --keep-config    # config.toml 보존
geode /uninstall --keep-data      # vault, journal 보존
geode /uninstall --dry-run        # 삭제 대상만 표시
```

GEODE CLI 자체는 삭제 안 함 (uv tool 영역). 사용자가 직접 `uv tool uninstall geode`.

## 9 Path 상수 (`core/paths.py:27-82`)

v0.63.0에서 흩어진 경로 상수를 통합:

```python
GEODE_HOME              = Path.home() / ".geode"
GLOBAL_CONFIG_TOML      = GEODE_HOME / "config.toml"
GLOBAL_ENV_FILE         = GEODE_HOME / ".env"
GLOBAL_VAULT_DIR        = GEODE_HOME / "vault"
GLOBAL_MODELS_DIR       = GEODE_HOME / "models"
GLOBAL_RUNS_DIR         = GEODE_HOME / "runs"
GLOBAL_SCHEDULER_DIR    = GEODE_HOME / "scheduler"
GLOBAL_PROJECTS_DIR     = GEODE_HOME / "projects"
PROJECT_GEODE_DIR       = Path.cwd() / ".geode"
```

추가 9개 (CLI_SOCKET_PATH, CLI_STARTUP_LOCK, SERVE_LOG_PATH, GLOBAL_JOURNAL_DIR, GLOBAL_WORKERS_DIR, MCP_REGISTRY_CACHE, APPROVE_HISTORY, PROJECT_EMBEDDING_CACHE, PROJECT_TOOL_OFFLOAD, PROJECT_VECTORS_DIR) — 일부 중복 정의는 향후 dedup.

## 테스트

`tests/test_lifecycle_commands.py` — 30 invariants. stop_serve(running/not-running/force/timeout), show_status(daemon report, disk scan, JSON), do_clean(scope filtering, dry-run), do_uninstall(full/keep-config/keep-data/dry-run).

## 다음

- [[cli/overview]] — CLI dispatcher
- [[manage-login]] — /login slash 명령
- [[debugging]] — Operations
