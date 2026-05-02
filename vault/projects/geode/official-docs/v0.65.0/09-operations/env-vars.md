---
title: Environment Variables
category: operations
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/config.py:148-247"
  - "core/config.py:38-54"
external_refs:
---

# Environment Variables

GEODE 설정은 cascade로 결정 — CLI args > env > project TOML > global TOML > 코드 default.

## 위치

| Tier | 위치 |
|---|---|
| 1 (높음) | CLI args |
| 2 | OS env / `.env` (project) |
| 3 | `.geode/config.toml` (project) |
| 4 | `~/.geode/config.toml` (global) |
| 5 (낮음) | `core/config.py` 코드 default |

## .env 파일 위치

| 우선순위 | 위치 |
|---|---|
| 1 | `<cwd>/.env` |
| 2 | `<cwd>/.geode/.env` |
| 3 | `~/.geode/.env` |

## 주요 환경변수

### LLM / Model

| 변수 | 의미 | 기본값 |
|---|---|---|
| `GEODE_MODEL` | active 모델 ID | (config.toml의 llm.primary_model) |
| `GEODE_AGENTIC_EFFORT` | reasoning effort 수준 | `medium` |
| `OPENAI_API_KEY` | OpenAI PAYG | (없음) |
| `ANTHROPIC_API_KEY` | Anthropic PAYG | (없음) |
| `ZAI_API_KEY` | GLM PAYG | (없음) |

### LangSmith

| 변수 | 의미 |
|---|---|
| `LANGSMITH_TRACING` | trace 활성화 (`true` / `false`) |
| `LANGSMITH_API_KEY` | LangSmith API key |
| `LANGSMITH_PROJECT` | 프로젝트 이름 (e.g. `geode-prod`) |
| `LANGSMITH_ENDPOINT` | self-hosted 시 URL override |

### Auth

| 변수 | 의미 |
|---|---|
| `GEODE_AUTH_TOML` | auth.toml 경로 override (테스트용) |
| `GEODE_AUTH_JSON` | legacy auth.json 경로 (자동 마이그레이션) |

### Pipeline

| 변수 | 의미 |
|---|---|
| `GEODE_CONFIDENCE_THRESHOLD` | confidence multiplier 임계 (default 0.7) |
| `GEODE_PLAN_AUTO_EXECUTE` | plan 자동 실행 (`true` / `false`) |

### Gateway / Webhook

| 변수 | 의미 |
|---|---|
| `GEODE_GATEWAY_ENABLED` | Slack gateway on/off |
| `GEODE_WEBHOOK_ENABLED` | 외부 webhook on/off |

### Automation

| 변수 | 의미 |
|---|---|
| `GEODE_AUTOMATION_STUCK_TIMEOUT` | turn timeout seconds (default 7200) |
| `GEODE_AUTOMATION_DRIFT_INTERVAL` | drift scan 주기 (default 21600) |

## TOML 매핑 (`core/config.py:38-54`)

```python
TOML_TO_SETTINGS = {
    "llm.primary_model": "model",
    "llm.openai_api_key": "openai_api_key",
    "agentic.effort": "agentic_effort",
    "pipeline.confidence_threshold": "confidence_threshold",
    "automation.stuck_timeout_seconds": "automation_stuck_timeout",
    # ...
}
```

env 변수 prefix:
- `GEODE_MODEL` → `model`
- `GEODE_AGENTIC_EFFORT` → `agentic_effort`
- 자동 case 변환 (snake_case)

## Settings 인스턴스

```python
from core.config import settings

settings.model           # active model ID
settings.openai_api_key  # PAYG key (env 또는 config)
settings.confidence_threshold
```

`Settings` 는 pydantic BaseSettings — 부팅 시 한 번만 평가 (변경 시 daemon 재시작 필요).

## 다음

- [[debugging]] — 환경 디버깅
- [[slack-gateway]] — Gateway 설정
- [[lifecycle]] — config 위치
