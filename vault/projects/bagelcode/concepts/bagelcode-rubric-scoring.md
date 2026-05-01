---
title: 베이글코드 과제 — 루브릭 기반 스코어링 (토큰 투자 대비 실효성)
category: concepts
tags: [bagelcode, rubric, scoring, evaluation, efficiency, tokens, anti-deception]
sources:
  - "[[bagelcode-tradingagents-paper]]"
  - "[[bagelcode-transcripts-schema]]"
  - "[[bagelcode-caching-strategy]]"
  - "[[kiki-scorecard-guards]]"
created: 2026-05-01
updated: 2026-05-01
---

# 루브릭 기반 스코어링 — 토큰 투자 대비 실효성

> 멀티 에이전트 시스템에서 가장 흔한 실패: **토큰 많이 써놓고 결과는 빈약**. 또는 **에이전트끼리 서로 칭찬만 하고 실제 검증은 안 함**. 이 페이지는 그 두 실패 모드를 잡는 루브릭과 측정 데이터의 spec.
>
> 영감: [[bagelcode-tradingagents-paper]] §5.1 (4지표) + [[kiki-scorecard-guards]] (C2/C8/C10) + Karpathy P4 (anti-deception ratchet).

## 두 가지 측정 대상

```
                   ┌─ 1) Outcome Quality   (작업 결과의 좋음)
Rubric measures ──┤
                   └─ 2) Efficiency        (토큰/$ 대비 그 좋음)
```

→ **둘 다 측정해야 의미 있다.** 좋기만 한 건 비싸고, 싸기만 한 건 nonsense. 비율(quality/cost)이 진짜 신호.

## 차원 (5 dimensions × 5점)

[[kiki-scorecard-guards]] 의 5점 척도 차용. 각 차원 0-5, 합산 25점 만점:

| # | 차원 | 정의 | 측정 방법 |
|---|---|---|---|
| **D1** | **Spec 적합성** | Builder 산출이 Spec AC를 충족하는가 | Critic 이 AC 항목별 ✓/✗ |
| **D2** | **실행 가능성** | README 대로 실제 동작하는가 | Critic 이 `run_cmd` 실행 + exit code |
| **D3** | **사용자 관찰성** | transcript 만 보고 의사결정 추적 가능한가 | 자동: kind 다양성 + body 평균 길이 |
| **D4** | **합의 수렴** | 에이전트끼리 같은 얘기 맴돌지 않는가 | 자동: spec.update 횟수, 무한루프 감지 |
| **D5** | **사용자 개입 효율** | 사용자가 끼어들면 실제로 반영되는가 | 자동: user.intervene → 다음 spec/build 변경 여부 |

D1+D2 = outcome quality 직접. D3+D4+D5 = process quality (multi-agent 협업의 본질).

## D1 Spec 적합성 — 자동/반자동 mix

```
score = 5 × (충족된 AC 수 / 전체 AC 수)
```

세부 채점 (Critic 의 `verify.result.dimensions.spec_fit`):

```jsonc
{
  "spec_fit": {
    "score": 4.5,
    "criteria": [
      {"ac": "GET /todos returns 200", "result": "PASS", "evidence": "curl ... 200"},
      {"ac": "POST creates todo", "result": "PASS", "evidence": "..."},
      {"ac": "DELETE removes", "result": "PARTIAL", "evidence": "404 instead of 204"}
    ]
  }
}
```

→ Critic 의 verify.result 가 **이 schema 를 채워야** D1 점수 산출. 안 채우면 자동 0점 (anti-deception).

## D2 실행 가능성 — 객관 측정

Critic 이 산출물의 `run_cmd` 실행 → stdout/stderr 캡처 → transcript 에 기록:

```jsonc
{
  "kind": "verify.result",
  "data": {
    "exec": {
      "cmd": "python -m pytest -q",
      "exit_code": 0,
      "duration_ms": 1240,
      "stdout_tail": "5 passed in 0.34s"
    }
  }
}
```

`exit_code == 0` 이고 stdout 에 fail 패턴 없으면 5점, 아니면 0점. **실행 결과 없으면 자동 0점.**

→ Karpathy P4 (anti-deception): "Critic 이 PASS 라고 적어도 exit_code 가 없으면 무효" 룰을 코드로 박는다.

## D3 사용자 관찰성 — 자동 측정

Transcript 자체에서 추출:

```python
def D3(transcript: list[Message]) -> float:
    kinds = {m.kind for m in transcript}
    diversity = len(kinds & {"goal", "spec", "build", "verify.result", "done"})  # 0-5
    avg_body = mean(len(m.body) for m in transcript if m.body)
    coverage = 1.0 if avg_body > 80 else avg_body / 80  # 너무 짧으면 깎음
    return min(5.0, diversity + coverage * 0.5)
```

→ "kind 다양성 ≥ 5 AND 평균 body ≥ 80자" = 5점. trivial echo 핑퐁이면 자동 깎임.

## D4 합의 수렴 — 자동 측정

무한 루프 / 핑퐁 감지:

```python
def D4(transcript: list[Message]) -> float:
    spec_count = count(kind="spec") + count(kind="spec.update")
    if spec_count > 5: return 1.0      # 5번 이상 다시 짜면 수렴 실패
    build_count = count(kind="build")
    if build_count > 3: return 2.0     # 3번 이상 빌드면 수렴 약함
    if has_user_veto_chain(): return 3.0
    return 5.0                          # 깔끔한 1-pass 수렴
```

## D5 사용자 개입 효율 — 자동 측정

```python
def D5(transcript: list[Message]) -> float:
    interventions = filter(kind="user.intervene")
    if not interventions: return 5.0   # 개입 안 했으면 만점 (필요 없는 시스템)
    responded = count(intervene → next spec/build with reference)
    return 5.0 * (responded / len(interventions))
```

→ "사용자 개입을 무시하지 않는다" 가 multi-agent 시스템의 진짜 가치. 개입 1회당 응답 여부 측정.

## 효율 (Efficiency) — 별도 차원

quality 25점 위에 **토큰 투자 대비** 효율 비율:

```
total_cost   = sum(tokens_in × price_in + tokens_out × price_out for each msg)
quality      = D1+D2+D3+D4+D5  (0-25)
cache_ratio  = sum(cache_read) / sum(tokens_in)
intervention_burden = count(user.intervene + user.veto + user.redo)

efficiency_score = (quality / 25) / (total_cost / $1)   # 1$당 quality fraction
```

**Target (제출 시):**

| 지표 | 목표 |
|---|---|
| Quality (총합 25) | ≥ 20 (각 차원 4점 이상) |
| Total cost | ≤ $1.5 / session |
| Cache hit ratio | ≥ 60% |
| Intervention burden | ≤ 2 / session (개입 너무 많으면 도구가 무의미) |
| Efficiency score | ≥ 0.5 / $ |

→ README 에 이 5개 수치를 demo 세션 결과로 박는다. **자기 시스템 자기가 채점한 결과**가 평가자에겐 가장 정직한 신호.

## TradingAgents §5.1 와의 매핑

| TradingAgents 4-지표 | 우리 5-차원 |
|---|---|
| Cumulative Return (수익) | D1 + D2 (outcome) |
| Sharpe Ratio (위험조정) | quality / cost (위험 = 토큰 비용) |
| Max Drawdown (최악 낙폭) | D4 무한 루프 감지 (worst case 수렴 실패) |
| Annualized Return (연환산) | efficiency_score (시간단위 → cost단위) |

→ 도메인 다르지만 골격은 같다: **outcome × efficiency × worst-case 안전성**.

## Anti-Deception 룰 (Karpathy P4 의 우리 구현)

| 룰 | 위반 시 |
|---|---|
| Critic 이 PASS 인데 `exec.exit_code` 없음 | D2 = 0 강제 |
| Critic 이 PASS 인데 `criteria` 배열 없음 | D1 = 0 강제 |
| Spec 이 AC 비어있음 | D1 = 0 강제 |
| Builder 가 build 했는데 artifacts 없음 | D2 = 0 강제 |
| 사용자 user.veto 후 그대로 done | D5 = 0 + 전체 0 강제 |

→ 이 룰들이 **transcript validator 의 일부**. 채점은 결국 schema 검증의 결과. ([[bagelcode-transcripts-schema]] §"미정/후속" 의 JSON Schema 와 같은 코드 path)

## 1세션 채점 예시

위 [[bagelcode-transcripts-schema]] 의 예시 transcript 적용:

| 차원 | 점수 | 근거 |
|---|---|---|
| D1 Spec 적합성 | 4.7 | 3/3 AC PASS, dimensions.criteria 작성됨 |
| D2 실행 가능성 | 5.0 | exit_code=0, "5 passed" |
| D3 관찰성 | 5.0 | 5 kinds diversity, body 평균 충분 |
| D4 수렴 | 5.0 | spec_update 1회, build 1회 |
| D5 개입 효율 | 5.0 | intervene 0회 |
| **Quality** | **24.7 / 25** | |
| total cost | $0.045 | tokens 합산 |
| cache hit | 92% | sandwich 적중 |
| **Efficiency** | **22 / $1** | quality 0.99 / cost 0.045 |

→ 매 세션 끝에 자동 산출 + transcript 에 `kind=audit` 으로 추가.

## 미정 / 후속

- [ ] 차원별 weighting (모두 동등 vs D1·D2 가중)
- [ ] 가격표 (`PRICE_TABLE.json`) 모델별 갱신 주기
- [ ] Critic 이 자기 검증 시 D1 자기 채점 안 됨 → 별도 evaluator 모듈로 분리?
- [ ] LLM-as-judge 회의론 — Critic 의 D1 평가가 hallucination 일 위험. 해법: D1 은 Critic + 정규식 / pytest 등 코드 검증 mix.

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-transcripts-schema]] — 채점 input
- [[bagelcode-caching-strategy]] — efficiency 분모 측정
- [[bagelcode-tradingagents-paper]] §5.1 4-지표
- [[kiki-scorecard-guards]] — 5점 × N차원 spec, C8/C10 anti-deception 영감
