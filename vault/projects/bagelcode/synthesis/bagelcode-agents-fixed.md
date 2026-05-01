---
title: 베이글코드 과제 — 에이전트 고정 결정 (Claude Code + Codex) + Cross-provider Verifier
category: synthesis
tags: [bagelcode, agents, decision, claude-code, codex, gemini, glm, cross-provider, verifier]
sources:
  - "[[bagelcode-orchestration-topology]]"
  - "[[bagelcode-fault-tolerance-design]]"
  - "[[bagelcode-frontier-orchestration-2026]]"
created: 2026-05-01
updated: 2026-05-01
---

# 에이전트 고정 + Cross-provider Verifier

> **사용자 결정 (확정)**: 사용 에이전트는 **Claude Code + Codex** 2종으로 고정. 검증은 **다른 provider 군** 으로 잡는다. 이 페이지는 그 결정을 둘러싼 구체화 + Verifier provider 비교.

## 고정 사실

| 역할 | 에이전트 | Provider | 모델 (default) | 비고 |
|---|---|---|---|---|
| Builder.A | **Claude Code** | Anthropic | `claude-opus-4-7` (또는 `sonnet-4-6`) | Agent SDK headless mode |
| Builder.B | **Codex** | OpenAI | `gpt-5.5` (또는 `o1`) | Codex CLI subagent + TOML config |
| Verifier | **cross-provider** | (Google / Z.ai / local) | 결정 대기 (§ 후보 비교) | Anthropic·OpenAI 와 다른 군 |
| Orchestrator | (Builder.A 의 Claude Code 가 동시 수행) | Anthropic | `claude-haiku-4-5` | sandwich §1+§4 만으로 라우팅 |

→ **Orchestrator 와 Builder.A 가 같은 Claude Code 인스턴스에서 다른 sandwich 로 동작**. 토큰 절감 + Cognition 의 "단일 컨텍스트" 원칙과 정합.

## 왜 Claude Code + Codex 인가 (사용자 결정 보강)

### Claude Code 강점
- **headless mode 안정** ([[bagelcode-frontier-orchestration-2026]] §K) — README CI/CD 동작 보장
- **Agent SDK depth=1** 제약이 우리 hierarchical 토폴로지와 정확히 일치 (재귀 spawn 금지 = 의도적)
- **베이글코드 메일 1순위 인용** ("Claude Code, Codex, Gemini CLI" 명시 순서)
- prompt cache (sandwich §1+§2 boundary, [[bagelcode-caching-strategy]])

### Codex 강점
- **TOML agent 정의** ([[bagelcode-frontier-orchestration-2026]] §L) — 우리 `agents/builder-b.md` 와 자연 매핑
- **CSV 배치 (`spawn_agents_on_csv`)** — stretch 옵션으로 batch 시나리오
- **non-interactive mode** — README 동작
- max_threads / max_depth 제어 가능
- **다른 provider 의존** = 한쪽 장애 시 fallback 보장

### "굳이 둘 다?" 정당화
- ICML 2025 §F: hierarchical + cross-provider = 95%+ 회복 (single provider 인 경우 회복률 ↓)
- 베이글코드 멀티 벤더 톤 직접 응답
- F1 (adapter 장애) 시나리오 시연 가능 — claude-code 죽이고 codex 로 fallback 되는 demo

## Verifier provider 후보 (cross-provider 군)

Anthropic 도 OpenAI 도 아닌 군에서 1개 선택:

### 후보 V1 — **Google Gemini 2.5 Pro** (기본 권장)

| 항목 | 평가 |
|---|---|
| API 안정성 | ✅ Google AI Studio + Vertex AI |
| Vision | ✅ (game.html 스크린샷 검증 가능) |
| Korean | ✅ 우수 |
| 가격 (input) | $1.25/1M (Pro), $0.075/1M (Flash) |
| Context cache | ⚠ min 4K — sandwich 작으면 미적용 |
| SDK | `@google/genai` (TS), `google-genai` (Python) |
| 베이글코드 메일 명시 | ✅ "Gemini CLI" 언급 |
| 셋업 부담 | ⚠ API 키 필요 |

→ **Verifier 1순위**: Vision 가능 + 메일 명시 정합.

### 후보 V2 — **Z.ai GLM-4.6** (저비용 옵션)

| 항목 | 평가 |
|---|---|
| API | OpenAI 호환 endpoint |
| Vision | ⚠ GLM-4V 별도 |
| Korean | ✅ |
| 가격 | input ~$0.6/1M (Pro 대비 50%) |
| Cache | OpenAI 호환 자동 |
| 셋업 | 키 발급 빠름, GFW 환경 주의 |
| 베이글코드 메일 | ❌ 미언급 |

→ **stretch 옵션** — `--verifier=glm` 플래그로 demo 시 비용 비교.

### 후보 V3 — **Local Llama 3.3 70B (Ollama)**

| 항목 | 평가 |
|---|---|
| API | localhost:11434 |
| Vision | ❌ |
| 가격 | $0 (로컬 GPU 필요) |
| Latency | ✅ 0 네트워크 |
| 셋업 | ❌ 평가자가 70B 모델 다운로드 부담 |
| README 동작 | ❌ 평가자에게 무리 |

→ **권장 X** — 평가자 환경에서 동작 보장 안 됨. degraded fallback 모드로만 (lint-only).

### 후보 V4 — **OpenRouter** (router 자체)

| 항목 | 평가 |
|---|---|
| API | OpenAI 호환 + 100+ 모델 통합 |
| 장점 | Verifier provider 동적 선택 가능 |
| 단점 | "다른 provider 군" 의미 약화 (라우터일 뿐) |

→ **stretch** — `--verifier-via=openrouter` 로 demo 시 자유도 강조.

## 결정 — Verifier 디폴트 = **Gemini 2.5 Pro**, fallback = **lint-only local**

```
Default chain:
  Verifier:  Gemini 2.5 Pro  (cloud, vision)
       ↓ (api fail)
  Verifier:  static lint-only mode  (in-process, no network)
       ↓
  PARTIAL verdict + transcript 표기
```

→ Gemini 키 없는 평가자도 README 동작 (lint-only 로 degraded).

## Adapter 구조 (`src/adapters/*`)

```typescript
// 공통 인터페이스
interface AgentAdapter {
  id: string                       // "claude-code" | "codex" | "gemini"
  capabilities: Capabilities       // {vision, json_mode, max_context, ...}
  
  ping(): Promise<HealthStatus>    // F2 capability probe
  call(req: AdapterRequest): Promise<AdapterResponse>
  
  // F1 circuit breaker hooks
  onSuccess(): void
  onFailure(err: Error): void
}

// 각 구현
class ClaudeCodeAdapter implements AgentAdapter { /* Agent SDK */ }
class CodexAdapter implements AgentAdapter { /* CLI subprocess + TOML */ }
class GeminiAdapter implements AgentAdapter { /* @google/genai */ }
class LintOnlyAdapter implements AgentAdapter { /* fallback, no network */ }
```

→ 각 adapter 가 [[bagelcode-fault-tolerance-design]] §F1-F2 의 health probe + circuit breaker 구현.

## Sandwich 매핑

[[kiki-appmaker-orchestration]] 4-section sandwich 가 actor 별로:

```
§1 contract   = "너는 누구이고 누구한테 PATCH 한다"
§2 stage tmpl = role 본문
§3 tool/skill = 사용 가능 도구 정의
§4 enforcement= routing 금지 + STOP

actor 별 §2 본문:
  - Orchestrator    → "ledger update + next_speaker 선정 + STOP"
  - Builder.A (CC)  → "spec → code, artifacts/ 에 쓰고 STOP"
  - Builder.B (Codex)→ Builder.A 와 동일 contract, 다른 모델
  - Verifier (Gemini)→ "build artifact 검증, exec 실행, dimensions 채점, STOP"
```

→ **Builder.A 와 Builder.B 의 §2 가 같음** = 사용자 입장에서 보면 같은 역할의 두 provider. fallback 의 의미.

## 인증·환경 변수

```bash
# .env (sample)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Optional fallback
GLM_API_KEY=...                  # Z.ai
PITCHCRAFT_VERIFIER=gemini       # gemini|glm|lint-only
PITCHCRAFT_PARALLEL_BUILDERS=0   # 1 = both run in parallel
PITCHCRAFT_MODEL_CLAUDE=claude-opus-4-7
PITCHCRAFT_MODEL_CODEX=gpt-5.5
PITCHCRAFT_MODEL_VERIFIER=gemini-2.5-pro
```

→ 모든 변수 optional (디폴트 있음). 키 없으면 그 adapter 자동 disabled + alternative 로 routing.

## 마감 안 위험 시나리오

| 시나리오 | 대응 |
|---|---|
| 평가자가 Codex 키 없음 | `--solo` 모드 자동 — Builder.A 만으로 동작, demo 영상은 fallback 전환 시연 |
| Gemini API 미가입 | lint-only mode 로 degraded, transcript 에 표기, README 에 "Gemini 키 옵션" 명시 |
| Claude Code 1.x → 2.x 마이너 업 | capability probe 가 model list 자동 재선택 |
| 전체 네트워크 끊김 | 모든 adapter circuit OPEN → user escalation, 마지막 transcript 보존 |

## 측정 (제출 README 박는 수치)

`--demo-fault-injection` 플래그 시 의도적 fault 시연:

```
$ pitchcraft demo --demo-fault-injection

[T+0] goal received
[T+0:30] Builder.A wake (claude-code)
[T+0:45] ⚠ Builder.A killed (artificial kill -9)
[T+0:46] circuit OPEN claude-code → routing to codex
[T+0:50] Builder.B wake (codex)
[T+1:40] artifact ready
[T+1:42] Verifier wake (gemini)
[T+1:55] PASS 91/100
[T+1:56] DONE in 1m56s (resilient session)
```

→ Demo 영상에 30초 분량으로 박으면 ICML 2025 §F 의 hierarchical + cross-provider safeguard 가 **실제 동작**하는 시연.

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-orchestration-topology]] — Hub-Ledger-Spoke (이 actor 4명이 그 토폴로지 위에 올라감)
- [[bagelcode-fault-tolerance-design]] — 각 adapter 의 health probe / circuit breaker
- [[bagelcode-frontier-orchestration-2026]] — Claude Code SDK / Codex subagents 1차 사료
- [[bagelcode-caching-strategy]] — provider 별 cache mechanism
- [[bagelcode-paperclip-vs-alternatives]] — framework 비채택 결정 (이 actor 들 직접 어댑터 통해 호출)
- [[geode-llm-models]] — multi-provider fallback chain 영감 (4 providers × 14 models)
