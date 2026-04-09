---
title: "Thread-Local Console Isolation — 멀티 세션 에이전트 데몬의 출력 오염 방지"
type: reference
category: blog-post
tags: [blog, safety-verification]
source: "blog/posts/safety-verification/58-thread-local-console-isolation.md"
created: 2026-04-08T00:00:00Z
---

# Thread-Local Console Isolation — 멀티 세션 에이전트 데몬의 출력 오염 방지

> Date: 2026-04-05 | Author: geode-team | Tags: [session-isolation, thread-safety, console, race-condition, daemon, ipc, frontier-research, distributed-systems]

## 목차

1. [도입 — 분산 스토리지에서 만난 문제가 에이전트 데몬에서 재현되다](#1-도입--분산-스토리지에서-만난-문제가-에이전트-데몬에서-재현되다)
2. [근본 원인 분석 — 글로벌 Console Race Condition](#2-근본-원인-분석--글로벌-console-race-condition)
3. [3개 취약점 전체 맵](#3-3개-취약점-전체-맵)
4. [Frontier Research — Claude Code는 어떻게 하는가](#4-frontier-research--claude-code는-어떻게-하는가)
5. [설계 결정 — Thread-Local Console Proxy](#5-설계-결정--thread-local-console-proxy)
6. [구현 — 3개 파일, 최소 변경](#6-구현--3개-파일-최소-변경)
7. [검증 — 스레드 격리 증명](#7-검증--스레드-격리-증명)
8. [설계 트레이드오프](#8-설계-트레이드오프)
9. [정리](#9-정리)

---

## 1. 도입 — 분산 스토리지에서 만난 문제가 에이전트 데몬에서 재현되다

분산 오브젝트 스토리지를 개발하면서 가장 자주 마주치는 버그 클래스가 있습니다. **공유 가변 상태에 대한 비원자적 접근**입니다. PB급 스토리지 클러스터에서 `SEGMENT_LOCK`의 `down_write`를 `down_read`로 전환하여 읽기 병렬성을 확보하는 작업, Eventual Consistency 환경에서 캐시 정합성을 검증하는 작업 — 모두 "누가 어떤 경로로 어떤 상태를 보는가"라는 동일한 문제로 귀결됩니다.

이 문제가 전혀 다른 도메인에서 재현되었습니다. LangGraph 기반 자율 에이전트 시스템 GEODE를 직접 설계하고 구현하면서, 분산 스토리지의 격리 문제가 멀티 세션 에이전트 데몬에서 그대로 나타난 것입니다.

GEODE는 Claude Code를 외부 Scaffold(스캐폴드)로 활용하면서 동시에 내부적으로는 LangGraph StateGraph 기반의 long-running autonomous agent를 구현한 시스템입니다. 56개 도구, 48개 Hook 이벤트, 3-provider LLM fallback chain, Domain Plugin을 통한 분석 파이프라인, 그리고 Eval Pipeline과 5-Gate Quality Scorecard까지 — 에이전틱 시스템의 전체 스택을 직접 구축해왔습니다. 이 과정에서 Frontier 에이전트 하네스(Claude Code, Codex CLI, OpenClaw, autoresearch)의 코드베이스를 지속적으로 리서치하며 설계 결정의 근거로 삼고 있습니다. 이번 포스트는 그 리서치가 실전 버그 수정에 직접 기여한 사례입니다.

### 아키텍처 배경

GEODE의 Thin-Only 아키텍처에서는 모든 CLI 클라이언트가 `geode serve` 데몬에 Unix 소켓으로 접속합니다. 데몬은 접속당 하나의 스레드를 할당하고, 각 스레드에서 `AgenticLoop`를 실행합니다.

```
geode (thin CLI A) ──── Unix socket ────┐
                                        ├── geode serve (단일 프로세스)
geode (thin CLI B) ──── Unix socket ────┘     ├── Thread A: AgenticLoop → console.print() → ???
                                              └── Thread B: AgenticLoop → console.print() → ???
```

분산 스토리지의 멀티 클라이언트 접속 구조와 동형(isomorphic)입니다. 스토리지 데몬이 여러 클라이언트의 I/O 요청을 동시에 처리하면서 세그먼트 잠금으로 데이터 정합성을 보장하듯, 에이전트 데몬도 여러 세션의 출력 경로를 격리해야 합니다.

문제는 여기서 발생합니다. 두 클라이언트가 동시에 접속한 상태에서, **Session A의 도구 호출 결과가 Session B의 터미널에 출력**되는 현상이 관측되었습니다. Resume 작업의 출력이 전혀 관련 없는 리서치 세션으로 흘러들어오는 것이 직접 확인된 P0 버그입니다. 분산 스토리지로 비유하면 Client A의 read response가 Client B의 소켓으로 전달된 것과 같습니다.

[PolicyChain 6-Layer 포스트](57-policychain-6layer-access-control.md)에서 도구 **실행 권한**의 격리를 다뤘다면, 이번 포스트에서는 도구 **출력 경로**의 격리를 다룹니다.

---

## 2. 근본 원인 분석 — 글로벌 Console Race Condition

### 발견 경위

`redirect_console()` 함수는 IPC 세션이 시작될 때 Rich Console의 출력 대상을 `_StreamingWriter`(클라이언트 소켓으로 쓰는 어댑터)로 교체합니다. 문제는 이 교체가 **프로세스 전역 객체의 직접 변이(mutation)**라는 것입니다.

```python
# core/cli/ui/console.py (수정 전)
console = Console(theme=GEODE_THEME, width=_get_terminal_width())  # 프로세스 전역 싱글턴

@contextmanager
def redirect_console(target):
    old_file = console._file          # 현재 _file 백업
    console._file = target            # 글로벌 객체 직접 변이
    try:
        yield
    finally:
        console._file = old_file      # 복원
```

> 핵심: `console._file = target`은 프로세스 내 모든 스레드가 공유하는 단일 객체를 변이시킵니다. 두 스레드가 동시에 이 코드를 실행하면, 한쪽의 `old_file` 백업이 이미 다른 쪽의 writer로 오염된 상태가 됩니다. 분산 스토리지에서 락 없이 공유 버퍼의 포인터를 교체하는 것과 동일한 패턴입니다.

### Race Condition 시나리오

```
t=0  Thread A: old_file_A = console._file       → stdout (정상)
t=1  Thread A: console._file = writer_A         → Session A의 소켓
t=2  Thread B: old_file_B = console._file       → writer_A (이미 오염!)
t=3  Thread B: console._file = writer_B         → Session B의 소켓
     --- 이 시점에서 Thread A의 모든 출력이 Session B로 라우팅됨 ---
t=4  Thread A: console._file = old_file_A       → stdout (A 복원)
t=5  Thread B: console._file = old_file_B       → writer_A (B가 A의 소켓으로 복원!)
```

t=3 이후 Thread A의 `console.print()` 호출은 `writer_B`를 통해 Session B의 클라이언트 소켓으로 전송됩니다. t=5에서는 Thread B가 종료 시 `writer_A`로 "복원"하므로, 다음 요청의 출력이 이미 끊어진 Session A의 소켓으로 향합니다.

---

## 3. 3개 취약점 전체 맵

조사 결과 동일한 패턴의 취약점이 3곳에서 발견되었습니다.

| 심각도 | 위치 | 공유 자원 | 영향 |
|:------:|------|----------|------|
| **CRITICAL** | `console.py:75` — `console = Console(...)` | Rich Console `_file` 속성 | 출력이 다른 세션의 소켓으로 라우팅 |
| **HIGH** | `agentic_ui.py:104` — `_session_meter` | 모듈 레벨 싱글턴 | 모델명, 경과시간, 토큰 카운트 오염 |
| **MEDIUM** | `sub_agent.py:47` — `_announce_queue` | 모듈 레벨 dict | 세션 크래시 시 orphan 결과 5분간 잔류 |

세 취약점 모두 같은 근본 패턴입니다: **모듈 레벨 가변 상태를 다중 스레드가 공유합니다.** 단일 프로세스/단일 세션 시절에는 문제가 없었지만, Thin-Only 아키텍처로 전환하면서 단일 데몬이 다중 IPC 세션을 동시에 처리하게 되자 발현된 것입니다. 분산 스토리지에서 단일 노드를 멀티 테넌트로 전환할 때 발생하는 전형적인 격리 실패와 같은 구조입니다.

---

## 4. Frontier Research — Claude Code는 어떻게 하는가

수정에 앞서 Claude Code 코드베이스를 직접 조사하여 동일한 문제를 어떻게 처리하는지 확인했습니다. GEODE 개발 과정에서는 Frontier 에이전트 하네스 4종(Claude Code, Codex CLI, OpenClaw, autoresearch)의 코드를 지속적으로 리서치하여 설계 결정의 근거로 삼고 있습니다. 이번에는 Claude Code의 세션 격리 아키텍처를 집중 분석했습니다.

### Claude Code의 아키텍처

```
Claude Code CLI (Process A) ────── 독립 프로세스
Claude Code CLI (Process B) ────── 독립 프로세스
Claude Code --bg   (Process C) ── tmux 세션 내 독립 프로세스
```

Claude Code는 **프로세스-per-세션 모델**입니다. 각 CLI 인스턴스가 별도 프로세스로 실행되며, 세션 간 메모리 공유가 원천적으로 불가합니다.

### Claude Code에도 동일한 취약점이 존재한다

흥미롭게도, Claude Code의 `ink.tsx`에서도 글로벌 `console` 객체를 패치합니다:

```typescript
// ink/ink.tsx:1571-1589
patchConsole(): () => void {
    const con = console;             // 글로벌 console 참조
    for (const m of CONSOLE_STDOUT_METHODS) {
        con[m] = toDebug;            // 글로벌 객체 직접 변이
    }
    return () => Object.assign(con, originals);
}
```

> Claude Code도 GEODE와 동일한 글로벌 mutation 패턴을 사용합니다. 차이점은 프로세스 격리가 이 문제를 **자연스럽게 회피**한다는 것입니다. 같은 프로세스에서 두 Ink 인스턴스가 실행되면 동일한 race condition이 발생합니다.

또한 `bootstrap/state.ts`의 글로벌 `STATE` 싱글턴(`costCounter`, `tokenCounter`, `sessionCounter` 등)도 프로세스 내에서는 격리되지 않습니다. `switchSession()` 함수가 이 상태를 원자적으로 교체하지만, 이는 동시 실행이 아닌 순차적 세션 전환만 가정합니다.

### GEODE vs Claude Code 비교

| 측면 | Claude Code | GEODE |
|------|-------------|-------|
| 세션 모델 | 프로세스-per-세션 | **스레드-per-세션** (단일 데몬) |
| 격리 수준 | OS 프로세스 (메모리 공간 분리) | Python 스레드 (GIL 하에 메모리 공유) |
| 글로벌 console | 같은 취약점, 프로세스 격리로 회피 | **직접 발현** |
| 리소스 공유 | 불가 (프로세스 경계) | MCP/스킬/메모리/훅 공유 |
| 해결 방향 | 해결 불필요 (아키텍처가 방어) | Thread-local 격리 필요 |

이 비교에서 핵심 인사이트를 얻었습니다: Claude Code의 프로세스 모델은 근본적 해결이 아니라 아키텍처적 회피입니다. GEODE의 단일 데몬 모델은 리소스 효율성(MCP 서버, 스킬, 메모리를 세션 간 공유)에서 이점이 있으므로, 프로세스 격리로 전환하는 대신 **스레드 레벨 격리**를 구현합니다. 분산 스토리지에서도 노드 분리(sharding)보다 세그먼트 레벨 잠금이 더 효율적인 것과 같은 트레이드오프입니다.

---

## 5. 설계 결정 — Thread-Local Console Proxy

### 대안 검토

| 접근 | 장점 | 단점 | 판정 |
|------|------|------|:----:|
| A. 프로세스-per-세션 전환 | 완전한 격리 | MCP/스킬/메모리 공유 불가, 리소스 낭비 | 기각 |
| B. `get_console()` 함수 도입 | 명시적, 타입 안전 | 14개 파일의 모든 `console.print()` 호출 수정 필요 | 기각 |
| C. `console`을 thread-local proxy로 교체 | **호출부 변경 0건**, 투명한 전환 | proxy `__setattr__` 처리 필요 | **채택** |

옵션 C가 채택된 이유: 기존의 모든 `from core.cli.ui.console import console` 구문이 그대로 동작합니다. proxy 객체의 `__getattr__`과 `__setattr__`이 thread-local Console 인스턴스로 투명하게 위임합니다.

### 핵심 설계

```
console (proxy) ──── __getattr__ / __setattr__ ────→ threading.local()
                                                         ├── Thread Main: _default_console (stdout)
                                                         ├── Thread A: Console(file=writer_A)
                                                         └── Thread B: Console(file=writer_B)
```

분산 스토리지의 per-client connection context와 동일한 패턴입니다. 스토리지 노드가 클라이언트 연결마다 독립된 I/O 컨텍스트를 할당하듯, 에이전트 데몬도 세션마다 독립된 Console 인스턴스를 할당합니다.

---

## 6. 구현 — 3개 파일, 최소 변경

### 6.1 `_ConsoleProxy` — 투명한 thread-local 위임

```python
# core/cli/ui/console.py
class _ConsoleProxy:
    """Thread-safe proxy delegating to per-thread Console instances."""

    _local = threading.local()

    def __init__(self, default: Console) -> None:
        object.__setattr__(self, "_default", default)

    def _current(self) -> Console:
        local: Console | None = getattr(self._local, "console", None)
        if local is not None:
            return local
        default: Console = object.__getattribute__(self, "_default")
        return default

    def __getattr__(self, name: str) -> Any:
        return getattr(self._current(), name)

    def __setattr__(self, name: str, value: Any) -> None:
        setattr(self._current(), name, value)


console: Any = _ConsoleProxy(_default_console)
```

> `__init__`에서 `object.__setattr__`을 사용하는 이유: `_ConsoleProxy.__setattr__`이 오버라이드되어 있으므로, `self._default = default`는 proxy가 아닌 underlying Console에 `_default` 속성을 설정하려 시도합니다. `object.__setattr__`으로 proxy 인스턴스 자체에 저장합니다.

> `_local`이 클래스 속성인 이유: `threading.local()`은 클래스 레벨에 하나만 있어도 thread별로 독립된 네임스페이스를 제공합니다. 인스턴스 레벨로 만들면 `__setattr__` 오버라이드와 충돌합니다.

### 6.2 세션 Console 생성 + 등록

```python
# core/cli/ui/console.py
def set_thread_console(c: Console) -> None:
    """IPC 핸들러 스레드 시작 시 호출."""
    _ConsoleProxy._local.console = c

def reset_thread_console() -> None:
    """IPC 핸들러 스레드 종료 시 호출."""
    _ConsoleProxy._local.__dict__.pop("console", None)

def make_session_console(file: Any) -> Console:
    """세션별 Console 팩토리 — GEODE 테마 + TrueColor 강제."""
    from rich.color import ColorSystem
    c = Console(theme=GEODE_THEME, file=file, force_terminal=True, width=120)
    c._color_system = ColorSystem.TRUECOLOR
    return c
```

### 6.3 CLIPoller — 세션 진입점에서 격리 설정

```python
# core/gateway/pollers/cli_poller.py
def _run_prompt_streaming(self, text, loop, session_id, client):
    from core.cli.ui.console import (
        make_session_console, reset_thread_console, set_thread_console,
    )

    writer = _StreamingWriter(client) if client else None
    if writer:
        set_thread_console(make_session_console(writer))  # 스레드 격리 진입
        _ipc_writer_local.writer = writer

    try:
        with lane_queue.acquire_all(f"cli:{session_id}", ["session", "global"]):
            result = loop.run(text)
    finally:
        if writer:
            reset_thread_console()                         # 스레드 격리 해제
            _ipc_writer_local.writer = None
```

> `redirect_console()` 호출이 완전히 제거되었습니다. 이전에는 글로벌 Console의 `_file`을 교체한 뒤 복원하는 컨텍스트 매니저였지만, 이제 각 스레드가 자신만의 Console 인스턴스를 소유하므로 교체/복원이 불필요합니다. 분산 스토리지에서 글로벌 버퍼 포인터 스왑 대신 per-connection 버퍼를 할당하는 것과 같은 전환입니다.

### 6.4 SessionMeter — 글로벌 싱글턴에서 thread-local로

```python
# core/cli/ui/agentic_ui.py (수정 전)
_session_meter: SessionMeter | None = None          # 모듈 레벨 싱글턴

# core/cli/ui/agentic_ui.py (수정 후)
_meter_local = threading.local()                     # 스레드별 독립

def init_session_meter(model: str = "") -> SessionMeter:
    meter = SessionMeter(model=model)
    _meter_local.meter = meter                       # 현재 스레드에만 설정
    return meter

def get_session_meter() -> SessionMeter | None:
    return getattr(_meter_local, "meter", None)      # 현재 스레드의 meter만 반환
```

CLIPoller의 `_handle_client()`에서도 스레드 진입 시 `init_session_meter()`를 호출하여, 각 IPC 세션이 독립된 모델명/경과시간/토큰 추적기를 갖도록 합니다.

---

## 7. 검증 — 스레드 격리 증명

### 7.1 Console 격리 테스트

```python
def test_console_proxy_isolates_threads():
    buf_a, buf_b = StringIO(), StringIO()
    barrier = threading.Barrier(2)

    def thread_a():
        set_thread_console(make_session_console(buf_a))
        barrier.wait()                  # 두 스레드 동시 활성화
        proxy.print("THREAD_A_OUTPUT")
        barrier.wait()
        reset_thread_console()

    def thread_b():
        set_thread_console(make_session_console(buf_b))
        barrier.wait()
        proxy.print("THREAD_B_OUTPUT")
        barrier.wait()
        reset_thread_console()

    # 결과: buf_a에는 THREAD_A만, buf_b에는 THREAD_B만 존재
    assert "THREAD_A_OUTPUT" in buf_a.getvalue()
    assert "THREAD_B_OUTPUT" not in buf_a.getvalue()
```

> `threading.Barrier(2)`로 두 스레드를 동기화하여, 두 스레드가 반드시 동시에 활성 상태일 때 `console.print()`를 호출합니다. race condition이 존재한다면 이 테스트가 실패합니다.

### 7.2 SessionMeter 격리 테스트

```python
def test_session_meter_isolates_threads():
    results = {}
    barrier = threading.Barrier(2)

    def thread_a():
        init_session_meter(model="model-A")
        barrier.wait()
        results["a"] = get_session_meter().model

    def thread_b():
        init_session_meter(model="model-B")
        barrier.wait()
        results["b"] = get_session_meter().model

    assert results["a"] == "model-A"  # B의 model이 아님
    assert results["b"] == "model-B"  # A의 model이 아님
```

### 7.3 품질 게이트

| 게이트 | 결과 |
|--------|------|
| Lint (`ruff check`) | 0 errors |
| Type (`mypy`) | 0 errors |
| Test (`pytest -m "not live"`) | **3640 passed** (3 new) |
| CI 5/5 | All pass |

---

## 8. 설계 트레이드오프

### `_ConsoleProxy`의 `Any` 타입 선언

```python
console: Any = _ConsoleProxy(_default_console)
```

`Console` 타입을 선언하면 mypy가 `_ConsoleProxy`에 `Console`의 모든 메서드가 없다고 경고합니다. `Any`로 선언하여 기존 호출부의 타입 검사를 유지하면서 proxy를 투명하게 삽입했습니다. `Protocol`을 정의하는 것도 가능하지만, Rich Console의 80개 이상의 public API를 모두 선언하는 것은 과도합니다.

### `capture_output()`의 호환성

`capture_output()`는 글로벌 Console의 `_file`을 `StringIO`로 교체합니다. proxy 환경에서는 **현재 스레드의** Console을 교체하므로, IPC 스레드에서 `/model` 같은 슬래시 명령어 실행 시 해당 스레드의 Console만 임시 교체됩니다. 다른 스레드에 영향 없음.

### `_announce_queue`는 이번에 수정하지 않은 이유

`sub_agent.py`의 `_announce_queue`는 `parent_session_key`로 키잉되어 있고 `threading.Lock`으로 보호됩니다. 세션 키가 `cli-{random_hex}`로 생성되므로 충돌 확률이 극히 낮고(2^32 공간), orphan TTL도 5분으로 제한되어 있습니다. 출력 오염(P0)에 비해 심각도가 낮아 다음 이터레이션으로 미뤘습니다.

### 프로세스 격리 vs 스레드 격리

프로세스-per-세션 모델(Claude Code 방식)을 채택하지 않은 이유:

1. **MCP 서버 공유**: GEODE 데몬은 MCP 서버를 한 번만 spawn하고 모든 세션이 공유합니다. 프로세스 격리 시 세션마다 MCP를 spawn해야 하며, 이는 리소스 낭비와 cold start 지연을 초래합니다.
2. **스킬/메모리/훅 공유**: `SharedServices`가 제공하는 공유 리소스를 프로세스 경계를 넘어 전달하려면 IPC 직렬화가 필요합니다.
3. **SessionLane 직렬화**: 같은 세션 키의 요청을 직렬화하는 `SessionLane`은 프로세스 내 세마포어로 구현되어 있습니다.

thread-local 격리는 공유 리소스의 이점을 유지하면서 출력 경로만 분리하는 최소 침습적 해결책입니다. 분산 스토리지에서도 전체 노드를 분리하는 대신 세그먼트 레벨 잠금으로 isolation을 달성하는 것이 일반적인 최적해인 것과 같은 판단입니다.

---

## 9. 정리

### 요약

| 항목 | 내용 |
|------|------|
| 문제 | 동시 IPC 세션의 출력이 교차 오염 (P0) |
| 근본 원인 | `redirect_console()`이 글로벌 Console `_file`을 직접 변이 |
| 분산 시스템 대응물 | 락 없는 공유 버퍼 포인터 스왑 (read response misrouting) |
| Frontier 비교 | Claude Code도 동일 취약점 보유, 프로세스 격리로 회피 |
| 해결 | `_ConsoleProxy` — thread-local Console 위임, 호출부 변경 0건 |
| 추가 수정 | `_session_meter` → `threading.local()` |
| 변경 범위 | 3 파일, +219/-37 lines |
| PR | [#652](https://github.com/mangowhoiscloud/geode/pull/652) |

### 체크리스트

- [x] 글로벌 Console 싱글턴 → thread-local proxy 전환
- [x] SessionMeter 모듈 레벨 → thread-local 전환
- [x] CLIPoller 세션 진입점에서 격리 설정/해제
- [x] 스레드 격리 증명 테스트 3건
- [x] CI 5/5 통과 (3640 tests)
- [ ] `_announce_queue` 격리 (다음 이터레이션)

---

*Source: `blog/posts/safety-verification/58-thread-local-console-isolation.md` | Category: [[blog-safety]]*

## Related

- [[blog-safety]]
- [[blog-hub]]
- [[geode]]
