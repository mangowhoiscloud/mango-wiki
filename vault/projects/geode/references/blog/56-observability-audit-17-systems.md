---
title: "Observability 전수 감사 — 17개 시스템은 어떻게 연결되어 있는가"
type: reference
category: blog-post
tags: [blog, safety-verification]
source: "blog/posts/safety-verification/56-observability-audit-17-systems.md"
created: 2026-04-08T00:00:00Z
---

# Observability 전수 감사 — 17개 시스템은 어떻게 연결되어 있는가

> Date: 2026-04-03 | Author: rooftopsnow | Tags: observability, hooks, metrics, agent-architecture, audit, termination-tracking

## 목차

1. [도입 — raw dict가 사용자에게 보였습니다](#1-도입--raw-dict가-사용자에게-보였습니다)
2. [감사 동기 — 하나의 버그가 전체 지도를 요구합니다](#2-감사-동기--하나의-버그가-전체-지도를-요구합니다)
3. [17개 관측 시스템 종합](#3-17개-관측-시스템-종합)
4. [HookSystem 46 이벤트 — 4-Layer를 관통하는 버스](#4-hooksystem-46-이벤트--4-layer를-관통하는-버스)
5. [종료 경로 11종 — while(tool_use)는 왜 멈추는가](#5-종료-경로-11종--whiletool_use는-왜-멈추는가)
6. [영구 저장소 6곳 — 세션이 죽어도 남는 것](#6-영구-저장소-6곳--세션이-죽어도-남는-것)
7. [HITL IPC 버그 3건 — 틈새에서 발생한 문제](#7-hitl-ipc-버그-3건--틈새에서-발생한-문제)
8. [Gap 7건 — 아직 보이지 않는 것](#8-gap-7건--아직-보이지-않는-것)
9. [Gap 보강 — 3건 즉시 수정](#9-gap-보강--3건-즉시-수정)
10. [마무리](#10-마무리)

---

## 1. 도입 — raw dict가 사용자에게 보였습니다

GEODE CLI에서 프롬프트를 입력했더니, 응답 대신 이런 텍스트가 출력되었습니다.

```
> 매출 순위는 어떻게 돼?

  {'type': 'ack'}
```

`{'type': 'ack'}`는 IPC 내부 프로토콜 응답입니다. 사용자에게 보여서는 안 되는 값이 그대로 렌더링된 것입니다. PR #630에서 stale `approval_response`를 `{"type": "ack"}`로 처리하도록 수정했는데, 클라이언트의 `send_prompt()` 루프가 이 타입을 인식하지 못해 fallback 렌더러로 빠진 것이 원인이었습니다.

이 버그를 추적하면서, GEODE의 관측 시스템이 어떻게 연결되어 있는지 전체 지도가 필요하다는 것을 깨달았습니다.

---

## 2. 감사 동기 — 하나의 버그가 전체 지도를 요구합니다

`ack` 노출 문제는 단순한 누락이었습니다. `ipc_client.py`의 structured events 리스트에 `"ack"`를 추가하면 끝나는 수정입니다. 그러나 이 리스트에는 이미 19개 이벤트 타입이 들어 있었고, `"ack"`가 빠졌다는 것은 **전체 이벤트 타입을 한눈에 볼 수 있는 문서가 없었기 때문**입니다.

v0.45.0 기준으로 GEODE의 `core/` 아래에는 193개 모듈이 존재합니다. 46개 Hook 이벤트, 3-provider LLM 폴백, 서브에이전트 시스템, MCP 44개 서버, HITL 승인 프로토콜 — 각각이 독립적으로 관측 가능성을 제공하지만, 전체를 조감하는 문서가 없었습니다.

그래서 이번 세션에서 전수 감사를 실행했습니다.

---

## 3. 17개 관측 시스템 종합

감사 결과 17개 독립 시스템이 식별되었습니다.

| # | System | 역할 | 저장 |
|---|--------|------|------|
| 1 | **HookSystem** | 46 이벤트 라이프사이클 | Memory |
| 2 | **SessionMetrics** | p50/p95 latency, error rate | Memory |
| 3 | **TokenTracker** | 비용 추적 (per-model) | Memory + JSONL + LangSmith |
| 4 | **Termination Tracking** | 종료 사유 11종 | AgenticResult |
| 5 | **RunLog** | 파이프라인 실행 이력 | JSONL |
| 6 | **SessionTranscript** | 대화 전문 기록 | JSONL |
| 7 | **LangSmith** | 외부 트레이싱 | run_tree.extra |
| 8 | **StuckDetection** | 좀비 작업 탐지 (2h) | Memory + thread |
| 9 | **ContextMonitor** | 토큰 예산 (80%/95%/200K) | Memory |
| 10 | **ErrorRecovery** | RETRY→ALT→FALLBACK→ESCALATE | RecoveryResult |
| 11 | **IPC Events** | thin-client 실시간 스트림 | Socket |
| 12 | **CostBudget** | 비용 상한 | Instance var |
| 13 | **TimeBudget** | 시간 상한 | monotonic clock |
| 14 | **ModelSwitching** | 모델 전환 추적 | Conversation message |
| 15 | **SubAgent** | 서브에이전트 라이프사이클 | Announce queue |
| 16 | **ProjectJournal** | 프로젝트별 실행/비용/에러 | JSONL |
| 17 | **UsageStore** | 월별 비용 집계 | JSONL |

핵심 관찰은 **Memory-only 시스템이 11개, 영구 저장 시스템이 6개**라는 점입니다. 세션이 비정상 종료되면 SessionMetrics, ErrorRecovery, ContextMonitor 데이터가 소실됩니다. 중요한 메트릭은 Hook → 영구 저장소 파이프라인을 타도록 설계되어야 합니다.

---

## 4. HookSystem 46 이벤트 — 4-Layer를 관통하는 버스

`core/hooks/system.py`에 정의된 46개 이벤트를 카테고리별로 분류하면 다음과 같습니다.

```
Pipeline(3)    PIPELINE_START / END / ERROR
Node(4)        NODE_BOOTSTRAP / ENTER / EXIT / ERROR
Analysis(3)    ANALYST_COMPLETE / EVALUATOR_COMPLETE / SCORING_COMPLETE
Verify(2)      VERIFICATION_PASS / FAIL
Automation(7)  DRIFT / OUTCOME / PROMOTED / SNAPSHOT / TRIGGER / POST / CONFIG
Memory(4)      MEMORY_SAVED / RULE_CREATED / UPDATED / DELETED
Prompt(1)      PROMPT_ASSEMBLED
SubAgent(3)    SUBAGENT_STARTED / COMPLETED / FAILED
Recovery(3)    TOOL_RECOVERY_ATTEMPTED / SUCCEEDED / FAILED
Agentic(1)     TURN_COMPLETE
Context(2)     CONTEXT_CRITICAL / CONTEXT_OVERFLOW_ACTION
Session(2)     SESSION_START / END
Model(1)       MODEL_SWITCHED
LLM(4)         LLM_CALL_START / END / FAILED / RETRY
Approval(3)    TOOL_APPROVAL_REQUESTED / GRANTED / DENIED
Fallback(1)    FALLBACK_CROSS_PROVIDER
Infra(3)       PIPELINE_TIMEOUT / SHUTDOWN_STARTED / CONFIG_RELOADED
MCP(2)         MCP_SERVER_CONNECTED / FAILED
```

Hook은 cross-cutting입니다. 어떤 레이어에서든 `from core.hooks import HookSystem, HookEvent`로 접근할 수 있고, `threading.Lock`으로 thread-safe합니다. SessionMetrics 같은 소비자는 `make_metrics_hook_handler()`를 통해 `LLM_CALL_END`, `TOOL_RECOVERY_*` 이벤트를 구독합니다.

---

## 5. 종료 경로 11종 — while(tool_use)는 왜 멈추는가

`AgenticResult.termination_reason`은 `while(tool_use)` 루프가 왜 멈췄는지를 기록합니다. `SESSION_END` hook에서 payload로 전달되며, IPC `turn_end` 이벤트에도 포함됩니다.

| Reason | 의미 | 심각도 |
|--------|------|--------|
| `natural` | LLM이 end_turn을 선택 | 정상 |
| `forced_text` | max_rounds 직전 wrap-up 강제 | 정상 |
| `max_rounds` | 라운드 상한 도달 | 경고 |
| `time_budget_expired` | 시간 예산 초과 | 경고 |
| `convergence_detected` | 반복 패턴 감지 (stuck) | 경고 |
| `cost_budget_exceeded` | 비용 예산 초과 | 차단 |
| `context_exhausted` | 컨텍스트 윈도우 복구 불가 | 차단 |
| `llm_error` | LLM API 에러 (3-provider 실패) | 에러 |
| `billing_error` | 인증/과금 에러 | 에러 |
| `user_cancelled` | Ctrl+C | 사용자 |
| `unknown` | 미분류 (기본값) | — |

이 중 `context_exhausted`는 3단계 압축(`summarize_tool_results` → `adaptive_prune` → `prune_oldest_messages`)을 모두 시도한 후에도 윈도우가 부족할 때 발생합니다. `convergence_detected`는 동일한 도구 호출이 반복될 때 stuck detection이 개입하는 경우입니다.

---

## 6. 영구 저장소 6곳 — 세션이 죽어도 남는 것

```
~/.geode/
├── usage/YYYY-MM.jsonl              # TokenTracker — 월별 비용
├── runs/{session_key}.jsonl         # RunLog — 파이프라인 실행 이력
├── projects/{id}/journal/
│   ├── runs.jsonl                   # ProjectJournal — 프로젝트별 실행
│   ├── costs.jsonl                  # 호출별 비용
│   ├── errors.jsonl                 # 에러 기록
│   └── learned.md                   # 학습된 패턴
├── journal/transcripts/
│   └── {project}/{session_id}.jsonl # SessionTranscript — 대화 전문
└── snapshots/                       # SnapshotManager — 파이프라인 상태
```

모든 영구 저장소는 JSONL(append-only) 포맷이며, 자동 정리 정책이 적용됩니다. RunLog는 2MB/2000줄, Transcript는 5MB에서 truncation됩니다. `usage/` 디렉토리만 월별 파일 로테이션이 적용되며 삭제 정책은 없습니다.

---

## 7. HITL IPC 버그 3건 — 틈새에서 발생한 문제

이번 감사의 출발점이 된 버그 3건입니다. 모두 관측 시스템 간 **열거의 불일치**에서 발생했습니다.

### 7-1. `{'type': 'ack'}` 노출 (#640)

PR #630에서 stale `approval_response`를 `{"type": "ack"}`로 처리하도록 추가했습니다. 그러나 `ipc_client.py`의 `send_prompt()` 루프에 `"ack"` 타입이 등록되지 않아, 응답이 fallback 렌더러로 빠져 raw dict가 출력되었습니다.

```python
# 수정: structured events에 ack/exit_ack 추가
if rtype in ("tool_start", ..., "node_skipped", "ack", "exit_ack"):
    continue
```

### 7-2. Console 테마 누락 (#640)

`_handle_approval_request()`가 `Console()` (bare)을 생성하여 GEODE_THEME이 적용되지 않았습니다. `[header]`, `[warning]` 스타일이 무시되어 입력 프롬프트 정렬이 깨졌습니다. 글로벌 `console` 인스턴스를 import하도록 수정했습니다.

### 7-3. 붙여넣기 입력 반복 (#641)

`multiline=False` 상태에서 붙여넣기된 멀티라인 텍스트의 각 줄바꿈이 개별 submit을 트리거했습니다. 빈 `>` 프롬프트가 반복되고, history에서 이전 입력이 재생되는 현상이 나타났습니다. `multiline=True` + Enter submit 키바인딩 + `splitlines()` join으로 수정했습니다.

---

## 8. Gap 7건 — 아직 보이지 않는 것

감사 결과 7개의 사각지대가 식별되었습니다.

| # | Gap | 감사 시 상태 | 보강 |
|---|-----|------------|------|
| 1 | 컨텍스트 압축 효과 미추적 | before/after 토큰 수 미기록 | **#643에서 수정** |
| 2 | per-tool 비용 미집계 | TokenTracker는 per-call이지 per-tool이 아님 | 미착수 |
| 3 | 재시도 횟수 미포함 | 종료 사유가 `"llm_error"` 하나로 통합 | **#643에서 수정** |
| 4 | 병렬 도구 실행 메트릭 없음 | batch_size, parallelism 미추적 | 미착수 |
| 5 | 서브에이전트 리소스 미추적 | CPU/메모리/컨텍스트 예산 없음 | 미착수 |
| 6 | MCP 서버 상시 헬스체크 없음 | 연결/실패만, latency histogram 없음 | 미착수 |
| 7 | cross-provider fallback latency 미기록 | 전환은 추적하나 소요 시간 미측정 | **#643에서 수정** |

7건 중 LOW risk 3건(1, 3, 7)을 같은 세션에서 즉시 보강했습니다. 나머지 4건은 아키텍처 변경이 필요하여 별도 세션으로 분리했습니다.

---

## 9. Gap 보강 — 3건 즉시 수정

감사와 보강을 같은 세션에서 실행했습니다. 발견 → 분류 → 구현 → CI까지 한 호흡으로 진행한 것이 핵심입니다.

### 9-1. 컨텍스트 압축 효과 추적 (Gap 1)

`summarize_tool_results()`의 반환 타입을 `int`에서 `tuple[int, int, int]`로 변경했습니다.

```python
# BEFORE
def summarize_tool_results(messages, target_window) -> int:
    ...
    return summarized

# AFTER
def summarize_tool_results(messages, target_window) -> tuple[int, int, int]:
    tokens_before = estimate_message_tokens(messages)
    ...
    tokens_after = estimate_message_tokens(messages)
    log.info("Summarized %d tool results: %d → %d tokens (-%d)",
             summarized, tokens_before, tokens_after, tokens_before - tokens_after)
    return summarized, tokens_before, tokens_after
```

`adaptive_prune()`에도 동일하게 before/after 토큰 로그를 추가했습니다. 이제 압축이 실제로 얼마나 효과적인지 숫자로 확인할 수 있습니다.

### 9-2. retry_exhausted 종료 사유 (Gap 3)

LLM 재시도 5회 소진 시 `termination_reason`이 `"llm_error"`였습니다. 즉시 실패(인증 에러 등)와 구분이 되지 않는 문제입니다.

```python
# BEFORE — 즉시 실패와 재시도 소진이 동일한 사유
termination_reason="llm_error"

# AFTER — 재시도 소진은 별도 사유
termination_reason="retry_exhausted"
```

이로써 종료 경로가 11종에서 사실상 더 세밀해졌습니다. `"llm_error"`는 non-retryable 에러(인증, 잘못된 요청)에만 사용되고, `"retry_exhausted"`는 transient 에러의 재시도 한도 초과에 사용됩니다.

### 9-3. Cross-provider fallback latency (Gap 7)

`_cross_provider_dispatch()`의 fallback hook에 `elapsed_ms`와 `attempt` 인덱스를 추가했습니다.

```python
# BEFORE
_fire_hook("fallback_cross_provider", {
    "from_provider": provider,
    "to_provider": next_p,
    ...
})

# AFTER
elapsed_ms = (time.perf_counter() - t0) * 1000
_fire_hook("fallback_cross_provider", {
    "from_provider": provider,
    "to_provider": next_p,
    "elapsed_ms": round(elapsed_ms, 1),
    "attempt": idx,
    ...
})
```

이제 Anthropic → OpenAI 전환에 몇 ms가 소요되었는지, 몇 번째 시도에서 전환되었는지 추적할 수 있습니다.

---

## 10. 마무리

### 체크리스트

- [x] 17개 관측 시스템 식별 및 분류
- [x] 46 Hook 이벤트 카테고리 매핑
- [x] 종료 경로 11종 문서화
- [x] 영구 저장소 6곳 디렉토리 맵
- [x] HITL IPC 버그 3건 수정 (#640, #641)
- [x] Gap 7건 식별
- [x] Gap 3건 즉시 보강 (#643) — compression metrics, retry_exhausted, fallback latency
- [x] `docs/architecture/observability-report.md` 작성

### 교훈

하나의 `ack` 누락이 이 감사를 시작하게 만들었습니다. 관측 시스템이 17개로 분산되어 있으면, 각 시스템이 개별적으로 올바르더라도 **시스템 간 인터페이스**에서 틈새가 생길 수 있습니다. 전체 지도를 한 번에 그려놓으면, 다음에 새로운 이벤트 타입을 추가할 때 어디를 업데이트해야 하는지 즉시 파악할 수 있습니다.

감사에서 멈추지 않고 같은 세션에서 보강까지 실행한 것도 중요한 판단이었습니다. Gap을 문서화만 하면 백로그에 쌓이기만 합니다. LOW risk 항목은 발견 즉시 수정하는 것이 전체 시스템의 관측 가능성을 빠르게 높이는 방법입니다.

---

*Source: `blog/posts/safety-verification/56-observability-audit-17-systems.md` | Category: [[blog-safety]]*

## Related

- [[blog-safety]]
- [[blog-hub]]
- [[geode]]
