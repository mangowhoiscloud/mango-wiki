---
title: CLI Overview
category: harness-cli
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/cli/__init__.py:300-520"
  - "core/cli/commands.py"
  - "core/cli/cmd_lifecycle.py"
external_refs:
---

# CLI Overview

GEODE CLI는 [Typer](https://typer.tiangolo.com/) 기반 dispatcher. 슬래시 명령 + 자연어 입력 두 모드.

## 진입

```bash
geode                  # REPL (자연어 + 슬래시 모두)
geode "..."            # 단발 자연어
geode <subcommand>     # 직접 호출 (analyze, doctor, version 등)
geode /<command>       # 슬래시 명령 직접 (실험적)
```

## 슬래시 명령

`core/cli/__init__.py:300-520` — `resolve_action()` dispatcher 가 case/match로 분기.

| 명령 | 핸들러 | 책임 |
|---|---|---|
| `/login` | `cmd_login()` | 인증 대시보드 + 서브명령 ([[manage-login]]) |
| `/model` | `cmd_model()` | 활성 모델 전환 |
| `/clear` | `cmd_clear()` | 세션 컨텍스트 초기화 |
| `/status` | `show_status()` | daemon + 디스크 사용량 |
| `/stop` | `stop_serve()` | serve daemon 종료 |
| `/clean` | `do_clean()` | 캐시 선택 정리 |
| `/uninstall` | `do_uninstall()` | 전체 제거 |
| `/skills` | `cmd_skills()` | 등록 스킬 목록 |
| `/mcp` | `cmd_mcp()` | MCP 서버 관리 |
| `/task` | `cmd_task()` | 비동기 작업 등록 |
| `/context` | `cmd_context()` | 현재 컨텍스트 검사 |
| `/apply` | `cmd_apply()` | 도구 결과 적용 |
| `/help` | help 출력 | 모든 슬래시 명령 |

## 자연어 입력 → AgenticLoop

```python
# cli/__init__.py main()
if user_input.startswith("/"):
    handle_slash(user_input)
else:
    response = client.send_prompt(user_input)  # serve daemon으로 IPC
```

자연어는 그대로 serve daemon으로 보내고, daemon이 AgenticLoop으로 처리.

## Subcommand vs 슬래시

| | 직접 subcommand | 슬래시 |
|---|---|---|
| `geode analyze "X"` | ✓ | (예약) |
| `geode doctor` | ✓ | (예약) |
| `geode version` | ✓ | (예약) |
| `geode about` | ✓ | (예약) |
| `geode "..."` | (자연어) | 자연어 안에 슬래시 가능 |

REPL 안에서는 슬래시가 주된 명령 방식, subcommand는 직접 호출 시 주.

## 모드 플래그

```bash
geode analyze "X" --dry-run                 # LLM 호출 skip
geode analyze "X" --verbose                 # 노드별 출력
geode analyze "X" --mode=evaluation         # 일부 노드만
```

`mode` 는 PolicyChain의 L3 (Mode-based) 와 연결 — 모드별 도구 allowlist 결정.

## 다음

- [[manage-login]] — `/login` 슬래시 디테일
- [[lifecycle]] — `/stop` `/clean` `/uninstall` `/status`
- [[thin-cli-vs-serve]] — 프로세스 분리
