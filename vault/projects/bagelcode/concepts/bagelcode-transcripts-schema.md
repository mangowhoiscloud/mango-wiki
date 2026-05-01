---
title: 베이글코드 과제 — Agent Transcripts 스키마 spec (1차)
category: concepts
tags: [bagelcode, schema, transcript, jsonl, protocol, multi-agent, foundation]
sources:
  - "[[bagelcode-tradingagents-paper]]"
  - "[[kiki-appmaker-orchestration]]"
  - "[[kiki-slack-integration]]"
created: 2026-05-01
updated: 2026-05-01
---

# Agent Transcripts 스키마 spec (1차)

> **모든 다른 결정의 선결.** 캐싱 경계, 루브릭 측정점, 사용자 개입 surface, .md 인스트럭션 구조 모두 이 스키마 위에 올라간다. 한 번 박히면 변경 비용 큼 → 이번 패스에서 단단하게 잡고 시작.
>
> 근거: [[bagelcode-tradingagents-paper]] §4.1-4.2 (structured-by-default + dialogue-as-entry), [[kiki-appmaker-orchestration]] (sandwich), [[kiki-slack-integration]] (intent + notifier 한 줄 이벤트).

## 설계 원칙 5개

1. **Append-only JSONL** — 한 줄 = 한 메시지. 파일이 곧 state machine. (Karpathy P5: Git as State Machine 변형)
2. **Structured-by-default, free-text only inside `.body`** — 라우팅·관찰에 필요한 모든 필드는 schema 안. 자연어는 한 필드에 격리.
3. **Pull, not broadcast** — 에이전트는 자기에게 필요한 메시지만 query. transcripts 전체를 system prompt 에 매번 넣지 않는다 (캐싱과 직결).
4. **모든 dialogue 도 structured entry** — debate/Q&A 도 JSONL 한 줄. "에이전트끼리만 알아서" 하는 사이드 채널 금지.
5. **사용자 = 1급 actor** — 사용자 발화도 같은 JSONL 에 같은 schema 로. 별도 채널 X.

## 디렉터리 레이아웃

```
sessions/<session_id>/
├── manifest.json          # 세션 메타 (시작 시각, 참여 에이전트, 모델, 모드)
├── transcript.jsonl       # 모든 메시지 (append-only)
├── artifacts/             # 에이전트 산출물 (코드/문서)
│   ├── spec.md
│   ├── output/...
│   └── ...
└── checkpoints/           # 캐시 키 / 리플레이용 스냅샷
```

## 메시지 schema (JSONL 한 줄 = 한 메시지)

```typescript
type Message = {
  // ─── 식별 ───────────────────────────
  id: string              // ULID — 시간순 정렬 가능
  ts: string              // ISO-8601 (UTC)
  session_id: string

  // ─── 라우팅 ─────────────────────────
  from: ActorId           // "user" | "coordinator" | "planner" | "builder" | "critic"
  to: ActorId | "*"       // "*" = broadcast (관찰자만, 라우팅 X)
  in_reply_to?: string    // 다른 메시지 id — 스레드 추적

  // ─── 분류 ───────────────────────────
  kind: MessageKind       // 아래 표 참조
  topic?: string          // 자유 태그 (e.g. "spec/auth", "build/api")

  // ─── 본문 ───────────────────────────
  body: string            // 자연어 (한 곳에만 격리)
  data?: Record<string, unknown>  // structured payload (kind별 schema)

  // ─── 산출물 ─────────────────────────
  artifacts?: ArtifactRef[]  // {path, sha256, role}

  // ─── 관찰성 ─────────────────────────
  model?: string          // "claude-opus-4-7" | "gpt-5.5" | "gemini-2.5-pro"
  tokens_in?: number
  tokens_out?: number
  cache_read?: number     // anthropic ephemeral cache hit tokens
  cache_write?: number
  latency_ms?: number
  cost_usd?: number       // 추정

  // ─── 통제 ───────────────────────────
  ack_required?: boolean  // true 면 to 측이 ack 메시지 응답 의무
  blocking?: boolean      // 다음 stage 진행 차단
}

type ActorId = "user" | "coordinator" | "planner" | "builder" | "critic" | string
```

## MessageKind (제어 어휘 — 이 셋이 protocol 의 핵심)

```
─── 시스템 ──────────
session.start         세션 개시 (manifest 와 짝)
session.end           세션 종료
agent.wake            특정 에이전트 호출
agent.stop            에이전트 정지

─── 작업 흐름 ──────
goal                  사용자가 던지는 최상위 요청
spec                  Planner 의 산출 (AC, 제약, 컨텍스트)
spec.update           Spec 수정 (질문 응답 후)
build                 Builder 의 코드/문서 산출
verify.request        검증 요청
verify.result         검증 결과 (PASS/FAIL + score + reason)
done                  최종 산출 확정

─── 대화 (자연어 격리) ──
question              에이전트→에이전트, 에이전트→사용자 질문
answer                질문에 대한 응답
debate                다자 토론 entry (TradingAgents §4.2 III/IV 패턴)
note                  자유 코멘트 (라우팅 안 함)

─── 사용자 개입 ────
user.intervene        사용자 끼어들기 (예: "스펙 다시 짜")
user.veto             특정 결과 거부
user.approve          명시적 승인
user.pause / .resume  세션 통제

─── 메타 ───────────
ack                   수신 확인 (ack_required 응답)
error                 오류 보고
audit                 감사 항목 (자동 기록, 사람·에이전트 안 읽음)
```

→ **20개 안 됨**. Slack-style 9-intent ([[kiki-slack-integration]]) + TradingAgents 5단계 + 사용자 개입 4개 의 합집합.

## kind 별 `data` schema 요약

| kind | data 스키마 |
|---|---|
| `goal` | `{ text: string, constraints?: string[], deadline?: string }` |
| `spec` | `{ acceptance_criteria: string[], non_goals?: string[], questions?: string[] }` |
| `build` | `{ files_changed: string[], summary: string, run_cmd?: string }` |
| `verify.request` | `{ targets: string[], rubric_id: string }` |
| `verify.result` | `{ verdict: "PASS"\|"FAIL"\|"PARTIAL", score: number, dimensions: {...} }` |
| `user.veto` | `{ target_msg_id: string, reason: string }` |
| `debate` | `{ stance: "for"\|"against"\|"neutral", round: number }` |

상세 schema 는 코드의 `protocol/schemas/*.json` (JSON Schema) — 런타임 validation.

## Append-only 보장

- writer 는 OS-level `O_APPEND` flush
- reader 는 `tail -F` 스타일 polling (1초 / inotify)
- 메시지 id 는 **ULID** — 사전순 정렬 = 시간 정렬, 충돌 위험 ε

## "사용자 개입" surface 매핑

| 개입 모드 | 입력 | transcript 결과 |
|---|---|---|
| 진행 중 자유 발언 | `> note ...` | `kind=note, from=user` |
| 결과 거부 | `> /veto <msg_id> "reason"` | `kind=user.veto` |
| 스펙 재작성 | `> /redo spec` | `kind=user.intervene` + 다음 Planner 가 reset 후 재작성 |
| 일시정지 | `> /pause` | `kind=user.pause` (모든 에이전트가 wake 시 확인) |
| 명시 승인 | `> /approve <msg_id>` | `kind=user.approve` (release gate 통과) |

## "사용자 관찰" surface

3-tier:

1. **Raw JSONL tail** — 로그 친화 사용자 (개발자)
2. **Pretty TUI** — 메시지를 actor·kind 색상화, 본문 wrap. 좌측 timeline + 우측 입력
3. **Web observer (옵션)** — JSONL → Server-Sent Events 로 브라우저 스트림

→ **3-tier 모두 같은 transcript 파일 1개에서 도출.** 별도 인프라 X.

## TradingAgents 패턴과 매핑

| TradingAgents §4.2 | 우리 과제 |
|---|---|
| Analyst report (structured) | `kind=spec` (Planner 가 만든 구조화 보고) |
| Trader decision (structured) | `kind=build` (Builder 가 만든 산출) |
| Researcher debate → facilitator structured entry | `kind=debate` 여러 줄 + `kind=verify.result` 하나 |
| Risk Mgmt debate → adjustment | `kind=user.intervene` 또는 `kind=user.veto` |
| Fund Manager final | `kind=done` |

→ **5단계가 우리에겐 Goal → Spec → Build → Verify → Done.** 같은 골격.

## Sandwich 와 transcript 의 관계

[[kiki-appmaker-orchestration]] 의 4-section sandwich 가 system prompt 라면, transcript 는 그 sandwich 가 채워나가는 conversation memory:

- **§1 Engineering-team contract** ↔ MessageKind 어휘 (어떤 메시지를 누가 어떤 순서로)
- **§2 Stage template** ↔ kind별 산출 schema
- **§3 Tool execution footer** ↔ artifacts/checkpoints 디렉터리 규약
- **§4 Routing enforcement** ↔ transcript validator (잘못된 kind/from/to 조합 reject)

## 실제 예 (전체 흐름 1개)

```jsonl
{"id":"01J9...","ts":"2026-05-02T01:00:00Z","session_id":"s1","from":"user","to":"coordinator","kind":"goal","body":"todo REST API in Python"}
{"id":"01J9...","ts":"2026-05-02T01:00:01Z","session_id":"s1","from":"coordinator","to":"planner","kind":"agent.wake","body":"plan from goal","in_reply_to":"01J9...goal"}
{"id":"01J9...","ts":"2026-05-02T01:00:18Z","session_id":"s1","from":"planner","to":"*","kind":"spec","body":"AC: GET/POST/DELETE on /todos, in-memory","data":{"acceptance_criteria":["GET /todos","POST /todos","DELETE /todos/:id"],"questions":["DB?"]},"model":"claude-opus-4-7","tokens_in":1240,"tokens_out":380,"cache_read":1100,"cost_usd":0.012}
{"id":"01J9...","ts":"2026-05-02T01:00:40Z","session_id":"s1","from":"user","to":"planner","kind":"answer","body":"in-memory ok","in_reply_to":"01J9...spec"}
{"id":"01J9...","ts":"2026-05-02T01:00:42Z","session_id":"s1","from":"planner","to":"*","kind":"spec.update","body":"in-memory dict store","data":{"acceptance_criteria":["...","in-memory store"]}}
{"id":"01J9...","ts":"2026-05-02T01:00:43Z","session_id":"s1","from":"coordinator","to":"builder","kind":"agent.wake","body":"build from spec"}
{"id":"01J9...","ts":"2026-05-02T01:01:55Z","session_id":"s1","from":"builder","to":"*","kind":"build","body":"app.py + test_app.py","data":{"files_changed":["app.py","test_app.py"],"run_cmd":"python -m pytest"},"artifacts":[{"path":"artifacts/app.py","sha256":"...","role":"src"}],"model":"gpt-5.5","tokens_in":2100,"tokens_out":1240,"cost_usd":0.025}
{"id":"01J9...","ts":"2026-05-02T01:01:57Z","session_id":"s1","from":"coordinator","to":"critic","kind":"verify.request","data":{"targets":["app.py"],"rubric_id":"v1"}}
{"id":"01J9...","ts":"2026-05-02T01:02:30Z","session_id":"s1","from":"critic","to":"*","kind":"verify.result","body":"PASS — 3/3 AC, tests green","data":{"verdict":"PASS","score":92,"dimensions":{"correctness":4.7,"clarity":4.5}},"model":"gemini-2.5-pro","tokens_in":3200,"tokens_out":420,"cost_usd":0.008}
{"id":"01J9...","ts":"2026-05-02T01:02:31Z","session_id":"s1","from":"coordinator","to":"user","kind":"done","body":"shipping app.py + tests"}
```

→ 평가자가 이 한 파일만 봐도 의사결정 추적 가능. JSONL 제출 요건과 정합.

## 미정 / 후속

- [ ] `data` 의 정확한 JSON Schema 작성 (코드 구현 단계에서)
- [ ] ULID lib 선택 (Python: `python-ulid`, Node: `ulid`) — 어느 언어로 가는지 따라
- [ ] 동시 writer (Coordinator + Critic 동시 쓰기) lock 전략 — append-only + flush + 재시도면 충분 vs file lock

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-tradingagents-paper]] — 1차 근거
- [[bagelcode-caching-strategy]] — 이 schema 위에 캐시 경계
- [[bagelcode-rubric-scoring]] — `verify.result.dimensions` 의 차원 정의
- [[bagelcode-paperclip-vs-alternatives]] — 이 schema 를 외부 framework 에 맞출지 자체 운영할지
- [[kiki-appmaker-orchestration]] — sandwich identity (4-section)
- [[kiki-slack-integration]] — 9-intent + Pipeline notifier
