---
title: GEODE Reasoning Depth Audit (R1~R9 Series)
category: synthesis
tags: [geode, reasoning, audit, anthropic, openai, glm, codex, frontier-research, encrypted-content, adaptive-thinking]
sources:
  - "geode/CHANGELOG.md (v0.55.0~v0.62.0)"
  - "geode/core/llm/providers/anthropic.py,codex.py,openai.py,glm.py"
  - "geode/core/llm/agentic_response.py"
  - "geode/core/cli/effort_picker.py"
  - "geode/tests/test_e2e_live_reasoning_depth.py"
  - "hermes-agent/agent/anthropic_adapter.py,codex_responses_adapter.py"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# GEODE Reasoning Depth Audit (R1~R9 Series)

> **9-cycle 추론 깊이 감사** (v0.55.0 → v0.62.0). 4개 프로바이더 (Anthropic / OpenAI Responses / Codex Plus / GLM) 의 reasoning 관련 wire kwargs 를 3-codebase ground truth (Hermes / OpenClaw / Claude Code) 에 맞춰 정렬. 시리즈 끝에 R9 live wire test 로 wire-level 검증 마침.

## 시리즈 요약 — 9 cycle, 8 버전

| Cycle | Version | 날짜 | 주제 | 핵심 변화 |
|---|---|---|---|---|
| **R1** | v0.55.0 | 2026-04-25 | Codex Plus encrypted reasoning replay | `codex_reasoning_items` sidecar + multi-turn `input` array replay |
| **R2** | v0.58.0 | 2026-04-28 | GLM thinking 필드 활성화 | `extra_body={"thinking":{"type":"enabled","clear_thinking":False}}` for GLM-4.5+ |
| **R3-mini** | v0.60.0 | 2026-04-28 | PAYG OpenAI Responses parity | `include=[reasoning.encrypted_content]` + `summary="auto"` for gpt-5.x |
| **R3-mini follow-up** | v0.61.0 | 2026-04-28 | PAYG `store=False` 명시 | Codex Plus parity. SDK default(True) 대신 명시 |
| **R4-mini** | v0.56.0 | 2026-04-26 | Anthropic adaptive thinking xhigh on Opus 4.7 | `output_config.effort="xhigh"` + `display="summarized"` 강제 |
| **R5** | (R 시리즈 일부) | — | 잡다 fixes | 머지 완료 |
| **R6** | v0.57.0 | 2026-04-27 | Reasoning summaries → AgenticUI | `reasoning_summary` IPC 이벤트 + sidecar 분리 |
| **R7** | (DROP) | — | Effort default SOT 통합 | Socratic Q1+Q4+Q5 fail → 폐기 |
| **R8** | v0.61.0 | 2026-04-28 | Picker effort `.geode/config.toml` 영구화 | `upsert_config_toml` 공유 helper. 3중 저장 |
| **R9** | v0.62.0 | 2026-04-28 | Live wire 검증 | `tests/test_e2e_live_reasoning_depth.py` 5 tests, `@pytest.mark.live` |

## 4-Provider 매트릭스 — 시리즈 후 결과

| Provider | Wire kwargs | Default effort | Surfacing |
|---|---|---|---|
| **Anthropic Opus 4.7** | `thinking={type:"adaptive",display:"summarized"}, output_config={effort}` | `xhigh` (picker), API default `high` | thinking blocks → `reasoning_summaries` |
| **Anthropic Opus 4.6 / Sonnet 4.6** | 동일, but `xhigh` → `max` 자동 다운 | `high` | 동일 |
| **Anthropic Haiku 4.5** | thinking 비전송 | (no knob) | 없음 |
| **OpenAI Responses (PAYG gpt-5.x)** | `include=[reasoning.encrypted_content], reasoning={effort,summary:"auto"}, store=False` | `medium` | `codex_reasoning_items` + `reasoning_summaries` |
| **OpenAI Responses (Codex Plus)** | 동일 | `medium` | 동일 |
| **OpenAI o-series (legacy)** | `reasoning={effort}` only | (legacy 3 levels) | 없음 |
| **GLM-4.5+ hybrid** | `extra_body={"thinking":{"type":"enabled","clear_thinking":False}}` | `enabled` | `reasoning_content` → `reasoning_summaries` |
| **GLM always-on (5.x)** | thinking field 무시 | (no knob) | 자동 |

## Per-cycle 상세

### R1 — Codex Plus encrypted reasoning (v0.55.0)

**문제**: gpt-5.x via Codex Plus 가 multi-turn 에서 reasoning state 손실. 매 라운드 cold restart.

**원인**: `store=False` (Codex Plus 권장) 일 때 server 가 reasoning 상태 보관 안 함 → 다음 turn 에 `previous_response_id` 기반 lookup 불가능.

**해결**: 
- 응답 normalize 시 `reasoning` 블록의 `encrypted_content` 추출 → `codex_reasoning_items` sidecar 저장
- 다음 라운드 input array 에 prior turn 의 `codex_reasoning_items` 를 prepend (단, `id` 필드는 strip — 서버 lookup 차단)
- `inject_reasoning_replay` 공유 walker (v0.60.0 에서 PAYG OpenAI 도 사용)

**3-codebase**: Hermes `codex_responses_adapter.py:228-246, 720-738` 가 정확히 같은 패턴.

### R2 — GLM thinking field (v0.58.0)

**문제**: GLM-4.5+ hybrid 모델이 `thinking` 필드 받지만 GEODE 가 안 보내고 있었음.

**해결**: `_GLM_THINKING_MODELS` frozenset (4.5/4.6/...) 게이트 + `extra_body={"thinking":{"type":"enabled","clear_thinking":False}}`. `clear_thinking=False` = prior-turn `reasoning_content` 보존.

**Frontier consensus**: 0/3 (Hermes generic chat_completions 라 모름, OpenClaw GLM plugin 없음, Claude Code Anthropic-only) → **GEODE leader**.

### R3-mini — PAYG OpenAI parity (v0.60.0)

**문제**: PAYG OpenAI 어댑터가 gpt-5.x 에 reasoning kwargs 안 보내고 있었음. picker 의 effort 선택이 wire 에 무시됨.

**원인**: `_REASONING_MODELS = {"o3","o4-mini","o3-mini"}` whitelist 만 있고 gpt-5* 누락.

**해결**: 
- `_is_payg_reasoning_model(model)` helper — `gpt-5*` prefix + o-series whitelist
- Codex Plus 와 같은 wire kwargs 적용
- `inject_reasoning_replay` 공유 helper 추출 (codex.py:243-271 → agentic_response.py)

### R3-mini follow-up — store=False 명시 (v0.61.0)

`pyproject.openai-python` SDK default = `store=True` (서버 저장). PAYG GEODE 가 input array + encrypted replay 만 쓰므로 server-side 저장 불필요. `store=False` 명시로 Codex Plus parity.

### R4-mini — Anthropic xhigh + display summarized (v0.56.0)

**문제 1**: Opus 4.7 추가 `xhigh` 단계가 default 4.6/Sonnet 에 보내면 400 에러.

**해결**: `_supports_xhigh_effort(model)` 게이트. Opus 4.7 만 통과, 나머지는 `xhigh → max` 자동 다운그레이드.

**문제 2**: Opus 4.7 부터 `thinking.display` 디폴트가 `"summarized"` → `"omitted"` 로 silent change. omitted 면 thinking blocks 빈 채로 응답 → R6 surfacing 깨짐.

**해결**: `display: "summarized"` 항상 명시 강제. 4.6 에서도 동일 (호환성).

상세: [[geode-adaptive-thinking]] 의 §3.3.

### R6 — Reasoning summaries surfacing (v0.57.0)

**문제**: 추론 모델이 thinking 한 토큰 비용을 사용자가 못 봄. silent spinner 동안 "죽었나?" 의심.

**해결**: 
- normalize 시 thinking blocks → `reasoning_summaries` sidecar 분리 (응답 content 에서 제외 → next-turn input 절약)
- AgenticLoop 가 매 LLM 호출 직후 `emit_reasoning_summary` 호출
- IPC `reasoning_summary` 이벤트 → CLI `event_renderer._handle_reasoning_summary` → "💭 thinking: ..." 240자 truncate 렌더

상세: [[geode-adaptive-thinking]] 의 §3.6, 3.7, 3.8.

### R7 (DROP) — Effort default SOT 통합 검토

**제안**: `effort_picker.default_effort` + `openai.py:_EFFORT_MAP` + adapter signature default 를 단일 SOT로 통합.

**Socratic 결과**: 
- Q1: 이미 SOT 분리 적절 (system default vs picker UI vs wire 번역)
- Q4: 통합하면 picker(UI 관심사) ↔ adapter(wire 관심사) 결합도만 증가
- Q5: 3-codebase 모두 분리 유지 (consensus 0/3)

→ **폐기**. 분산이 의도된 분리.

### R8 — Picker config.toml 영구화 (v0.61.0)

**문제**: `commands.py:435` 의 코멘트가 `.env + config.toml` 양쪽 저장 한다고 거짓말. 실제론 `.env` 만.

**해결**: `upsert_config_toml(section, key, value)` 공유 helper → `.env` + `config.toml` + 런타임 `settings` 3중 저장.

상세: [[geode-adaptive-thinking]] 의 §3.9.

### R9 — Live wire 검증 (v0.62.0)

5 개 `@pytest.mark.live` 테스트:
- `test_anthropic_xhigh_returns_thinking_summaries` — Opus 4.7 effort=xhigh → reasoning_summaries 비어있지 않음
- `test_gpt5_payg_returns_encrypted_items_and_summary` — PAYG gpt-5.5 → codex_reasoning_items + reasoning_summaries
- `test_gpt5_payg_multi_turn_replay` — round 2 with prior reasoning items 성공 (walker 검증)
- `test_glm_4_6_thinking_returns_summary` — GLM-4.6 thinking → reasoning_summaries
- `test_codex_plus_returns_encrypted_items_and_summary` — Codex Plus 동일

각 테스트 env var 별도 게이팅 (ANTHROPIC_API_KEY / OPENAI_API_KEY / GLM_API_KEY / CHATGPT_OAUTH_TOKEN). 가진 키만 opt-in.

비용: ~$0.01-0.05 / test. 운영자 분기별 검증 권장.

## 공유 인프라

### `inject_reasoning_replay` walker (v0.60.0)

`core/llm/agentic_response.py` 에 추출. Codex Plus + PAYG OpenAI 양쪽 호출. 29 라인.

walker 동작:
- prior turn 의 `codex_reasoning_items` 를 input array 의 user/assistant entry 사이에 inject
- 각 item 의 `id` 필드 strip (서버 lookup 차단)
- empty `encrypted_content` 항목 skip

### Per-provider effort enum table (v0.59.0, [[geode-adaptive-thinking|adaptive-thinking 페이지]])

`core/cli/effort_picker.py` 의 `supported_efforts` + `default_effort`. picker UI 가 모델 선택 시 자동으로 valid effort 범위 표시.

### `upsert_config_toml` helper (v0.61.0)

`core/cli/_helpers.py` 의 공유 helper. picker effort + model 양쪽 영속화.

## 시리즈 후 검증

- **Production tests**: 4226 → 4322 (+96 invariants 시리즈 동안 누적)
- **Live tests**: 5 추가 (R9)
- **Lint + mypy**: 항상 clean (각 cycle 마다 ratchet)
- **3-codebase ground truth**: 모든 cycle 이 Hermes / OpenClaw / Claude Code 중 1+ 개와 매칭

## See also

- [[geode-adaptive-thinking]] — Anthropic adaptive thinking 상세 구현 (R4-mini + R6 + 영구화)
- [[geode-llm-models]] — 모델 fallback chain
- [[geode-agentic-loop]] — adaptive_effort 다운그레이드 로직
- [[deep-thinking-ratio]] — Think@N (외부 가지치기, 다른 패밀리)
- [[blog-research-detail]] — Hermes / Codex Rust / Anthropic docs 비교 연구
- [[index]]
