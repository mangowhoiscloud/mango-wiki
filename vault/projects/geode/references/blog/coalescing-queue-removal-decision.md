---
title: "CoalescingQueue 삭제 결정 — '프론티어 패턴이니까'는 근거가 아니다"
type: reference
category: blog-post
tags: [blog, narrative]
source: "blog/posts/narrative/coalescing-queue-removal-decision.md"
created: 2026-04-08T00:00:00Z
---

# CoalescingQueue 삭제 결정 — "프론티어 패턴이니까"는 근거가 아니다

> Date: 2026-03-30 | Tags: decision-record, dead-code, simplicity, agent-architecture

## 배경

GEODE의 `CoalescingQueue`는 OpenClaw의 wake coalescing 패턴을 가져온 것이다. 원래 설계 의도:

```
250ms 내 동일 요청 → 병합 → callback 1회 실행
메인 lane 점유 시 → 1초 간격 retry
```

Session 48에서 큐잉 아키텍처를 전면 재설계하면서 (3개 독립 LaneQueue → SessionLane + Global), CoalescingQueue를 여러 차례 검토했다.

## 검토 과정

### 1차: Beck (검증팀)

> "CoalescingQueue callback은 no-op (`lambda _k, _d: None`). 제거하고 `seen: set[str]`으로 대체하면 동일한 동작."

→ **P1 (Deception)**: dead feature disguised as active.

### 2차: Karpathy (검증팀)

> "CoalescingQueue는 dedup (제출 단계), SessionLane은 gate (실행 단계). 다른 관심사. 유지."

→ **P3 (Keep)**: not redundant, different concern.

### 3차: 재검토 (이 문서)

Karpathy의 "다른 관심사" 논거를 실제 코드에서 검증:

```python
# sub_agent.py — 실제 사용
is_new = self._coalescing.submit(key, lambda _k, _d: None, None)
```

**callback이 no-op이면** submit()의 return value만 사용. 이는 `key in seen_set`과 동일하다.

**"다른 관심사"가 맞더라도, 발동 조건이 존재하지 않는다:**

- Sub-agent 작업은 LLM이 1회 `tool_use`로 생성
- `delegate(tasks)` 호출 내에서 같은 `task_id` 중복 확률 ≈ 0
- AgenticLoop는 동기 루프 — 250ms 내 재호출 구조적 불가능

## 결정

**삭제한다.**

| 기준 | 결과 |
|------|------|
| callback 실행 여부 | no-op (lambda) — 실행해도 아무것도 안 함 |
| dedup 발동 빈도 | 0 (동기 루프 구조상 250ms 내 재제출 불가) |
| SessionLane 중복 | 같은 key → 직렬화로 이미 보호 |
| 코드 비용 | 148줄 + Timer 스레드 + RuntimeCoreConfig 필드 |
| 테스트 비용 | test_coalescing.py 유지보수 |

## 교훈

1. **"프론티어에서 가져왔으니까"는 근거가 아니다.** OpenClaw의 coalescing은 비동기 이벤트 루프(heartbeat + webhook) 환경에서 의미가 있었다. GEODE의 동기 AgenticLoop에서는 발동 조건 자체가 없다.

2. **"해가 없으니까"도 근거가 아니다.** 148줄의 코드는 읽는 사람에게 "이게 뭔가 중요한 일을 하고 있구나"라는 인상을 준다. 실제로는 아무것도 안 한다. 이것이 더 큰 해다.

3. **검증팀의 "다른 관심사" pass는 이론적으로 맞았지만 실증적으로 틀렸다.** 관심사가 다르더라도 발동 빈도가 0이면 존재할 이유가 없다.

## 삭제 범위

- `core/orchestration/coalescing.py` (148줄)
- `core/runtime.py` CoalescingQueue import + 인스턴스 생성
- `core/runtime.py` RuntimeCoreConfig.coalescing 필드
- `core/agent/sub_agent.py` _deduplicate() 내 coalescing 참조
- `tests/test_coalescing.py`

---

*Source: `blog/posts/narrative/coalescing-queue-removal-decision.md` | Category: [[blog-narrative]]*

## Related

- [[blog-narrative]]
- [[blog-hub]]
- [[geode]]
