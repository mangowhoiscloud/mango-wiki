---
title: "장기 실행 자율 에이전트 — '끝날 때까지 돌려'를 안전하게 만드는 설계"
type: reference
category: blog-post
tags: [blog, orchestration]
source: "blog/posts/orchestration/65-long-running-agent-openclaw-pattern.md"
created: 2026-04-08T00:00:00Z
---

# 장기 실행 자율 에이전트 — "끝날 때까지 돌려"를 안전하게 만드는 설계

> "50턴이면 충분하지 않나요?"
> 단순 질문에는 그렇습니다.
> 하지만 200개 파일을 리팩토링하는 야간 배치에서는
> 50턴이 절반도 채 못 갑니다.
> 이 글은 GEODE가 턴 제한을 벗어나
> "작업이 끝나거나 불가능하다고 판단할 때까지" 돌 수 있게 된 과정을 기록합니다.

> Date: 2026-03-28 | Author: rooftopsnow | Tags: long-running, agentic-loop, time-budget, context-overflow, openclaw, karpathy, while-true

---

## 목차

1. 문제: 50턴의 벽
2. 프론티어 3종이 이 문제를 푸는 방식
3. `for range(50)` → `while True`: 루프 구조 전환
4. 시간 예산 — Karpathy P3의 wall-clock 패턴
5. 컨텍스트가 넘칠 때 유저에게 알려주기
6. 서브에이전트도 동등하게
7. 안전 보장 — 5개 가드가 무한 루프를 막는 방법
8. 마무리

---

## 1. 문제: 50턴의 벽

GEODE의 AgenticLoop은 `for round_idx in range(50)`으로 돌아갑니다. Claude Code도 같은 구조입니다. 하나의 사용자 요청에 대해 LLM이 도구를 호출하고, 결과를 받고, 다시 호출하는 사이클을 **최대 50번** 반복합니다.

```python
# AS-IS: core/agent/agentic_loop.py
for round_idx in range(self.max_rounds):  # max_rounds=50
    response = await self._call_llm(system, messages)
    if response.stop_reason != "tool_use":
        return result  # 자연 종료
    tool_results = await self._process_tools(response)
    messages.append(tool_results)
# 여기 도달하면 → "Max rounds reached. Please try a more specific request."
```

> 50이라는 숫자는 대화형 사용에서는 충분합니다. 하지만 "이 코드베이스의 테스트 커버리지를 80%까지 올려"처럼 수십 개 파일을 순회해야 하는 작업에서는 턴이 모자랍니다. 그렇다고 `max_rounds=1000`으로 올리면, 에이전트가 같은 에러를 반복하며 새벽 3시에 API 비용 $200을 태우고 있을 수 있습니다.

"턴 제한을 높인다"가 아니라, **"언제 멈출지를 에이전트와 인프라가 함께 결정하는 구조"**가 필요합니다.

---

## 2. 프론티어 3종이 이 문제를 푸는 방식

이 문제를 이미 해결한 시스템 3종을 비교했습니다.

| 항목 | Claude Code | OpenClaw | Karpathy autoresearch |
|------|-----------|----------|----------------------|
| **루프** | `for range(50)` | `while(tool_use)` | `while(budget > 0)` |
| **종료 조건** | 라운드 상한 | LLM stop + 타임아웃 | 시간 예산 소진 |
| **컨텍스트** | 서버 압축 80% | auto-compaction | L1 차단/L2 추출/L3 요약 |
| **무한 루프 방지** | 수렴 감지 (에러 4회) | Stuck 2시간 해제 | 래칫 (악화 시 롤백) |

OpenClaw의 Attempt Loop이 가장 급진적입니다. **라운드 상한이 없습니다.** 대신 Lane Queue의 `runTimeoutSeconds`, StuckDetector의 2시간 자동 해제, 컨텍스트 오버플로우 자동 압축이 종료를 결정합니다. LLM이 "할 일이 끝났다"고 판단하면 `end_turn`을 보내고, 그것이 자연스러운 종료입니다.

Karpathy의 autoresearch는 [이전 포스트](https://rooftopsnow.tistory.com/308)에서 다뤘듯 **시간 예산**(`TRAINING_BUDGET_SECONDS=300`)으로 제어합니다. "300초 안에 최선을 다하라" — 효율적인 에이전트일수록 같은 시간에 더 많은 실험을 돌립니다.

---

## 3. `for range(50)` → `while True`: 루프 구조 전환

OpenClaw 패턴을 채택했습니다. `for` 루프를 `while True`로 바꾸고, 3개 가드를 상단에 배치합니다.

```python
# TO-BE: core/agent/agentic_loop.py
self._loop_start_time = time.monotonic()
round_idx = 0
while True:
    # Guard 1: 라운드 상한 (0이면 비활성 → 무제한)
    if self.max_rounds > 0 and round_idx >= self.max_rounds:
        break
    # Guard 2: 시간 예산 (0이면 비활성)
    if self._time_budget_s > 0:
        elapsed = time.monotonic() - self._loop_start_time
        if elapsed >= self._time_budget_s:
            break

    response = await self._call_llm(system, messages, round_idx=round_idx)
    if response.stop_reason != "tool_use":
        return result  # 자연 종료

    tool_results = await self._process_tools(response)
    messages.append(tool_results)
    round_idx += 1
```

> `max_rounds=0`이면 Guard 1이 비활성화됩니다. 이때 루프는 LLM이 `end_turn`을 보내거나, 시간 예산이 소진되거나, 수렴 감지가 발동하거나, 컨텍스트 오버플로우가 반복되어 LLM이 더 이상 유의미한 출력을 하지 못할 때 자연스럽게 종료됩니다. 기존 `max_rounds=50` 기본값은 그대로 유지되므로, **기존 동작은 100% 호환**됩니다.

---

## 4. 시간 예산 — Karpathy P3의 wall-clock 패턴

`time_budget_s` 파라미터를 추가했습니다. `max_rounds`와 독립적으로 동작합니다.

```python
# config.toml
[agentic]
time_budget = 300  # 5분
```

시간 예산에도 **Wrap-Up Headroom** 개념을 적용했습니다. Claude Code는 마지막 2라운드 전에 `tool_choice=none`으로 강제 전환하여 에이전트가 결과를 정리하게 합니다. 이걸 시간 기반으로 확장했습니다.

```python
_WRAP_UP_TIME_HEADROOM_S = 30.0  # 만료 30초 전부터 도구 호출 차단

# WRAP_UP: 라운드 기반 OR 시간 기반
force_text = False
if self.max_rounds > 0:
    remaining = self.max_rounds - round_idx
    force_text = remaining <= self.WRAP_UP_HEADROOM
if not force_text and self._time_budget_s > 0:
    remaining_time = self._time_budget_s - elapsed
    force_text = remaining_time <= self._WRAP_UP_TIME_HEADROOM_S
```

> 30초는 LLM 라운드 2~3회에 해당합니다. 에이전트는 이 시간 동안 새 도구를 호출하지 않고, 지금까지의 결과를 종합하여 텍스트로 응답합니다. "갑자기 끊기는" 경험이 사라집니다.

---

## 5. 컨텍스트가 넘칠 때 유저에게 알려주기

[52번 포스트](https://rooftopsnow.tistory.com/333)에서 다룬 컨텍스트 3중 방어(80% 압축, 95% 프루닝)가 장기 실행의 핵심 인프라입니다. 문제는 이 압축이 **조용히** 일어난다는 것이었습니다.

```python
# AS-IS: log만 남기고, 유저는 모름
log.info("Emergency pruned: %d → %d messages", original_count, len(pruned))
```

유저 입장에서는 "아까 분명 말했는데 왜 모르지?"라는 혼란이 발생합니다. 컨텍스트가 압축됐다는 사실을 알아야 합니다.

```python
# TO-BE: UI 알림 추가
def render_context_event(event_type, *, original_count, new_count):
    label = "compacted" if event_type == "compact" else "pruned"
    console.print(f"  [dim]⟳ Context {label}: {original_count} → {new_count} messages[/dim]")
```

실제 동작:

```
✢ Thinking... (round 42)
  ⟳ Context compacted: 85 → 12 messages      ← 이게 새로 추가된 알림
✓ web_fetch → 3.2KB
✢ Thinking... (round 43)
```

> [28번 포스트](https://rooftopsnow.tistory.com/316)의 Hook System이 이 알림의 트리거입니다. `CONTEXT_CRITICAL` 이벤트 → `_apply_overflow_strategy()` → 압축/프루닝 실행 → `_notify_context_event()` → 콘솔 출력. 서브에이전트(`quiet=True`)에서는 표시하지 않습니다.

---

## 6. 서브에이전트도 동등하게

[23번 포스트](https://rooftopsnow.tistory.com/313)에서 서브에이전트가 부모의 도구/MCP/스킬/메모리를 **전부 상속**하는 구조를 만들었습니다. 하지만 실행 예산은 상속하지 않았습니다.

| 항목 | 부모 (AS-IS) | 서브에이전트 (AS-IS) | 서브에이전트 (TO-BE) |
|------|-------------|--------------------|--------------------|
| max_rounds | 50 | **10** | **50** |
| max_tokens | 32,768 | **8,192** | **32,768** |
| max_turns (대화 이력) | 200 | **10** | **200** |

> 8,192 토큰이면 긴 코드 생성이나 상세 분석이 불가능합니다. 10턴 대화 이력은 장기 작업에 전혀 부족합니다. 부모와 동일하게 맞추되, 안전장치(depth=2, max_total=15, summary 500자 cap)는 유지합니다. 서브에이전트 결과가 부모 컨텍스트에 주입될 때는 여전히 summary 한 줄만 들어갑니다.

---

## 7. 안전 보장 — 5개 가드가 무한 루프를 막는 방법

`max_rounds=0`, `time_budget_s=0`으로 설정하면 진짜 무한히 돌까요? 아닙니다.

| Guard | 작동 조건 | 효과 |
|-------|----------|------|
| **수렴 감지** | 동일 에러 4회 연속 | `break` — "이 방법으로는 안 된다" |
| **컨텍스트 80%** | Provider별 자동 압축 | 메시지 요약/축소 후 계속 |
| **컨텍스트 95%** | 긴급 프루닝 (최근 N개만) | 오래된 메시지 삭제 후 계속 |
| **StuckDetector** | 2시간 무응답 | 세션 자동 해제 |
| **Gateway max_rounds=5** | 외부 메시지 (Slack 등) | 게이트웨이는 별도 제한 유지 |

**최악의 시나리오**: 모든 가드가 작동하지 않으면? 컨텍스트 오버플로우가 반복적으로 압축 → 품질 저하 → LLM이 유의미한 도구 호출을 하지 못함 → `end_turn` 자연 종료. 또는 StuckDetector가 2시간 후 강제 해제합니다.

> 비용 상한(세션당 $X 초과 시 정지)은 이번 이터레이션에 포함하지 않았습니다. 현재는 [토큰 추적 시스템](https://rooftopsnow.tistory.com/333)이 세션 비용을 집계하지만, 자동 정지까지는 연결되지 않은 상태입니다. 다음 이터레이션 대상입니다.

---

## 8. 마무리

### 핵심 정리

| 변경 | Before | After |
|------|--------|-------|
| 루프 구조 | `for range(50)` | `while True` + 3 guards |
| 종료 조건 | 라운드 상한만 | 라운드 + 시간 + 수렴 + 컨텍스트 |
| 컨텍스트 압축 | 자동, 무음 | 자동 + UI 알림 |
| 서브에이전트 | 부모의 1/4~1/5 예산 | 부모와 동일 |
| GLM-5 컨텍스트 | 80K (오류) | 200K (실측) |

### 관련 포스트

- [52번 — Token Guard: 컨텍스트 예산을 지키는 3중 방어](https://rooftopsnow.tistory.com/333)
- [28번 — Hook System: 이벤트 버스로 파이프라인 관통](https://rooftopsnow.tistory.com/316)
- [23번 — 서브에이전트 Full Inheritance](https://rooftopsnow.tistory.com/313)
- [38번 — 하네스 엔지니어링: AI 에이전트를 자율 비행시키는 제어 구조](https://rooftopsnow.tistory.com/319)
- [19번 — Karpathy autoresearch: 자율 ML 연구 루프](https://rooftopsnow.tistory.com/308)

### 다음은

- 비용 상한 (세션당 $X 초과 시 자동 정지)
- 래칫 메커니즘 (결과가 나빠지면 자동 롤백)
- 다양성 강제 (같은 전략 5회 반복 시 다른 경로 시도)

이 셋이 갖춰지면 "야간 무인 배치"가 가능해집니다. 지금은 "사람이 지켜보면서 오래 돌리는" 단계입니다.

---

*이 글은 GEODE [#511](https://github.com/mangowhoiscloud/geode/pull/511) PR의 설계 결정을 정리한 것입니다. 코드는 [GEODE 리포지토리](https://github.com/mangowhoiscloud/geode)에서 확인할 수 있습니다.*

---

*Source: `blog/posts/orchestration/65-long-running-agent-openclaw-pattern.md` | Category: [[blog-orchestration]]*

## Related

- [[blog-orchestration]]
- [[blog-hub]]
- [[geode]]
