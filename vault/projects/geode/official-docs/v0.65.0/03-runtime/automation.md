---
title: Automation L4.5
category: runtime
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/automation/"
  - "core/config.py:171-243"
external_refs:
---

# Automation L4.5

GEODE 전 자동화 maturity의 L4.5 계층 — 시스템 자체가 *자체 운영*을 위해 자율 동작하는 컴포넌트들.

## 6 컴포넌트

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| **StuckDetector** | `core/automation/stuck_detector.py` | long-running turn 자동 해제 (default 7200s) |
| **DriftDetection** | `core/automation/drift_detection.py` | 6시간마다 prompt/axes/scoring drift 검사 |
| **OutcomeTracking** | `core/automation/outcome_tracking.py` | tier/score 분포 시계열 적재 (on/off 토글) |
| **SnapshotManager** | `core/automation/snapshot.py` | recent N runs 보관 + GC |
| **FeedbackLoop** | `core/automation/feedback.py` | 사용자 평가 → calibration 데이터 |
| **ExpertPanel / ModelRegistry** | `core/automation/expert_panel.py`, `model_registry.py` | LLM 모델 신뢰도 추적 |

## StuckDetector

가장 가시적인 컴포넌트. AgentLoop turn이 timeout 초과 시:

```python
class StuckDetector:
    def __init__(self, threshold_seconds=7200, check_interval_seconds=60):
        self.threshold = threshold_seconds
        ...

    def check(self):
        for turn in active_turns:
            if turn.duration_seconds > self.threshold:
                self._fire_stuck_event(turn)
                turn.kill()
```

trigger 하면:
- HookEvent.TURN_STUCK 발화
- RunLog 기록
- 사용자에게 알림 (NotificationPort)
- AgentLoop kill (graceful)

`config.toml` 의 `[automation] stuck_timeout_seconds` 조정.

## DriftDetection

```python
def scan(self):
    """6시간마다 호출."""
    for hash_name, expected in AXES_VERSIONS.items():
        actual = compute_axes_hash()
        if actual != expected:
            self._fire_drift_event(hash_name, expected, actual)
```

prompt/axes 무결성 위반 시 즉시 알림 + journal 기록.

## OutcomeTracking

각 분석 완료 시 `(tier, final_score, cause)` 적재. config.toml 의 `[automation] outcome_tracking_enabled` 토글.

데이터 → 시계열 분석 → tier 분포 drift, cause distribution shift 등 검출.

## SnapshotManager

각 graph run을 `~/.geode/runs/<run_id>/` 에 저장. recent N (기본 100) 만 유지, 그 이상은 GC.

## FeedbackLoop

`/rate <run_id> <score>` 슬래시 명령으로 사용자 피드백 → calibration 데이터셋에 추가.

## 설정 (`core/config.py:171-243`)

```toml
[automation]
stuck_timeout_seconds = 7200
stuck_check_interval_seconds = 60
drift_check_interval_seconds = 21600    # 6h
outcome_tracking_enabled = true
snapshot_max_runs = 100
feedback_enabled = true
```

env 변수: `GEODE_AUTOMATION_STUCK_TIMEOUT`, `GEODE_AUTOMATION_DRIFT_INTERVAL` 등.

## 다음

- [[scheduler]] — 시간 기반 작업
- [[orchestration]] — multi-agent
- [[58-events]] — automation hook events
