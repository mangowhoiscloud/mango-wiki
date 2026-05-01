---
title: GEODE Research Catchup — 4 Notes (Mar~Apr 2026)
category: references
tags: [geode, research, codex-oauth, claude-code-dag, model-ux, defect-scan, frontier-research]
sources:
  - "geode/docs/research/codex-oauth-request-spec.md"
  - "geode/docs/research/claude-code-tasks-dag-system.md"
  - "geode/docs/research/model-ux-governance.md"
  - "geode/docs/research/v0531-defect-scan.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE Research Catchup (4 Notes)

이전 wiki sync (2026-04-15) 이후 추가된 4개 연구 노트. [[blog-research-detail|기존 blog-research-detail]] 와 별개의 in-repo `docs/research/` 트랙. [[blog-research]] hub 의 보충.

## 목록

| 날짜 | 제목 | 트리거 |
|---|---|---|
| 2026-04-27 | codex-oauth-request-spec | production incident — `max_output_tokens` 400 에러 |
| 2026-03-18 | claude-code-tasks-dag-system | task DAG 시스템 도입 검토 |
| 2026-04-27 | model-ux-governance | `/login` + `/model` UX 3-codebase audit |
| (date n/a) | v0531-defect-scan | v0.53.1 후속 cross-provider parity 결함 스캔 |

## codex-oauth-request-spec (2026-04-27)

### Trigger

Production incident: GEODE 가 Codex Plus 에 `max_output_tokens` 보냄 → `400 "Unsupported parameter: max_output_tokens"`.

### 3-codebase 그라운딩

correct request shape 를 3 reference 와 비교:
- Hermes `DEFAULT_CODEX_BASE_URL` = `https://chatgpt.com/backend-api/codex`
- OpenClaw `OPENAI_CODEX_BASE_URL` (minus `/codex`)
- Codex Rust `default_base_url` for `AuthMode::Chatgpt`

→ 모두 같은 base URL. 차이는 endpoint 마지막 segment.

### 발견

| Field | Codex Plus | OpenAI PAYG |
|---|---|---|
| `max_output_tokens` | ✗ (400) | ✓ |
| `temperature` | gpt-5.x-codex 만 ✗ | ✓ |
| `top_p` | ✗ | ✓ |
| `parallel_tool_calls` | ✓ (Hermes default true) | ✓ |
| `store=False` | required | optional |

→ **Codex Plus = 더 strict 한 wire spec**. v0.52.6 hotfix 로 GEODE 가 두 path 분리.

상세는 [[geode-reasoning-depth-audit|R 시리즈]] 의 R1 참조.

## claude-code-tasks-dag-system (2026-03-18)

### Trigger

Claude Code v2.1.16+ 가 도입한 task DAG 시스템 — sub-agent 들이 의존 그래프 형성해서 병렬 실행. GEODE 가 흡수 가능한가?

### 분석 결과

| 측면 | Claude Code | GEODE |
|---|---|---|
| Task 정의 | TaskCreate / TaskUpdate / TaskList tools | `core/orchestration/task_system.py` |
| DAG | blocks/blockedBy 양방향 | 부분 (Karpathy autoresearch 패턴 참조) |
| 병렬 실행 | sub-agent spawn (Agent tool) | `SubAgentManager` |
| Status | pending / in_progress / completed / deleted | 동일 |
| Owner | agent 식별자 | 미구현 (single-process) |

### Decision

GEODE 의 `core/orchestration/task_system.py` 가 부분적으로 같은 패턴 — 의존 graph 명시하지 않고 sequential 분배. 다만:
- DAG 명시 (blocks/blockedBy) 도입은 v0.6x 이후 (현재 단순한 게 충분)
- `owner` field 는 multi-agent 시점에 도입

→ **Claude Code 패턴 참조하되 직접 도입은 보류**. Karpathy autoresearch 인용 패턴 우선.

## model-ux-governance (2026-04-27)

### Trigger

3-codebase /login + /model UX audit. 사용자 frustration: "Claude Pro 에 OAuth 했는데 왜 model picker 에 Anthropic 모델만 나옴?"

### 핵심 원칙

> "User logs in with one auth mode at a time; system stores it; later `/model` selection just picks a bare model name — auth mode choice must be upstream, not conflated with model choice."

= **`/login` 이 auth + provider 결정. `/model` 은 model 만**. 두 관심사 분리.

### 3-codebase 비교 (file:line 인용)

| 시스템 | /login 의존 | /model 의존 | 분리 정도 |
|---|---|---|---|
| Hermes | provider + auth | model only | ✓ 분리 |
| OpenClaw | provider + plan | model only | ✓ 분리 |
| Claude Code | auth provider 자동 감지 | model only | ✓ 분리 (감지 자동) |
| **GEODE (당시)** | partial — env var 만 | model + provider | ✗ 혼재 |

### 적용

GEODE picker UX ([[geode-adaptive-thinking|v0.59.0 두축 picker]]) 가 이 원칙 따라 재설계. `/login` 으로 provider/auth 결정 후 `/model` 에선 model 만 선택. provider 는 model id 로부터 추론 (e.g. `claude-*` → Anthropic, `gpt-*` → OpenAI).

## v0531-defect-scan

### Trigger

v0.53.1 release 후 cross-provider parity 결함 의심 → 전수 스캔.

### 결함 매트릭스 (sample)

| 영역 | Anthropic | OpenAI | Codex | GLM | 결함 |
|---|---|---|---|---|---|
| `agentic_call` return type | normalize_anthropic | normalize_openai_responses | normalize_openai_responses | normalize_openai (Chat Completions) | OK |
| Encrypted reasoning replay | n/a | ✗ | ✓ | ✗ | **gap** (R3-mini 에서 해결) |
| reasoning_summaries surface | thinking blocks | reasoning items | reasoning items | reasoning_content | OK |
| store parameter | n/a | implicit True | False | n/a | **gap** (R3-mini follow-up 에서 해결) |
| temperature on adaptive | rejected | accepted | rejected (codex models) | accepted | OK (per-model 게이트) |
| ... | | | | | |

→ 이 스캔 결과가 [[geode-reasoning-depth-audit|R 시리즈]] 9 cycle 의 입력. 발견된 gap 마다 R-N cycle 로 처리.

## See also

- [[geode-reasoning-depth-audit]] — 4 research 가 input 이 된 시리즈
- [[geode-adaptive-thinking]] — model-ux-governance 가 picker UX 재설계 트리거
- [[blog-research]] — 일반 research hub
- [[blog-research-detail]] — 별도 트랙 13개 외부 연구
- [[index]]
