---
title: "Rich console.print() Thread-Safety 조사 리포트"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/rich-thread-safety-console-print.md"
created: 2026-04-08T00:00:00Z
---

# Rich console.print() Thread-Safety 조사 리포트

> Date: 2026-03-29 | Issue: `_on_sched_complete`에서 백그라운드 스레드 console.print() — Rich thread-safety 미보장
> Status: cosmetic, 보류 → **조사 완료, 조건부 안전**

---

## 0. 문제 정의

백그라운드 스레드(예: `threading.Timer` 콜백, daemon thread)에서 `console.print()`를 호출할 때, Rich 라이브러리가 thread-safety를 보장하는지 여부.

---

## 1. 그라운드 트루스: Rich Console의 동기화 메커니즘

### 1.1 Lock 구조

Rich `Console`은 두 개의 `RLock`을 사용합니다:

```python
self._lock = threading.RLock()              # _write_buffer, live_stack, render_hooks 보호
self._record_buffer_lock = threading.RLock() # _record_buffer 별도 보호
```

### 1.2 Thread-Local Buffer (v9.5.0, 2020-12-18 도입)

```python
class ConsoleThreadLocals(threading.local):
    theme_stack: ThemeStack
    buffer: List[Segment] = field(default_factory=list)
    buffer_index: int = 0
```

각 스레드가 **독립 버퍼**를 가집니다. `print()` 호출 시 렌더링/세그먼트 빌드는 thread-local 버퍼에서 수행됩니다.

### 1.3 print() 호출 경로

```
print()
  └─ with self:          # _enter_buffer() — thread-local counter 증가
       └─ 렌더링 → thread-local buffer에 Segment 추가
  └─ _exit_buffer()      # counter가 0이면:
       └─ _check_buffer()
            └─ _write_buffer()   # ← 여기서만 self._lock 획득 (RLock)
                 └─ file.write() + file.flush()
```

**핵심**: 렌더링 단계는 lock 없이 thread-local로 처리, **최종 stdout flush만 `_lock`으로 직렬화**.

### 1.4 `_lock` 획득 지점

| 메서드 | Lock 여부 |
|--------|----------|
| `_write_buffer()` | `with self._lock` |
| `set_live()` / `clear_live()` | `with self._lock` |
| `push_render_hook()` / `pop_render_hook()` | `with self._lock` |
| `print()` 렌더링 단계 | Lock 없음 (thread-local) |
| `_enter_buffer()` / `_exit_buffer()` | Lock 없음 (thread-local counter) |

---

## 2. 판정: 시나리오별 Thread-Safety

| 시나리오 | 안전? | 근거 |
|----------|-------|------|
| 여러 스레드에서 `console.print()` (Live/Progress 없음) | **대체로 안전** | thread-local 버퍼 + flush 직렬화 |
| `console.print()` + 활성 `Live`/`Status`/`Progress` | **안전하지 않음** | Race condition ([#1530](https://github.com/Textualize/rich/issues/1530), 수정 후 revert됨) |
| `RichHandler` 멀티스레드 로깅 | **기능적으로 안전, 성능 이슈** | 15x 오버헤드 ([#3704](https://github.com/Textualize/rich/issues/3704)), 간헐적 데드락 ([#2046](https://github.com/Textualize/rich/issues/2046)) |
| `RichHandler` + `Live`/`Progress` | **안전하지 않음** | 출력 corruption ([#3769](https://github.com/Textualize/rich/issues/3769)) |
| Python 3.13+ free-threading (no GIL) | **미확인** | Rich에서 공식 지원 선언 없음 |

---

## 3. 관련 GitHub Issue 히스토리

| Issue | 제목 | 상태 | 핵심 |
|-------|------|------|------|
| [#90](https://github.com/Textualize/rich/issues/90) | Progress context 종료 시 데드락 | Fixed v9.12.1 | 초기 Lock 누락 |
| [#927](https://github.com/Textualize/rich/issues/927) | Status context 종료 시 데드락 | Fixed v9.8.2 | Lock ordering 데드락 |
| [#1267](https://github.com/Textualize/rich/issues/1267) | RichHandler가 다른 스레드를 block | Closed (by design) | Live + 로깅 충돌 |
| [#1530](https://github.com/Textualize/rich/issues/1530) | **Live + console.print가 thread-safe하지 않음** | **Fix reverted, 미해결** | Console과 Live의 별도 lock |
| [#2046](https://github.com/Textualize/rich/issues/2046) | RichHandler 멀티스레드 데드락 | Closed (미재현) | 2026-02 재확인됨 |
| [#3704](https://github.com/Textualize/rich/issues/3704) | 멀티스레드 컨텍스트 15x 성능 저하 | Closed (by design) | RLock contention |
| [#3769](https://github.com/Textualize/rich/issues/3769) | Console() + RichHandler + Progress 충돌 | Discussion 전환 | 인스턴스 공유 문제 |

### 가장 중요한 이슈: #1530

PR #1723으로 수정이 merge되어 v10.15.0에 릴리스되었으나, **문제가 발생하여 revert**됨. 2022-02-01 리포터 확인: *"the bugfix for this was reverted due to problems; this bug is still open."*

**근본 원인**: Console과 Live가 **별도의 `_lock`을 사용**. 한 커뮤니티 기여자(Alex7Li)가 lock 공유를 제안했으나 적용되지 않음.

### 역사적 데드락 패턴 (#927, 수정됨)

```
Main thread: _lock 획득 → refresh_thread.join() 호출 (block)
Refresh thread: _lock 획득 시도 → 대기 (block)
→ Circular wait = Deadlock
```

수정: join() 전 lock 해제
```python
self._lock.release()
try:
    self._refresh_thread.join()
finally:
    self._lock.acquire()
```

---

## 4. `_on_sched_complete` 컨텍스트에서의 분석

코드베이스에서 `_on_sched_complete`는 직접 존재하지 않으나, 동일 패턴의 콜백들이 확인됨:

| 패턴 | 위치 | 스레드 컨텍스트 |
|------|------|----------------|
| `CoalescingQueue._fire` | `threading.Timer` daemon thread | timer 콜백 |
| `StuckDetector._monitor_loop` | background `threading.Thread` | 60초 주기 모니터링 |
| `HookSystem` 콜백 | Timer, background thread에서 trigger | 동기 실행 |
| `IsolatedRunner` 완료 콜백 | `threading.Thread` daemon | subagent 완료 시 |

**판정**: 이들 콜백에서 `console.print()` 호출 시:

1. **Live/Progress/Status가 비활성인 경우**: thread-local 버퍼 + flush 직렬화로 **안전**. 출력 순서가 보장되지 않을 뿐(cosmetic issue), 데이터 손상은 없음.
2. **Live/Progress/Status가 활성인 경우**: **race condition 가능**. 출력이 깨지거나, 극히 드물게 데드락 발생 가능.

---

## 5. 권장 대응

### Option A: 현상 유지 (보류 유지)

- Live/Progress를 백그라운드 콜백과 동시에 사용하지 않는다면, 현재 상태로 실용적 문제 없음
- 출력 interleaving은 cosmetic issue로 분류 가능

### Option B: Queue-Based 패턴 (방어적 수정)

```python
import queue, threading

class SafeConsolePrinter:
    def __init__(self, console):
        self._console = console
        self._queue: queue.Queue = queue.Queue()
        self._worker = threading.Thread(target=self._drain, daemon=True)
        self._worker.start()

    def print(self, *args, **kwargs):
        self._queue.put((args, kwargs))

    def _drain(self):
        while True:
            args, kwargs = self._queue.get()
            self._console.print(*args, **kwargs)
```

### Option C: stdlib QueueHandler 활용

```python
import logging
from logging.handlers import QueueHandler, QueueListener
from rich.logging import RichHandler

log_queue = queue.Queue()
listener = QueueListener(log_queue, RichHandler())
listener.start()

# 백그라운드 스레드에서:
handler = QueueHandler(log_queue)
logger = logging.getLogger("bg")
logger.addHandler(handler)
logger.info("from background thread")  # 안전
```

### 권장

- **Live/Progress 미사용 시**: Option A (현상 유지). GIL + thread-local 버퍼 + RLock flush로 실용적 안전성 확보.
- **Live/Progress 병용 시**: Option B 또는 C 적용. 단일 스레드로 Rich 출력을 집중.

---

## 6. Python 3.13+ Free-Threading 고려사항

Rich의 thread-safety는 부분적으로 GIL에 의존합니다 (예: thread-local 버퍼의 `list.extend`). Python 3.13+ `--disable-gil` 빌드에서는 추가 동기화가 필요할 수 있으나, Rich에서 공식 지원을 선언한 바 없습니다. 현시점에서는 free-threading 환경에서의 Rich 사용은 검증되지 않은 상태입니다.

---

## Appendix: Thread-Safety CS 기초

### A.1 Race Condition vs Data Race

- **Race Condition**: 프로그램 결과가 스레드 실행 순서에 의존하는 결함. TOCTOU(check-then-act) 버그 포함.
- **Data Race**: 두 스레드가 동일 메모리 위치에 동시 접근하고, 최소 하나가 write이며, 동기화 메커니즘이 없는 경우. Race condition의 부분집합.

### A.2 Python GIL이 보장하는 것과 보장하지 않는 것

| 보장함 | 보장하지 않음 |
|--------|-------------|
| 인터프리터 내부 일관성 (참조 카운팅) | 다중 바이트코드 연산의 원자성 |
| 단일 바이트코드 원자성 (`list.append()`, `dict[k]=v`) | `print()` — 내부적으로 `write(text)` + `write("\n")`이 **별도 호출** |
| | I/O 시 GIL 해제 — `Py_BEGIN_ALLOW_THREADS` |

`n += 1`은 LOAD → LOAD_CONST → BINARY_ADD → STORE 4개 바이트코드. 사이에서 스레드 전환 가능.

### A.3 `print()` vs `console.print()` Thread-Safety

| | `print()` | Rich `console.print()` |
|---|-----------|----------------------|
| stdout 쓰기 | `write(text)` + `write("\n")` 분리 호출 | thread-local 버퍼 빌드 → `_write_buffer()`에서 **단일 `write()` + `flush()`** |
| 동기화 | 없음 | `_write_buffer()`에서 `RLock` 획득 |
| Line interleaving | **발생 가능** | **방지됨** (단일 write) |
| Character interleaving | 드묾 (OS 버퍼링) | 발생 안 함 |

### A.4 Lock vs RLock

- **`threading.Lock`**: 비재진입. 같은 스레드가 두 번 acquire하면 **데드락**.
- **`threading.RLock`**: 재진입. 같은 스레드가 여러 번 acquire 가능 (내부 카운터). Release도 동일 횟수 필요.

Rich가 RLock을 사용하는 이유: `print()` → `_check_buffer()` → `_write_buffer()` 호출 체인에서 같은 스레드가 lock을 재진입할 수 있음.

### A.5 Queue-Based 출력 패턴이 Gold Standard인 이유

```
Worker Threads          Queue (thread-safe)          Writer Thread
    │                        │                           │
    ├─ queue.put(msg) ──────→│                           │
    ├─ queue.put(msg) ──────→│──── queue.get() ─────────→│── console.print()
    ├─ queue.put(msg) ──────→│                           │
```

1. `queue.Queue`는 내부 Lock으로 thread-safe
2. **단일 스레드만 Rich 출력 수행** → contention 제거
3. Worker 스레드는 `put()`만 호출 → I/O 블로킹 없음, 빠름
4. Live/Progress/Status와의 충돌도 완전 해소

### A.6 Python 3.13+ Free-Threading 시사점

PEP 703 `--disable-gil` 빌드에서는 단일 바이트코드 원자성도 보장되지 않음. `list.append()`, `dict[k]=v` 등의 연산도 명시적 Lock 필요 가능. Rich의 thread-local 버퍼 `list.extend`가 GIL 없이 안전한지 미검증.

---

## References

- [Rich console.py source](https://github.com/Textualize/rich/blob/master/rich/console.py) — `_lock`, `ConsoleThreadLocals` 구현
- [Rich live.py source](https://github.com/Textualize/rich/blob/master/rich/live.py) — Live 별도 RLock
- [Rich CHANGELOG](https://github.com/Textualize/rich/blob/master/CHANGELOG.md) — v9.5.0 thread-safe 도입
- [Issue #1530](https://github.com/Textualize/rich/issues/1530) — Live + print race condition (미해결)
- [Issue #927](https://github.com/Textualize/rich/issues/927) — Status 데드락 (수정됨)
- [Issue #2046](https://github.com/Textualize/rich/issues/2046) — RichHandler 데드락
- [Issue #3704](https://github.com/Textualize/rich/issues/3704) — 멀티스레드 15x 성능 저하
- [Issue #3769](https://github.com/Textualize/rich/issues/3769) — Console + RichHandler + Progress 충돌
- [Thread-Safe Print in Python](https://superfastpython.com/thread-safe-print-in-python/) — Python threading.Lock 패턴
- [Python Free-Threading Guide](https://py-free-threading.github.io/) — GIL 제거 관련

---

*Source: `blog/research/rich-thread-safety-console-print.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
