---
title: Kiki Circuit Breaker — Per-Agent + Company-Wide Resilience
type: concept
tags: [kiki, resilience, circuit-breaker, fault-tolerance]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Circuit Breaker

2-level circuit breaker 패턴으로 에이전트 장애 전파를 차단.

## Per-Agent Circuit Breaker (3-state)

```
CLOSED (normal) → 3 consecutive failures → OPEN (blocked)
  → 5 ± 1.25min jittered timeout → HALF_OPEN (probe)
    → success → CLOSED
    → failure → OPEN (re-arm)
```

- Jittered timeout: thundering herd 방지 (25% random jitter)
- Failure classification: `auth_fail`, `rate_limit`, `timeout`, `unknown`
- Snapshot persistence: 플러그인 재시작 시 상태 복원

## Company-Wide Circuit Breaker

3개 이상 서로 다른 에이전트가 1분 내 실패 → 전사적 차단.

```
Config:
  agentFailureThreshold: 3 (distinct agents)
  windowMs: 60,000 (1 minute)
  cooldownMs: 300,000 (5 minutes auto-reset)
```

## API Key Rotation

429 Rate Limit 발생 시 자동으로 다음 키로 전환 (round-robin). 30분 후 exhausted 키 재시도(recovery probe).

## Related

- [[kiki]]
- [[kiki-scorecard-guards]]
