---
title: "Exponential Backoff + Jitter — Thundering Herd를 해소하는 재시도 설계"
type: reference
category: blog-post
tags: [blog, llm-resilience]
source: "blog/posts/llm-resilience/70-exponential-backoff-jitter-thundering-herd.md"
created: 2026-04-08T00:00:00Z
---

# Exponential Backoff + Jitter — Thundering Herd를 해소하는 재시도 설계

> Date: 2026-03-31 | Author: rooftopsnow | Tags: jitter, exponential-backoff, thundering-herd, retry, resilience, circuit-breaker, geode

## 목차

1. 도입 — 동시에 재시도하면 실패가 반복된다
2. 순수 Exponential Backoff의 한계
3. Jitter 3대 전략 — Full, Equal, Decorrelated
4. GEODE 기존 구현과 갭 분석
5. Jitter 적용 — Before vs After
6. SessionLane과 Jitter의 상호작용
7. 프로덕션 적용 가이드라인
8. 마무리

---

## 1. 도입 — 동시에 재시도하면 실패가 반복된다

LLM API 기반 에이전트 시스템에서 재시도(Retry)는 필수 레질리언스 패턴입니다. Rate Limit, 네트워크 타임아웃, 5xx 에러는 일상적으로 발생하며, 적절한 재시도 로직 없이는 단발성 장애가 전체 파이프라인을 중단시킵니다.

GEODE는 v0.8부터 Exponential Backoff(지수 백오프)와 Circuit Breaker(서킷 브레이커)를 조합한 4-Stage Failover를 운영해 왔습니다(#08 참조). 그러나 **순수 지수 백오프에는 치명적인 맹점**이 있습니다 — 여러 세션이 동시에 실패하면, 동일한 대기 시간 후 동시에 재시도하여 **Thundering Herd(떼몰림 문제)**를 유발합니다.

이 글에서는 Jitter(지터, 무작위 분산)를 도입하여 재시도 타이밍을 분산시키는 설계를 다룹니다. AWS Architecture Blog의 3대 Jitter 전략을 비교하고, GEODE의 기존 백오프 로직에 적용한 구현을 해설합니다.

---

## 2. 순수 Exponential Backoff의 한계

### 2.1 기본 공식

```
delay = min(base * 2^attempt, max_delay)
```

| attempt | base=1s | cap=30s |
|---------|---------|---------|
| 0 | 1s | 1s |
| 1 | 2s | 2s |
| 2 | 4s | 4s |
| 3 | 8s | 8s |
| 4 | 16s | 16s |
| 5 | 32s | 30s (cap) |

> 단일 클라이언트에서는 효과적입니다. 문제는 **N개 세션이 동일 시점에 실패할 때** 발생합니다.

### 2.2 Thundering Herd 시나리오

```
시간 →
t=0   [S1] [S2] [S3] [S4] [S5]  ← 5개 세션 동시 Rate Limit
       │    │    │    │    │
t=1s  [S1] [S2] [S3] [S4] [S5]  ← 전원 동시 재시도 → 다시 Rate Limit
       │    │    │    │    │
t=2s  [S1] [S2] [S3] [S4] [S5]  ← 또 동시 재시도 → 또 Rate Limit
       │    │    │    │    │
t=4s  [S1] [S2] [S3] [S4] [S5]  ← 패턴 반복...
```

5개 세션이 정확히 같은 시점에 1s, 2s, 4s를 대기합니다. API 서버 입장에서는 트래픽 스파이크가 반복되어 복구할 여유가 없습니다. 세션 수가 많아질수록 상황은 악화됩니다.

**핵심 문제**: 결정론적(deterministic) 대기 시간이 동기화된 재시도 파동을 만듭니다.

---

## 3. Jitter 3대 전략 — Full, Equal, Decorrelated

AWS Architecture Blog에서 제시한 3가지 Jitter 전략을 비교합니다. 모든 전략의 목표는 동일합니다 — **재시도 타이밍에 무작위성을 부여하여 동기화를 깨뜨리는 것**입니다.

### 3.1 Full Jitter

```python
# 전략 1: Full Jitter
sleep = random_between(0, min(cap, base * 2 ** attempt))
```

> 대기 시간을 0부터 지수 백오프 값까지의 전체 구간에서 무작위로 선택합니다. 분산 범위가 가장 넓어 Thundering Herd 해소에 가장 효과적입니다. 단점은 0에 가까운 값이 나올 수 있어 즉시 재시도가 발생할 가능성이 있다는 것입니다.

### 3.2 Equal Jitter

```python
# 전략 2: Equal Jitter
temp = min(cap, base * 2 ** attempt)
sleep = temp / 2 + random_between(0, temp / 2)
```

> 지수 백오프의 절반은 보장하고, 나머지 절반에서 무작위를 적용합니다. 최소 대기 시간이 보장되어 서버에 최소한의 회복 시간을 부여합니다. 다만 분산 범위가 Full Jitter의 절반이므로 Thundering Herd 해소 효과는 상대적으로 약합니다.

### 3.3 Decorrelated Jitter

```python
# 전략 3: Decorrelated Jitter
sleep = min(cap, random_between(base, prev_sleep * 3))
```

> 이전 대기 시간을 기반으로 다음 대기 시간을 결정합니다. 직전 sleep 값의 3배까지 무작위 범위를 확장하므로, 시도가 누적될수록 분산이 자연스럽게 넓어집니다. 상태(prev_sleep)를 유지해야 하는 것이 구현상 차이입니다.

### 3.4 전략 비교

| 전략 | 수식 | 최소 대기 | 분산 범위 | 상태 유지 | Thundering Herd 해소 |
|------|------|----------|----------|----------|---------------------|
| **No Jitter** | `base * 2^n` | 결정론적 | 없음 | 불필요 | 해소 불가 |
| **Full Jitter** | `random(0, exp)` | 0 | 최대 | 불필요 | 최고 |
| **Equal Jitter** | `exp/2 + random(0, exp/2)` | exp/2 | 중간 | 불필요 | 중간 |
| **Decorrelated** | `random(base, prev*3)` | base | 점진 확대 | 필요 | 높음 |

```
                    분산 범위 시각화 (attempt=2, base=1s, cap=30s)

No Jitter:    |████|                         delay = 4s (고정)
              0    4

Full Jitter:  |░░░░░░░░░░░░░░░░|            delay ∈ [0, 4s]
              0                4

Equal:        |    |░░░░░░░░░░░░|            delay ∈ [2, 4s]
              0    2            4

Decorrelated: |░░░░░░░░░░░░░░░░░░░░░░░░░|   delay ∈ [1, prev*3] (확장형)
              0                         ...
```

> AWS의 시뮬레이션 결과에 따르면, Full Jitter가 총 작업량(서버 부하)을 가장 크게 줄이며, Decorrelated Jitter가 완료 시간에서 근소하게 유리합니다. 둘 다 순수 백오프 대비 **작업량을 70-90% 감소**시킵니다.

---

## 4. GEODE 기존 구현과 갭 분석

### 4.1 기존 4-Stage Failover

```python
# geode/llm/client.py (기존)
def _retry_with_backoff(fn: Any, *, model: str, max_retries: int = 3) -> Any:
    """4-Stage Failover: Retry → Fallback → Circuit Break → Recovery."""
    if not _circuit_breaker.can_execute():
        raise RuntimeError("Circuit breaker is open — 호출 차단 중")

    models_to_try = [model] + [m for m in FALLBACK_MODELS if m != model]

    for current_model in models_to_try:
        for attempt in range(max_retries):
            try:
                result = fn(model=current_model)
                _circuit_breaker.record_success()
                return result
            except _RETRYABLE_ERRORS as exc:
                delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
                time.sleep(delay)
            except anthropic.BadRequestError as exc:
                if "credit balance" in str(exc).lower():
                    raise RuntimeError("API 크레딧 부족") from exc
                raise

    _circuit_breaker.record_failure()
    raise last_error
```

> 86행의 `delay` 계산이 순수 지수 백오프입니다. `random` 요소가 없으므로 동일 시점에 실패한 모든 세션이 동일한 대기 시간을 갖습니다.

### 4.2 갭 분석

| 구성 요소 | 상태 | 비고 |
|----------|------|------|
| Exponential Backoff | 구현 완료 | `1s → 2s → 4s`, cap 30s |
| Circuit Breaker | 구현 완료 | 3-State, 5회 임계, 60s 복구 |
| Provider Fallback | 구현 완료 | Opus → Sonnet → Haiku |
| **Jitter** | **미구현** | 결정론적 delay, Thundering Herd 취약 |
| Retry Budget | 미구현 | 레이어 간 재시도 증폭 미방어 |

**GEODE에서 Thundering Herd가 실제로 발생하는 시나리오:**

1. Slack Gateway에 5개 채널이 바인딩된 상태
2. Anthropic API가 일시적으로 Rate Limit 반환
3. 5개 세션의 `_retry_with_backoff()`가 동시에 `time.sleep(1.0)` 진입
4. 1초 후 5개 요청이 동시에 API를 호출 → 다시 Rate Limit
5. Circuit Breaker가 열리기 전까지 3 × 5 = 15회의 동기화된 스파이크 발생

---

## 5. Jitter 적용 — Before vs After

### 5.1 Jitter Strategy 선택: Full Jitter

GEODE에는 **Full Jitter**를 적용합니다.

| 판단 기준 | Full Jitter 선택 이유 |
|----------|---------------------|
| 서버 부하 최소화 | 분산 범위가 가장 넓어 동기화 해소에 최적 |
| 구현 단순성 | 상태 유지 불필요 (Decorrelated 대비) |
| SessionLane 보완 | per-key 직렬화가 최소 대기를 이미 보장 |
| AWS 권장 | "총 작업량 기준 Full Jitter가 최선" |

> Equal Jitter의 "최소 대기 보장"은 매력적이지만, GEODE는 SessionLane의 per-key Semaphore가 동일 세션 내 직렬화를 이미 보장합니다. 따라서 Jitter 계층에서는 분산을 극대화하는 Full Jitter가 적합합니다.

### 5.2 구현

```python
# geode/llm/client.py (업데이트)
import random

RETRY_BASE_DELAY: float = 1.0
RETRY_MAX_DELAY: float = 30.0

def _jittered_delay(attempt: int) -> float:
    """Full Jitter: delay ∈ [0, min(cap, base * 2^attempt)].

    순수 지수 백오프의 Thundering Herd 문제를 해소합니다.
    동일 시점에 실패한 N개 세션의 재시도 타이밍을 무작위로 분산시켜
    API 서버에 균일한 부하를 분배합니다.
    """
    exp_delay = min(RETRY_BASE_DELAY * (2 ** attempt), RETRY_MAX_DELAY)
    return random.uniform(0, exp_delay)
```

> `random.uniform(0, exp_delay)`가 Full Jitter의 핵심입니다. 0부터 지수 백오프 상한까지 균등 분포로 대기 시간을 선택합니다. `random.random() * exp_delay`와 동일하지만, 의도가 더 명확한 `uniform`을 사용합니다.

```python
# geode/llm/client.py (업데이트)
def _retry_with_backoff(fn: Any, *, model: str, max_retries: int = 3) -> Any:
    """4-Stage Failover + Full Jitter."""
    if not _circuit_breaker.can_execute():
        raise RuntimeError("Circuit breaker is open — 호출 차단 중")

    models_to_try = [model] + [m for m in FALLBACK_MODELS if m != model]
    last_error: Exception | None = None

    for current_model in models_to_try:
        for attempt in range(max_retries):
            try:
                result = fn(model=current_model)
                _circuit_breaker.record_success()
                return result
            except _RETRYABLE_ERRORS as exc:
                last_error = exc
                delay = _jittered_delay(attempt)  # Full Jitter 적용
                time.sleep(delay)
            except anthropic.BadRequestError as exc:
                if "credit balance" in str(exc).lower():
                    raise RuntimeError("API 크레딧 부족") from exc
                raise

    _circuit_breaker.record_failure()
    raise last_error  # type: ignore[misc]
```

> 변경점은 단 한 줄입니다: `delay = min(...)` → `delay = _jittered_delay(attempt)`. 기존 4-Stage Failover, Circuit Breaker, Provider Fallback 로직은 변경 없이 유지됩니다.

### 5.3 Before vs After 비교

```
Before (No Jitter) — 5개 세션 동시 실패

시간 →  0     1s    2s    3s    4s    5s    6s    7s
        ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
S1      █─────█───────────█
S2      █─────█───────────█
S3      █─────█───────────█
S4      █─────█───────────█
S5      █─────█───────────█
                ▲           ▲
              스파이크      스파이크
        API 부하: ███████░░░███████░░░░░░░███████


After (Full Jitter) — 5개 세션 동시 실패

시간 →  0     1s    2s    3s    4s    5s    6s    7s
        ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
S1      █──█
S2      █───────█
S3      █────█
S4      █─────────█
S5      █──────█
        API 부하: █░█░██░█░█░░░░░░░░░░░░░░░░░░░░
                  ↑ 분산된 재시도, 스파이크 없음
```

| 지표 | Before (No Jitter) | After (Full Jitter) |
|------|-------------------|---------------------|
| 1차 재시도 동시성 | 5/5 (100%) | ~1/5 (20%) |
| 2차 재시도 동시성 | 5/5 (100%) | ~0-1/5 |
| API 피크 부하 | N (세션 수) | ~1-2 |
| Circuit Breaker 트리거 확률 | 높음 | 낮음 |
| 평균 완료 시간 | 동일 | 유사 (±10%) |

---

## 6. SessionLane과 Jitter의 상호작용

GEODE의 SessionLane은 **per-key Semaphore(1)**로 동일 세션 내 요청을 직렬화합니다. Jitter와 SessionLane은 서로 다른 계층에서 동시성을 제어합니다.

```
┌─────────────────────────────────────────────────┐
│                  API Server                      │
│    (Rate Limit: N requests/min per API key)      │
└──────────────────────┬──────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │ Session │   │ Session │   │ Session │
    │  Lane 1 │   │  Lane 2 │   │  Lane 3 │
    │ sem(1)  │   │ sem(1)  │   │ sem(1)  │
    └────┬────┘   └────┬────┘   └────┬────┘
         │             │             │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │ Jitter  │   │ Jitter  │   │ Jitter  │
    │ Layer   │   │ Layer   │   │ Layer   │
    │ [0,exp] │   │ [0,exp] │   │ [0,exp] │
    └─────────┘   └─────────┘   └─────────┘
```

| 계층 | 역할 | 범위 |
|------|------|------|
| **SessionLane** | 동일 세션 직렬화 | intra-session |
| **Jitter** | 세션 간 재시도 분산 | inter-session |
| **Circuit Breaker** | 전체 호출 차단/복구 | global |

> SessionLane은 "같은 세션의 요청이 겹치지 않도록" 보장하고, Jitter는 "다른 세션의 재시도가 겹치지 않도록" 분산합니다. 두 계층은 직교(orthogonal)하며, 조합하면 **intra-session 직렬화 + inter-session 분산**이라는 이상적인 부하 분배가 달성됩니다.

---

## 7. 프로덕션 적용 가이드라인

### 7.1 Retry Budget: 레이어 간 증폭 방지

AWS Builders' Library가 강조하는 핵심 안티패턴은 **다층 재시도 증폭**입니다. 3개 레이어가 각각 3회 재시도하면 백엔드에 3^3 = 27배 부하가 걸립니다.

```python
# geode/llm/client.py — Retry Budget 상수
MAX_RETRY_BUDGET_PER_MINUTE: int = 10  # 분당 최대 재시도 횟수

class RetryBudget:
    """슬라이딩 윈도우 기반 재시도 예산.

    전체 시스템에서 분당 재시도 횟수를 제한하여
    다층 재시도 증폭을 방지합니다.
    """

    def __init__(self, max_per_minute: int = MAX_RETRY_BUDGET_PER_MINUTE) -> None:
        self._max = max_per_minute
        self._timestamps: list[float] = []

    def can_retry(self) -> bool:
        now = time.time()
        self._timestamps = [t for t in self._timestamps if now - t < 60.0]
        return len(self._timestamps) < self._max

    def record(self) -> None:
        self._timestamps.append(time.time())
```

> Retry Budget은 Jitter, Circuit Breaker와 함께 **재시도 3중 안전장치**를 구성합니다: (1) Jitter가 타이밍을 분산하고, (2) Retry Budget이 총량을 제한하며, (3) Circuit Breaker가 연속 실패 시 전체를 차단합니다.

### 7.2 Idempotency: 재시도의 전제 조건

재시도가 안전하려면 API 호출이 멱등(idempotent)이어야 합니다. LLM API의 `generate()` 호출은 본질적으로 멱등합니다 — 동일 입력에 대해 부수효과 없이 응답을 반환합니다. 그러나 도구 실행(`run_bash`, `write_file`)은 멱등하지 않으므로 **재시도 대상에서 제외**해야 합니다.

```python
_RETRYABLE_ERRORS = (
    anthropic.RateLimitError,
    anthropic.APIConnectionError,
    anthropic.InternalServerError,
)
# BadRequestError, AuthenticationError 등은 재시도 불가
```

> Retryable과 Non-Retryable의 명확한 분리는 GEODE 초기 설계(#08)부터 유지된 원칙입니다. Jitter 도입 시에도 이 분류는 변경하지 않습니다.

### 7.3 관측성: Jitter 효과 측정

```python
# geode/llm/client.py — 재시도 메트릭
import logging

logger = logging.getLogger(__name__)

def _retry_with_backoff(fn: Any, *, model: str, max_retries: int = 3) -> Any:
    # ... (생략)
    except _RETRYABLE_ERRORS as exc:
        last_error = exc
        delay = _jittered_delay(attempt)
        logger.info(
            "retry attempt=%d model=%s delay=%.3fs error=%s",
            attempt, current_model, delay, type(exc).__name__,
        )
        time.sleep(delay)
```

> `delay` 값을 로깅하면 Jitter의 실제 분산 효과를 사후 분석할 수 있습니다. delay 값의 표준편차가 0에 가까우면 Jitter가 작동하지 않는 것이고, base 값의 50% 이상이면 충분히 분산되고 있는 것입니다.

---

## 8. 마무리

### 핵심 정리

| 항목 | 값/설명 |
|------|---------|
| Jitter 전략 | Full Jitter — `random.uniform(0, min(cap, base * 2^attempt))` |
| 선택 근거 | 서버 부하 최소화 + 구현 단순성 + SessionLane 보완 |
| 변경 범위 | `_retry_with_backoff()` 내 delay 계산 1줄 |
| Thundering Herd 해소 | 동시 재시도 100% → ~20% (5세션 기준) |
| 기존 구조 영향 | Circuit Breaker, Fallback Chain 변경 없음 |
| 추가 안전장치 | Retry Budget (분당 10회 상한) |
| 관측성 | retry 로그에 delay 값 기록 |

### 재시도 3중 안전장치 요약

```
요청 실패
  │
  ├─ 1차: Jitter Layer ──── 타이밍 분산 (inter-session)
  │      delay = random(0, exp_backoff)
  │
  ├─ 2차: Retry Budget ──── 총량 제한 (system-wide)
  │      분당 10회 이내
  │
  └─ 3차: Circuit Breaker ── 연속 실패 차단 (per-provider)
         5회 연속 → 60초 차단 → Half-Open 프로브
```

### 체크리스트

- [ ] `_jittered_delay()` 함수 추가 — Full Jitter 적용
- [ ] `_retry_with_backoff()` delay 계산을 `_jittered_delay()` 호출로 교체
- [ ] `RetryBudget` 클래스 구현 — 분당 재시도 상한
- [ ] retry 로그에 `delay` 값 포함 — Jitter 효과 관측
- [ ] 기존 Circuit Breaker, Fallback Chain 동작 검증 — 회귀 없음 확인
- [ ] 멀티 세션 부하 테스트 — Thundering Herd 해소 확인

### 참고 자료

- [Exponential Backoff And Jitter — AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Timeouts, retries and backoff with jitter — AWS Builders' Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [Jitter: Making Things Better With Randomness — Marc Brooker](https://brooker.co.za/blog/2015/03/21/backoff.html)
- [Retry Patterns That Work — DEV Community (2026)](https://dev.to/young_gao/retry-patterns-that-actually-work-exponential-backoff-jitter-and-dead-letter-queues-75)

---

*Source: `blog/posts/llm-resilience/70-exponential-backoff-jitter-thundering-herd.md` | Category: [[blog-llm-resilience]]*

## Related

- [[blog-llm-resilience]]
- [[blog-hub]]
- [[geode]]
- [[geode-llm-models]]
