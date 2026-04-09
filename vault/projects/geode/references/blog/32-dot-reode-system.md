---
title: ".reode 디렉토리 아키텍처 — 자율 에이전트의 런타임 상태를 관리하는 3-디렉토리 설계"
type: reference
category: blog-post
tags: [blog, reode]
source: "blog/posts/reode/32-dot-reode-system.md"
created: 2026-04-08T00:00:00Z
---

# .reode 디렉토리 아키텍처 — 자율 에이전트의 런타임 상태를 관리하는 3-디렉토리 설계

> Date: 2026-03-19 | Author: reode-team | Tags: [.reode, configuration, session-management, ADR-011, runtime-state]

## 목차
1. 도입 — 코딩 에이전트에 런타임 상태 관리가 필요한 이유
2. 3-디렉토리 분리 원칙 — .claude, .reode, ~/.reode
3. .reode 디렉토리 구조 — 각 서브디렉토리의 역할
4. 5-Layer Config Cascade — 설정 우선순위 체계
5. TOML 기반 프로젝트 제어 — config, routing, model-policy
6. 세션 관리 — SessionTranscript와 SessionManager
7. 마무리

---

## 1. 도입 — 코딩 에이전트에 런타임 상태 관리가 필요한 이유

코딩 에이전트는 한 번의 세션에서 수십 개의 도구를 호출하고, 수백 줄의 코드를 생성하며, 여러 개의 서브에이전트를 병렬 실행합니다. 이 과정에서 발생하는 세션 로그, 설정 오버라이드, 스냅샷, 캐시 데이터는 어디에 저장해야 할까요?

REODE는 프론티어 에이전트 3종(Claude Code, Codex CLI, OpenClaw) 비교 조사에서 **7개의 GAP(격차)**을 식별하고, 이를 해소하기 위해 `.reode` 디렉토리 아키텍처(ADR-011)를 설계했습니다. 핵심 원칙은 **역할별 디렉토리 분리**: 설정(Configuration), 런타임 상태(Runtime State), 사용자 상태(User State)를 각각 다른 위치에 저장하는 것입니다.

---

## 2. 3-디렉토리 분리 원칙 — .claude, .reode, ~/.reode

### 2.1 역할 분리 다이어그램

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                        REODE 상태 관리                           │
 ├─────────────────┬───────────────────┬────────────────────────────┤
 │   .claude/      │   .reode/         │   ~/.reode/                │
 │   Configuration │   Runtime State   │   User State               │
 │   (what to do)  │   (what was done) │   (who I am)               │
 ├─────────────────┼───────────────────┼────────────────────────────┤
 │ VCS 추적 (Git)  │ .gitignore        │ 머신 로컬                  │
 │ 팀 공유         │ 개인/세션 고유     │ 프로젝트 간 공유           │
 ├─────────────────┼───────────────────┼────────────────────────────┤
 │ • CLAUDE.md     │ • sessions/       │ • user_profile/            │
 │ • AGENTS.md     │ • agent-memory/   │ • scheduler/               │
 │ • settings.json │ • snapshots/      │ • runs/                    │
 │ • skills/       │ • result_cache/   │ • history                  │
 │ • worktrees/    │ • reports/        │ • config.toml (글로벌)     │
 │                 │ • config.toml     │ • skills/ (사용자 스킬)    │
 │                 │ • routing.toml    │                            │
 │                 │ • model-policy.toml│                           │
 └─────────────────┴───────────────────┴────────────────────────────┘
```

> 이 분리가 중요한 이유는 **수명(lifecycle)이 다르기 때문**입니다. `.claude/`의 설정은 팀 전체가 공유하므로 Git에 추적됩니다. `.reode/`의 세션 데이터는 개인의 실행 이력이므로 `.gitignore`에 포함됩니다. `~/.reode/`는 여러 프로젝트를 넘나드는 사용자 프로필이므로 머신에 귀속됩니다.

### 2.2 GAP 분석에서 도출된 설계

ADR-011은 프론티어 에이전트 비교 조사에서 식별한 7개 GAP을 해소합니다.

| GAP | 심각도 | 출처 | .reode 해소 방안 |
|-----|--------|------|------------------|
| G1 | Medium | Claude Code, Codex | `.reode/config.toml` — 프로젝트 레벨 설정 |
| G2 | High | Claude Code, Codex | `.reode/sessions/` — 세션 인덱스 + Resume |
| G3 | Critical | Claude Code, Codex | Context Compaction (별도 구현) |
| G4 | Low | Codex | `.reode/agent-memory/` — 2-Phase Memory |
| G5 | Low | Claude Code | 3-Scope 에이전트 메모리 (local 스코프) |
| G6 | Medium | Claude Code, Codex | 5-Layer Config Cascade |
| G7 | Medium | OpenClaw | 서브에이전트 정리 정책 |

---

## 3. .reode 디렉토리 구조 — 각 서브디렉토리의 역할

### 3.1 전체 트리

```
.reode/
├── config.toml              # 프로젝트 설정 (TOML)
├── routing.toml             # 파이프라인 노드별 LLM 모델 라우팅
├── model-policy.toml        # 모델 허용/차단 정책
├── MEMORY.md                # 프로젝트 로컬 메모리
├── sessions/                # 세션 퍼시스턴스
│   ├── <session-id>.jsonl   # 세션별 이벤트 로그 (append-only)
│   ├── sessions-index.json  # 메타데이터 인덱스
│   └── sessions.db          # SQLite 인덱스 (빠른 쿼리)
├── snapshots/               # 파이프라인 상태 스냅샷
├── result_cache/            # LRU 결과 캐시
├── reports/                 # 생성된 리포트 (Scorecard 등)
├── agent-memory/            # 서브에이전트 프로젝트 메모리
├── checkpoints/             # 파이프라인 체크포인트
└── models/                  # 모델 레지스트리
```

### 3.2 서브디렉토리별 역할

#### sessions/ — 세션 퍼시스턴스 (G2 해소)

모든 도구 호출, LLM 응답, 서브에이전트 이벤트가 **JSONL(JSON Lines)** 형식으로 기록됩니다. 각 세션은 고유한 ID를 가지며, `sessions-index.json`에 메타데이터가 인덱싱됩니다.

```json
// sessions-index.json
{
  "sessions": [
    {
      "session_id": "e98d5e68f8eb",
      "started_at": "2026-03-18T06:43:48.010146+00:00",
      "model": "claude-sonnet-4-5",
      "event_count": 3,
      "last_event_at": "2026-03-18T06:45:05.599373+00:00"
    }
  ]
}
```

> JSONL을 선택한 이유는 **append-only 쓰기**에 최적화되어 있기 때문입니다. 에이전트가 세션 중 비정상 종료되더라도, 마지막으로 기록된 줄까지는 유효합니다. JSON 파일 전체가 깨지는 것과 달리, JSONL은 줄 단위로 독립적이므로 내구성(durability)이 높습니다.

#### snapshots/ — 파이프라인 상태 스냅샷

`WorkflowGuard.snapshot_save()`가 생성하는 JSON 파일들이 저장됩니다. 비-Git 프로젝트에서도 상태 복원이 가능하도록 하는 안전장치입니다.

```python
# core/cli/workflow_guard.py
def snapshot_save(self, name: str, data: dict[str, Any]) -> Path:
    self._snapshots_dir.mkdir(parents=True, exist_ok=True)
    ts = int(time.time())
    safe_name = name.replace("/", "_").replace(" ", "_")
    snap_file = self._snapshots_dir / f"{safe_name}_{ts}.json"
    snap_file.write_text(
        json.dumps({"name": name, "ts": ts, "data": data}, indent=2)
    )
    return snap_file
```

> 파일명에 **Unix 타임스탬프**를 붙이는 이유는 동일 이름의 스냅샷을 여러 번 저장할 수 있게 하면서, `sorted(glob("*.json"), reverse=True)`로 최신 순 정렬을 O(n log n)에 수행하기 위해서입니다.

#### agent-memory/ — 서브에이전트 프로젝트 메모리 (G5 해소)

서브에이전트가 생성한 메모리의 **local 스코프**를 저장합니다. 메인 에이전트의 메모리와 분리하여, 서브에이전트 정리(cleanup) 시 안전하게 삭제할 수 있습니다.

#### result_cache/ — LRU 결과 캐시

동일한 도구 호출의 결과를 캐싱합니다. 특히 LLM 호출 비용이 높은 분석(assess) 단계의 결과를 재사용할 때 유효합니다.

---

## 4. 5-Layer Config Cascade — 설정 우선순위 체계

### 4.1 우선순위 계층

REODE의 설정은 5단계 계층(cascade)으로 결정됩니다. 상위 계층이 하위를 덮어씁니다.

```
  우선순위
     ▲
     │  1. CLI 인자           reode --model claude-opus-4-6
     │  2. 환경 변수          REODE_MODEL=claude-opus-4-6
     │  3. 프로젝트 TOML      .reode/config.toml
     │  4. 글로벌 TOML        ~/.reode/config.toml
     │  5. 코드 기본값        Settings 클래스 디폴트
     ▼
```

### 4.2 구현 — Pydantic BaseSettings + TOML 오버레이

```python
# core/config.py
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="REODE_",      # REODE_MODEL, REODE_VERBOSE 등
        env_file=".env",
        extra="ignore",
    )

    model: str = "claude-opus-4-6"         # Layer 5: 코드 기본값
    verbose: bool = False
    confidence_threshold: float = 0.7
    max_iterations: int = 5
    ...
```

> Pydantic BaseSettings가 Layer 1(CLI), 2(env), 5(default)를 자동으로 처리합니다. 나머지 Layer 3, 4는 TOML 오버레이(`_apply_toml_overlay`)가 담당합니다. 이 2단계 접근은 Pydantic의 기본 동작을 최대한 활용하면서, TOML이라는 사용자 친화적 포맷을 추가한 것입니다.

### 4.3 TOML 오버레이의 안전장치

```python
# core/config.py
def _apply_toml_overlay(s: Settings) -> None:
    toml_values = _load_toml_config()
    dotenv_keys = _env_file_keys()  # .env 파일에 명시된 키들

    for field_name, toml_value in toml_values.items():
        env_key = f"REODE_{field_name.upper()}"
        # 환경 변수 또는 .env에서 이미 설정된 값은 덮어쓰지 않음
        if env_key in os.environ or env_key in dotenv_keys:
            continue
        if hasattr(s, field_name):
            object.__setattr__(s, field_name, toml_value)
```

> `_env_file_keys()`로 `.env` 파일까지 확인하는 이유: Pydantic이 `.env`를 먼저 로드하므로, `os.environ`에는 나타나지 않을 수 있습니다. 사용자가 `.env`에 `REODE_MODEL=glm-5`를 명시했다면, TOML의 `model` 값이 이를 덮어쓰면 안 됩니다.

### 4.4 경로 상수 — 단일 진실 원천

`.reode` 하위 경로는 `config.py`에서 **상수**로 정의됩니다. 코드 전체에서 이 상수를 참조하며, 문자열 하드코딩을 금지합니다.

```python
# core/config.py
USER_DATA_DIR: Path = Path.home() / ".reode"       # ~/.reode/
PROJECT_DATA_DIR: Path = Path(".reode")             # .reode/

# User-global
USER_SKILLS_DIR: Path = USER_DATA_DIR / "skills"
USER_RUNS_DIR: Path = USER_DATA_DIR / "runs"
USER_SCHEDULER_DIR: Path = USER_DATA_DIR / "scheduler"

# Project-local
PROJECT_RESULT_CACHE_DIR: Path = PROJECT_DATA_DIR / "result_cache"
PROJECT_REPORT_DIR: Path = PROJECT_DATA_DIR / "reports"

# ADR-011 필수
SESSION_DIR: Path = PROJECT_DATA_DIR / "sessions"
AGENT_MEMORY_DIR: Path = PROJECT_DATA_DIR / "agent-memory"
CHECKPOINT_DIR: Path = PROJECT_DATA_DIR / "checkpoints"
```

> 경로 상수를 한 곳에 모아두면 **디렉토리 구조 변경 시 수정 범위를 최소화**할 수 있습니다. `".reode/sessions"`라는 문자열이 코드 10곳에 흩어져 있으면 하나를 놓치기 쉽지만, `SESSION_DIR`을 참조하면 `config.py` 한 줄만 수정하면 됩니다.

---

## 5. TOML 기반 프로젝트 제어 — config, routing, model-policy

### 5.1 config.toml — 마스터 설정

```toml
# .reode/config.toml

[llm]
primary_model = "claude-opus-4-6"
secondary_model = "claude-sonnet-4-5"

[output]
verbose = false

[pipeline]
confidence_threshold = 0.7
max_iterations = 5
```

TOML 키와 Settings 필드의 매핑은 `_TOML_TO_SETTINGS` 딕셔너리가 담당합니다.

```python
# core/config.py
_TOML_TO_SETTINGS: dict[str, str] = {
    "llm.primary_model": "model",
    "llm.secondary_model": "default_secondary_model",
    "llm.router_model": "router_model",
    "output.verbose": "verbose",
    "pipeline.confidence_threshold": "confidence_threshold",
    "pipeline.max_iterations": "max_iterations",
}
```

> TOML의 계층적 키(`llm.primary_model`)를 Settings의 플랫 필드(`model`)로 매핑하는 이유: Pydantic BaseSettings는 플랫 네임스페이스를 사용하지만, TOML은 섹션(`[llm]`)으로 논리적 그룹화를 제공합니다. 매핑 딕셔너리가 이 두 세계를 연결합니다.

### 5.2 routing.toml — 노드별 모델 라우팅

파이프라인의 각 노드가 사용할 LLM 모델을 개별 지정합니다. 비용이 높은 분석 노드에는 Opus를, 단순 생성 노드에는 Sonnet이나 Haiku를 할당하여 **비용 최적화**를 달성합니다.

```toml
# .reode/routing.toml

[_default]
model = "claude-sonnet-4-5"

[migration]
assess = "claude-opus-4-6"        # 복잡한 분석 → 고성능 모델
plan = "claude-opus-4-6"          # 전략 수립 → 고성능 모델
transform = "claude-sonnet-4-5"   # 코드 변환 → 중간 모델
validate = "claude-sonnet-4-5"
measure = { model = "claude-haiku-4-5", reason = "simple scorecard generation" }

[porting]
analyze = "claude-opus-4-6"
map_types = "claude-opus-4-6"
generate = "claude-sonnet-4-5"
verify = "claude-sonnet-4-5"
```

> `measure` 노드에 Haiku를 할당한 이유를 TOML 인라인 테이블의 `reason` 필드로 기록합니다. 이는 코드가 아닌 **설정 파일에서 설계 의도를 문서화**하는 패턴입니다. 6개월 뒤 "왜 여기에 Haiku를 쓰지?"라는 질문에 TOML 파일 자체가 답합니다.

비용 구조를 시각화하면 다음과 같습니다.

```
  Migration Pipeline 노드별 모델 배치

  ASSESS ──→ PLAN ──→ TRANSFORM ──→ VALIDATE ──→ MEASURE
    │          │          │            │             │
  Opus       Opus      Sonnet       Sonnet        Haiku
  ($$$)      ($$$)      ($$)         ($$)          ($)
```

### 5.3 model-policy.toml — 모델 허용/차단 정책

프로젝트 단위로 사용 가능한 LLM 모델을 제한합니다. 보안이나 컴플라이언스 요구사항에 대응합니다.

```toml
# .reode/model-policy.toml

[policy]
allowlist = [
    "claude-opus-4-6",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "gpt-5.4",
    "gpt-4.1",
    "qwen3.5-plus",
]
default_model = "claude-sonnet-4-5"
```

| 설정 | 동작 |
|------|------|
| `allowlist`만 설정 | 목록에 있는 모델만 허용 |
| `denylist`만 설정 | 목록에 있는 모델만 차단 |
| 둘 다 미설정 | 모든 모델 허용 (permissive) |
| `default_model` | 명시적 모델 지정이 없을 때 사용할 모델 |

> 이 정책 파일이 `.reode/`에 위치하는 이유: 모델 허용 범위는 프로젝트마다 다를 수 있습니다. 금융 프로젝트는 외부 API 모델을 차단하고, R&D 프로젝트는 모든 모델을 허용할 수 있습니다. `.reode/`는 gitignore 대상이므로 팀원별로 다른 정책을 적용할 수도 있고, `.claude/`로 옮기면 팀 전체에 강제할 수도 있습니다.

---

## 6. 세션 관리 — SessionTranscript와 SessionManager

### 6.1 SessionTranscript — JSONL 이벤트 로그

모든 에이전트 상호작용이 `.reode/sessions/<session-id>.jsonl`에 기록됩니다.

```python
# core/cli/transcript.py
class SessionTranscript:
    def __init__(self, session_dir: Path, session_id: str) -> None: ...
    def append(self, event_type: str, data: dict) -> None: ...

    # 편의 메서드
    def record_session_start(self, model: str) -> None: ...
    def record_user_message(self, text: str) -> None: ...
    def record_assistant_message(self, text: str) -> None: ...
    def record_tool_call(self, tool_name: str, tool_input: dict) -> None: ...
    def record_tool_result(self, tool_name: str, status: str, summary: str) -> None: ...
    def record_subagent_start(self, agent_id: str, task_type: str) -> None: ...
    def record_subagent_complete(self, agent_id: str, status: str, summary: str) -> None: ...
```

> `record_*` 편의 메서드가 `append()`를 감싸는 패턴은 **타입 안전성**을 위한 것입니다. `append("tool_cal", {...})` 같은 오타를 방지하고, 어떤 이벤트 타입이 존재하는지 IDE 자동완성으로 탐색할 수 있게 합니다.

하나의 이벤트는 다음 구조를 가집니다.

```json
{
  "ts": 1710907328.123,
  "type": "tool_call",
  "tool_name": "run_bash",
  "tool_input": {"command": "uv run pytest tests/ -q"}
}
```

### 6.2 SessionManager — SQLite 인덱스 (G2 해소)

`SessionManager`는 SQLite를 사용하여 세션 메타데이터를 인덱싱하고, `/resume` 명령으로 이전 세션을 재개할 수 있게 합니다.

```python
# core/cli/session_manager.py
class SessionManager:
    def __init__(self, db_path: Path, session_dir: Path) -> None: ...
    def list(self, limit: int) -> list[SessionMeta]: ...
    def get(self, session_id: str) -> SessionMeta | None: ...
    def upsert(self, meta: SessionMeta) -> None: ...
    def rebuild_conversation(self, session_id: str) -> list[Message]: ...
```

SQLite 스키마는 다음과 같습니다.

```sql
-- .reode/sessions/sessions.db
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  model TEXT,
  project_dir TEXT,
  message_count INTEGER DEFAULT 0,
  summary TEXT,
  transcript_path TEXT NOT NULL
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
```

> SQLite를 선택한 이유: (1) 설치 없이 Python 표준 라이브러리로 사용 가능, (2) 단일 파일이므로 `.reode/sessions/` 안에 깔끔하게 격리, (3) 인덱스를 통한 빠른 정렬/검색(`updated_at DESC`). Redis나 PostgreSQL은 `.reode` 철학("외부 서비스 의존 없이 로컬에서 동작")에 맞지 않습니다.

### 6.3 이중 인덱스 전략

세션 메타데이터는 **두 곳**에 인덱싱됩니다.

```
                 ┌─────────────────────────┐
                 │  <session-id>.jsonl      │  원본 이벤트 로그
                 │  (append-only, 줄 단위)   │
                 └───────────┬─────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                             ▼
  ┌──────────────────┐          ┌──────────────────┐
  │ sessions-index   │          │   sessions.db     │
  │     .json        │          │    (SQLite)       │
  │                  │          │                   │
  │ 빠른 메타데이터   │          │  쿼리/정렬/필터링  │
  │ 조회 (파싱 불필요) │         │  rebuild_conversation│
  └──────────────────┘          └──────────────────┘
```

| 인덱스 | 용도 | 장점 |
|--------|------|------|
| `sessions-index.json` | 세션 목록 빠른 조회 | JSONL 전체를 파싱하지 않고 메타데이터 확인 |
| `sessions.db` (SQLite) | 정렬, 필터링, 세션 재개 | SQL 쿼리로 유연한 검색, `rebuild_conversation()` |

---

## 7. 마무리

### 핵심 정리

| 항목 | 값/설명 |
|------|---------|
| 아키텍처 출처 | ADR-011 (.reode Directory Architecture v2) |
| 디렉토리 분리 | `.claude/`(VCS) + `.reode/`(gitignore) + `~/.reode/`(머신 로컬) |
| 설정 계층 | 5-Layer: CLI > env > project TOML > global TOML > defaults |
| TOML 파일 | config.toml(마스터), routing.toml(노드별 모델), model-policy.toml(허용 정책) |
| 세션 저장 | JSONL(이벤트 로그) + SQLite(인덱스) + JSON(메타데이터) |
| 경로 관리 | `config.py` 상수 (`SESSION_DIR`, `AGENT_MEMORY_DIR` 등) |
| GAP 해소 | G1(설정), G2(세션 resume), G4(에이전트 메모리), G5(local 스코프), G6(cascade) |
| Settings 클래스 | Pydantic BaseSettings, 70+ 필드, thread-safe singleton |

### 3-디렉토리 분리 판단 기준

| 질문 | .claude/ | .reode/ | ~/.reode/ |
|------|----------|---------|-----------|
| 팀 전체가 공유해야 하는가? | O | X | X |
| Git에 추적되어야 하는가? | O | X | X |
| 실행할 때마다 바뀌는가? | X | O | X |
| 프로젝트를 넘어 유지되어야 하는가? | X | X | O |
| 세션이 끊기면 사라져도 되는가? | X | O (일부) | X |

### 체크리스트

- [ ] `.reode/`가 `.gitignore`에 포함되어 있는가
- [ ] `.reode/config.toml`이 `_TOML_TO_SETTINGS` 매핑에 부합하는가
- [ ] `.reode/routing.toml`의 모델명이 `model-policy.toml`의 allowlist에 포함되는가
- [ ] `.reode/sessions/` 디렉토리가 생성 가능한 상태인가
- [ ] 경로 문자열 하드코딩 없이 `config.py` 상수를 참조하고 있는가
- [ ] 환경 변수(`.env`)로 설정한 값이 TOML에 의해 덮어써지지 않는가

---

*Source: `blog/posts/reode/32-dot-reode-system.md` | Category: [[blog-reode]]*

## Related

- [[blog-reode]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
