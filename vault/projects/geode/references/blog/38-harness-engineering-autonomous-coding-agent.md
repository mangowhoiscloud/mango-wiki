---
title: "하네스 엔지니어링 — AI 코딩 에이전트를 자율 비행시키는 제어 구조"
type: reference
category: blog-post
tags: [blog, harness-frontier]
source: "blog/posts/harness-frontier/38-harness-engineering-autonomous-coding-agent.md"
created: 2026-04-08T00:00:00Z
---

# 하네스 엔지니어링 — AI 코딩 에이전트를 자율 비행시키는 제어 구조

> Date: 2026-03-20 | Author: rooftopsnow | Tags: harness-engineering, ralph-loop, autonomous-agent, claude-code, ralphton

## 목차
1. 도입: 10만 줄을 작성한 에이전트, 키보드를 터치한 인간은 0명
2. 프롬프트에서 하네스로 — 엔지니어링의 축이 이동하고 있다
3. 7개 리서치 사례가 하네스 설계에 남긴 흔적
4. Phase 0: 소크라틱 리즈닝 — 코딩 전에 모호성을 제거하라
5. Phase 1-2: 계획과 구현 — 의존 그래프 기반 병렬 빌드
6. Phase 3: 3-에이전트 검증과 백프레셔
7. 실전 검증: 3개 스택, 동일한 하네스, $3~$5
8. 하네스 비교 매트릭스: harness-for-real의 좌표
9. 마무리

---

## 1. 도입: 10만 줄을 작성한 에이전트, 키보드를 터치한 인간은 0명

2026년 2월, 한국 최초 랄프톤(Ralphton)이 열렸습니다. 인간은 설계하고 AI 에이전트가 자율적으로 코딩하는 해커톤입니다. 우승팀의 기록:

| 항목 | 수치 |
|------|------|
| 총 코드량 | 100,000줄 |
| 테스트 코드 비율 | 70% (70,000줄) |
| 소크라틱 리즈닝 라운드 | 133회 |
| 최종 모호성 점수 | 0.05 |
| 인간의 키보드 터치 | 0회 |

실패한 팀에게도 공통된 패턴이 있었습니다. 스펙을 급하게 확장하고 병렬 워크트랙을 열었더니 모호성이 증폭되었고, 에이전트는 수만 줄의 *잘못된* 코드를 자신 있게 작성했습니다. 코드의 양이 문제가 아니었습니다. **입력의 품질이 출력의 품질을 결정했습니다.**

이 글은 그 우승 전략을 재사용 가능한 시스템으로 만든 [harness-for-real](https://github.com/mangowhoiscloud/harness-for-real)의 설계를 해부합니다. 단순히 "이렇게 만들었다"가 아니라, 7개의 리서치 사례에서 어떤 교훈을 뽑아냈고, 그것이 코드의 어디에 박혀 있는지를 추적합니다.

---

## 2. 프롬프트에서 하네스로 — 엔지니어링의 축이 이동하고 있다

2025년 초반까지 AI 코딩의 핵심 기술은 프롬프트 엔지니어링이었습니다. "어떻게 말하면 모델이 더 잘 동작하는가"가 관건이었습니다. 2025년 중반, 컨텍스트 엔지니어링으로 축이 이동했습니다. CLAUDE.md, specs/, 아키텍처 문서 — 모델에게 *무엇을 보여줄 것인가*가 중요해졌습니다.

2026년 현재, 축은 다시 이동했습니다.

```
프롬프트 엔지니어링 → 컨텍스트 엔지니어링 → 하네스 엔지니어링
```

하네스 엔지니어링의 정의는 명확합니다: **"AI 에이전트를 신뢰할 수 있게 만드는 인프라, 제약, 피드백 루프를 설계하는 분야."** 여기에는 세 가지 원칙이 관통합니다:

1. **제어(Control)** — 에이전트가 허용된 범위 밖의 행동을 하지 않도록 제한
2. **감시(Monitoring)** — 동작 상태와 출력 결과를 실시간 추적/기록
3. **개선(Feedback)** — 오류 감지 → 다음 동작에 반영하는 루프

이 세 원칙이 왜 중요한지는 산업 사례가 증명합니다. LangChain은 모델(GPT-5.2-Codex)을 고정한 채 **하네스만 개선**하여 Terminal Bench 2.0 점수를 52.8%에서 66.5%로 올렸습니다. 발표 당시 기준 Top 30에서 Top 5로 도약했습니다. 바뀐 것은 제어 구조뿐이었습니다.

```
코딩 에이전트 = AI 모델(들) + 하네스
"모델은 상품화; 하네스가 경쟁 우위"
```

---

## 3. 7개 리서치 사례가 하네스 설계에 남긴 흔적

harness-for-real은 백지에서 설계된 것이 아닙니다. 랄프톤 우승팀 분석, Geoffrey Huntley의 원조 Ralph Loop, Anthropic 공식 가이드, HumanLayer의 백프레셔 연구, LangChain의 미들웨어 체인, Chroma의 컨텍스트 길이 연구, ETH 취리히의 CLAUDE.md 연구 — 7개의 리서치 사례에서 구체적인 설계 결정을 도출했습니다. 각 사례가 코드의 어디에 반영되었는지 추적합니다.

### 3.1 Geoffrey Huntley — Ralph Loop 원형

Geoffrey Huntley가 2024년 초 발견하고 2025년 7월 공식 블로그에 공개한 Ralph Loop의 핵심은 한 줄이었습니다:

```bash
while true; do cat PROMPT.md | claude -p; done
```

"루프 위에 앉으세요, 루프 안에 있지 않고." 매 반복마다 깨끗한 컨텍스트로 시작하고, 진행 상태는 파일과 git에 저장합니다. 기억을 컨텍스트가 아닌 파일에 외부화하는 것이 핵심이었습니다. 이후 그가 정리한 공식 플레이북(3 Phases, 2 Prompts, 1 Loop)은 Plan → Build의 2단계 구조와, "don't assume not implemented" 같은 핵심 언어 패턴을 확립했습니다.

**반영 지점:**
- `loop.sh`의 기본 구조: 매 반복마다 프롬프트 파일을 파이프하고 깨끗한 컨텍스트로 재시작
- `progress.txt`, `IMPLEMENTATION_PLAN.md`, git에 상태를 외부화
- `PROMPT_build.md`에 `"don't assume not implemented"`, `"capture the why"` 등 Huntley 패턴 직접 삽입
- AGENTS.md 60줄 제한, "상태는 IMPLEMENTATION_PLAN.md에" 원칙

> 원조 Ralph Loop는 작은 작업에 최적화되어 있었습니다. 그러나 대회 규모(10만 줄)에서는 수동 단계 전환, 갇힌 루프 무한 실행, 품질 게이트 부재 같은 한계가 드러났습니다. harness-for-real은 이 기반 위에 4-Phase FSM, 회로 차단기, 백프레셔를 얹어 확장한 것입니다.

### 3.2 랄프톤 우승팀 — 소크라틱 리즈닝과 다중 검증

우승팀이 증명한 것은 두 가지였습니다. 첫째, **코드 작성 전에 모호성을 제거하면 전체 품질이 결정된다는 것.** 133라운드의 자문자답으로 모호성 점수를 0.05까지 낮춘 뒤에야 첫 줄의 코드를 작성했습니다. 둘째, **Validator + Coordinator + Packer 다중 검증**으로 에이전트가 자기 작업을 검증할 수 있게 만들었다는 것.

**반영 지점:**
- `PROMPT_socratic.md` — Phase 0 전체가 이 전략의 자동화
- 모호성 점수 공식: `AMBIGUITY_SCORE = Remaining / (Found + 1)`
- `PROMPT_verify.md` — Validator(스펙 준수) + Coordinator(통합 일관성) + Packer(배포 준비) 3-에이전트 검증 구조를 그대로 재현
- 70% 테스트 코드 목표 (`scripts/test-ratio.sh`로 측정)

### 3.3 랄프톤 3등팀 — 비용 최적화와 모델 라우팅

3등팀의 교훈은 실전적이었습니다: "초반에 비싼 모델을 쓰고 후반에 저렴한 모델로 전환하라." 계획과 추론에는 Opus가 필요하지만, 구현은 Sonnet으로 충분합니다.

**반영 지점:**
- `loop.sh`의 모델 라우팅: 소크라틱/계획/검증은 Opus, 구현은 Sonnet
- v2 적응형 라우팅: 항목 복잡도(S/M/L/XL)에 따라 모델 자동 선택, 실패 누적 시 Opus 에스컬레이션
- 실측: asis-legacy 전체 실행에서 Opus 비용 $2.20, Sonnet 비용 $2.77 — 구현 20회 반복이 Sonnet으로 처리되어 총 $4.97

### 3.4 Anthropic 공식 가이드 — 2단계 에이전트와 세션 루틴

Anthropic의 "[Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)"는 2단계 에이전트 아키텍처를 제안했습니다. Initializer Agent가 환경을 세팅하고, Coding Agent가 이후 모든 세션을 처리합니다. 핵심은 **매 컨텍스트 윈도우마다 실행되는 세션 시작 루틴** — pwd 확인, progress 읽기, feature list 검토, git log, 기본 기능 테스트 — 이 에이전트의 방향을 잡아준다는 것이었습니다. 또한 **Feature List를 편집/삭제 금지**하여 조기 완료 선언을 방지하는 패턴도 제시했습니다.

**반영 지점:**
- `init.sh` — Initializer Agent 역할. 프로젝트 타입 자동 감지, `.harness-config` 생성, AGENTS.md/CLAUDE.md 스캐폴딩
- `PROMPT_build.md`의 Session Start Routine 7단계가 Anthropic 가이드의 세션 루틴을 거의 그대로 따름
- `IMPLEMENTATION_PLAN.md`의 status 필드가 Feature List의 `passes` 역할 — 에이전트가 DONE으로 바꾸려면 테스트 통과가 선행조건
- 이중 조건 종료: `HARNESS_COMPLETE` 마커 + 계획 상태 확인으로 조기 완료 선언 방지

### 3.5 백프레셔 — Huntley, Moss, HumanLayer의 합류점

백프레셔(Back Pressure) 개념은 여러 소스에서 합류합니다. Moss([banay.me](https://banay.me/dont-waste-your-backpressure/))는 "에이전트 *주변에* 구조를 설정하여 품질과 정확성(correctness)에 대한 자동화된 피드백"이라 정의했고, Huntley가 이를 [재해석하여 확산](https://ghuntley.com/pressure/)시켰습니다. HumanLayer는 "[context-efficient backpressure](https://www.hlyr.dev/blog/context-efficient-backpressure)"라는 변형을 제시하며 핵심 원칙 하나를 강조했습니다 — **"실패만 표면화, 성공은 무음."** 성공 메시지가 컨텍스트를 오염시키면 에이전트의 추론 품질이 떨어집니다.

**반영 지점:**
- `hooks/backpressure.sh` — Write/Edit마다 타입체크 + 린트 실행. exit 0(무음), exit 2(에러만 표면화)
- `hooks/pre-commit-gate.sh` — 커밋마다 테스트 + skip 마커 차단. 성공 시 출력 없음
- `.harness-config` 미존재 시 pre-commit-gate가 커밋 자체를 차단 — 백프레셔 없는 코드 커밋 원천 방지
- MCP 서버 대신 CLI 래퍼 선호 — 도구 설명이 시스템 프롬프트에 삽입되어 맥락 오염을 일으키는 것을 방지

### 3.6 LangChain — 미들웨어 체인과 루프 감지

LangChain이 Terminal Bench에서 Top 30 → Top 5로 점프한 비결은 미들웨어 체인이었습니다:

```
Request → LocalContextMiddleware
        → LoopDetectionMiddleware
        → ReasoningSandwichMiddleware
        → PreCompletionChecklistMiddleware
        → Response
```

특히 `LoopDetectionMiddleware`(에이전트가 같은 실수를 반복하는지 감지)와 `PreCompletionChecklistMiddleware`(완료 선언 전 체크리스트 강제)가 인상적이었습니다.

**반영 지점:**
- 회로 차단기(`MAX_STUCK`) — LoopDetectionMiddleware의 Bash 구현. 연속 N회 커밋 없음 감지 시 모델 에스컬레이션 또는 강제 전환
- v2 예측형 회로 차단기(`PREDICTIVE_STUCK`) — 실패 패턴 분석 후 선제적 전략 전환(SPLIT/ESCALATE/SKIP)
- `PROMPT_verify.md`의 3-에이전트 체크리스트 — PreCompletionChecklistMiddleware의 다중 에이전트 버전
- `LEARNINGS.md` 축적 + 자동 주입 — 에이전트가 같은 실수를 반복하지 않도록 하는 런타임 학습 메커니즘

### 3.7 Chroma + ETH 취리히 — 컨텍스트 관리의 과학

Chroma의 "[Context Rot](https://research.trychroma.com/context-rot)" 연구(18개 모델 평가)는 **컨텍스트 길이 증가 시 성능이 비균일하게 저하**되는 현상을 실증했습니다. lost-in-the-middle 효과, 주의력 희석(attention dilution), 방해 정보 간섭(distractor interference) 세 가지가 복합적으로 작용합니다. ETH 취리히의 SRI Lab 연구([arxiv 2602.11988](https://arxiv.org/abs/2602.11988))는 AGENTS.md 파일이 **LLM에 의해 자동 생성되면 성능이 2-3% 악화되고 비용이 약 20% 증가**한다는 것을 SWE-bench Lite 300개 태스크에서 보여줬습니다. 반면 수동 작성 파일은 +4% 개선 효과가 있었습니다. "60줄 미만" 가이드라인은 이 연구 결과와 Anthropic/커뮤니티 실무 권장이 합류한 것입니다.

**반영 지점:**
- 서브에이전트 패턴: `PROMPT_build.md`에서 "500 parallel subagents for search/read, only 1 for build/tests" — 검색은 병렬화하되 빌드 충돌은 방지. 컨텍스트 길이를 줄이는 "맥락 방화벽"
- `PROMPT_socratic.md`의 cross-spec analysis에 "Opus subagent with ultrathink" 사용 — 심층 추론은 격리된 서브에이전트에서
- AGENTS.md 60줄 제한을 `CLAUDE.md` 규칙으로 강제: "Keep AGENTS.md under 60 lines. State goes in IMPLEMENTATION_PLAN.md"
- "효과 없는 것: 코드베이스 개요, 디렉토리 나열. 효과 있는 것: 빌드/테스트 명령, 발견된 패턴" — ETH 연구에서 자동 생성 파일이 기존 문서와 중복될 때 해롭다는 결론과 일치

---

## 4. Phase 0: 소크라틱 리즈닝 — 코딩 전에 모호성을 제거하라

소크라틱 단계는 에이전트가 스펙을 읽고 스스로에게 질문하는 자문자답 루프입니다. 각 라운드는 8개 카테고리(UNDEFINED_TERM, CONTRADICTION, MISSING_ERROR_HANDLING, MISSING_PERFORMANCE_CONSTRAINT, AMBIGUOUS_ACCEPTANCE_CRITERIA, INTEGRATION_GAP, UNSTATED_ASSUMPTION, EDGE_CASE)와 3단계 심각도(CRITICAL/MAJOR/MINOR)로 구조화됩니다.

word-counter 예시의 실제 소크라틱 기록입니다:

```markdown
Round: 5
Spec: word-definition.md
Category: UNDEFINED_TERM
Severity: MAJOR
Q: "alphanumeric"이 ASCII만 의미하는가, Unicode까지 포함하는가?
   스펙에 "Unicode letters are supported"라고 되어 있지만
   "alphanumeric"의 범위가 불명확하다.
A: 스펙이 "café"를 예시로 들고 있으므로 Unicode-aware 매칭이 맞다.
   Python의 \w에서 underscore를 제외한 패턴을 사용해야 한다.
Confidence: 0.95
Resolution: Unicode-aware 영숫자 매칭 사용. ASCII-only가 아님.
```

> 이 Resolution이 이후 구현 단계에서 `tokenizer.py`의 정규식 `[^\W_']+(?:'[^\W_']+)*`를 결정했습니다. Resolution은 권위 있는 결정(authoritative decision)으로 취급됩니다 — 구현 에이전트가 임의로 다른 해석을 내릴 수 없습니다.

모호성 점수와 수렴 감지:

```
AMBIGUITY_SCORE = Ambiguities_Remaining / (Ambiguities_Found + 1)
```

| 전환 조건 | 임계값 |
|----------|--------|
| 표준 게이트 | `AMBIGUITY_SCORE < 0.10` |
| 수렴 게이트 (v2) | `CONVERGENCE_DETECTED` + `score < 0.15` + `CRITICAL: 0` |

word-counter에서는 11개 모호성을 발견하고 전부 해결하여 0.00으로 1라운드 만에 통과했습니다. 실제 랄프톤 우승팀은 133라운드가 필요했습니다. 스펙의 복잡도에 따라 차이가 크지만, 중요한 것은 이 과정이 **자동화**되어 있다는 점입니다. 인간이 개입할 필요가 없습니다.

산출물인 `CLARITY_LOG.md`는 이후 모든 단계에서 참조됩니다. 계획 단계는 `clarity_ref: CLARITY_LOG.md#Round-5`처럼 각 결정을 역추적할 수 있고, 검증 단계의 Validator는 CLARITY_LOG의 Resolution과 구현이 일치하는지 대조합니다.

---

## 5. Phase 1-2: 계획과 구현 — 의존 그래프 기반 병렬 빌드

### 계획: Opus가 의존 그래프를 그린다

계획 단계는 코드를 한 줄도 작성하지 않습니다. Opus가 스펙 + CLARITY_LOG + 기존 소스를 분석하여 `IMPLEMENTATION_PLAN.md`를 생성합니다. 핵심은 의존 그래프와 병렬 그룹입니다:

```markdown
Independent_Groups:
  - group_1: [Tokenizer, Counter, Formatter]  # 상호 의존 없음
  - group_2: [CLI]                            # group_1에 의존
  - group_3: [Integration Tests]              # group_2에 의존
Build_Order: group_1 → group_2 → group_3
```

각 항목에 복잡도 등급(S/M/L/XL)이 부여되고, 이 등급이 모델 라우팅에 직접 사용됩니다:

| 복잡도 | 기준 | 모델 | 비용/반복 (실측) |
|--------|------|------|-----------------|
| S | 단일 파일, <50 LOC | Sonnet | ~$0.10 |
| M | 2-3 파일, <200 LOC | Sonnet | ~$0.15 |
| L | 4+ 파일, 200-500 LOC | Opus | ~$0.70 |
| XL | 시스템 전반, >500 LOC | Opus | ~$1.10 |

> 계획 단계의 또 다른 규칙은 "L/XL 항목을 S/M으로 분할하라"입니다. 작은 항목은 병렬화가 가능하고, 저렴한 모델로 처리할 수 있습니다. word-counter에서 5개 항목 중 3개가 S, 2개가 M이었던 것은 이 원칙의 결과입니다.

### 구현: 한 번에 하나, 병렬로 여러 개

구현 단계의 원칙은 **"한 번에 하나만 처리하라."** 범위 확대(scope creep)는 자율 루프의 1번 킬러입니다. 매 반복은 계획에서 정확히 하나의 작업만 처리하고, 신선한 컨텍스트로 다음 반복을 시작합니다.

v2의 병렬 빌드는 이 원칙을 깨지 않으면서 속도를 높입니다. `scripts/plan-parser.sh`가 의존 그래프를 파싱하여 독립 항목을 식별하고, `scripts/parallel-build.sh`가 git worktree로 각 항목을 별도 브랜치에서 동시 빌드합니다. 각 워커는 여전히 하나의 항목만 처리합니다 — 병렬성은 워커 수준이지 항목 수준이 아닙니다.

```bash
# asis-legacy phase.log — 실제 병렬 빌드 기록
event=PARALLEL_START items=3 max=3     # group_1: 3개 독립 항목 동시 빌드
event=PARALLEL_DONE success
# ... group_1 완료 후
event=PARALLEL_START items=2 max=3     # group_2: 2개 독립 항목 동시 빌드
event=PARALLEL_DONE success
```

**런타임 학습 주입**은 에이전트의 장기 기억입니다. 구현 중 발견한 교훈이 `LEARNINGS.md`에 축적되고, 다음 반복 시 프롬프트에 자동 주입됩니다:

```markdown
### Learning: Spring 4.3.x CGLIB fails on Java 17+ without --add-opens
- Context: @ContextConfiguration 통합 테스트에서 ExceptionInInitializerError 발생
- Discovery: Spring 4.3.x의 CGLIB 3.2.5가 ClassLoader.defineClass()에
  리플렉션 접근하는데 Java 9+ 모듈 시스템이 차단
- Rule: maven-surefire-plugin argLine에
  --add-opens java.base/java.lang=ALL-UNNAMED 추가 필수
```

> asis-legacy에서 이 학습이 없었다면, 이후 모든 통합 테스트 항목에서 같은 에러를 반복했을 것입니다. 실제로 검증 단계에서 4개 학습 전부 적용 확인(Learnings_Applied: 4 of 4)을 받았습니다. asis-boot3에서는 9개가 축적되었고 9개 전부 확인(9 of 9). 에이전트가 스스로 학습하고 다음 세션에 전달하는 메커니즘입니다.

---

## 6. Phase 3: 3-에이전트 검증과 백프레셔

### 3-에이전트 검증

검증 단계는 3개의 Opus 서브에이전트를 병렬로 실행합니다:

```
Validator  ── specs/ 기준 수용 조건 대조. CLARITY_LOG Resolution과 구현 일치 확인.
Coordinator ── 모듈 간 연결, 고아 파일, 의존성 정합성, API 인터페이스 일관성.
Packer     ── 빌드 산출물, 시크릿 노출, README, 클론→실행 가능성.
```

3개 모두 ALL PASS면 `HARNESS_COMPLETE` 마커를 기록합니다. 하나라도 FAIL이면 새 항목을 `IMPLEMENTATION_PLAN.md`에 추가하고 **구현 단계로 회귀**합니다. 이 회귀 루프가 핵심입니다 — 검증은 단순한 종료 조건이 아니라, 자동 수정 메커니즘의 트리거입니다.

word-counter에서 Packer가 README.md 누락과 `__init__.py` 미비를 발견했고, 세션 내에서 즉시 수정하여 재검증을 통과했습니다:

```
Verification Report:
  Validator:   ALL PASS (25 criteria checked)
  Coordinator: ALL PASS (18 modules checked)
  Packer:      ALL PASS (6 checks — 2 initially failed, fixed in-session)
```

### 백프레셔: 두 겹의 품질 게이트

| 훅 | 시점 | 타임아웃 | 검사 항목 | 실패 시 |
|---|---|---|---|---|
| `backpressure.sh` | Write/Edit마다 | 60초 | 타입체크 + 린트 | 에이전트 즉시 수정 |
| `pre-commit-gate.sh` | 커밋마다 | 120초 | 테스트 + skip 차단 + TODO 차단 | 커밋 차단 |

> 두 훅 모두 `.harness-config`에서 커맨드를 읽습니다. Python 프로젝트면 `uv run pytest`, Java면 `mvn test`. 이 단일 설정 소스(single source of truth) 패턴 덕분에 하네스 코드 자체는 언어에 무관합니다.

### 회로 차단기: 갇힌 루프를 탈출시킨다

```
[기본] MAX_STUCK=5회 연속 커밋 없음
  → Sonnet이면 Opus로 에스컬레이션
  → Opus이면 RECOVERY MODE 컨텍스트 주입
  → 복구 실패 시 다음 단계로 강제 전환

[v2 예측형] PREDICTIVE_STUCK=2회 실패
  → 에이전트 자기 진단 (BUILD_ITEM_FAILURE)
  → suggestion에 따라 SPLIT / ESCALATE / SKIP
```

asis-legacy에서 실제로 작동한 기록:

```
23:06:51 event=CIRCUIT_BREAKER Stuck 3 iterations, phase=build, model=sonnet
```

Item 19에서 3회 연속 커밋 없이 멈췄고, 회로 차단기가 개입하여 전략을 전환한 뒤 검증 단계로 진행했습니다. 예산 강제(`MAX_BUDGET_USD`)와 결합하면 80% 도달 시 경고, 100% 시 체크포인트 저장 후 자동 중단합니다.

---

## 7. 실전 검증: 3개 스택, 동일한 하네스, $3~$5

동일한 하네스로 3개의 서로 다른 스택에서 프로젝트를 자율 생성했습니다. 스펙 파일만 작성하고, `bash loop.sh` 한 번 실행한 뒤 결과를 확인했습니다.

### Word Counter CLI (Python / uv + pytest)

| 페이즈 | 반복 | 비용 | 비고 |
|--------|------|------|------|
| Socratic | 1 | $0.63 | 11개 모호성 발견, 전부 해결, 점수 0.00 |
| Plan | 1 | $0.59 | 5 항목, 3 병렬 그룹 |
| Build | 8 | $1.31 | Sonnet 전용, 회로 차단기 1회 |
| Verify | 1 | $0.52 | Packer가 2건 발견 → 즉시 수정 |
| **합계** | **11** | **$3.06** | **144 테스트 전부 통과** |

### AS-IS Spring Boot 3 (Java 21 / Maven)

| 페이즈 | 반복 | 비용 | 비고 |
|--------|------|------|------|
| Socratic | 1 | ~$0.70 | 동일 스펙, 스택별 모호성 추가 해결 |
| Plan | 1 | ~$1.00 | 14 항목 |
| Build | 12 | ~$2.30 | Sonnet 전용, LEARNINGS 9개 축적 |
| Verify | 1 | ~$0.50 | ALL PASS (35 criteria) |
| **합계** | **15** | **~$4.50** | **73 테스트 전부 통과** |

### AS-IS Spring Legacy (Java 1.8 / Maven)

| 페이즈 | 반복 | 비용 | 비고 |
|--------|------|------|------|
| Socratic | 1 | $0.70 | 19개 모호성 해결 |
| Plan | 1 | $1.12 | 19 항목 |
| Build | 20 | $2.77 | Sonnet 전용, 회로 차단기 1회, LEARNINGS 4개 |
| Verify | 1 | $0.39 | ALL PASS (30 criteria) |
| **합계** | **23** | **$4.97** | **73 테스트 전부 통과** |

> 같은 Employee CRUD API 스펙을 Java 1.8 + Spring 4.3.4와 Java 21 + Spring Boot 3.3.7에서 각각 구현했습니다. 하네스는 `.harness-config`에서 빌드 커맨드를, `CLAUDE.md`의 Stack-Specific Rules에서 스택 제약을 읽습니다. "Java 1.8 — no var, no records" vs "Java 21 — use records, ProblemDetail(RFC 7807)". 하네스 코드 자체는 동일합니다.

asis-legacy의 비용 로그에서 적응형 모델 라우팅의 실제 동작:

```
phase=socratic  model=opus    cost=$0.70    # 추론 단계
phase=plan      model=opus    cost=$1.12    # 추론 단계
phase=build     model=sonnet  cost=$0.20    # Item 1 (S)
phase=build     model=sonnet  cost=$0.10    # Item 2 (S)
phase=build     model=sonnet  cost=$0.09    # Item 3 (S)
...20회 반복 전체 Sonnet...
phase=verify    model=opus    cost=$0.39    # 추론 단계
```

Opus는 소크라틱/계획/검증(3회)에만 사용되었고, 구현 20회 반복 전체가 Sonnet으로 처리되었습니다. 3등팀의 교훈이 실측 데이터로 검증된 셈입니다.

---

## 8. 하네스 비교 매트릭스: harness-for-real의 좌표

리서치에서 분석한 주요 하네스 도구들과 harness-for-real을 기능 축으로 비교합니다. 각 축은 "있다/없다"가 아니라, **어떤 수준으로 구현되어 있는가**를 표시합니다.

### 기능 매트릭스

| 기능 축 | [Ghuntley 플레이북](https://github.com/ghuntley/how-to-ralph-wiggum) | [ralph-claude-code](https://github.com/frankbria/ralph-claude-code) | [claude-code-harness](https://github.com/Chachamaru127/claude-code-harness) | [ACE (HumanLayer)](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) | **harness-for-real** |
|---|---|---|---|---|---|
| **소크라틱 사전 단계** | 수동 스펙 | -- | -- | -- | 자동화 + 수렴 가속 |
| **단계 전환** | 수동 | 종료 감지 | Plan→Work→Review | -- | 4-Phase FSM 자동 |
| **회로 차단기** | -- | 있음 (커밋 감지) | -- | -- | 대칭 복구 + 예측형 |
| **모델 라우팅** | -- | -- | -- | -- | 적응형 (복잡도 기반) |
| **병렬 빌드** | -- | -- | -- | -- | git worktree 동시 빌드 |
| **런타임 학습** | -- | -- | -- | -- | LEARNINGS.md + 자동 주입 |
| **백프레셔** | 언급 | 속도 제한 | 9개 가드레일 | 컨텍스트 엔지니어링 | 2-훅 (Write + Commit) |
| **예산 강제** | -- | 속도 제한 | -- | -- | 토큰 기반 자동 중단 |
| **체크포인트/복구** | -- | 세션 연속성 | -- | -- | JSON 상태 + 재시작 |
| **다중 에이전트 검증** | -- | -- | Review 단계 | -- | 3-에이전트 (V+C+P) |
| **외부 문서 통합** | -- | -- | -- | -- | context-hub (chub) |
| **의존성** | -- | npm 플러그인 | TypeScript + Node | Python | **Bash only** |

### 성향 레이더: 어디에 무게를 실었는가

위 매트릭스를 5개 축으로 요약하면 harness-for-real의 설계 성향이 드러납니다:

```
                    자율성 (Autonomy)
                         ★★★★★
                           │
                           │
    비용 효율              │              품질 보장
   (Cost Efficiency)       │          (Quality Assurance)
      ★★★★☆ ─────────────┼──────────────── ★★★★★
                           │
                           │
    확장성                 │              단순성
   (Scalability)           │           (Simplicity)
      ★★★★☆ ─────────────┴──────────────── ★★★★☆
```

| 축 | 등급 | 근거 |
|---|---|---|
| **자율성** | 5/5 | 4-Phase FSM 자동 전환, 회로 차단기 자동 복구, 검증→구현 회귀 루프. 스펙 작성 후 인간 개입 0. |
| **품질 보장** | 5/5 | 소크라틱 사전 단계 + 70% 테스트 목표 + 2-훅 백프레셔 + 3-에이전트 검증. 4중 품질 게이트. |
| **비용 효율** | 4/5 | 적응형 Opus/Sonnet 라우팅 + 예산 강제 + 수렴 가속. 3개 프로젝트 모두 $5 이내. Opus 전용 대비 ~5배 절감. |
| **확장성** | 4/5 | git worktree 병렬 빌드 + 의존 그래프 자동 파싱. 단, 병렬 워커 간 머지 충돌 시 순차 폴백. |
| **단순성** | 4/5 | Bash only, 외부 의존성 0. init.sh 한 번으로 어떤 스택이든 설정. 단, loop.sh 754줄은 읽기 쉽지 않음. |

> 다른 하네스들이 특정 축에 집중하는 반면(ralph-claude-code는 회로 차단기, ACE는 컨텍스트 엔지니어링, claude-code-harness는 가드레일), harness-for-real은 **자율성과 품질 보장 두 축을 동시에 최대치로 밀어붙인** 설계입니다. 대가는 loop.sh의 복잡성(754줄)이지만, 사용자 입장에서는 `bash loop.sh` 한 줄이면 됩니다. 복잡성은 하네스 내부에 격리되어 있습니다.

---

## 9. 마무리

### 리서치 → 설계 추적표

| 리서치 사례 | 핵심 교훈 | harness-for-real 반영 |
|------------|----------|---------------------|
| Huntley Ralph Loop (2024 발견, 2025.07 공개) | 기억을 파일에 외부화 | progress.txt + LEARNINGS.md + git |
| 랄프톤 우승팀 (2026.02) | 모호성 제거 + 다중 검증 | Phase 0 소크라틱 + Phase 3 V/C/P 검증 |
| 랄프톤 3등팀 | 비싼 모델은 추론에만 | 적응형 Opus/Sonnet 라우팅 |
| Anthropic 공식 가이드 | 세션 루틴 + 조기 완료 방지 | Session Start Routine + 이중 종료 조건 |
| Moss + Huntley + HumanLayer | 실패만 표면화, 성공은 무음 | 2-훅 백프레셔 (exit 0 무음, exit 2 에러) |
| LangChain (Terminal Bench 52.8→66.5%) | 루프 감지 + 완료 체크리스트 | 회로 차단기 + 예측형 에스컬레이션 |
| Chroma Context Rot + ETH 취리히 (arxiv 2602.11988) | 맥락 방화벽 + 자동생성 악화 | 서브에이전트 격리 + AGENTS.md 수동 작성 강제 |

### 하네스 설계 체크리스트

- [ ] `specs/`에 JTBD별 명세서 작성 — "그리고"가 필요하면 분리
- [ ] 소크라틱 리즈닝으로 명세 모호성 사전 제거 (목표: `AMBIGUITY_SCORE < 0.10`)
- [ ] IMPLEMENTATION_PLAN.md에 의존 그래프 + 병렬 그룹 포함
- [ ] 모델 라우팅: 추론(Opus) + 구현(Sonnet) 분리
- [ ] 백프레셔: 타입체크 + 린트 + 테스트 자동 강제, 성공은 무음
- [ ] 회로 차단기: 갇힌 루프 감지 + 모델 에스컬레이션 + 강제 전환
- [ ] 런타임 학습: LEARNINGS.md 축적 + 다음 반복 자동 주입
- [ ] 체크포인트: 크래시 후 마지막 지점부터 재시작
- [ ] 예산 강제: 토큰 기반 자동 중단 (80% 경고, 100% 중단)
- [ ] AGENTS.md 60줄 미만 유지, 수동 작성

프롬프트 엔지니어링에서 컨텍스트 엔지니어링으로, 다시 하네스 엔지니어링으로. 모델은 매 분기 새로운 것이 나옵니다. 하네스는 쌓입니다. **경쟁은 모델이 아니라 제어 구조에서 갈립니다.**

---

*Source: `blog/posts/harness-frontier/38-harness-engineering-autonomous-coding-agent.md` | Category: [[blog-harness-frontier]]*

## Related

- [[blog-harness-frontier]]
- [[blog-hub]]
- [[geode]]
