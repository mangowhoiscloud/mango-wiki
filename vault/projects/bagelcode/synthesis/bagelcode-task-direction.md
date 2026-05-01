---
title: 베이글코드 과제 — 제작 방향성 결정
category: synthesis
tags: [bagelcode, task-direction, multi-agent, design-decisions, scoping]
sources:
  - "[[bagelcode-team-profile]]"
  - "[[bagelcode-kiki-leverage]]"
  - "[[bagelcode-davis-system]]"
  - "[[bagelcode-ai-first-culture]]"
created: 2026-05-01
updated: 2026-05-01
---

# 베이글코드 과제 — 제작 방향성 (의사결정 페이지)

> 다음 단계로 넘어가기 전에 합의할 **제품 컨셉 / 스코프 / 기술 선택** 정리. 미정 항목은 명시적으로 ❓ 표시.

## 핵심 메시지 한 줄 (작성자 의도)

**"베이글코드 모바일 캐주얼팀이 실제로 쓸 만한, 멀티 에이전트 협업 도구의 가장 작은 동작 가능 단면."**

→ 데모용 가짜 multi-agent X. 실제 코드 작업 흐름에 끼어들 수 있는 "한 페어 + 사람 1명" 구조.

## 컨셉 후보 3안 (택일)

### 안 A — "Pair Programming Bridge" (Coordinator + Coder + Critic)

```
사용자 ── 한 줄 요청 ──▶ Coordinator
                          │
                          ├─▶ Coder (Claude Code 또는 Codex)
                          │      │  생성/수정
                          │      ▼
                          ├─▶ Critic (Gemini CLI)
                          │      │  실측 + 점수 + 거부권
                          │      ▼
                          └─▶ 사용자 (관찰 + 개입)
```

| 장점 | 단점 |
|---|---|
| 3개 에이전트 모두 등장 (메일의 Claude/Codex/Gemini 명시 충족) | 3개 에이전트 모두 설치/인증 부담 |
| Critic = "사용자 개입" 자연스러운 anchor | Critic 가짜 점수 위험 |
| Karpathy P4 (anti-deception) 자연스럽게 구현 | 3-way 메시지 protocol 복잡 |

### 안 B — "Spec ↔ Build Pingpong" (Planner + Builder)

```
사용자 ── 요청 ──▶ Planner (Claude Code) ── SPEC.md ──▶ Builder (Codex)
                       ▲                                    │
                       └──── 질문/이의 (channel) ────────────┘
                                       │
                                  사용자 채팅 끼어들기
```

| 장점 | 단점 |
|---|---|
| 가장 작고 단단함 — 에이전트 2개 최소 충족 | 메일이 셋 다 언급한 거 대비 약함 |
| PDCA 의 Plan↔Do 핑퐁이 자연스러움 ([[kiki-appmaker-pdca]]) | "독창성" 측면에서 평범 위험 |
| 인스트럭션 자산 sandwich 적용 깔끔 | Critic 없으면 fake-green 위험 |

### 안 C — "Game Designer ↔ Game Coder" (도메인 특화)

> 메일의 "기획자는 에이전트에게 게임을 만들게 한다" 직접 응답.

```
사용자(기획자) ── 게임 아이디어 ──▶ Designer Agent (스펙/룰북)
                                       │
                                       ▼
                                  Coder Agent (HTML/JS canvas 미니게임)
                                       │
                                       ▼
                                  사용자가 플레이 + 피드백
                                       │
                                       ▼
                                  (Designer 가 다시 받아 룰 조정)
```

| 장점 | 단점 |
|---|---|
| **베이글코드 도메인 정조준** — 게임 회사가 게임 만드는 도구 | 도메인 깊이 들어가다 시간 잡아먹힐 수 있음 |
| "기획 역량 기대" 멘트 정조준 | 진짜 게임이 안 굴러가면 즉시 마이너스 |
| 데모 시연이 가장 임팩트 큼 | 평가자가 게임 실행 환경 셋업 부담 |

## 권장 — **안 A 변형(2 에이전트로 시작) → 시간 남으면 Critic 추가, 또는 안 C로 도메인 색깔 입히기**

근거:
- "Claude Code, Codex, Gemini CLI 등" 의 "등" 은 셋 다 의무 X. **2개 에이전트 + 사용자 끼어들기**가 메일 조건 명문.
- [[bagelcode-team-profile]] 의 "3일 안에 prototype" / "단순 UI/UX" / "에이전트도 사람도" → **B를 뼈대로, A의 Critic을 옵션으로**.
- "기획 역량 기대" → README 도입부에 안 C의 게임 데모 케이스를 1개 시연 — 도메인 톤만 입히는 정도.

## 기술 선택 (잠정)

| 영역 | 선택 | 근거 |
|---|---|---|
| 통신 방식 | **append-only JSONL message log + 파일 watch** | "에이전트 세션 로그(JSONL)" 제출 요건과 한 자산. 별도 IPC 인프라 없이 README 동작. |
| 라우팅 | Coordinator 프로세스 (Node.js 또는 Python CLI) | 의존성 최소 |
| 에이전트 호출 | **Claude Code SDK / Codex CLI / Gemini CLI** subprocess | 각 vendor 공식 entrypoint 호출 |
| UI | **터미널 TUI 1면 + 웹 옵저버 1면** | "사용자 개입 + 관찰" 양면. TUI=개입, 웹=관찰 |
| 인스트럭션 | sandwich 4-section ([[kiki-appmaker-orchestration]]) per-agent `.md` | 제출 ".md 파일 포함" 요건 충족 |
| 상태 머신 | issue-like 상태 (`todo/in_progress/review/done`) | [[kiki-scorecard-guards]] 영감 |

❓ **검토 필요:**
- [ ] 후보가 사용해본 코딩 에이전트는? (Codex CLI 인증 셋업 부담 정도)
- [ ] Gemini CLI 도 셋업 가능한가? (안 A 의존)
- [ ] 데모 시연은 라이브 영상? 녹화 영상?
- [ ] GitHub repo public 으로 둘 수 있는가? (zip 대비 평가 편의)

## 스코프 — IN / OUT

**IN (반드시):**
- README 1개 — 5분 안에 setup → run 가능
- `.md` 인스트럭션 폴더 — coordinator/agents/ 구조 + sandwich 4-section
- 메시지 protocol 명세 (1페이지)
- JSONL 세션 로그
- 짧은 시연 녹화 (1-3분)

**OUT (절대 금지 — [[bagelcode-kiki-leverage]] §"가져오지 말 것"):**
- Paperclip/외부 SaaS 의존
- 대시보드/예쁜 UI
- 17-agent 풀세트
- `.bkit/` 풍의 자체 런타임
- 게임 엔진 통합
- DB / 영속 인프라 (파일 + JSONL 로 충분)

## 위험 신호 + 미리 방어

| 위험 | 사전 대응 |
|---|---|
| Codex/Gemini 셋업이 느려서 README 깨짐 | Claude Code 단독 모드 + Codex/Gemini 어댑터 stub 분리. 실 셋업은 시연 영상에서. |
| 두 에이전트가 trivial echo만 함 | Planner SPEC ↔ Coder 산출물 ↔ Critic 채점 — 의미 있는 차이를 protocol에 박기 |
| "기획 역량" 신호 약함 | README에 미니 게임 케이스 (안 C 부분 차용) 1개로 도메인 톤 입히기 |
| 평가자가 .md 안 읽음 | README 본문에 sandwich 핵심 4섹션 inline 인용 |
| fake-green | Critic 결과가 실측이라는 증거 (테스트 stdout / 실행 로그) |

## 다음 단계 (이 문서 합의 후)

1. ✅ 사전 리서치 정돈
2. ✅ Transcripts 스키마 spec — [[bagelcode-transcripts-schema]] (선결, 다른 모든 결정의 토대)
3. ✅ 캐싱 전략 — [[bagelcode-caching-strategy]]
4. ✅ 루브릭 spec — [[bagelcode-rubric-scoring]]
5. ✅ Paperclip vs 대안 결정 — [[bagelcode-paperclip-vs-alternatives]] (자체 구현 권장)
6. ⬜ **컨셉 픽스 (A/B/C 중)** ← 사용자 결정 대기
7. ⬜ Coordinator + Planner walking skeleton (sandwich §1+§2 + transcript writer)
8. ⬜ Builder 에이전트 + Critic (rubric 자동 채점 hook)
9. ⬜ TUI + (옵션) 웹 옵저버
10. ⬜ README + 시연 녹화 + 세션 JSONL 정돈
11. ⬜ 제출

⏰ **남은 시간**: 2026-05-01 → 2026-05-03 23:59 = 약 ~70시간 (수면/식사 제외 실 작업 ~25-30시간 가정)

## 진행 순서 변경 (이번 패스 반영)

원래는 "컨셉 픽스 → 스키마" 였으나, **스키마 먼저** 가 옳음:

> Transcripts 스키마는 A/B/C 어느 쪽이든 같은 골격으로 충분 (kind 어휘만 살짝 다름). 스키마가 박히면 컨셉 변경 비용이 작아진다.

→ [[bagelcode-transcripts-schema]] 가 1차로 박혔으니, 컨셉은 그 위에서 kind 가중치만 변형하는 형태로 결정 가능.

## 2026-05-01 후반 — PDCA 폐기, 방향 재정렬

**사용자 피드백**: PDCA 는 단조롭다. 환경 변화·통신 견고성·연결부 장애 대응을 주안점으로.

**행동:**
- frontier 사료 11종 수집 ([[bagelcode-frontier-orchestration-2026]])
- ICML 2025 §F (Resilience of Faulty Agents) 의 topology 결과 = chain 10.5% 저하 → **PDCA pipeline 폐기**
- **Hub-Ledger-Spoke** 토폴로지로 회귀 ([[bagelcode-orchestration-topology]])
- 사용 에이전트 **Claude Code + Codex 고정**, 검증은 cross-provider (Gemini 디폴트) ([[bagelcode-agents-fixed]])
- Fault tolerance F1-F5 분류 + 복구 primitive 작성 ([[bagelcode-fault-tolerance-design]])

**컨셉 자체:**
- 안 A (3-agent 합의), 안 B (2-agent 핑퐁), 안 C (게임 도메인) 모두 **PDCA 가정에 묶인 안** 이었음
- 새 방향 = **"Resilient Hierarchical Builder Pair"** — Builder.A (Claude Code) → Builder.B (Codex fallback) → Verifier (Gemini cross-provider) — 단일 transcript 위에서 ledger 갱신
- 게임 도메인 (안 C) 은 README 도입부 1 case 로 잔존 검토 — 베이글코드 톤 유지용

**다음 결정:**
- [ ] 컨셉 이름 (Pitchcraft 유지 vs 신명 — 토폴로지 변경 반영)
- [ ] Verifier provider 최종 (Gemini vs GLM)
- [ ] parallel builders 모드 default vs flag
- [ ] D6 Resilience 차원 [[bagelcode-rubric-scoring]] 에 추가할지

## See also

- [[bagelcode]] — 프로젝트 허브
- [[bagelcode-recruitment-task]] — 메일 원문
- [[bagelcode-team-profile]] — 페르소나 종합
- [[bagelcode-kiki-leverage]] — 자산 활용 매핑
- [[bagelcode-davis-system]] / [[bagelcode-ai-first-culture]] — 1차 근거
- [[kiki-appmaker-orchestration]] — sandwich identity 원본
- [[kiki-appmaker-pdca]] — Plan-Do-Check-Act 원본
- [[hub-spoke-pattern]] / [[kiki-slack-integration]] / [[kiki-scorecard-guards]]
