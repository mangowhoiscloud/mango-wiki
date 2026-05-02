---
title: Learning Path
category: getting-started
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
external_refs:
  - url: "https://hermes-agent.nousresearch.com/docs/getting-started/learning-path"
    pattern: "Progressive learning order"
---

# Learning Path

GEODE를 익히는 권장 순서. Hermes Agent의 learning-path 패턴 차용.

## Stage 1 — User (1-2 시간)

목표: 자연어 입력으로 결과 받기.

| 시간 | 페이지 |
|---|---|
| 5min | [[installation]] |
| 5min | [[quickstart]] |
| 10min | [[first-analysis]] (Cowboy Bebop dry-run) |
| 20min | [[manage-login]] — OAuth 또는 API key 등록 |
| 30min | 자연어 명령 실험 (`summarize`, `compare`, `schedule`) |

## Stage 2 — Power User (1 일)

목표: 시스템 메모리/스킬/스케줄을 활용해 일상 워크플로우 자동화.

| 페이지 | 학습 |
|---|---|
| [[5-tier-context]] | Org/Project/Session/Vault/Breadcrumb 메모리 계층 |
| [[catalog]] | 24 scaffold skills 어떤 게 어떤 작업에 |
| [[scheduler]] | AT/EVERY/CRON 작업 등록 |
| [[mcp]] | 외부 MCP 도구 연결 |
| [[lifecycle]] | `/clean`, `/stop`, `/uninstall` |

## Stage 3 — Domain Plugin Author (3-5 일)

목표: 새 도메인 plugin 작성.

| 페이지 | 학습 |
|---|---|
| [[4-layer-stack]] | 코어 아키텍처 |
| [[domain-port-protocol]] | 16-method Protocol |
| [[building-a-plugin]] | 단계별 구현 |
| [[pipeline]] | Game IP 참고 구현 |
| [[guardrails-g1-g4]] | 검증 게이트 통과 룰 |

## Stage 4 — Core Contributor (1-2 주)

목표: GEODE 코어 변경 기여.

| 페이지 | 학습 |
|---|---|
| [[design-philosophy]] | CANNOT/CAN |
| [[workflow]] | 8-step + Socratic Gate |
| [[verification-team]] | 4 페르소나 |
| [[testing]] | Quality gates |
| [[contributing]] | PR 흐름 |
| [[frontier-comparison]] | Claude Code/Codex/OpenClaw/Hermes 비교 |

## Stage 5 — System Operator (필요 시)

목표: 운영 환경 디버깅 + 모니터링.

| 페이지 | 학습 |
|---|---|
| [[slack-gateway]] | Slack 통합 |
| [[debugging]] | Operations |
| [[env-vars]] | 환경 변수 |
| [[troubleshooting]] | 자주 발생하는 문제 |
| [[faq]] | FAQ |

## 다음

스테이지별 첫 페이지부터 시작. 각 페이지 끝의 "다음" 링크 따라가면 자연스럽게 이어진다.
