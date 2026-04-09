---
title: "야간 무인 배치를 위한 3가지 안전 장치 — 비용 상한, 래칫, 다양성 강제"
type: reference
category: blog-post
tags: [blog, orchestration]
source: "blog/posts/orchestration/66-autonomous-safety-overnight-batch.md"
created: 2026-04-08T00:00:00Z
---

# 야간 무인 배치를 위한 3가지 안전 장치 — 비용 상한, 래칫, 다양성 강제

> "사람이 지켜보면서 오래 돌리는" 단계에서
> "자고 일어나면 끝나있는" 단계로.
> 이 글은 GEODE의 `while(True)` 루프에 야간 무인 실행을 안전하게 만드는
> 3가지 메커니즘을 추가한 과정을 기록합니다.

> Date: 2026-03-28 | Author: rooftopsnow | Tags: autonomous-safety, cost-budget, ratchet, diversity-forcing, karpathy, overnight-batch, while-true

---

## 목차

1. 이전 글에서 남긴 숙제
2. 3조건이 왜 필요한가
3. 조건 1: 비용 상한 자동 정지
4. 조건 2: 런타임 래칫 — 중단이 아닌 에스컬레이션
5. 조건 3: 다양성 강제 — 같은 삽질 방지
6. 3조건이 동시에 작동하는 시나리오
7. 마무리

---

## 1. 이전 글에서 남긴 숙제

[이전 글](https://rooftopsnow.tistory.com/359)에서 GEODE의 `for range(50)` → `while True` 전환을 다뤘습니다. 시간 예산, 컨텍스트 오버플로우 감지, 수렴 감지까지 넣었지만, 마지막에 이렇게 썼습니다:

> - 비용 상한 (세션당 $X 초과 시 자동 정지)
> - 래칫 메커니즘 (결과가 나빠지면 자동 롤백)
> - 다양성 강제 (같은 전략 5회 반복 시 다른 경로 시도)
>
> 이 셋이 갖춰지면 "야간 무인 배치"가 가능해집니다.

이번 글은 이 3가지를 구현한 기록입니다.

---

## 2. 3조건이 왜 필요한가

`while True` 루프에 시간 예산과 수렴 감지만 있으면 충분하지 않을까요? 아닙니다.

| 시나리오 | 기존 가드 | 문제 |
|----------|----------|------|
| API 비용 폭주 | 시간 예산만 | 10분 안에 $50 쓸 수 있음 |
| 같은 에러 반복 | 수렴 감지 → 중단 | 더 강한 모델이면 풀 수 있는 문제도 포기 |
| 같은 도구만 호출 | 감지 없음 | `web_search` 10번 반복해도 결과 안 바뀜 |

Karpathy의 autoresearch 논문(P3, P4)에서 이 문제를 명확히 짚습니다:

- **P3 (고정 시간 예산)**: "N회 반복" 대신 "T분 안에 최선을" — 하지만 시간만으로는 비용을 제어하지 못합니다.
- **P4 (래칫)**: `modify → evaluate → if better: keep, else: revert` — 단, local optima 갇힘을 완화하려면 Diversity Forcing이 필요합니다.

---

## 3. 조건 1: 비용 상한 자동 정지

### Before

```python
# /cost budget 10.00 → 표시만
# 실제 루프에서 비용 체크: 없음
```

세션 비용은 `TokenTracker`가 추적하지만, AgenticLoop이 이 값을 확인하지 않았습니다.

### After

```python
# AgenticLoop.__init__
self._cost_budget = cost_budget  # 0 = 무제한

# 매 라운드 후
if self._cost_budget > 0:
    tracker = get_tracker()
    if tracker.session_accumulator.total_cost_usd >= self._cost_budget:
        return AgenticResult(
            text=f"Cost budget (${self._cost_budget:.2f}) exceeded.",
            termination_reason="cost_budget_exceeded",
        )
```

> 핵심 설계 결정: 라운드 **후**에 체크합니다. 라운드 **전**에 체크하면 마지막 작업의 결과를 사용자에게 전달하지 못합니다. "돈은 썼는데 결과는 못 봄"을 방지합니다.

REPL에서 `/cost budget 5.00`으로 설정하면, 세션 누적 비용이 $5를 넘는 순간 루프가 정상 종료됩니다.

---

## 4. 조건 2: 런타임 래칫 — 중단이 아닌 에스컬레이션

### Before

```python
# 동일 에러 3회 → 즉시 중단
if len(set(last_3)) == 1:
    return True  # break
```

같은 에러가 3번 반복되면 루프를 끝냅니다. 하지만 이건 너무 빨리 포기합니다. Sonnet이 못 푸는 문제를 Opus는 풀 수 있을 수 있습니다.

### After

```python
if len(set(last_3)) == 1:
    if not self._convergence_escalated:
        self._convergence_escalated = True
        self._try_model_escalation()  # Sonnet → Opus
        self._recent_errors.clear()   # 에스컬레이션 후 재시작
        return False                  # 한 번 더 기회
    # 이미 에스컬레이션했는데도 같은 에러 → 이제 중단
    if len(self._recent_errors) >= 4 and len(set(self._recent_errors[-4:])) == 1:
        return True
```

에스컬레이션 맵:

```python
escalation_map = {
    "claude-sonnet-4-6": "claude-opus-4-6",
    "claude-haiku-4-5-20251001": "claude-sonnet-4-6",
    "gpt-4.1-mini": "gpt-4.1",
    "gpt-4.1": "gpt-5.4",
    "glm-4.7-flash": "glm-5",
}
```

> Karpathy P4의 래칫은 "결과가 나빠지면 롤백"입니다. GEODE에서는 "같은 실패가 반복되면 더 강한 모델로 에스컬레이션"으로 변환했습니다. 코드 생성이 아닌 대화형 에이전트에서는 "롤백"보다 "전략 전환"이 더 적합합니다.

---

## 5. 조건 3: 다양성 강제 — 같은 삽질 방지

### 문제

`web_search("ML Engineer 채용")` → 결과 불만족 → 다시 `web_search("ML Engineer 채용")` → 5번 반복.

LLM은 같은 도구를 같은 방식으로 반복 호출하는 경향이 있습니다. 결과가 안 나오면 "다른 도구를 써보자"가 아니라 "같은 도구를 더 세게 써보자"를 선택합니다.

### 구현

```python
# 도구 호출 추적
self._consecutive_tool_tracker.append(tool_name)

# 5회 연속 같은 도구 → 힌트 주입
if len(self._consecutive_tool_tracker) >= 5:
    last_5 = self._consecutive_tool_tracker[-5:]
    if len(set(last_5)) == 1:
        messages.append({
            "role": "user",
            "content": f"[system] The tool '{last_5[0]}' has been called "
                       f"5 times consecutively. Try a different approach.",
        })
        self._consecutive_tool_tracker.clear()
```

> "강제"가 아닌 "힌트"입니다. 도구를 블랙리스트하지 않습니다. LLM에게 "다른 접근을 시도하라"는 시스템 메시지를 주입하고, 최종 판단은 LLM이 합니다. Karpathy P4의 Diversity Forcing 원칙을 따릅니다.

---

## 6. 3조건이 동시에 작동하는 시나리오

야간 배치로 "AI 트렌드 리서치 + 리포트 생성"을 실행한다고 가정합니다.

```
[Round 1-5]  web_search × 5 → 다양성 강제 힌트 주입
[Round 6]    web_fetch로 전환 → 새로운 결과 획득
[Round 7-9]  web_fetch 실패 × 3 → 수렴 감지 → Sonnet → Opus 에스컬레이션
[Round 10]   Opus로 재시도 → 성공
[Round 11]   generate_report → 완료
[비용 체크]   $4.80 / $5.00 → 예산 내 정상 종료
```

3가지 가드가 계층적으로 작동합니다:

```
다양성 강제 (도구 수준)  ← 가장 먼저 개입
    ↓
런타임 래칫 (모델 수준)  ← 에러 반복 시
    ↓
비용 상한 (세션 수준)    ← 최종 안전망
```

---

## 7. 마무리

### 핵심 정리

| 메커니즘 | 감지 | 행동 | Karpathy 대응 |
|----------|------|------|:------------:|
| 비용 상한 | `total_cost >= budget` | 루프 정상 종료 | P3 |
| 런타임 래칫 | 동일 에러 3회 | 모델 에스컬레이션 → 재시도 | P4 |
| 다양성 강제 | 동일 도구 5회 | 시스템 힌트 주입 | P4 완화 |

### Before vs After

| 항목 | Before (65번 글) | After (이번 글) |
|------|-----------------|----------------|
| 비용 제어 | 표시만 | 자동 정지 |
| 수렴 대응 | 즉시 중단 | 에스컬레이션 → 재시도 → 중단 |
| 반복 도구 | 감지 없음 | 5회 → 힌트 주입 |
| 운용 단계 | "지켜보면서 돌리기" | **"자고 일어나면 끝나있기"** |

### 아직 남은 것

- **그래프 부분 상태 스냅샷**: 파이프라인 재시도 전 상태 저장 (graph-partial-state)
- **E2E Phase 6**: 서브에이전트 + 스케줄러 + 모델 전환 통합 검증
- **Hook L4 AUTONOMY**: 승인 패턴 학습 → 자동 승인 룰 생성

### 관련 포스트

- [65번 — 장기 실행 자율 에이전트: while True 설계](https://rooftopsnow.tistory.com/359)
- [52번 — Token Guard: 컨텍스트 예산을 지키는 3중 방어](https://rooftopsnow.tistory.com/333)
- [19번 — Karpathy autoresearch: 자율 ML 연구 루프](https://rooftopsnow.tistory.com/308)
- [38번 — 하네스 엔지니어링: AI 에이전트를 자율 비행시키는 제어 구조](https://rooftopsnow.tistory.com/319)

---

*이 글은 GEODE [#513](https://github.com/mangowhoiscloud/geode/pull/513) PR의 설계 결정을 정리한 것입니다. 코드는 [GEODE 리포지토리](https://github.com/mangowhoiscloud/geode)에서 확인할 수 있습니다.*

---

*Source: `blog/posts/orchestration/66-autonomous-safety-overnight-batch.md` | Category: [[blog-orchestration]]*

## Related

- [[blog-orchestration]]
- [[blog-hub]]
- [[geode]]
