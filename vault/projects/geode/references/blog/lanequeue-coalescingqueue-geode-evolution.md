---
title: "LaneQueue & CoalescingQueue 리서치 — GEODE 큐 아키텍처 진화"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/lanequeue-coalescingqueue-geode-evolution.md"
created: 2026-04-08T00:00:00Z
---

# LaneQueue & CoalescingQueue 리서치 — GEODE 큐 아키텍처 진화

> Date: 2026-03-30 | Scope: OpenClaw 원본 패턴 → GEODE 적용 → Session 48 단순화
> Sources: blog posts (technical/, narrative/, release/, orchestration/)

---

## 0. 한 줄 요약

OpenClaw의 **LaneQueue**(레인 기반 동시성 제어) + **CoalescingQueue**(250ms 디바운스 디덥)를 GEODE가 도입했으나, 실제 운영에서 CoalescingQueue는 **dead code**로 판명되어 삭제하고, LaneQueue는 **SessionLane**(per-key 직렬화)으로 진화시켜 5개 동시성 게이트를 2개로 통합했습니다.

---

## 1. 원본 패턴: OpenClaw의 큐 아키텍처

### 1.1 LaneQueue

OpenClaw의 Lane Queue는 **네임드 레인** 기반 동시성 제어입니다. 각 레인은 독립 Semaphore를 가지고, 요청은 하나 이상의 레인을 통과해야 실행됩니다.

```
Request → Lane("session", max=1)   ← 세션 직렬화
       → Lane("global", max=8)     ← 전체 동시성 상한
       → Execution
```

**핵심 속성**:
- 레인은 독립적: `session` 레인 대기가 `global` 레인을 점유하지 않음
- `acquire_all(key, ["session", "global"])`: 여러 레인을 순서대로 획득, 실패 시 역순 해제

### 1.2 CoalescingQueue

250ms 디바운스 윈도우 내 중복 요청을 합치는 패턴입니다:

```python
class CoalescingQueue:
    def submit(self, key: str, callback, data) -> bool:
        """250ms 내 같은 key → 합침, 새 key → Timer 시작"""
        with self._lock:
            if key in self._pending:
                self._pending[key].data = data  # 최신 데이터로 덮어쓰기
                return False  # 중복
            self._pending[key] = Entry(data, Timer(0.25, self._fire, [key]))
            self._pending[key].timer.start()
            return True  # 신규

    def _fire(self, key: str):
        """Timer 만료 시 콜백 실행 (threading.Timer 스레드에서)"""
        with self._lock:
            entry = self._pending.pop(key)
        self._callback(key, entry.data)
```

**설계 의도**: Node.js 이벤트 루프 환경에서, 빠르게 연속되는 동일 이벤트(Slack 메시지 재전송 등)를 하나로 합침.

---

## 2. GEODE 초기 도입 (v0.26.0)

GEODE는 OpenClaw의 두 패턴을 Python `threading` 기반으로 포팅했습니다:

```
Request → CoalescingQueue(250ms dedup)
       → LaneQueue(session, max=1)       ← 세션 직렬화
       → LaneQueue(global, max=4)        ← 전체 동시성
       → LaneQueue(scheduler, max=2)     ← 스케줄러 전용
       → IsolatedRunner._semaphore(5)    ← 서브에이전트 실행
       → Execution
```

### 문제 1: 같은 문제를 3번 독립적으로 해결

| 시점 | 추가된 게이트 | 목적 |
|------|-------------|------|
| v0.25.0 | `IsolatedRunner.Semaphore(5)` | 서브에이전트 동시성 |
| v0.26.0 | `LaneQueue` 3개 레인 | 세션/글로벌/스케줄러 |
| v0.32.1 | `_sched_semaphore` | 스케줄러 작업 전용 |

결과: `LaneQueue.global(4)` + `Semaphore(5)` 이중 게이팅 → 실효치 `min(4,5) = 4`.

### 문제 2: LaneQueue의 글로벌 직렬화 버그

OpenClaw의 `Lane("session", max_concurrent=1)`은 **모든 세션을 하나의 Semaphore(1)로 직렬화**합니다. 의도는 "같은 세션 내 직렬화"인데, 실제로는 **전체 세션이 한 줄로 서는** 글로벌 직렬화가 발생.

```
의도:  Session A ──→──→    Session B ──→──→   (병렬)
현실:  Session A ──→──→ │ Session B ──→──→    (직렬 — 하나의 Semaphore)
```

### 문제 3: OpenClaw의 메모리 누수

```python
# OpenClaw (문제)
sessions = {}  # Map<string, Semaphore(1)>
# 새 key마다 무한 추가, 정리 로직 없음
# 7일 운영 → 800+ idle 엔트리 누적
# 100,000 unique threads × ~500 bytes = 50MB+
```

`lastUsed` 타임스탬프는 기록하지만 eviction 로직이 없음.

---

## 3. SessionLane: GEODE의 해결책

### 3.1 핵심 구조

```python
class _SessionEntry:
    __slots__ = ("semaphore", "last_used", "held")

    def __init__(self) -> None:
        self.semaphore = threading.Semaphore(1)  # key별 독립 Semaphore
        self.last_used: float = time.time()
        self.held: bool = False  # eviction 보호 플래그
```

**per-key Semaphore**로 "같은 key → 직렬화, 다른 key → 병렬"을 달성합니다.

### 3.2 Lock 분리 규율 (핵심 불변식)

```python
def _get_or_create(self, key: str) -> _SessionEntry:
    with self._lock:              # ← dict 보호만
        entry = self._sessions.get(key)
        if entry is None:
            if len(self._sessions) >= self._max_sessions:
                self._evict_idle_locked()
            entry = _SessionEntry()
            self._sessions[key] = entry
        entry.last_used = time.time()
        return entry
    # semaphore.acquire()는 lock 밖에서 수행!
```

**`self._lock`은 dict만 보호하고, `semaphore.acquire()`는 lock 밖에서 호출**합니다. 만약 acquire를 lock 안에서 호출하면, Thread A가 Semaphore 대기 중 lock을 점유 → 다른 모든 스레드의 `_get_or_create()` 차단 → per-key 병렬성 파괴.

### 3.3 Idle Eviction 전략

| 단계 | 조건 | 동작 |
|------|------|------|
| 1. 용량 OK | `len < max_sessions` | 즉시 생성 |
| 2. Idle 정리 | `last_used < threshold AND NOT held` | 만료 엔트리 일괄 제거 |
| 3. 강제 제거 | 정리 후에도 초과 | 가장 오래된 idle 1개 제거 |
| 4. 전부 held | 모든 엔트리가 `held=True` | 소프트 캡 초과 허용 |

**`held` 플래그**: TOCTOU 레이스 방지. Semaphore가 acquire된 상태의 엔트리는 절대 evict하지 않음.

### 3.4 용량 설계

```
Slack: 10 channels × 5 threads = 50 sessions
Discord: 5 channels × 3 threads = 15 sessions
Scheduler: 10 jobs               = 10 sessions
Sub-agents: 15 max               = 15 sessions
─────────────────────────────────────────
Total ≈ 90 sessions (peak)
max_sessions = 256 = 90 × 2.8 안전 마진
Memory: 256 × ~500 bytes ≈ 125KB (무시 가능)
```

---

## 4. CoalescingQueue: 삭제 결정 (Session 48)

### 4.1 발견: 콜백이 no-op

```python
# 실제 사용
is_new = self._coalescing.submit(key, lambda _k, _d: None, None)
#                                     ^^^^^^^^^^^^^^^^^^^^^^^^
#                                     콜백이 아무것도 안 함
```

이건 `key not in seen_set`과 동일합니다. 148줄의 Timer 기반 디바운스 로직이 `set` 멤버십 체크 한 줄로 대체 가능.

### 4.2 트리거 조건 자체가 존재하지 않음

- 서브에이전트 태스크는 LLM `tool_use`당 한 번 생성 → 중복 불가
- AgenticLoop은 동기 실행 → 250ms 내 재제출 물리적 불가능
- **실측 디덥 빈도 ≈ 0**

### 4.3 SessionLane이 이미 동일 보호 제공

같은 key → `Semaphore(1)` 직렬화 → 250ms 윈도우 불필요

### 4.4 삭제 비용/이득

| 항목 | 값 |
|------|-----|
| 삭제 코드 | `coalescing.py` 148줄 |
| Timer 스레드 오버헤드 | 제거 |
| RuntimeCoreConfig 통합 | 제거 |
| 테스트 유지 비용 | `test_coalescing.py` 제거 |

**판정**: 활성 기능으로 위장한 dead code. PR #535에서 삭제.

---

## 5. 최종 아키텍처: Session 48 이후

### Before (v0.36.0) — 5개 게이트, 3개 컴포넌트

```
CoalescingQueue(250ms) → LaneQueue × 3레인 → IsolatedRunner.Semaphore(5) → Execution
```

### After (Session 48) — 2개 게이트, 1개 컴포넌트

```
SessionLane(per-key) → IsolatedRunner (실행만, Semaphore 없음) → Execution
```

### 6 PRs 시퀀스

| PR | 내용 |
|----|------|
| #531 | Phase 2+3 구조적 결함 (TOCTOU, fcntl.flock PID) |
| #532 | v0.36.0 릴리스 베이스라인 |
| #533 | LaneQueue 통합 (3레인 → 1) |
| #534 | SessionLane 통합 (4레인 → 2 컴포넌트) |
| #535 | CoalescingQueue 삭제 + Thin REPL |
| #536 | P1 수정 (TOCTOU, depth guard) |

### 수치

| 지표 | Before | After | Delta |
|------|--------|-------|-------|
| 동시성 게이트 | 5 | 2 | -60% |
| 컴포넌트 | 3 | 1 | -67% |
| 동적 레인 | 4 | 0 | -100% |
| 테스트 | 3,386 | 3,433 | +47 |
| 삭제 라인 | — | ~487 | (REPL bootstrap) |

---

## 6. 주요 패턴: Async Ownership Transfer

스케줄러는 **메인 스레드에서 non-blocking acquire, 워커 스레드에서 release**하는 비대칭 소유권 패턴을 사용합니다:

```python
# Main thread (REPL loop)
if not lane.try_acquire(key):       # Non-blocking, timeout=0
    continue

_cap_key, _cap_lane = key, lane     # 클로저 캡처 (루프 변수 문제 방지)

def _run_isolated(*, _lane=_cap_lane, _key=_cap_key) -> str:
    try:
        result = loop.run(prompt)
        return result.text or ""
    finally:
        _lane.manual_release(_key)  # 워커 스레드에서 해제

runner.run_async(_run_isolated, config=...)
```

**불변식**: `acquired == released + active_count`

**안전장치**:
- 기본 인자 캡처로 루프 변수 문제 방지
- `_lane_acquired` guard로 이중 해제 방지
- `_active.pop(key)` → `semaphore.release()` 순서 보장

---

## 7. Duck Typing 다형성

`Lane`과 `SessionLane`이 동일 API를 노출합니다:

```python
# Lane과 SessionLane 모두
def _raw_acquire(self, key: str) -> bool: ...
def _raw_release(self, key: str) -> None: ...
```

`LaneQueue.acquire_all()`이 두 타입을 투명하게 처리:

```python
@contextmanager
def acquire_all(self, key: str, lane_names: list[str]) -> Generator:
    acquired: list[tuple[Lane | SessionLane, str]] = []
    try:
        for name in lane_names:
            lane = self._lanes[name]
            if not lane._raw_acquire(key):    # 두 타입 모두 동작
                raise TimeoutError(...)
            acquired.append((lane, key))
        yield
    finally:
        for lane, k in reversed(acquired):    # 역순 해제
            lane._raw_release(k)
```

---

## 8. 실제 사용 흐름

### Gateway (Slack/Discord)

```python
session_key = "gateway:slack:c12345:u789:1234567890_123456"
#             채널타입:채널ID:유저ID:스레드ID

with lane_queue.acquire_all(session_key, ["session", "global"]):
    response = processor(content, metadata)
# 같은 Slack 스레드 → 직렬화, 다른 스레드 → 병렬
```

### Scheduler (이중 try_acquire)

```python
key = f"sched:{job_id}"
if not sched_lane.try_acquire(key):     # 글로벌 동시성 상한
    continue
if not session_lane.try_acquire(key):   # 중복 실행 방지
    sched_lane.manual_release(key)      # 롤백
    continue
```

### Sub-agent (고유 key)

```python
key = f"ip:berserk:pipeline:subagent:reddit_analysis"
# 고유 key → 새 Semaphore(1) → 즉시 acquire (블로킹 없음)
# SessionLane이 호출자에게 투명
```

---

## 9. 설계 교훈

1. **Lock 스코프 분리**: Dict lock ≠ Semaphore lock. per-key 병렬성은 이 둘을 분리해야 달성됨.
2. **`held` 플래그**: eviction과 acquire 사이의 TOCTOU 레이스를 단일 boolean으로 해결.
3. **소프트 캡**: `max_sessions=256`은 권고치. 모든 엔트리가 active면 초과 허용 — hard limit의 데드락보다 안전.
4. **Dead code 탐지**: 콜백이 no-op이면 전체 메커니즘의 존재 이유를 재검토.
5. **코드 삭제 > 코드 추가**: 5개 게이트 → 2개로 줄이는 것이 47개 테스트 추가보다 더 큰 품질 향상.

---

## References (블로그 내부)

- `posts/technical/session-lane-per-key-serialization.md` — SessionLane 설계 상세
- `posts/narrative/queue-simplification-journey.md` — OpenClaw GAP 분석
- `posts/narrative/coalescing-queue-removal-decision.md` — CoalescingQueue 삭제 결정
- `posts/release/session-48-queue-architecture.md` — Session 48 큐 아키텍처 통합
- `posts/technical/lane-queue-async-ownership.md` — Async 소유권 이전 패턴
- `posts/orchestration/14-task-graph-coalescing-lane-queue.md` — 초기 오케스트레이션 설계

---

*Source: `blog/research/lanequeue-coalescingqueue-geode-evolution.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
