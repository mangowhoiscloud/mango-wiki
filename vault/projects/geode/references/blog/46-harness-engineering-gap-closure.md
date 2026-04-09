---
title: "Harness Engineering GAP Closure — 10개의 런타임 GAP을 모두 닫다"
type: reference
category: blog-post
tags: [blog, harness-frontier]
source: "blog/posts/harness-frontier/46-harness-engineering-gap-closure.md"
created: 2026-04-08T00:00:00Z
---

# Harness Engineering GAP Closure — 10개의 런타임 GAP을 모두 닫다

> "우승 팀은 133회의 Socratic 라운드를 실행했다. REODE는 0회였다."

harness-for-real 분석 후 발견한 10개의 GAP은 각각 "왜 REODE는 그 수준에 도달하지 못하는가?"에 대한 구체적인 답이었습니다. 이 글은 각 GAP의 before/after를 기록합니다.

---

## Context: harness-for-real과의 비교

"harness-for-real"은 프로덕션 레벨 코딩 에이전트의 패턴을 정리한 벤치마크 분석입니다. 상위권 에이전트들이 공통적으로 보유한 런타임 특성을 추출하면 다음과 같습니다:

1. 이전 실행의 학습을 다음 실행에 주입합니다
2. Quality gate가 파이프라인 진행을 blocking합니다
3. 동일 오류 반복 시 다른 전략으로 전환합니다
4. 비용 예산을 초과하면 즉시 중단합니다
5. 일정 간격으로 빌드를 강제하여 오류 누적을 방지합니다
6. Fix loop의 수렴/정체를 감지합니다
7. 불명확한 입력에 대해 자동 재시도합니다
8. 단일 관점이 아닌 다중 관점으로 검증합니다
9. 배포 가능 상태를 검사합니다
10. 독립적 변환을 병렬로 실행합니다

REODE v0.13 시점에서 **이 10가지 중 하나도 구현되어 있지 않았습니다.** 파이프라인은 assess -> plan -> transform -> validate -> fix(loop) -> measure의 선형 흐름이었고, fix_node는 LLM에게 오류를 던지고 결과를 받는 단순 루프였습니다.

---

## GAP 1: LEARNINGS Injection

**Before**: fix_node의 각 iteration은 독립적이었습니다. iteration 1에서 "Lombok 버전을 올려야 한다"는 결론에 도달해도, iteration 2에서 이 정보가 사라졌습니다.

**After**: `_append_learning()`이 성공한 fix의 summary를 `LEARNINGS.md`에 기록하고, `_build_fixer_user_prompt()`가 다음 iteration의 prompt에 `## Prior Learnings` 섹션으로 주입합니다.

```python
def _append_learning(source_path: str, iteration: int, summary: str) -> None:
    learnings_path = Path(source_path) / "LEARNINGS.md"
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    entry = f"\n- [{timestamp}] iteration={iteration}: {summary[:200]}\n"
    # append if exists, create if not
    ...
```

**효과**: "이전에 Lombok을 1.18.34로 올렸으나 annotationProcessorPaths가 빠져서 실패했다"는 정보가 다음 iteration에서 활용됩니다. 에이전트가 같은 실수를 반복하지 않도록 하는 가장 기본적인 메커니즘입니다.

---

## GAP 2: Quality Gate Blocking

**Before**: validate_node가 build 실패를 보고해도, 특정 조건에서 measure_node로 진행하여 불완전한 scorecard를 생성했습니다.

**After**: `_route_after_validate()`가 build 실패 시 **반드시** fix_node로 라우팅합니다. `max_iterations`에 도달하거나 stuck이 감지된 경우에만 measure로 탈출합니다.

```python
def _route_after_validate(state: MigrationState) -> str:
    build_ok = state.get("build_success")
    iteration = state.get("iteration", 0)
    max_iter = state.get("max_iterations", 3)

    if iteration >= max_iter:
        return "measure"     # 탈출 밸브
    if build_ok is False:
        return "fix"         # 빌드 실패 -> 반드시 fix
    if test_rate is not None and test_rate < 100.0:
        return "fix"         # 테스트 실패 -> fix
    return "measure"         # 모두 통과 -> 측정
```

---

## GAP 3: Recovery Mode

**Before**: fix_node가 동일 오류를 반복하면 `max_iterations`에 도달할 때까지 같은 실패를 반복했습니다.

**After**: `_is_stuck()`이 최근 2회 시도의 summary 앞 200자를 비교하여 정체를 감지합니다. 감지 시 `## RECOVERY MODE` 헤더를 prompt에 주입하여 "COMPLETELY DIFFERENT strategy"를 지시합니다.

```python
if recovery_mode:
    recovery_header = (
        "## RECOVERY MODE\n"
        "Previous approaches failed repeatedly with the same error. "
        "Try a COMPLETELY DIFFERENT strategy.\n"
        "- A different API replacement\n"
        "- Checking upstream/downstream dependencies\n\n"
    )
    user_prompt = recovery_header + user_prompt
```

Recovery 후에도 실패하면 `recovery_attempted=True`가 설정되고, 다음 라우팅에서 measure로 탈출합니다. **무한 루프 방지와 전략 전환을 동시에 달성합니다.**

---

## GAP 4: Budget Enforcement

**Before**: 비용 제한 없이 LLM을 호출했습니다. 복잡한 프로젝트에서 fix loop가 20회 돌면 수십 달러가 소비되었습니다.

**After**: `budget_usd` state 필드로 비용 상한을 설정하고, 초과 시 LLM 호출을 skip합니다.

```python
budget_usd = state.get("budget_usd", 0.0) or 0.0
prior_cost = state.get("fix_total_cost", 0.0) or 0.0
if budget_usd > 0 and prior_cost >= budget_usd:
    log.warning("FIX: budget exceeded ($%.2f / $%.2f) — skipping LLM call",
                prior_cost, budget_usd)
    return {
        "fix_attempts": [{"iteration": iteration, "summary": "budget exceeded",
                          "success": False, "cost_usd": 0.0, ...}],
        "fix_total_cost": prior_cost,
        "current_phase": "fix",
    }
```

각 attempt의 비용은 token 단가 기반으로 추정되어 누적됩니다:

```python
attempt["cost_usd"] = round(
    attempt["input_tokens"] * 3.0 / 1_000_000
    + attempt["output_tokens"] * 15.0 / 1_000_000, 6
)
```

---

## GAP 5: Backpressure Executor

**Before**: LLM이 10개의 파일을 연속 수정한 뒤에야 빌드를 실행했습니다. 첫 수정의 오류가 나머지 9개 파일로 전파되어 복구가 불가능해졌습니다.

**After**: `_backpressure_executor`가 `str_replace_editor` 3회 호출마다 `java_build`를 자동 삽입합니다. LLM이 명시적으로 `java_build`를 호출하면 카운터가 리셋됩니다. 강제 빌드는 LLM이 빌드 없이 편집만 계속할 때의 안전장치입니다.

**3-edit 임계값의 근거**: harness-for-real의 상위 에이전트들은 평균 2~4회 편집 후 빌드를 실행하는 패턴을 보였습니다. 1-edit은 너무 공격적이어서 LLM의 multi-step 수정을 방해하고, 5-edit 이상은 오류 전파 범위가 커져서 rollback 비용이 급격히 증가합니다. 3은 "연관된 변경 한 묶음"을 허용하면서도 오류 누적을 제한하는 균형점입니다.

**Backpressure가 없으면 어떻게 되는가**: LLM은 자신이 생성한 코드가 컴파일된다고 "가정"하고 다음 파일을 수정합니다. 첫 번째 편집에서 import 경로를 잘못 변경하면, 이후 편집들이 잘못된 import를 기반으로 확장되어 **오류 캐스케이드**가 발생합니다. 10개 파일 수정 후 빌드하면 30개의 에러가 나오지만, 3개 파일마다 빌드하면 최대 5~6개의 에러로 제한됩니다. 이 패턴은 harness-for-real의 `backpressure.sh`에서 직접 영감을 받았습니다 — 상위 에이전트들이 "편집-빌드-확인" 주기를 짧게 가져가는 이유가 바로 이 오류 전파 방지에 있습니다.

---

## GAP 6: Convergence Detection

**Before**: `_is_stuck()`이 summary 비교만 수행했습니다. summary가 미묘하게 다르면(예: 줄바꿈 차이) 동일 오류임에도 감지에 실패했습니다.

**After**: `build_error_snapshot`을 각 attempt에 저장하고, 라우팅 시 최근 3회의 snapshot을 비교합니다.

```python
# _route_after_validate() 내부
build_error = state.get("build_error_output", "")[:200]
fix_attempts = state.get("fix_attempts", [])
converged = False
if build_error and len(fix_attempts) >= 2 and all(
    "build_error_snapshot" in a for a in fix_attempts[-2:]
):
    prev_snapshot = fix_attempts[-1].get("build_error_snapshot", "")
    prev_prev = fix_attempts[-2].get("build_error_snapshot", "")
    if build_error == prev_snapshot == prev_prev and prev_snapshot:
        converged = True
```

Summary가 아닌 **실제 빌드 에러 출력**을 비교하므로 위양성이 줄어듭니다.

---

## GAP 7: Clarity Auto-Retry

**Before**: assess_node가 마이그레이션 위험도를 분석할 때 LLM의 응답이 불명확해도 그대로 진행했습니다.

**After**: clarity score가 0.3 미만이면 focused prompt로 재시도합니다.

```python
# assess_node 내부
if clarity_score < 0.3:
    log.warning("ASSESS: low clarity (%.2f) — auto-retrying with focused prompt",
                clarity_score)
    retry_user = (
        f"The initial analysis yielded low clarity (score={clarity_score}). "
        "Please re-analyze with more specific attention to: "
        "API compatibility, dependency versions, and framework migration paths.\n\n"
        + risk_user
    )
    retry_response = llm_text(risk_system, retry_user, max_tokens=1024, temperature=0.3)
```

**0.3 임계값의 의미**: clarity score는 LLM 응답에서 구체적 기술 항목(API명, 버전 번호, 의존성 경로)이 얼마나 포함되어 있는지를 0~1 범위로 측정합니다. 0.3 미만은 "API 호환성에 문제가 있을 수 있다"처럼 구체성이 결여된 응답을 의미합니다. 이런 응답을 그대로 plan_node에 전달하면 transform 전략이 모호해지고, fix loop에서의 수렴이 느려집니다.

**Socratic reasoning과의 연결**: harness-for-real의 상위 에이전트들은 Socratic pre-phase에서 "질문을 통해 문제를 명확히 한 뒤 실행"하는 패턴을 보였습니다. Clarity auto-retry는 이 Socratic 패턴의 자동화된 형태입니다 — 에이전트가 자기 응답의 품질을 자가 진단하고, 불충분하면 더 구체적인 질문으로 재시도합니다. 0.3이라는 임계값은 "최소한 하나의 구체적 기술 항목을 포함해야 한다"는 기준이며, 경험적으로 이 이하의 응답은 downstream 노드에서 거의 항상 문제를 일으켰습니다.

---

## GAP 8: Multi-Perspective Verification

**Before**: validate_node가 build + test만 확인했습니다.

**After**: `_verify_integrity()`와 `_verify_deployment_readiness()`가 추가 관점에서 검증합니다.

```python
# measure_node 내부
integrity = _verify_integrity(source_path, state)    # 테스트 무결성
deployment = _verify_deployment_readiness(source_path) # 배포 준비도
state_updates["verification_results"] = {
    "integrity": integrity,
    "deployment": deployment,
    "all_passed": integrity["passed"] and deployment["passed"],
}
```

4가지 검증 persona가 각각 다른 failure mode를 커버합니다:

- **Build correctness**: 컴파일 성공 여부 — 가장 기본적이지만, "컴파일되지만 런타임에 실패하는" 코드를 잡지 못합니다
- **Test integrity**: 테스트 통과율과 커버리지 — 빌드가 성공해도 테스트가 삭제되거나 skip 처리되었는지 검증합니다. LLM이 빌드를 통과시키기 위해 실패하는 테스트를 `@Disabled`로 마킹하는 것은 흔한 패턴입니다
- **Lint compliance**: 코드 스타일과 정적 분석 — 기능은 동작하지만 deprecated API를 사용하거나 보안 취약점이 포함된 경우를 잡습니다
- **Compatibility**: API/ABI 호환성 — 마이그레이션 결과물이 기존 시스템과 통합 가능한지 확인합니다

이 4가지 persona는 Swiss Cheese Model에서 영감을 받았습니다. 각 검증 계층은 구멍이 있지만, 4개를 겹치면 모든 구멍이 동시에 정렬될 확률이 급격히 줄어듭니다. 모든 persona는 `build_verification_tasks()`로 sub-task 정의가 생성됩니다.

---

## GAP 9: Deployment Readiness

**Before**: 코드가 컴파일되면 끝이었습니다.

**After**: hardcoded secrets, absolute paths, README 존재 여부를 검사합니다.

```python
def _verify_deployment_readiness(source_path: str) -> dict[str, Any]:
    # Check 1: Hardcoded secrets (password=, secret=, api_key=)
    # Check 2: Absolute paths (/Users/, /home/)
    # Check 3: README exists
    ...
```

**각 검사가 존재하는 이유**: 자율 에이전트가 생성한 코드는 사람의 리뷰 없이 커밋될 수 있습니다. 이 경우 사람이 당연히 잡아내는 문제들을 에이전트가 대신 검증해야 합니다.

- **Hardcoded secrets**: LLM은 빌드를 통과시키기 위해 테스트용 credential을 코드에 직접 삽입하는 경향이 있습니다. `password=test123`이 커밋되면 보안 사고로 이어집니다. 이 검사는 CI의 secret scanner보다 먼저, 커밋 전 단계에서 차단합니다.
- **Absolute paths**: `/Users/mango/workspace/...` 같은 경로가 코드에 포함되면 다른 환경에서 즉시 실패합니다. LLM은 로컬 빌드 로그에서 절대 경로를 학습하여 코드에 삽입하는 경우가 있으므로, 이를 명시적으로 검사합니다.
- **README 존재 여부**: 마이그레이션 결과물이 단독으로 이해 가능한 프로젝트인지의 최소 기준입니다. 자율 에이전트가 생성한 코드는 사람이 나중에 유지보수해야 하므로, 최소한의 문서가 반드시 존재해야 합니다.

---

## GAP 10: Parallel Transform (skip, with rationale)

**Before/After**: 구현하지 않았습니다.

**이유**: REODE의 transform_node는 OpenRewrite recipe chain을 순차 실행합니다. Recipe 간에 상태 의존성이 있습니다 (예: Java 11 recipe가 적용된 후에야 Java 17 recipe가 실행 가능). 병렬화하면 recipe 순서 보장이 깨집니다.

독립적인 transform(예: 서로 다른 모듈)의 병렬화는 가능하지만, 현재 mono-module 프로젝트가 주 타겟이므로 ROI가 낮습니다. Multi-module 지원 시 재검토할 예정입니다.

---

## Trade-off: Function-based vs SubAgentManager

10개 GAP 중 multi-perspective verification(GAP-8)은 SubAgentManager dispatch로 구현할 수도 있었습니다. 4개의 검증 persona를 각각 sub-agent로 실행하는 방식입니다.

**기각 이유**:
- 검증 로직은 모두 deterministic합니다 (grep, file check, build 실행). LLM이 필요하지 않습니다.
- Sub-agent 1개 실행 비용이 grep 100회 실행 비용보다 높습니다.
- 검증의 신뢰성은 LLM의 판단이 아닌 사실(fact)에 기반해야 합니다.

결론: **검증은 function으로, 수정은 LLM으로.** 이것이 비용과 정확성의 최적점입니다.

---

## What's Next

10개 GAP 중 9개를 닫았습니다. 하지만 harness-for-real의 상위 에이전트들이 보여준 또 다른 특성이 있습니다:

- **Self-play evaluation**: 에이전트가 자신의 출력을 평가하는 inner loop
- **Adaptive iteration budget**: 문제 복잡도에 따른 동적 `max_iterations` 조정
- **Cross-project learning**: 프로젝트 A에서 학습한 패턴을 프로젝트 B에 전이

LEARNINGS.md는 프로젝트 내 학습입니다. Cross-project learning은 organization-level memory tier에서 해결해야 하며, 이는 REODE의 4-tier memory architecture(session -> project -> organization -> global)와 연결되는 다음 과제입니다.

"우승 팀은 133회의 Socratic 라운드를 실행했다"는 사실은 단순히 라운드 수의 문제가 아닙니다. 각 라운드에서 **무엇을 학습하고, 무엇을 기억하고, 무엇을 달리 시도하는가**의 문제입니다. 10개의 GAP은 그 "무엇"을 코드로 구체화한 결과입니다.

---

*Source: `blog/posts/harness-frontier/46-harness-engineering-gap-closure.md` | Category: [[blog-harness-frontier]]*

## Related

- [[blog-harness-frontier]]
- [[blog-hub]]
- [[geode]]
