---
title: "좀비 MCP와 스케줄러 누수 — 자율 에이전트의 프로세스 관리 실패"
type: reference
category: blog-post
tags: [blog, orchestration]
source: "blog/posts/orchestration/68-zombie-mcp-scheduler-leak.md"
created: 2026-04-08T00:00:00Z
---

# 좀비 MCP와 스케줄러 누수 — 자율 에이전트의 프로세스 관리 실패

> Date: 2026-03-29 | Author: rooftopsnow | Tags: mcp, scheduler, zombie-process, memory-leak, isolated-session, dedup

---

## 목차

1. 증상 발견
2. 원인 1: 스케줄러 중복 생성
3. 원인 2: isolated 세션의 MCP 좀비
4. 원인 3: IsolatedRunner 결과 캐시 누적
5. 수정
6. 마무리

---

## 1. 증상 발견

GEODE REPL에서 스케줄 잡을 삭제했는데, 동일한 "every 5 minutes" 잡이 계속 fire되는 현상이 발생했습니다. 프로세스를 확인해보니 MCP 서버 프로세스가 수십 개 누적되어 있었습니다.

```
sequential-thinking   8개 (정상 2개)
arxiv                 8개 (정상 2개)
linkedin-scraper-mcp  6개 (정상 2개)
npm exec              29개 (정상 ~6개)
```

`geode serve`(1세트) + REPL(1세트) = 서버당 2개가 정상인데, 나머지는 전부 좀비였습니다. 더 심각한 것은 **좀비가 지금도 계속 생성되고 있다**는 점이었습니다 — 2:32AM, 2:37AM, 2:38AM에 새 프로세스가 나타났습니다.

---

## 2. 원인 1: 스케줄러 중복 생성

스케줄러 잡 목록을 확인하니 "every 5 minutes" 잡이 **3개**였습니다.

```
nl_0669c3dd  every 5min  (삭제됨 — REPL에서 삭제 요청한 것)
nl_12800114  every 5min  (활성)
nl_6d46ef9f  every 5min  (활성)
nl_0eefcbd4  every 10min (활성)
```

REPL에서 하나만 삭제했지만, 동일한 스케줄로 생성된 잡이 2개 더 남아있었습니다.

### 근본 원인

`NLScheduleParser`가 매번 `uuid.uuid4().hex[:8]`로 랜덤 ID를 생성합니다.

```python
# core/automation/nl_scheduler.py
@staticmethod
def _generate_job_id(name: str, agent_id: str) -> str:
    hex8 = uuid.uuid4().hex[:8]
    prefix = agent_id if agent_id else "nl"
    return f"{prefix}_{hex8}"
```

> "every 5 minutes"를 3번 입력하면 `nl_a1b2c3d4`, `nl_e5f6g7h8`, `nl_i9j0k1l2` — 서로 다른 ID로 3개가 생성됩니다.

`SchedulerService.add_job()`은 `job_id` 중복만 체크하고, schedule+action 동일성은 검사하지 않았습니다.

```python
# core/automation/scheduler.py (수정 전)
def add_job(self, job: ScheduledJob) -> None:
    with self._lock:
        if job.job_id in self._jobs:       # ID 충돌만 체크
            raise ValueError(...)
        self._jobs[job.job_id] = job       # 동일 스케줄 무한 등록 가능
```

---

## 3. 원인 2: isolated 세션의 MCP 좀비

스케줄 잡이 fire되면 REPL drain loop에서 isolated AgenticLoop을 생성합니다. 문제는 **공유 `mcp_manager`를 그대로 전달**한다는 점이었습니다.

```python
# core/cli/__init__.py (수정 전)
_, _, _iso_loop = _build_agentic_stack(
    _iso_conv,
    mcp_manager=mcp_mgr,  # 부모의 singleton MCP 매니저 공유
    quiet=True,
)
```

> `MCPServerManager`는 singleton입니다. 모든 AgenticLoop이 동일 인스턴스를 참조합니다. isolated 세션이 MCP 도구를 호출하면 매니저가 새 `StdioMCPClient` subprocess를 스폰합니다. 그런데 isolated 세션이 종료되어도 매니저의 `_clients` dict에 연결이 남아있고, `close_all()`은 REPL 종료 시에만 호출됩니다.

5분마다 fire되는 잡 3개 x MCP 서버 13개 = **5분마다 39개 subprocess 누적**. 1시간이면 468개.

---

## 4. 원인 3: IsolatedRunner 결과 캐시 누적

`IsolatedRunner._results` dict는 `run_async()` 완료 시 결과를 저장하지만, **삭제 로직이 없었습니다**.

```python
# core/orchestration/isolated_execution.py (수정 전)
def _worker() -> None:
    result = self._execute(fn, args, kwargs or {}, cfg)
    with self._lock:
        self._results[session_id] = result  # 영원히 축적
```

> 장시간 운용 시 수천 개의 `IsolationResult` 객체가 heap에 누적됩니다. 각 결과에 output 텍스트가 포함되어 있으므로 메모리 소비가 선형 증가합니다.

---

## 5. 수정

### 5-1. 스케줄러 dedup

`add_job()`에 schedule+action 동일성 체크를 추가했습니다.

```python
# core/automation/scheduler.py
def add_job(self, job: ScheduledJob) -> None:
    with self._lock:
        if job.job_id in self._jobs:
            raise ValueError(f"Job '{job.job_id}' already exists")
        if job.enabled:
            for existing in self._jobs.values():
                if (
                    existing.enabled
                    and existing.schedule.kind == job.schedule.kind
                    and existing.schedule.every_ms == job.schedule.every_ms
                    and existing.schedule.cron_expr == job.schedule.cron_expr
                    and existing.action == job.action
                ):
                    raise ValueError(
                        f"Duplicate schedule: existing job '{existing.job_id}'"
                    )
        self._jobs[job.job_id] = job
```

> enabled 잡 간에만 dedup을 적용합니다. disabled 잡은 실행되지 않으므로 중복이어도 안전합니다. 테스트에서 disabled 잡을 여러 개 만드는 패턴이 있어 이 구분이 필요했습니다.

### 5-2. isolated 세션 MCP 차단

isolated 스케줄 잡에 `mcp_manager=None`을 전달하여 MCP subprocess 스폰을 원천 차단했습니다.

```python
# core/cli/__init__.py
_, _, _iso_loop = _build_agentic_stack(
    _iso_conv,
    mcp_manager=None,    # MCP subprocess 스폰 차단
    hitl_level=0,        # HITL 승인 프롬프트 억제
    quiet=True,
)
```

> isolated 스케줄 잡은 내장 도구(47개)로 충분합니다. 외부 MCP 서버 호출이 필요한 작업은 `isolated=False`(systemEvent)로 메인 세션에서 실행해야 합니다.

### 5-3. 결과 캐시 eviction

`MAX_RESULTS_CACHE=200`을 설정하고, 초과 시 oldest-first eviction을 적용했습니다.

```python
# core/orchestration/isolated_execution.py
MAX_RESULTS_CACHE = 200

def _worker() -> None:
    result = self._execute(fn, args, kwargs or {}, cfg)
    with self._lock:
        self._results[session_id] = result
        if len(self._results) > self.MAX_RESULTS_CACHE:
            oldest = next(iter(self._results))
            self._results.pop(oldest, None)
```

> Python dict는 삽입 순서를 유지하므로 `next(iter(...))`가 가장 오래된 항목을 반환합니다. O(1) eviction입니다.

---

## 6. 마무리

### 핵심 정리

| 이슈 | 근본 원인 | 수정 |
|------|----------|------|
| 스케줄 중복 | random UUID ID + dedup 미검사 | schedule+action 동일성 체크 |
| 좀비 MCP | isolated 세션에 singleton MCP 공유 | `mcp_manager=None` |
| 결과 캐시 누적 | `_results` dict 무한 성장 | MAX_RESULTS_CACHE=200 eviction |

### 체크리스트

- [x] 중복 스케줄 잡 삭제 (nl_12800114, nl_0eefcbd4, nl_6d46ef9f)
- [x] 좀비 MCP 프로세스 전수 정리
- [x] dedup 로직 추가 + 테스트 141건 통과
- [x] isolated 세션 MCP 차단
- [x] 결과 캐시 eviction 구현
- [x] `_announce_queue` 세션 종료 시 자동 정리 (`cleanup_announce_queue` + `mark_session_completed`)
- [x] `_run_records` max 200 eviction 추가

---

*Source: `blog/posts/orchestration/68-zombie-mcp-scheduler-leak.md` | Category: [[blog-orchestration]]*

## Related

- [[blog-orchestration]]
- [[blog-hub]]
- [[geode]]
- [[geode-tool-system]]
