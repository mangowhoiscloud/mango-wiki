---
title: SessionLane — Per-Key Concurrency Control
tags: [geode, concurrency, session-lane, openclaw, queue]
sources: [raw/geode-blog/research/lanequeue-coalescingqueue-geode-evolution.md]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.90, inferred: 0.10 }
---

# SessionLane — Per-Key Concurrency Control

OpenClaw LaneQueue/CoalescingQueue에서 GEODE SessionLane으로의 진화. 5개 동시성 게이트를 2개로 통합한 큐 아키텍처 단순화.

## Origin: OpenClaw Patterns

- **LaneQueue**: Named lane 기반 Semaphore 동시성 제어 (`session`, `global`, `scheduler`)
- **CoalescingQueue**: 250ms 디바운스 윈도우로 중복 요청 합침

## Problem Discovery

### Global Serialization Bug

OpenClaw의 `Lane("session", max=1)`은 모든 세션을 하나의 Semaphore(1)로 직렬화. "같은 세션 내 직렬화" 의도였으나 실제로는 전체 세션이 한 줄로 서는 글로벌 직렬화가 발생.

### Dead Code: CoalescingQueue

콜백이 `lambda _k, _d: None` (no-op). 148줄의 Timer 기반 디바운스가 `set` 멤버십 체크 한 줄로 대체 가능. 트리거 조건 자체가 존재하지 않음(서브에이전트는 tool_use당 1회 생성, 250ms 내 재제출 물리적 불가).

## Solution: SessionLane

### Core Design

```python
class _SessionEntry:
    __slots__ = ("semaphore", "last_used", "held")
    def __init__(self):
        self.semaphore = threading.Semaphore(1)  # per-key 독립
        self.last_used = time.time()
        self.held = False  # eviction 보호
```

**Per-key Semaphore**: 같은 key → 직렬화, 다른 key → 병렬.

### Critical Invariant: Lock Scope Separation

```
self._lock → dict 보호만 (get/create/evict)
semaphore.acquire() → lock 밖에서 호출
```

Lock 안에서 semaphore.acquire()를 호출하면, Thread A가 대기 중 lock 점유 → 모든 스레드의 `_get_or_create()` 차단 → per-key 병렬성 파괴.

### Idle Eviction with `held` Flag

| Step | Condition | Action |
|------|-----------|--------|
| 1 | len < max_sessions | 즉시 생성 |
| 2 | last_used < threshold AND NOT held | 만료 엔트리 일괄 제거 |
| 3 | 정리 후에도 초과 | 가장 오래된 idle 1개 제거 |
| 4 | 모든 엔트리 held | 소프트 캡 초과 허용 (데드락 방지) |

`held` 플래그로 TOCTOU 레이스 방지: Semaphore acquire 상태의 엔트리는 절대 evict하지 않음.

## Architecture Simplification

| Metric | Before (v0.36.0) | After (Session 48) | Delta |
|--------|-------------------|---------------------|-------|
| Concurrency gates | 5 | 2 | -60% |
| Components | 3 | 1 | -67% |
| Dynamic lanes | 4 | 0 | -100% |
| Tests | 3,386 | 3,433 | +47 |
| Deleted lines | -- | ~487 | REPL bootstrap |

## Design Lessons

1. **Lock scope separation**: Dict lock != Semaphore lock. Per-key 병렬성의 전제.
2. **`held` flag**: Eviction과 acquire 사이의 TOCTOU를 단일 boolean으로 해결.
3. **Soft cap**: Hard limit은 데드락 → max_sessions=256은 권고치, 초과 허용.
4. **Dead code detection**: 콜백이 no-op이면 전체 메커니즘의 존재 이유를 재검토.
5. **코드 삭제 > 코드 추가**: 게이트 60% 감소가 테스트 47개 추가보다 더 큰 품질 향상.

## Related

- [[geode-gateway]] — Gateway concurrency management
- [[geode-openclaw-patterns]] — OpenClaw adopted patterns
- [[geode-architecture]] — GEODE architecture overview
- [[blog-research-detail]] — Full research document index
