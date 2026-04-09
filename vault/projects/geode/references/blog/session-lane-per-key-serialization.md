---
title: "SessionLane -- 에이전트 시스템의 per-key 직렬화 설계"
type: reference
category: blog-post
tags: [blog, technical]
source: "blog/posts/technical/session-lane-per-key-serialization.md"
created: 2026-04-08T00:00:00Z
---

# SessionLane -- 에이전트 시스템의 per-key 직렬화 설계

> Date: 2026-03-30 | Author: geode-team | Tags: python, concurrency, session-management, openclaw, agent-system

## Table of Contents

1. [문제 -- Lane("session", max=1)은 전체를 직렬화한다](#1-문제)
2. [OpenClaw 분석 -- Session Lane = per-key Semaphore](#2-openclaw-분석)
3. [OpenClaw 결함 -- max_sessions 무제한, idle cleanup 없음](#3-openclaw-결함)
4. [GEODE SessionLane 설계](#4-geode-sessionlane-설계)
5. [Lane과의 API 호환 -- duck typing for acquire_all()](#5-lane과의-api-호환)
6. [_raw_acquire/_raw_release -- LaneQueue의 다형성 지원](#6-_raw_acquire_raw_release)
7. [실사용 흐름 -- gateway / scheduler / sub-agent](#7-실사용-흐름)
8. [Wrap-up](#8-wrap-up)

---

## 1. 문제

GEODE의 동시성 제어는 `LaneQueue`가 담당합니다. 현재 구현에서 "session" Lane은 `max_concurrent=1`로 설정됩니다.

```python
# core/runtime_wiring/infra.py
def build_default_lanes() -> LaneQueue:
    queue = LaneQueue()
    queue.add_lane("session", max_concurrent=1)  # Serial per session
    queue.add_lane("global", max_concurrent=DEFAULT_GLOBAL_CONCURRENCY)
    return queue
```

이 코드의 의도는 **같은 세션의 요청을 순서대로 처리**하는 것입니다. Slack 채널 A에서 메시지 3개가 연달아 오면, 이전 메시지 처리가 끝난 뒤 다음 메시지를 처리해야 합니다. 동일 스레드의 LLM 응답이 뒤섞이면 대화 맥락이 깨지기 때문입니다.

하지만 `Lane("session", max_concurrent=1)`은 **전체 시스템에서 1개의 요청만 실행**합니다.

```
[상황] Slack 채널 A에서 메시지 1개, 채널 B에서 메시지 1개 동시 도착

[기대] A와 B는 서로 다른 세션 → 병렬 실행
[현실] session Lane의 Semaphore(1)이 전체에 1개 → A 처리 중 B는 대기
```

`Lane` 클래스의 `acquire()` 내부를 보면 이유가 명확합니다.

```python
# core/orchestration/lane_queue.py
class Lane:
    def __init__(self, name: str, *, max_concurrent: int = 4, ...) -> None:
        self._semaphore = threading.Semaphore(max_concurrent)  # 단일 Semaphore
        self._active: dict[str, float] = {}
```

`threading.Semaphore(1)` 하나가 모든 key에 적용됩니다. key가 `"gateway:slack:C12345:U789:thread_A"`이든 `"gateway:slack:C67890:U123:thread_B"`이든, 동일한 Semaphore를 놓고 경쟁합니다.

이것은 "세션별 직렬화"가 아니라 "전역 직렬화"입니다.

```
Lane("session", max=1)

Thread A: acquire("key_A") → 성공 (sem: 1→0)
Thread B: acquire("key_B") → 대기 (sem: 0, key_A 해제까지 블록)
                                     ↑ key가 다른데도 대기
```

이 문제를 해결하려면 **같은 key는 serial, 다른 key는 parallel**인 구조가 필요합니다. 이것이 per-key Semaphore, 즉 `SessionLane`입니다.

---

## 2. OpenClaw 분석

OpenClaw(`github.com/openclaw/openclaw`)의 Lane Queue는 GEODE의 원본 참조 구현입니다. OpenClaw의 Session Lane은 처음부터 per-key 직렬화를 구현하고 있습니다.

```typescript
// openclaw/src/infra/lane-queue.ts (핵심 로직 추출)
class SessionLane {
  private sessions = new Map<string, { sem: Semaphore; lastUsed: number }>();
  private lock = new Mutex();

  async acquire(sessionKey: string): Promise<void> {
    let entry = this.sessions.get(sessionKey);
    if (!entry) {
      entry = { sem: new Semaphore(1), lastUsed: Date.now() };
      this.sessions.set(sessionKey, entry);
    }
    entry.lastUsed = Date.now();
    await entry.sem.acquire();
  }

  release(sessionKey: string): void {
    const entry = this.sessions.get(sessionKey);
    if (entry) {
      entry.sem.release();
      entry.lastUsed = Date.now();
    }
  }
}
```

핵심 구조는 **`Map<string, Semaphore(1)>`** 입니다. 각 session key마다 독립적인 Semaphore(1)을 생성합니다.

```
Session Lane (per-key):

Thread A: acquire("key_A") → key_A의 sem 획득 (sem_A: 1→0)
Thread B: acquire("key_B") → key_B의 sem 획득 (sem_B: 1→0) ← 즉시 성공!
Thread C: acquire("key_A") → key_A의 sem 대기 (sem_A: 0)   ← A와 같은 key → 직렬
```

같은 key(`key_A`)를 가진 Thread A와 C는 순서대로 실행됩니다. 다른 key(`key_B`)를 가진 Thread B는 A와 무관하게 병렬로 실행됩니다.

이 패턴은 에이전트 시스템의 세션 격리 모델과 정확히 일치합니다. 세션은 대화 맥락의 단위이며, 같은 맥락 안에서의 순서 보장은 필수이고, 서로 다른 맥락 간의 병렬 실행은 당연합니다.

| 비교 | Lane (단일 Semaphore) | SessionLane (per-key Semaphore) |
|------|:---------------------:|:-------------------------------:|
| 자료구조 | `Semaphore(N)` | `Dict[str, Semaphore(1)]` |
| key_A + key_A | serial | serial |
| key_A + key_B | serial (N=1일 때) | **parallel** |
| 메모리 | 고정 | key 수에 비례 |
| 용도 | global 동시성 제한 | 세션별 직렬화 |

---

## 3. OpenClaw 결함

OpenClaw의 per-key Semaphore 구조는 올바르지만, 프로덕션에서 운용하기에 두 가지 결함이 있습니다.

### 결함 1: max_sessions 무제한

`Map<string, Semaphore>`는 새로운 key가 올 때마다 무한정 커집니다. Slack 봇이 수백 개 스레드에서 메시지를 받으면, 각 스레드마다 Semaphore 엔트리가 생성됩니다. 한 번 대화하고 떠난 스레드의 엔트리도 영원히 남습니다.

```python
# 시간에 따른 메모리 증가 시뮬레이션
sessions = {}
for i in range(100_000):  # 10만 개 고유 스레드
    key = f"gateway:slack:C{i}:U{i}:thread_{i}"
    sessions[key] = threading.Semaphore(1)
    # 각 엔트리: Semaphore 객체 (~300 bytes) + key 문자열 + dict 오버헤드
    # 10만 개 × ~500 bytes ≈ 50MB — 대부분 idle
```

### 결함 2: idle cleanup 없음

OpenClaw 구현에는 idle 엔트리를 정리하는 메커니즘이 없습니다. `lastUsed` 타임스탬프는 기록하지만, 이를 기반으로 오래된 엔트리를 제거하는 코드가 없습니다.

Node.js 환경에서는 프로세스가 비교적 자주 재시작되므로 문제가 드러나지 않을 수 있습니다. 하지만 GEODE의 `geode serve` 데몬은 한 번 시작하면 수일간 실행됩니다. cleanup 없이는 메모리 leak이 불가피합니다.

```
시간 경과에 따른 Session 엔트리 증가 (cleanup 없음):

Day 1: 50 sessions   [████████░░]
Day 2: 150 sessions  [████████████████████░░░░░░░░░░]
Day 7: 800 sessions  [████████████████████████████████████████████████████████]
                      ↑ 대부분 idle — 메모리만 차지
```

---

## 4. GEODE SessionLane 설계

OpenClaw의 per-key Semaphore 원리를 유지하되, 두 가지 결함을 해결하는 설계입니다.

### 4.1. _SessionEntry -- per-key 상태 캡슐화

```python
# core/orchestration/lane_queue.py
import threading
import time

class _SessionEntry:
    """Per-key Semaphore와 메타데이터를 캡슐화."""

    __slots__ = ("semaphore", "last_used", "held")

    def __init__(self) -> None:
        self.semaphore = threading.Semaphore(1)
        self.last_used: float = time.time()
        self.held: bool = False  # 현재 acquire 상태인지
```

> `__slots__`를 사용하는 이유: 엔트리가 수백 개 생길 수 있으므로 per-instance `__dict__` 오버헤드를 제거합니다. `Semaphore` + `float` + `bool` = 최소 메모리.

`held` 플래그는 eviction 안전성을 위해 존재합니다. Semaphore가 현재 acquire된 상태인 엔트리를 dict에서 제거하면, release 시점에 존재하지 않는 엔트리를 참조하게 됩니다.

### 4.2. _get_or_create -- lazy creation under lock

```python
class SessionLane:
    """Per-key serialization lane.

    같은 key → serial (Semaphore(1) per key).
    다른 key → parallel (독립적인 Semaphore).
    """

    _DEFAULT_MAX_SESSIONS = 256
    _DEFAULT_IDLE_TIMEOUT_S = 3600.0  # 1시간

    def __init__(
        self,
        name: str,
        *,
        max_sessions: int = _DEFAULT_MAX_SESSIONS,
        idle_timeout_s: float = _DEFAULT_IDLE_TIMEOUT_S,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.name = name
        self.timeout_s = timeout_s
        self._max_sessions = max_sessions
        self._idle_timeout_s = idle_timeout_s
        self._sessions: dict[str, _SessionEntry] = {}
        self._lock = threading.Lock()  # dict 보호 전용
        self._stats = _LaneStats()

    def _get_or_create(self, key: str) -> _SessionEntry:
        """key에 해당하는 entry를 반환. 없으면 생성."""
        with self._lock:
            entry = self._sessions.get(key)
            if entry is None:
                # 용량 초과 시 idle 정리
                if len(self._sessions) >= self._max_sessions:
                    self._evict_idle_locked()
                # 정리 후에도 초과면 가장 오래된 idle 제거
                if len(self._sessions) >= self._max_sessions:
                    self._evict_oldest_idle_locked()
                entry = _SessionEntry()
                self._sessions[key] = entry
            entry.last_used = time.time()
            return entry
```

> 핵심 설계: `self._lock`은 **dict 조작만** 보호합니다. `semaphore.acquire()`는 lock 바깥에서 호출됩니다. 만약 `semaphore.acquire()`를 lock 안에서 호출하면, Semaphore 대기 중에 lock을 잡고 있으므로 다른 key의 `_get_or_create()`도 블록됩니다. 이것은 per-key 병렬성을 무효화합니다.

```
[잘못된 설계] lock 안에서 semaphore.acquire():

Thread A: lock 획득 → sem_A.acquire(대기) → lock 해제
Thread B: lock 획득 시도 → 대기 (A가 lock을 잡고 sem 대기 중)
          ↑ key가 달라도 A의 sem 해제까지 진입 불가

[올바른 설계] lock 밖에서 semaphore.acquire():

Thread A: lock 획득 → entry 조회 → lock 해제 → sem_A.acquire(대기)
Thread B: lock 획득 → entry 조회 → lock 해제 → sem_B.acquire(즉시 성공)
          ↑ A와 B가 독립적으로 진행
```

### 4.3. _evict_idle_locked -- held=True 보호

```python
class SessionLane:
    # ...

    def _evict_idle_locked(self) -> int:
        """idle 상태인 entry를 정리. held=True인 entry는 보호.

        _lock을 잡은 상태에서 호출해야 합니다.
        """
        now = time.time()
        threshold = now - self._idle_timeout_s
        to_remove = [
            k
            for k, entry in self._sessions.items()
            if entry.last_used < threshold and not entry.held
        ]
        for k in to_remove:
            del self._sessions[k]
        if to_remove:
            log.debug(
                "SessionLane '%s' evicted %d idle entries (%d remaining)",
                self.name,
                len(to_remove),
                len(self._sessions),
            )
        return len(to_remove)

    def _evict_oldest_idle_locked(self) -> bool:
        """가장 오래된 idle entry 1개를 강제 제거.

        _evict_idle_locked 이후에도 용량 초과일 때 호출.
        """
        oldest_key: str | None = None
        oldest_time = float("inf")
        for k, entry in self._sessions.items():
            if not entry.held and entry.last_used < oldest_time:
                oldest_key = k
                oldest_time = entry.last_used
        if oldest_key is not None:
            del self._sessions[oldest_key]
            log.debug(
                "SessionLane '%s' force-evicted oldest idle entry '%s'",
                self.name,
                oldest_key,
            )
            return True
        return False
```

> `not entry.held` 조건이 핵심입니다. 현재 Semaphore를 acquire한 상태의 entry를 제거하면, 해당 key로 `release()`가 호출될 때 entry를 찾을 수 없습니다. `held=True`인 entry는 어떤 상황에서도 eviction 대상이 되지 않습니다.

eviction 전략을 정리하면 다음과 같습니다.

| 단계 | 조건 | 동작 |
|------|------|------|
| 1. 용량 여유 | `len < max_sessions` | 즉시 생성 |
| 2. idle 정리 | `last_used < threshold AND NOT held` | 만료된 idle 일괄 제거 |
| 3. 강제 제거 | 정리 후에도 초과 | 가장 오래된 idle 1개 제거 |
| 4. 전원 held | 모든 entry가 held=True | 그대로 생성 (max 초과 허용) |

4단계가 `max_sessions`를 초과하는 것은 의도적입니다. active 세션을 제거하면 데이터 정합성이 깨집니다. cap은 soft limit이며, held 세션이 해제되면 자연스럽게 줄어듭니다.

### 4.4. max_sessions=256 cap

기본값 256은 다음 계산에 기반합니다.

```
GEODE Gateway 운용 시나리오:
- Slack 채널 10개 × 평균 5개 활성 스레드 = 50 세션
- Discord 채널 5개 × 평균 3개 활성 스레드 = 15 세션
- 스케줄러 잡 10개 = 10 세션
- 서브에이전트 최대 15개 = 15 세션
- 합계 ≈ 90 세션 (피크 시)

256 = 90 × 2.8 (여유) → 정상 운용에서 eviction 발생하지 않음
메모리: 256 × ~500 bytes ≈ 125KB (무시 가능)
```

---

## 5. Lane과의 API 호환

`SessionLane`은 기존 `Lane`과 다른 클래스입니다. 하지만 `LaneQueue.acquire_all()`이 두 타입을 모두 지원해야 합니다.

현재 `acquire_all()` 구현을 봅니다.

```python
# core/orchestration/lane_queue.py
class LaneQueue:
    @contextmanager
    def acquire_all(
        self,
        key: str,
        lane_names: list[str],
    ) -> Generator[None, None, None]:
        acquired_sems: list[Lane] = []
        try:
            for name in lane_names:
                lane = self._lanes.get(name)
                if lane is None:
                    raise KeyError(f"Lane '{name}' not found")
                if not lane._semaphore.acquire(timeout=lane.timeout_s):
                    raise TimeoutError(...)
                acquired_sems.append(lane)
                # ...
```

`lane._semaphore.acquire()`를 직접 호출합니다. `SessionLane`에는 `_semaphore`가 없습니다. per-key이므로 단일 semaphore 필드가 존재하지 않습니다.

해법은 **duck typing** 입니다. `Lane`과 `SessionLane` 모두가 동일한 내부 API를 제공하면, `acquire_all()`은 타입을 구분하지 않고 호출할 수 있습니다.

```python
class SessionLane:
    """Lane과 호환되는 API 표면."""

    @contextmanager
    def acquire(self, key: str) -> Generator[None, None, None]:
        """Context manager acquire — Lane.acquire()와 동일한 시그니처."""
        entry = self._get_or_create(key)
        acquired = entry.semaphore.acquire(timeout=self.timeout_s)
        if not acquired:
            self._stats.inc_timeouts()
            raise TimeoutError(
                f"SessionLane '{self.name}' timeout for key '{key}'"
            )
        entry.held = True
        self._stats.inc_acquired()
        try:
            yield
        finally:
            entry.held = False
            entry.last_used = time.time()
            entry.semaphore.release()
            self._stats.inc_released()

    def try_acquire(self, key: str) -> bool:
        """Non-blocking acquire — Lane.try_acquire()와 동일한 시그니처."""
        entry = self._get_or_create(key)
        acquired = entry.semaphore.acquire(timeout=0)
        if not acquired:
            self._stats.inc_timeouts()
            return False
        entry.held = True
        self._stats.inc_acquired()
        return True

    def manual_release(self, key: str) -> bool:
        """수동 해제 — Lane.manual_release()와 동일한 시그니처."""
        with self._lock:
            entry = self._sessions.get(key)
            if entry is None or not entry.held:
                log.warning(
                    "SessionLane '%s' manual_release for inactive key '%s'",
                    self.name,
                    key,
                )
                return False
            entry.held = False
            entry.last_used = time.time()
        entry.semaphore.release()
        self._stats.inc_released()
        return True

    def acquire_timeout(self, key: str, timeout_s: float) -> bool:
        """Blocking acquire with custom timeout."""
        entry = self._get_or_create(key)
        acquired = entry.semaphore.acquire(timeout=timeout_s)
        if not acquired:
            self._stats.inc_timeouts()
            return False
        entry.held = True
        self._stats.inc_acquired()
        return True
```

> `acquire`, `try_acquire`, `manual_release`, `acquire_timeout` -- 4개 API가 `Lane`과 동일한 시그니처를 가집니다. 호출자는 `Lane`인지 `SessionLane`인지 알 필요가 없습니다. 이것이 Python의 structural subtyping (duck typing)입니다.

---

## 6. _raw_acquire/_raw_release

`LaneQueue.acquire_all()`은 현재 `lane._semaphore.acquire()`를 직접 호출합니다. `SessionLane`을 지원하려면 이 부분을 추상화해야 합니다.

```python
class Lane:
    """기존 Lane에 _raw 메서드 추가."""

    def _raw_acquire(self, key: str) -> bool:
        """내부용: semaphore acquire + active tracking.

        LaneQueue.acquire_all()이 사용. context manager가 아님.
        Returns True on success, False on timeout.
        """
        acquired = self._semaphore.acquire(timeout=self.timeout_s)
        if not acquired:
            self._stats.inc_timeouts()
            return False
        with self._lock:
            self._active[key] = time.time()
        self._stats.inc_acquired()
        return True

    def _raw_release(self, key: str) -> None:
        """내부용: semaphore release + active tracking 해제."""
        with self._lock:
            self._active.pop(key, None)
        self._stats.inc_released()
        self._semaphore.release()


class SessionLane:
    """SessionLane에도 동일한 _raw 메서드."""

    def _raw_acquire(self, key: str) -> bool:
        entry = self._get_or_create(key)
        acquired = entry.semaphore.acquire(timeout=self.timeout_s)
        if not acquired:
            self._stats.inc_timeouts()
            return False
        entry.held = True
        self._stats.inc_acquired()
        return True

    def _raw_release(self, key: str) -> None:
        with self._lock:
            entry = self._sessions.get(key)
        if entry is not None:
            entry.held = False
            entry.last_used = time.time()
            entry.semaphore.release()
        self._stats.inc_released()
```

이제 `acquire_all()`은 `_raw_acquire`/`_raw_release`만 호출합니다.

```python
class LaneQueue:
    def __init__(self) -> None:
        self._lanes: dict[str, Lane | SessionLane] = {}

    def add_session_lane(
        self,
        name: str,
        *,
        max_sessions: int = 256,
        idle_timeout_s: float = 3600.0,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> SessionLane:
        """per-key 직렬화 lane 추가."""
        lane = SessionLane(
            name,
            max_sessions=max_sessions,
            idle_timeout_s=idle_timeout_s,
            timeout_s=timeout_s,
        )
        self._lanes[name] = lane
        return lane

    @contextmanager
    def acquire_all(
        self,
        key: str,
        lane_names: list[str],
    ) -> Generator[None, None, None]:
        """Lane과 SessionLane 모두 지원하는 다형적 acquire."""
        acquired: list[tuple[Lane | SessionLane, str]] = []
        try:
            for name in lane_names:
                lane = self._lanes.get(name)
                if lane is None:
                    raise KeyError(f"Lane '{name}' not found")
                # duck typing: Lane과 SessionLane 모두 _raw_acquire 지원
                if not lane._raw_acquire(key):
                    raise TimeoutError(
                        f"Lane '{name}' timeout for key '{key}'"
                    )
                acquired.append((lane, key))
            yield
        finally:
            for lane, k in reversed(acquired):
                lane._raw_release(k)
```

> `_raw_acquire`/`_raw_release`를 도입하는 이유는 기존 `acquire()` context manager와의 책임 분리입니다. `acquire()`는 외부 API(사용자가 `with lane.acquire():`로 호출), `_raw_acquire`는 내부 API(`LaneQueue`가 다중 lane을 조율할 때 사용)입니다. context manager의 `yield`를 중첩 없이 여러 lane에 적용하기 위해 raw 레벨 분리가 필요합니다.

---

## 7. 실사용 흐름

### 7.1. Gateway -- acquire_all()

Gateway는 Slack 메시지가 도착하면 session lane + global lane을 동시에 획득합니다.

```python
# core/gateway/channel_manager.py — route_message 내부
session_key = build_gateway_session_key(
    message.channel,       # "slack"
    message.channel_id,    # "C12345"
    message.sender_id,     # "U789"
    thread_id=message.thread_id,  # "1234567890.123456"
)
# session_key = "gateway:slack:c12345:u789:1234567890_123456"

with self._lane_queue.acquire_all(session_key, ["session", "global"]):
    response = self._processor(content, metadata)
```

`session` Lane이 `SessionLane`이면, 같은 Slack 스레드(`thread_id` 동일)의 요청은 직렬화되고, 다른 스레드의 요청은 병렬로 처리됩니다.

```
Slack Thread A: "오늘 날씨 알려줘"  →  session_key = "...thread_A"
Slack Thread A: "내일은?"           →  session_key = "...thread_A"  → A의 첫 번째 완료 후 실행
Slack Thread B: "뉴스 요약해줘"     →  session_key = "...thread_B"  → A와 병렬로 즉시 실행
```

### 7.2. Scheduler -- dual try_acquire

스케줄러는 non-blocking으로 두 개의 lane을 확인합니다. 하나라도 실패하면 다음 폴링에서 재시도합니다.

```python
# core/cli/__init__.py — 스케줄러 드레인 (설계)
session_lane = lane_queue.get_lane("session")  # SessionLane
sched_lane = lane_queue.get_lane("scheduler")  # Lane(max=2)

key = f"sched:{job_id}"

# 1) scheduler lane 확인 (전체 동시 실행 수 제한)
if not sched_lane.try_acquire(key):
    log.warning("Scheduler lane full, skipping %s", job_id)
    continue

# 2) session lane 확인 (같은 key의 중복 실행 방지)
if not session_lane.try_acquire(key):
    sched_lane.manual_release(key)  # rollback
    log.warning("Session lane busy for %s, retry next poll", key)
    continue

# 3) 비동기 실행 + 클로저에서 dual release
_cap_key = key
_cap_session = session_lane
_cap_sched = sched_lane

def _run_isolated(*, _key=_cap_key, _sess=_cap_session, _sch=_cap_sched):
    try:
        return loop.run(prompt)
    finally:
        _sess.manual_release(_key)
        _sch.manual_release(_key)
```

> 스케줄러의 dual try_acquire는 2단계 잠금입니다. `scheduler` Lane은 전체 동시 잡 수를 제한하고(global cap), `session` Lane은 같은 잡의 중복 실행을 방지합니다(per-key serialization). 둘 다 non-blocking이므로 메인 루프가 블록되지 않습니다.

### 7.3. Sub-agent -- unique key, transparent

서브에이전트는 항상 unique key를 사용합니다.

```python
# core/memory/session_key.py
def build_subagent_session_key(ip_name: str, task_id: str, phase: str = "pipeline") -> str:
    normalized_name = _normalize_name(ip_name)
    normalized_task_id = _normalize_name(task_id)
    return f"ip:{normalized_name}:{phase}:subagent:{normalized_task_id}"

# 예: "ip:berserk:pipeline:subagent:reddit_analysis"
```

`task_id`가 유일하므로, 서브에이전트의 session key는 항상 고유합니다. `SessionLane`에서 고유 key는 항상 새로운 `Semaphore(1)`을 받으므로, 대기 없이 즉시 acquire됩니다.

```
SubAgent "reddit_analysis":  key = "ip:berserk:...:reddit_analysis"  → 새 sem → 즉시 통과
SubAgent "youtube_analysis": key = "ip:berserk:...:youtube_analysis" → 새 sem → 즉시 통과
SubAgent "twitch_analysis":  key = "ip:berserk:...:twitch_analysis"  → 새 sem → 즉시 통과
```

서브에이전트 입장에서 `SessionLane`은 투명합니다. 병렬성을 제한하는 것은 `global` Lane이나 `subagent` Lane(`Lane(max_concurrent=5)`)의 역할입니다.

| 호출자 | Lane 조합 | SessionLane 역할 |
|--------|-----------|-----------------|
| Gateway | session + global | 같은 스레드 직렬화, 다른 스레드 병렬 |
| Scheduler | session + scheduler | 같은 잡 중복 방지 |
| Sub-agent | session + subagent | 투명 (unique key → 항상 즉시 통과) |

---

## 8. Wrap-up

| Item | Description |
|------|-------------|
| 문제 | `Lane("session", max=1)`은 전역 직렬화 -- 다른 key도 블록됨 |
| OpenClaw 원리 | per-key `Semaphore(1)` -- 같은 key serial, 다른 key parallel |
| OpenClaw 결함 | `max_sessions` 무제한, idle cleanup 없음 |
| GEODE 설계 | `_SessionEntry`(held 보호) + lazy creation(lock은 dict만) + eviction(idle 정리) + cap(256) |
| API 호환 | `_raw_acquire`/`_raw_release` duck typing으로 `LaneQueue.acquire_all()` 다형성 |
| 핵심 불변식 | `self._lock`은 dict 보호만, `semaphore.acquire()`는 lock 밖에서 호출 |

### Checklist

- [ ] `_SessionEntry`: `Semaphore(1)` + `last_used` + `held` 캡슐화
- [ ] `_get_or_create`: lazy creation, lock은 dict만 보호
- [ ] `_evict_idle_locked`: `held=True` 보호, idle만 정리
- [ ] `max_sessions=256`: soft cap, held 초과 허용
- [ ] `acquire`/`try_acquire`/`manual_release`/`acquire_timeout`: Lane과 동일 시그니처
- [ ] `_raw_acquire`/`_raw_release`: `LaneQueue.acquire_all()`의 다형성 지원
- [ ] lock 안에서 `semaphore.acquire()` 호출 금지 -- per-key 병렬성 무효화 방지

---

*Source: `blog/posts/technical/session-lane-per-key-serialization.md` | Category: [[blog-technical]]*

## Related

- [[blog-technical]]
- [[blog-hub]]
- [[geode]]
