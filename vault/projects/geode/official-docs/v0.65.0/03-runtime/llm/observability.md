---
title: Observability (LangSmith)
category: runtime-llm
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/"
  - "core/agent/loop.py"
external_refs:
  - url: "https://docs.smith.langchain.com/"
    pattern: "LangSmith tracing"
---

# Observability (LangSmith)

GEODE는 [LangSmith](https://docs.smith.langchain.com/) 를 LLM 호출 trace + 평가의 SOT로 사용한다.

## 환경 변수

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=geode-prod    # 또는 geode-dev
```

`.geode/.env` 또는 `~/.geode/.env` 에 둠.

## 자동 trace

LangChain `@traceable` 데코레이터 + LangGraph 통합으로 다음이 자동 trace:

| 호출 | trace 이름 |
|---|---|
| StateGraph 실행 | `<graph-name>:invoke` |
| 각 노드 실행 | `node:<name>` |
| LLM 호출 | `<provider>:invoke` (anthropic, openai-codex, glm, openai) |
| Tool 호출 | `tool:<name>` |
| Sub-agent | `sub_agent:<task>` |

## 첨부 메타데이터

각 trace에:
- `prompt_hash` ([[prompt-hashing]])
- `model_id` (예: claude-sonnet-4-6, gpt-5.5, glm-5.1)
- `cache_creation_input_tokens` / `cache_read_input_tokens` (Anthropic만)
- `tier` / `final_score` (synthesizer 끝)
- `cause` / `action` (Game IP 도메인)
- `prompt_cache_hit` (boolean)

## 활용

| 분석 | 쿼리 |
|---|---|
| Prompt drift 추적 | 같은 prompt_hash 그룹의 응답 분포 |
| Cache hit-rate | `cache_read_input_tokens / total_input_tokens` |
| 모델 비용 비교 | provider별 input_tokens × pricing |
| Tier 분포 | synthesizer 결과의 tier histogram |
| 분석 시간 | StateGraph p50/p95/p99 |

## 직접 호출

```python
from langsmith import Client

client = Client()
runs = client.list_runs(project_name="geode-prod", filter='eq(name, "anthropic:invoke")')
for r in runs:
    print(r.id, r.metadata.get("prompt_hash"), r.outputs)
```

## 메모리 / 보안

- Sensitive payload (API key, OAuth token, profile.key) 는 trace에 *절대* 보내지 않음 — `core/llm/providers/*.py` 에서 `extra={"key": "..."}` 같은 직접 metadata 전달 금지
- LangSmith 자체는 외부 SaaS — 사용자 데이터 외부 유출 우려 시 self-hosted langsmith 또는 옵션 OFF

## 환경별 설정

| Env | LANGSMITH_PROJECT | 의도 |
|---|---|---|
| dev (로컬) | `geode-dev` | 개발자 individual 실험 |
| ci | `geode-ci` | CI 테스트 trace |
| prod | `geode-prod` | 사용자 실 실행 |

## 다음

- [[prompt-system]] — Prompt SOT
- [[prompt-hashing]] — drift 검증
- [[testing]] — E2E 검증
