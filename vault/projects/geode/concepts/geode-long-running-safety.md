---
title: Long-Running Agent Safety Patterns
tags: [geode, safety, agentic-loop, frontier, ratchet]
sources: [raw/geode-blog/research/long-running-agent-safety.md]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.80, inferred: 0.20 }
---

# Long-Running Agent Safety Patterns

프론티어 하네스 3종(Claude Code, OpenClaw, Karpathy autoresearch)에서 추출한 장기 실행 에이전트 안전 설계 패턴과 GEODE 적용.

## Core Principle

> "제어된 자율성" — 제약(CANNOT)이 자유도(CAN)보다 먼저 정의된다.

## Key Patterns

### 1. Wrap-Up Headroom (Claude Code)

`max_rounds` 도달 2턴 전부터 `tool_choice=none`으로 강제 전환. 에이전트가 작업 중간에 갑자기 종료되지 않고, 결과를 정리할 시간을 확보한다.

**GEODE 적용**: [[geode-agentic-loop]]의 종료 시퀀스에 headroom 적용 가능.

### 2. Ratchet Mechanism (Karpathy P4)

매 반복마다 checkpoint → modify → evaluate → 점수 하락 시 revert. "절대 나빠지지 않는다"는 보장으로 야간 무인 실행에 필수.

**GEODE 적용**: Pipeline 재실행 시 이전 결과와 비교하는 scoring ratchet 구현 예정.

### 3. Triple Termination Condition

```
종료 = min(시간 예산, 반복 상한) OR 목표 달성 검증 통과
```

시간 예산(wall-clock)이 반복 횟수보다 정직한 제약 — 에이전트가 스스로 효율을 최적화하게 유도.

### 4. Convergence Detection + Diversity Forcing

- **수렴 감지**: 동일 에러 4회 반복 시 루프 탈출 (Claude Code)
- **다양성 강제**: 동일 전략 5회 반복 시 다른 방향 강제 (autoresearch)
- 조합: "반복하면 멈추고, 같은 길만 가면 돌리고, 나빠지면 되돌린다"

### 5. Error Recovery with Safety Gate

4단계 에스컬레이션: RETRY → ALTERNATIVE → FALLBACK → ESCALATE.
핵심 불변식: `DANGEROUS` 도구(`run_bash`, `memory_save` 등)는 자동 복구 대상에서 제외.

## Context Management Under Long Runs

3계층 전략:
- **80%**: WARNING — Anthropic 서버 압축 / OpenAI 클라이언트 요약
- **95%**: CRITICAL — 긴급 프루닝 (첫 메시지 + 브릿지 + 최근 N개)
- **Overflow**: Hook 기반 압축 전략 결정

## GEODE GAP Status

| Pattern | Status | Priority |
|---------|--------|----------|
| Wrap-Up Headroom | 미구현 | P0 |
| 시간 예산 모드 | 미구현 | P0 |
| Ratchet (상태 롤백) | 미구현 | P1 |
| Diversity Forcing | 미구현 | P1 |
| Convergence Detection | 구현 완료 | -- |
| Error Recovery 4단계 | 구현 완료 | -- |
| Context 3계층 관리 | 구현 완료 | -- |

## Related

- [[geode-agentic-loop]] — GEODE agentic loop design
- [[geode-context-guard]] — Context overflow prevention
- [[blog-research-detail]] — Full research document index
- [[geode-claude-code-patterns]] — Claude Code adopted patterns
