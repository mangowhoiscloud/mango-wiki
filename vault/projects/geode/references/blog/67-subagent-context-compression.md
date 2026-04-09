---
title: "서브에이전트 반환 컨텍스트 압축 — announce vs tool_result 이중 주입 제거"
type: reference
category: blog-post
tags: [blog, orchestration]
source: "blog/posts/orchestration/67-subagent-context-compression.md"
created: 2026-04-08T00:00:00Z
---

# 서브에이전트 반환 컨텍스트 압축 — announce vs tool_result 이중 주입 제거

> 서브에이전트가 결과를 돌려주는 경로가 두 개라면,
> 부모 컨텍스트에는 같은 정보가 두 번 들어갑니다.
> 이 글은 GEODE에서 발견한 이중 주입 문제와,
> 프론티어 3종이 같은 문제를 어떻게 풀었는지를 비교합니다.

> Date: 2026-03-28 | Author: rooftopsnow | Tags: sub-agent, context-compression, announce, tool-result, dedup, openclaw, karpathy, claude-code

---

## 목차

1. 문제 발견 — 같은 결과가 두 번 들어온다
2. 프론티어 3종 비교 (Claude Code, OpenClaw, Karpathy autoresearch)
3. 비교 매트릭스
4. GEODE의 선택과 이유
5. 구현 코드
6. 마무리

---

## 1. 문제 발견 — 같은 결과가 두 번 들어온다

GEODE의 `delegate_task` 도구는 서브에이전트에게 작업을 위임하고, 완료된 결과를 부모 에이전트에게 돌려줍니다. 문제는 **돌려주는 경로가 두 개**라는 점이었습니다.

```
AgenticLoop (부모)
  │
  ├─ tool_use: delegate_task(...)
  │     └─ SubAgentManager.delegate(tasks)
  │           ├─ IsolatedRunner × N (병렬 실행)
  │           └─ return results ──→ tool_result (전체 데이터)  ← 경로 1
  │
  └─ _check_announced_results() [매 라운드 시작]
        └─ drain_announced_results()
              └─ inject system_event (summary ≤500자)        ← 경로 2
```

**경로 1 (tool_result)**: `delegate_task`가 동기적으로 반환하는 전체 `SubResult`. LLM이 다음 tool_use 결정에 즉시 활용합니다.

**경로 2 (announce)**: OpenClaw의 Spawn+Announce 패턴을 도입하면서 추가한 비동기 알림 큐. 서브에이전트 완료 시 summary를 큐에 push하고, 부모 AgenticLoop이 매 라운드 시작 시 poll해서 `[system:subagent_completed]` 메시지로 주입합니다.

두 경로 모두 정상적으로 동작했지만, **동기 호출인 `delegate_task`에서는 둘 다 작동할 이유가 없었습니다**. tool_result로 이미 전체 데이터를 받았는데, 다음 라운드에서 같은 결과의 500자 요약이 다시 주입됩니다.

```
Round 3: [tool_result] delegate_task → {task_id: "t1", output: {...전체...}, summary: "분석 완료..."}
Round 4: [system:subagent_completed] Sub-agent completed: task_id=t1, summary=분석 완료...
```

> 토큰 낭비만의 문제가 아닙니다. LLM 입장에서는 같은 결과가 두 번 들어오면 해당 정보에 과도한 가중치를 부여할 수 있습니다. 서브에이전트를 3개 위임하면 6건의 메시지가 컨텍스트에 쌓이고, 이 중 절반은 중복입니다.

---

## 2. 프론티어 3종 비교

이중 주입은 GEODE만의 문제일까요? 프론티어 에이전트 시스템 3종이 서브에이전트 결과를 어떻게 반환하는지 살펴보겠습니다.

### 2-1. Claude Code — 단일 경로, 서버사이드 압축

Claude Code의 Agent tool은 서브에이전트를 별도 프로세스로 실행하고, 결과를 **tool_result 단일 경로**로만 반환합니다. announce 같은 비동기 알림 패턴은 사용하지 않습니다.

```
MainAgent
  └─ tool_use: Agent(prompt="...")
       └─ SubProcess (독립 컨텍스트)
            └─ return result ──→ tool_result (단일 경로)
```

컨텍스트 관리는 두 가지 메커니즘으로 처리합니다:

- **clear_tool_uses**: 오래된 tool_use/tool_result 쌍을 제거하되, 최근 5개는 보존
- **compact (서버사이드)**: 컨텍스트가 80%에 도달하면 Anthropic 서버가 자동으로 이전 메시지를 요약

> Claude Code는 동기 반환만 지원하므로 이중 주입 문제가 구조적으로 발생하지 않습니다. 대신 컨텍스트가 커지면 서버사이드에서 공격적으로 압축합니다.

### 2-2. OpenClaw — 동기/비동기 분리

OpenClaw는 GEODE가 announce 패턴을 도입할 때 참조한 원본 시스템입니다. 핵심은 **동기 호출과 비동기 호출을 명확히 구분**한다는 점입니다.

```
동기 (agentTurn):
  MainSession → spawn(task) → await result → 콜백 직접 반환
  announce: 사용하지 않음

비동기 (fire-and-forget):
  MainSession → spawn(task) → 즉시 반환
  ... 시간 경과 ...
  SubAgent 완료 → systemEvent(announce) → MainSession poll
```

- **agentTurn** (격리된 에이전트 턴): 동기적으로 결과를 기다리고, 콜백으로 직접 반환합니다. announce 큐를 거치지 않습니다.
- **systemEvent** (메인 세션 주입): 비동기 완료 시에만 사용합니다. 부모가 다른 작업을 하는 도중 서브에이전트가 끝났을 때 알려주는 유일한 채널입니다.

세션 키 계층으로 격리합니다:

```
agent:main:main          ← 메인 세션
  └─ cron:{jobId}        ← 스케줄 잡
  └─ agent:sub:{taskId}  ← 서브에이전트
```

> OpenClaw의 설계 원칙은 명확합니다: **결과를 기다렸다면 announce는 불필요하다**. announce는 "기다리지 않는" 경우에만 필요한 알림 채널입니다.

### 2-3. Karpathy autoresearch — 1비트까지 압축

Karpathy의 autoresearch는 가장 공격적인 접근을 취합니다. P6 Context Budget 원칙에 따라 서브 실험 결과를 3단계로 압축합니다:

```
L1 차단: stdout 전체 → 파일 저장 (컨텍스트 진입 차단)
L2 추출: 파일에서 핵심 2줄만 추출
L3 요약: "개선" 또는 "악화" — 1비트
```

```python
# autoresearch 스타일 (개념 코드)
result = run_experiment(config)
save_to_file(result.full_output, f"results/{exp_id}.json")  # L1: 파일로 차단

metrics = extract_metrics(result)  # L2: 2줄 추출
# → "accuracy: 0.847 → 0.863, loss: 0.312 → 0.298"

verdict = "improved" if metrics.better else "degraded"  # L3: 1비트
context.append(f"Experiment {exp_id}: {verdict}")
```

> autoresearch에서 **output은 반드시 input보다 작아야 합니다**. 실험 하나의 stdout이 10,000 토큰이라면, 컨텍스트에는 10 토큰만 들어갑니다. 이 비대칭이 수백 번의 실험을 단일 컨텍스트 안에서 가능하게 합니다.

---

## 3. 비교 매트릭스

| 시스템 | 동기 반환 | 비동기 알림 | 압축 수준 | 이중 주입 | 서버사이드 압축 |
|--------|----------|-----------|----------|----------|--------------|
| **Claude Code** | tool_result (전체) | 없음 | clear_tool_uses + compact | 없음 | Yes (Anthropic) |
| **OpenClaw** | 콜백 직접 | announce (summary) | 세션 auto-archive 60분 | 동기 시 announce 안 함 | No |
| **autoresearch** | 파일 저장 | 없음 (polling) | L1-L3 (1비트까지) | 없음 | No |
| **GEODE (Before)** | tool_result (전체) | announce (500자) | 500자 cap | **이중 주입** | Yes (Anthropic) |
| **GEODE (After)** | tool_result (전체) | announce=False | 이중 주입 제거 | 해소 | Yes (Anthropic) |

> 3종 모두 **동기 호출에서는 단일 경로**라는 공통점이 있습니다. GEODE만 두 경로를 동시에 열어둔 상태였습니다. OpenClaw에서 패턴을 가져올 때, 동기/비동기 분리 조건을 빠뜨린 것이 원인이었습니다.

---

## 4. GEODE의 선택과 이유

### 접근: OpenClaw와 동일 — 동기 시 announce 끔

세 시스템의 접근을 놓고 보면 선택지가 명확했습니다:

| 선택지 | 장점 | 단점 |
|--------|------|------|
| Claude Code 방식 (announce 자체 제거) | 단순 | 비동기 서브에이전트 지원 불가 |
| OpenClaw 방식 (동기/비동기 분기) | 두 경로 모두 활용 | 파라미터 하나 추가 |
| autoresearch 방식 (1비트 압축) | 최소 토큰 | 현재 구조와 불일치 |

GEODE는 **OpenClaw 방식**을 선택했습니다.

이유는 간단합니다. GEODE의 서브에이전트 시스템은 현재 동기 호출(`delegate_task`)만 지원하지만, 아키텍처 상 비동기 fire-and-forget 경로도 열어두고 있습니다. announce 메커니즘 자체를 제거하면 비동기 경로의 유일한 알림 채널이 사라집니다.

### tool_result vs announce 역할 분리

```
tool_result (동기 경로)
  ├─ 반환 시점: tool_use 직후
  ├─ 데이터: 전체 SubResult (output, summary, duration, error)
  ├─ 소비자: LLM이 즉시 다음 판단에 활용
  └─ 용도: delegate_task의 동기 반환

announce (비동기 경로)
  ├─ 반환 시점: 서브에이전트 완료 시 큐에 push → 다음 라운드에서 poll
  ├─ 데이터: summary (500자 이내)
  ├─ 소비자: 부모 AgenticLoop이 system_event로 주입
  └─ 용도: fire-and-forget 백그라운드 작업 완료 알림
```

> 동기 호출에서 announce가 불필요한 이유가 여기 있습니다. tool_result가 이미 전체 데이터를 LLM에게 전달했으므로, announce의 500자 요약은 **새로운 정보를 제공하지 않습니다**. 오히려 동일 정보의 중복 주입이 됩니다.

---

## 5. 구현 코드

변경은 두 파일, 총 4줄입니다.

### 5-1. SubAgentManager.delegate() — announce 파라미터 추가

```python
# core/agent/sub_agent.py
def delegate(
    self,
    tasks: list[SubTask],
    *,
    on_progress: Callable[[SubResult], None] | None = None,
    announce: bool = True,  # 새 파라미터
) -> list[SubResult]:
    """Run multiple sub-tasks in parallel, wait for all.

    Args:
        announce: If False, skip pushing results to the announce queue.
            Callers that already return full results via tool_result
            (e.g. delegate_task) should pass announce=False to avoid
            injecting the same information into the parent context twice.
    """
```

> `announce`의 기본값은 `True`입니다. 기존 호출자(비동기 경로)의 동작을 깨뜨리지 않으면서, 동기 호출자만 명시적으로 `False`를 전달합니다. Open-Closed 원칙에 부합하는 설계입니다.

### 5-2. announce 큐 push 조건 분기

```python
# core/agent/sub_agent.py — delegate() 메서드 하단
# Announce completed results to parent (OpenClaw Spawn+Announce)
if announce and self._announce_enabled and self._parent_session_key:
    for sub_result in results:
        summary = ""
        if sub_result.success:
            summary = sub_result.output.get("summary", "") if sub_result.output else ""
            if not summary:
                summary = str(sub_result.output)[:200] if sub_result.output else "completed"
        else:
            summary = sub_result.error or "failed"
        agent_result = SubAgentResult(
            task_id=sub_result.task_id,
            task_type=sub_result.description,
            status="ok" if sub_result.success else "error",
            summary=summary,
            data=sub_result.output,
            duration_ms=sub_result.duration_ms,
            error_message=sub_result.error,
        )
        self._announce_result(self._parent_session_key, agent_result)
```

> 조건이 3중입니다: `announce` (호출자 의도) AND `self._announce_enabled` (시스템 설정) AND `self._parent_session_key` (부모 세션 존재). 셋 중 하나라도 False면 announce를 건너뜁니다.

### 5-3. delegate_task 핸들러 — announce=False 전달

```python
# core/agent/tool_executor.py — delegate_task 핸들러
# announce=False: delegate_task returns full results via tool_result,
# so skip announce queue to avoid double context injection.
results = self._sub_agent_manager.delegate(
    sub_tasks, on_progress=_on_progress, announce=False
)
```

> 이 한 줄이 이중 주입을 제거합니다. `delegate_task`는 동기 호출이므로 `results`가 그대로 tool_result로 반환됩니다. announce 큐에 push할 이유가 없습니다.

### 5-4. 부모 AgenticLoop — 변경 없음

```python
# core/agent/agentic_loop.py — 매 라운드 시작
# Poll for sub-agent announced results (OpenClaw Spawn+Announce)
self._check_announced_results(messages)
```

> 부모 측 polling 로직은 건드리지 않았습니다. 큐가 비어 있으면 0건을 반환할 뿐이므로 부작용이 없습니다. 향후 비동기 서브에이전트가 추가되면 이 경로가 자연스럽게 활성화됩니다.

### Before/After 흐름 비교

```
[Before]
Round 3: tool_use(delegate_task) → SubAgent 실행
         tool_result ← {output: {...전체...}, summary: "분석 완료..."}  ← 경로 1
         announce queue ← push(summary="분석 완료...")                  ← 경로 2
Round 4: _check_announced_results() → inject system_event             ← 이중 주입
         LLM sees: tool_result(Round 3) + system_event(Round 4) = 같은 내용 2회

[After]
Round 3: tool_use(delegate_task) → SubAgent 실행
         tool_result ← {output: {...전체...}, summary: "분석 완료..."}  ← 유일한 경로
         announce queue ← (skip, announce=False)
Round 4: _check_announced_results() → queue empty → 0건
         LLM sees: tool_result(Round 3) = 1회만
```

---

## 6. 마무리

### 핵심 정리

| 항목 | 설명 |
|------|------|
| 문제 | 동기 delegate_task에서 tool_result + announce 이중 주입 |
| 원인 | OpenClaw 패턴 도입 시 동기/비동기 분리 조건 누락 |
| 해결 | `delegate(announce=False)` — 동기 호출에서 announce 끔 |
| 변경 규모 | 2파일, 4줄 |
| 프론티어 정합성 | OpenClaw 동일 패턴, Claude Code/autoresearch도 동기 단일 경로 |
| 부작용 | 없음 — 비동기 경로는 기본값 `True` 유지 |

### 체크리스트

- [ ] delegate_task(동기) → tool_result만, announce 없음
- [ ] 비동기 서브에이전트 → announce 유지 (summary 500자 이내)
- [ ] 이중 주입 해소 → 컨텍스트 토큰 절약
- [ ] 프론티어 3종과 정합성 확인 (OpenClaw 패턴 일치)

### 다음 글 예고

이번 글은 **같은 정보의 중복 제거**에 집중했습니다. 하지만 tool_result 자체의 크기를 줄이는 문제는 아직 남아 있습니다. autoresearch의 L1-L3 압축처럼, 서브에이전트 결과를 tool_result 단계에서 summary-only로 줄이고 전체 데이터는 파일이나 메모리에 보관하는 접근도 검토할 수 있습니다. 이 주제는 다음 글에서 다루겠습니다.

---

*Source: `blog/posts/orchestration/67-subagent-context-compression.md` | Category: [[blog-orchestration]]*

## Related

- [[blog-orchestration]]
- [[blog-hub]]
- [[geode]]
- [[geode-tool-system]]
