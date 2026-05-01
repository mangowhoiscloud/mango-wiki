---
title: 베이글코드 과제 — Fault Tolerance 설계 (연결부 / 통신 / 에이전트 자체)
category: concepts
tags: [bagelcode, fault-tolerance, resilience, circuit-breaker, retry, fallback, observability]
sources:
  - "[[bagelcode-frontier-orchestration-2026]]"
  - "[[bagelcode-orchestration-topology]]"
  - "[[bagelcode-transcripts-schema]]"
  - "[[kiki-circuit-breaker]]"
  - "[[kiki-scorecard-guards]]"
created: 2026-05-01
updated: 2026-05-01
---

# Fault Tolerance 설계 — 연결부 / 통신 / 에이전트 자체

> 사용자 주안점 그대로 받아옴: "환경 변화가 발생했을 때 (1) **연결부**, (2) **통신 과정**, (3) **파트별 에이전트 자체** 에 장애 대응 및 변화를 잡아야 한다." 이 페이지는 그 3축에 frontier safeguard 들을 매핑한 spec.

## 실패 분류 (Failure Taxonomy)

3축 × 모드별로 5종 정리:

```
                       ┌─────────────────────────────────┐
        연결부          │  F1. Adapter 장애 (네트워크/인증)  │
                       │  F2. 모델/API 환경 변경 (rate, 마이그레이션)
                       └─────────────────────────────────┘

                       ┌─────────────────────────────────┐
        통신 과정       │  F3. 메시지 schema 위반 / 손상     │
                       │  F4. 동시성 / 순서 / 중복            │
                       └─────────────────────────────────┘

                       ┌─────────────────────────────────┐
       에이전트 자체    │  F5. 에이전트 거짓 / 환각 / 무한 루프 │
                       └─────────────────────────────────┘
```

각 F# 마다 (a) 감지, (b) 복구 primitive, (c) transcript 표시, (d) 사용자 surface.

---

## F1 — Adapter 장애 (연결부 1)

### 시나리오
- Anthropic API 5xx, rate limit, OAuth 만료
- Codex CLI binary 없음 / 인증 토큰 죽음
- Gemini API 키 invalid

### 감지
- adapter call 의 try/catch + structured error code
- timeout (per-call 30s default, configurable)
- response schema 검증 실패

### 복구 primitive
1. **Retry with exponential backoff** — 1s/2s/4s, 최대 3회
2. **Circuit breaker** ([[kiki-circuit-breaker]] 차용)
   - 같은 adapter 5분 내 3회 실패 → **OPEN** (1분 동안 호출 차단)
   - HALF_OPEN → 1회 성공 → CLOSED
3. **Provider fallback** ([[bagelcode-orchestration-topology]] Hub-Ledger):
   - Builder.A (Claude Code) OPEN → **Builder.B (Codex) 로 routing**
   - Verifier (Gemini) OPEN → **local lint mode 로 degrade** (정적 검사만, vision 빠짐)

### Transcript 표시
```jsonc
{ "kind": "error", "from": "coordinator", "data": {
  "adapter": "claude-code", "code": "rate_limited",
  "retry_count": 2, "circuit": "half_open"
}}
{ "kind": "audit", "from": "coordinator", "data": {
  "fallback": "claude-code → codex", "reason": "circuit_open"
}}
```

### 사용자 surface
- TUI 우상단 health badge: `🟢 claude-code  🟡 codex  🔴 gemini (degraded)`
- circuit OPEN 시 토스트: "claude-code 장애로 codex 로 fallback 했어요. /switch 로 강제 변경 가능."

---

## F2 — 모델/API 환경 변경 (연결부 2)

### 시나리오
- Anthropic 이 모델 이름 변경 (`claude-opus-4` → `claude-opus-4-7`)
- Codex CLI 메이저 버전 업 → flag 변경
- Gemini API endpoint 마이그레이션
- 사용자가 도중에 API 키 교체

### 감지
- adapter 가 startup 시 **capability probe** (`models.list`, `--version`)
- 응답 schema 가 기대와 다르면 schema_mismatch error
- ENV 변경 watcher (`.env` mtime polling)

### 복구 primitive
1. **Capability probe at startup** — 시작 시 각 adapter 의 모델 list 확인 → 우리가 요구한 모델이 없으면 alternative 자동 선택
   ```
   요구: "claude-opus-4-7"  →  없음  →  fallback 표 ["claude-opus-4-6", "claude-sonnet-4-6"]
   ```
2. **Hot reload of `.env`** — 파일 수정 감지 시 adapter 재초기화 (Anthropic 의 rainbow deployment 영감 — 구·신 동시 가동 필요 없음, 작은 시스템이라 즉시 swap)
3. **Schema migration table** — protocol version 표기, 미래 호환

### Transcript 표시
```jsonc
{ "kind": "audit", "from": "coordinator", "data": {
  "event": "model_substituted",
  "requested": "claude-opus-4-7", "actual": "claude-opus-4-6",
  "reason": "model_not_available"
}}
```

### 사용자 surface
- 첫 turn 시작 시 capability summary print
- ENV 변경 감지 시 inline notice: "Anthropic 키가 교체됐어요. 새 키로 호출합니다."

---

## F3 — 메시지 schema 위반 / 손상 (통신 1)

### 시나리오
- LLM 이 요구한 JSON 대신 markdown 으로 응답
- `data` 필드 missing / wrong type
- ULID 형식 깨짐
- artifact ref 의 sha256 mismatch

### 감지
- 모든 transcript write 전 **JSON Schema validator** 통과 (이미 [[bagelcode-transcripts-schema]] §"Append-only 보장")
- artifact write 시 sha256 자동 계산 + ref 와 대조

### 복구 primitive
1. **Strict + Lenient 모드 분리**:
   - Strict: 검증 실패 → reject + LLM 에게 schema error 반환 + retry 1회 (자기 교정)
   - Lenient (debate / note): 자유 텍스트 허용
2. **Coercion layer** — 부분 매칭은 자동 보정 (e.g. JSON-in-markdown extract)
3. **Inspector 패턴** ([[bagelcode-frontier-orchestration-2026]] §F):
   - 별도 Verifier 가 "이 메시지 의미가 spec 과 일치?" 검토
   - 한국어 / 영어 mix 등 미세 손상 catch

### Transcript 표시
```jsonc
{ "kind": "error", "from": "validator", "data": {
  "violator_msg": "01J9...", "violation": "data.acceptance_criteria not array",
  "action": "retry_with_schema_hint"
}}
```

### 사용자 surface
- 검증 실패 메시지는 TUI 에 회색 처리 + "schema retry 1/2"
- 2회 모두 실패 시 사용자에게 raw 텍스트 노출 + 진행 여부 묻기

---

## F4 — 동시성 / 순서 / 중복 (통신 2)

### 시나리오
- Coordinator + Verifier 가 transcript 에 동시 write → 메시지 분실
- 같은 메시지 두 번 ack
- 시각 역전 (시스템 시간 jump)

### 감지
- ULID 단조성 break (이전 < 현재 가 아닌 경우)
- 동일 `id` 두 번 등장
- `in_reply_to` 가 없는 id 참조

### 복구 primitive
1. **Append-only with O_APPEND + flock** — POSIX file advisory lock
2. **ULID dedup** — id 가 이미 존재하면 두 번째 write 무시 (idempotent)
3. **순서 reconciliation** — read 시 `id` 정렬, ts 는 신뢰하지 않음
4. **At-least-once delivery + idempotency** — adapter 가 retry 했는데 응답 받으면 같은 id 로 두 번 쓰지 않음 (UUID seed in adapter call)

### Transcript 표시
- 정상이면 표시 X (silent infrastructure)
- 비정상 발견 시 `kind=audit, event=duplicate_msg_dropped`

---

## F5 — 에이전트 거짓 / 환각 / 무한 루프 (에이전트 자체)

### 시나리오
- Builder 가 코드 만들었다고 하지만 artifacts 없음
- Verifier 가 PASS 인데 exec 안 함
- Planner 와 Builder 가 서로 핑퐁만 무한 반복
- 같은 spec 으로 Builder 가 동일한 잘못된 답 반복 (degeneration-of-thought)

### 감지
- **Anti-deception 룰** ([[bagelcode-rubric-scoring]] §"Anti-Deception 룰") — schema 단계에서 강제
- **stuck_count** (Magentic-One progress-ledger): 같은 메시지 패턴 5+ 반복
- **Challenger 패턴** ([[bagelcode-frontier-orchestration-2026]] §F): Verifier 가 Builder 결과 도전권
- **MAR (Multi-Agent Reflexion)**: 단일 reflexion 으로는 degeneration 못 잡음 → cross-provider Verifier 가 핵심

### 복구 primitive
1. **Schema 강제 anti-deception**:
   - Builder 가 build 했다고 했는데 `artifacts` 비면 → kind=error 자동 발행
   - Verifier 가 PASS 인데 `exec.exit_code` 없으면 → 자동 0점 + retry instruction
2. **Cross-provider Verifier** = 같은 군 (Anthropic/OpenAI) 가 자기 결과 검증 못 함 → Gemini/GLM/local 강제
3. **Stuck escalation**:
   - progress-ledger.stuck_count ≥ 5 → 사용자에게 자동 escalate
   - "지금 같은 spec 으로 5번째 시도 중. 진행 / 중단 / spec 수정?"
4. **Local compensation (ALAS)**: 무한 루프 break 시 **이전 turn 까지 rollback** 하고 instruction 만 변경, 처음부터 다시 X

### Transcript 표시
```jsonc
{ "kind": "audit", "from": "coordinator", "data": {
  "event": "stuck_detected", "pattern_repeats": 5,
  "action": "escalate_to_user"
}}
{ "kind": "verify.result", "data": {
  "verdict": "REJECT", "reason": "build claimed but artifacts.length == 0",
  "anti_deception_rule": "build_without_artifacts"
}}
```

### 사용자 surface
- TUI 좌하단 "stuck counter" 시각화
- 5 도달 시 inline modal: "벗어나는 방법: redo / spec_diff / abort"

---

## 환경 변화 감지 — Heartbeat / Health probe

각 adapter 에 **per-30s health probe**:

```typescript
async function probe(adapter): HealthStatus {
  const t0 = Date.now()
  try {
    const r = await adapter.ping()       // models.list / --version / no-op
    return { ok: true, latency: Date.now()-t0, version: r.version }
  } catch (e) {
    return { ok: false, error: e.code, since: lastSuccessAt[adapter] }
  }
}
```

→ TUI health badge 가 이 데이터로 갱신.

→ adapter version 변경 감지 시 (e.g. claude code 0.2.71 → 0.2.85) → audit 로 기록 + capability probe 재실행.

## 우선순위 + 마감 안 (스코프)

| Primitive | 필수 (P0) | 권장 (P1) | 옵션 (P2) |
|---|---|---|---|
| Schema validator | ✅ | | |
| Anti-deception rules | ✅ | | |
| Retry + exp backoff | ✅ | | |
| Circuit breaker | ✅ | | |
| Provider fallback (A→B) | ✅ | | |
| Cross-provider Verifier | ✅ | | |
| Capability probe at startup | ✅ | | |
| Stuck escalation | ✅ | | |
| Hot ENV reload | | ✅ | |
| Inspector pattern (별도 agent) | | ✅ | |
| File lock for append | | ✅ | |
| Idempotency UUID seed | | ✅ | |
| Hot model substitution | | | ✅ |
| ALAS local compensation 정교화 | | | ✅ |

→ P0 만으로도 ICML 2025 의 hierarchical + safeguard = **96.4% 회복** 효과 대부분 확보.

## 측정 hook (rubric 에 차원 추가)

[[bagelcode-rubric-scoring]] 의 5차원에 추가 차원 검토:

| 신차원 | 측정 |
|---|---|
| **D6. Resilience** | 의도적 fault injection 시 회복률 (e.g. claude adapter kill 후 codex fallback 성공) |

→ demo 영상에서 `kill -9 $(pgrep claude-code)` 한 번 보여주면 strong signal.

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-orchestration-topology]] — 이 fault tolerance 가 올라가는 토폴로지
- [[bagelcode-frontier-orchestration-2026]] — 1차 사료
- [[bagelcode-transcripts-schema]] — schema validator 의 base
- [[bagelcode-rubric-scoring]] — D6 Resilience 차원 추가 검토
- [[bagelcode-agents-fixed]] — adapter 별 health probe 구체화
- [[kiki-circuit-breaker]] — kiki 의 circuit breaker production 사례
- [[kiki-scorecard-guards]] — C14 (10초 후 wake), C18 (least-loaded peer) 가드 영감
