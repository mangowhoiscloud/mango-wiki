---
title: Scheduler
category: runtime
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/scheduler/scheduler.py:1-69"
external_refs:
  - url: "https://docs.openclaw.ai/automation/cron-jobs.md"
    pattern: "Cron + standing orders"
---

# Scheduler

`core/scheduler/scheduler.py:1-69` — AT/EVERY/CRON 3-type 스케줄링. Active hours, runlog, atomic store, deterministic jitter.

## 3 ScheduleKind

```python
class ScheduleKind(Enum):
    AT = "at"          # one-shot, 절대 시간 (datetime)
    EVERY = "every"    # fixed-interval (anchor 기반 drift 방지)
    CRON = "cron"      # 표준 cron expression
```

## Schedule dataclass

```python
@dataclass
class Schedule:
    id: str
    kind: ScheduleKind
    target: str          # 자연어 prompt 또는 슬래시 명령
    when: datetime | None  # AT
    interval: int | None   # EVERY (seconds), anchor에서 시작
    cron: str | None        # CRON
    active_hours: ActiveHours | None
    enabled: bool = True
```

## ActiveHours — quiet window

```python
@dataclass
class ActiveHours:
    start: time          # e.g. 09:00
    end: time            # e.g. 22:00
    weekdays_only: bool  # default False
    timezone: str        # IANA tz, e.g. "Asia/Seoul"
```

active_hours 외부에 firing 예정이면 다음 active window까지 미룸 (quiet hours 보호).

## Atomic Store

```
~/.geode/scheduler/
├── schedules.json          # SOT (atomic write: tmp → rename)
├── schedules.json.lock     # O_EXCL + PID
└── runlog/
    ├── <schedule_id>.jsonl  # per-job execution history
```

writes 안전성:
1. `schedules.json.tmp` 에 새 내용
2. `os.replace(tmp, schedules.json)` (atomic on POSIX)
3. lock 파일은 fcntl flock + PID 기록 → stale lock 검출

## Deterministic Jitter

```python
def jitter(schedule_id: str, base_delay: float, max_jitter: float) -> float:
    """id 기반 결정적 jitter — thundering herd 방지."""
    seed = int(hashlib.md5(schedule_id.encode()).hexdigest(), 16)
    return base_delay + (seed % int(max_jitter * 1000)) / 1000.0
```

같은 분에 여러 job이 fire 될 때 ID 별로 ~5초 흔들기.

## Missed Task Recovery

데몬 재시작 시 `last_fired_at` 보다 다음 firing이 지났다면:
- `recovery_policy=skip` → skip
- `recovery_policy=fire_now` → 즉시 실행 (기본)
- `recovery_policy=fire_all_missed` → 모든 누락 분 fire (드물게)

## 호출 예

```python
scheduler.schedule_at(
    target="summarize today's GitHub activity",
    when=datetime(2026, 5, 3, 9, 0, tzinfo=KST),
)

scheduler.schedule_every(
    target="check email inbox",
    interval_seconds=3600,
    active_hours=ActiveHours(start=time(9, 0), end=time(18, 0)),
)

scheduler.schedule_cron(
    target="weekly retro report",
    cron="0 9 * * 1",   # 월 9시
)
```

## CLI / Tool

- `schedule_job` tool — LLM이 호출 (WRITE)
- `/task` 슬래시 명령 — 직접 등록
- 스케줄러 자체는 serve daemon 안에서 별도 thread

## Quick Activation

```bash
# 1. AT — 특정 시간 1회
geode "schedule '집 나갈 시간' at 2026-05-03 09:00"

# 2. EVERY — 일정 간격 반복
geode "every 1 hour check email inbox during 9am-6pm KST weekdays"

# 3. CRON — 표준 cron expression
geode "cron '0 9 * * 1' weekly retrospective"

# 4. 등록 확인
geode /task list

# 5. 직접 등록 (LLM 없이)
geode /task add at 'tomorrow 9am' 'morning standup'
```

각 job 은 `~/.geode/scheduler/schedules.json` 에 atomic write. active hours quiet window 적용. recovery_policy 기본 `fire_now` (재시작 시 누락 분 즉시 실행).

스케줄 ID로 개별 cancel:
```bash
geode /task cancel <job-id>
```

## 다음

- [[automation]] — L4.5 자동화
- [[orchestration]] — multi-agent
