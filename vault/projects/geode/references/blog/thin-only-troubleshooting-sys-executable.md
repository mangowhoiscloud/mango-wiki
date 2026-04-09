---
title: "Thin-Only 트러블슈팅 — sys.executable 불일치 + serve-side UI 누출"
type: reference
category: blog-post
tags: [blog, technical]
source: "blog/posts/technical/thin-only-troubleshooting-sys-executable.md"
created: 2026-04-08T00:00:00Z
---

# Thin-Only 트러블슈팅 — sys.executable 불일치 + serve-side UI 누출

> Date: 2026-03-30 | Tags: troubleshooting, thin-client, ipc, subprocess, python

## 증상

```
$ geode
  Failed to start geode serve
  Try manually: geode serve &
```

`geode serve`를 직접 실행하면 정상 동작하지만, `geode` (thin client)에서 자동 시작이 실패.

추가로, `geode serve`를 수동 실행한 후 thin client로 대화하면 **AgenticLoop UI가 serve 터미널에 출력**되는 문제 발생.

## 원인 1: sys.executable 불일치

### 코드

```python
# core/cli/ipc_client.py — start_serve_if_needed()
subprocess.Popen(
    [sys.executable, "-m", "geode.cli", "serve"],
    ...
)
```

### 문제

`uv tool install -e .`로 설치하면 geode CLI는 **python3.12** 환경에 설치됨. 하지만 시스템의 `sys.executable`은 **python3.14**를 가리킴.

```
$ python3 -c "import sys; print(sys.executable)"
/opt/homebrew/opt/python@3.14/bin/python3.14

$ which geode
/Users/mango/.local/bin/geode  # python3.12 venv
```

`python3.14 -m geode.cli serve` → `ModuleNotFoundError` (geode는 3.12에만 설치).

### 수정

```python
import shutil

geode_bin = shutil.which("geode")
cmd = [geode_bin, "serve"] if geode_bin else [sys.executable, "-m", "geode.cli", "serve"]
subprocess.Popen(cmd, ...)
```

`shutil.which("geode")`로 실제 설치된 CLI 바이너리를 직접 사용. `sys.executable` fallback은 개발 환경용.

### 동일 패턴이 있는 다른 코드

```python
# core/orchestration/isolated_execution.py:421
proc = subprocess.Popen(
    [sys.executable, "-m", "core.agent.worker"],
    ...
)
```

이건 worker process spawn. `geode serve` 내부에서 호출되므로 serve 프로세스의 `sys.executable`이 올바른 Python을 가리킴 → 현재는 문제 없음. 하지만 향후 동일 이슈 가능성 있음.

## 원인 2: IPC 모드 quiet=False

### 코드

```python
# core/gateway/shared_services.py
SessionMode.IPC: {
    "hitl_level": 0,
    "quiet": False,  # ← 문제
    ...
}
```

### 문제

`quiet=False` → AgenticLoop가 Rich console로 도구 호출, 결과, 상태 등을 stdout에 출력. IPC 모드는 **serve 프로세스** 안에서 실행되므로, 이 출력이 serve 터미널에 나타남.

thin client는 IPC JSON으로 최종 결과만 받아서 자체 렌더링하므로, serve-side 출력은 불필요하고 혼란만 유발.

### 수정

```python
SessionMode.IPC: {
    "hitl_level": 0,
    "quiet": True,  # serve-side UI 억제; 결과는 IPC JSON으로 전달
    ...
}
```

## 교훈

1. **`sys.executable` ≠ 앱이 설치된 Python**. `uv tool install`은 독립 venv에 설치하므로 시스템 Python과 다를 수 있다. subprocess로 자기 자신을 spawn할 때는 `shutil.which()`로 실제 바이너리를 찾아야 한다.

2. **"quiet" 설정은 실행 위치가 결정한다**. REPL(터미널에서 직접) → quiet=False. IPC(serve 프로세스 안에서) → quiet=True. 모드의 이름이 아니라 **stdout을 누가 보는가**가 기준.

3. **serve 자동 시작은 반드시 E2E 테스트**. subprocess spawn + socket probe + timeout 체인은 환경별로 다르게 실패할 수 있다.

---

*Source: `blog/posts/technical/thin-only-troubleshooting-sys-executable.md` | Category: [[blog-technical]]*

## Related

- [[blog-technical]]
- [[blog-hub]]
- [[geode]]
