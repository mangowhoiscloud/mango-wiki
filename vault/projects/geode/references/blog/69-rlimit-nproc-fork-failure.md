---
title: "RLIMIT_NPROC와 fork() 실패 — macOS에서 에이전트 샌드박스의 함정"
type: reference
category: blog-post
tags: [blog, orchestration]
source: "blog/posts/orchestration/69-rlimit-nproc-fork-failure.md"
created: 2026-04-08T00:00:00Z
---

# RLIMIT_NPROC와 fork() 실패 — macOS에서 에이전트 샌드박스의 함정

> Date: 2026-03-29 | Author: rooftopsnow | Tags: rlimit, nproc, fork, macos, sandbox, bash-tool, subprocess

---

## 목차

1. 증상
2. 진단
3. 근본 원인: macOS의 RLIMIT_NPROC 의미
4. 수정
5. 마무리

---

## 1. 증상

GEODE REPL에서 `run_bash` 도구를 호출하면 **exit code 128**이 반환되었습니다.

```
▸ run_bash(command="top -l 1 -n 0 | head -12")
✓ run_bash → 128
```

LLM은 "fork() 실패로 새 프로세스를 생성할 수 없다"고 판단했습니다. 반복 호출해도 동일한 결과였습니다.

---

## 2. 진단

exit code 128은 Unix에서 **signal에 의한 종료**(128 + signal number)를 의미합니다. 하지만 이 경우는 signal이 아니라 `fork()` 시스템콜 자체가 실패한 것이었습니다.

시스템 상태를 확인했습니다.

```bash
$ python3 -c "import resource; print(resource.getrlimit(resource.RLIMIT_NPROC))"
(2666, 4000)

$ ps -u mango | wc -l
373
```

시스템 기본 NPROC 한도 2666에 비해 현재 프로세스 373개 — 여유가 충분합니다. 그런데 왜 fork가 실패하는가?

---

## 3. 근본 원인: macOS의 RLIMIT_NPROC 의미

GEODE의 `BashTool`은 보안 샌드박스 목적으로 `preexec_fn`에서 리소스 제한을 설정합니다.

```python
# core/cli/bash_tool.py (수정 전)
_BASH_NPROC_LIMIT = 64

def _set_resource_limits() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (_BASH_CPU_LIMIT_S, _BASH_CPU_LIMIT_S))
    resource.setrlimit(resource.RLIMIT_FSIZE, (_BASH_FSIZE_LIMIT_B, _BASH_FSIZE_LIMIT_B))
    with contextlib.suppress(ValueError, OSError):
        resource.setrlimit(resource.RLIMIT_NPROC, (_BASH_NPROC_LIMIT, _BASH_NPROC_LIMIT))
```

`preexec_fn`은 `subprocess.Popen`이 fork 후, exec 전에 **자식 프로세스 안에서** 호출합니다. 의도는 "자식이 만들 수 있는 프로세스를 64개로 제한"하는 것이었습니다.

### Linux vs macOS

| OS | `RLIMIT_NPROC` 의미 |
|----|--------------------|
| **Linux** | 해당 UID의 **전체** 프로세스 수 제한. 하지만 `setrlimit`은 호출한 프로세스와 그 자식에만 적용 |
| **macOS** | 해당 UID의 **전체** 프로세스 수 제한. `setrlimit` 호출 즉시 시스템 전역으로 적용 |

macOS에서 `setrlimit(RLIMIT_NPROC, (64, 64))`를 호출하면, 해당 사용자의 **모든 프로세스 합계**가 64로 제한됩니다. 이미 373개 프로세스가 실행 중이므로 64를 초과 — fork 자체가 불가능해집니다.

### 왜 `suppress`로 안전하다고 생각했나

```python
with contextlib.suppress(ValueError, OSError):
    resource.setrlimit(resource.RLIMIT_NPROC, ...)
```

> macOS에서 `RLIMIT_NPROC`가 지원되지 않을 수 있어서 `suppress`로 감싼 것이었습니다. 하지만 macOS는 `RLIMIT_NPROC`를 **지원합니다** — 단지 의미가 다를 뿐입니다. `setrlimit` 호출은 성공하고, 이후 모든 fork가 실패합니다.

### 시간적 조건

이 버그가 항상 발생하지 않았던 이유: MCP 서버가 적을 때(프로세스 < 64)는 문제없이 동작합니다. GEODE에 MCP 서버가 13개로 늘어나고(`config.toml`), `geode serve` + REPL + npm exec 부모 프로세스까지 합산하면 64를 쉽게 초과합니다. 여기에 좀비 MCP 누적까지 더해지면 즉시 발현됩니다.

```
geode serve      1
REPL             1
MCP 서버        13 x 2 (serve + REPL) = 26
npm exec 부모   13 x 2 = 26
linkedin(uvx)    2
기타 시스템     ~50
---
합계            ~106  >> 64
```

---

## 4. 수정

`RLIMIT_NPROC` 설정을 완전히 제거했습니다. CPU와 FSIZE 제한은 유지합니다.

```python
# core/cli/bash_tool.py (수정 후)
def _set_resource_limits() -> None:
    """preexec_fn for subprocess: apply hard resource limits.

    Note: RLIMIT_NPROC is intentionally NOT set. On macOS it caps the
    user's *total* process count (not per-subprocess), causing fork()
    failures when many MCP/serve processes are running.
    """
    resource.setrlimit(resource.RLIMIT_CPU, (_BASH_CPU_LIMIT_S, _BASH_CPU_LIMIT_S))
    resource.setrlimit(resource.RLIMIT_FSIZE, (_BASH_FSIZE_LIMIT_B, _BASH_FSIZE_LIMIT_B))
```

> fork bomb 방지는 `RLIMIT_NPROC`가 아니라 `_BLOCKED_PATTERNS`의 정규식 매칭과 HITL 승인 게이트로 이미 보호되고 있습니다. `RLIMIT_NPROC`는 방어 중복이었고, macOS에서는 오히려 해를 끼쳤습니다.

---

## 5. 마무리

### 핵심 정리

| 항목 | 값 |
|------|---|
| 증상 | `run_bash` exit code 128 (fork 실패) |
| 근본 원인 | `RLIMIT_NPROC=64`가 macOS에서 사용자 전체 프로세스 한도로 작용 |
| 트리거 조건 | MCP 서버 13개 x 2세트 + npm exec + 좀비 = 64 초과 |
| 수정 | `RLIMIT_NPROC` 설정 제거, CPU/FSIZE 유지 |
| 검증 | 3310 tests passed |

### 교훈

| 교훈 | 설명 |
|------|------|
| **플랫폼 의미 차이** | 동일 API(`setrlimit`)가 OS마다 다른 scope로 적용된다 |
| **suppress는 안전하지 않다** | 예외를 삼키면 "실패해도 괜찮다"가 아니라 "성공했지만 의도와 다르다"를 놓친다 |
| **방어 중복의 위험** | 이미 정규식+HITL로 보호되는데 NPROC을 추가하면, 없는 것보다 못한 결과가 된다 |
| **프로세스 수 가정 금지** | 에이전트 시스템은 MCP, 서브에이전트, 스케줄러로 프로세스가 동적으로 증가한다. 고정 한도는 위험하다 |

---

*Source: `blog/posts/orchestration/69-rlimit-nproc-fork-failure.md` | Category: [[blog-orchestration]]*

## Related

- [[blog-orchestration]]
- [[blog-hub]]
- [[geode]]
