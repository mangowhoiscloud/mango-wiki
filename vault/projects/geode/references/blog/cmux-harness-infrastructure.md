---
title: "cmux 리서치 — AI 코딩 에이전트를 위한 하네스 인프라스트럭처"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/cmux-harness-infrastructure.md"
created: 2026-04-08T00:00:00Z
---

# cmux 리서치 — AI 코딩 에이전트를 위한 하네스 인프라스트럭처

> Date: 2026-03-21 | Author: rooftopsnow | Tags: cmux, harness, terminal-multiplexer, claude-code, agentmaxxing, API-proxy, multi-agent

---

## 1. cmux란 무엇인가

[cmux](https://github.com/manaflow-ai/cmux)는 **Ghostty 기반 macOS 네이티브 터미널**입니다. Swift/AppKit으로 작성되었으며, libghostty를 사용해 GPU 가속 렌더링을 제공합니다. Electron이 아닌 네이티브 앱이라 빠르고 메모리 사용량이 적습니다.

| 항목 | 값 |
|------|-----|
| GitHub | [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) |
| Stars | 9,015+ |
| Forks | 609 |
| 언어 | Swift |
| 라이선스 | AGPL-3.0 |
| 대상 | macOS 14.0+ (Apple Silicon + Intel) |
| 가격 | 무료, 오픈소스 |

핵심 포지셔닝: **"cmux is a primitive, not a solution."** 특정 워크플로우를 강제하지 않고, 터미널 + 브라우저 + 알림 + 스크립팅 API라는 **합성 가능한 프리미티브**를 제공합니다. 무엇을 만들지는 개발자에게 맡깁니다.

---

## 2. 핵심 기능: 하네스 인프라 관점

cmux를 하네스 엔지니어링 관점에서 분석하면, 4가지 축에서 가치를 제공합니다.

### 2.1 컨텍스트 제어 — 사이드바와 워크스페이스

```
Window
├── Workspace 1 (git branch: feature/auth, PR #42 ✓, port 8080)
│   ├── Pane: Claude Code (🔵 알림 링)
│   └── Pane: 브라우저 (dev server)
├── Workspace 2 (git branch: feature/api, port 3000)
│   └── Pane: Codex
└── Workspace 3 (git branch: fix/css)
    └── Pane: Gemini CLI
```

사이드바의 수직 탭이 각 워크스페이스의 **git 브랜치, PR 상태/번호, 작업 디렉토리, 리스닝 포트, 최근 알림 텍스트**를 실시간으로 표시합니다. 이것은 tmux의 상태바보다 훨씬 풍부한 컨텍스트를 제공합니다.

### 2.2 관측 — 알림 시스템

3가지 알림 소스를 지원합니다:

| 소스 | 방식 | 용도 |
|------|------|------|
| CLI | `cmux notify --title "..." --body "..."` | Claude Code 훅에 연결 |
| OSC 777 | 터미널 이스케이프 시퀀스 | 범용 터미널 알림 |
| OSC 99 | Kitty 프로토콜 (서브타이틀, ID 지원) | 고급 알림 |

에이전트가 입력을 기다리면 해당 pane에 **파란색 알림 링**이 표시되고 탭이 점등됩니다. `Cmd+Shift+U`로 가장 최근 미읽은 알림으로 즉시 이동할 수 있습니다.

**하네스 연결 포인트**: Claude Code의 `hooks` 설정에서 `Stop` 이벤트에 `cmux notify`를 연결하면, 에이전트가 대기할 때 자동으로 알림이 발생합니다.

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "cmux notify --title 'Claude Code' --body '입력 대기 중'"
      }]
    }]
  }
}
```

### 2.3 실행 루프 — CLI & Socket API

cmux는 **Unix 소켓 기반 스크립팅 API**를 제공합니다.

```bash
# 워크스페이스 생성 + 분할 + 에이전트 실행을 스크립트로 자동화
cmux workspace create --name "auth-feature"
cmux split right
cmux send-keys "claude code --resume"
```

소켓 접근 모드:

| 모드 | 설명 |
|------|------|
| Off | 소켓 비활성화 (가장 안전) |
| cmux processes only | cmux 내부 프로세스만 접근 (기본값) |
| allowAll | 모든 로컬 프로세스 접근 허용 |

**사이드바 메타데이터 API**로 프로그래밍 방식의 상태 표시도 가능합니다:
- 상태 pill (텍스트 + 색상)
- 프로그레스 바 (0.0~1.0)
- 로그 엔트리 (info/progress/success/warning/error)

### 2.4 통합 — 내장 브라우저

[agent-browser](https://github.com/vercel-labs/agent-browser)에서 포팅한 스크립터블 API를 가진 내장 브라우저가 있습니다. 에이전트가 접근성 트리를 스냅샷하고, 엘리먼트를 클릭/입력하고, JS를 실행할 수 있습니다.

```bash
# 터미널 옆에 브라우저를 분할하여 dev server 확인
cmux split right --browser --url "http://localhost:3000"
```

이것은 harness-for-real의 E2E verification과 유사한 역할을 합니다 — 빌드 후 실제 앱이 동작하는지 브라우저에서 확인하는 루프를 자동화할 수 있습니다.

---

## 3. "하네스 리서처로 붙는다"는 것의 의미

### 3.1 cmux의 하네스 레이어

cmux 자체는 하네스가 아닙니다. **하네스를 실행하는 인프라**입니다. 계층으로 구분하면:

```
Layer 3: 하네스 (harness-for-real, CLAUDE.md, hooks, skills)
Layer 2: 에이전트 CLI (Claude Code, Codex, Gemini CLI, OpenCode)
Layer 1: 터미널 인프라 (cmux, tmux, Ghostty, iTerm)
Layer 0: OS (macOS)
```

"하네스 리서처로 붙는다"는 것은 **Layer 1에 cmux를 배치하고, Layer 2-3의 에이전트와 하네스를 그 위에서 운영한다**는 의미입니다.

### 3.2 기존 tmux 대비 장점

| 기능 | tmux | cmux |
|------|------|------|
| 알림 | 없음 (macOS 알림 수동 연결) | 내장 (알림 링 + 사이드바 + 패널) |
| 컨텍스트 | 상태바 (1줄) | 사이드바 (branch, PR, port, 알림) |
| 브라우저 | 없음 | 내장 (스크립터블 API) |
| 스크립팅 | tmux CLI | Unix 소켓 + CLI + JSON API |
| 성능 | 터미널 에뮬레이터 의존 | GPU 가속 (libghostty) |
| 에이전트 인식 | 없음 | OSC 9/99/777 알림 자동 인식 |

### 3.3 cmux-agent-mcp — 에이전트가 에이전트를 오케스트레이션

[cmux-agent-mcp](https://glama.ai/mcp/servers/multiagentcognition/cmux-agent-mcp)는 cmux를 **MCP 서버로 노출**하여, 하나의 오케스트레이터 에이전트가 여러 서브에이전트를 관리할 수 있게 합니다.

```
오케스트레이터 (Claude Code)
  → MCP Tool Call: cmux_orchestrate
    → cmux Socket API
      → Workspace 1: Claude Code (auth 작업)
      → Workspace 2: Claude Code (API 작업)
      → Workspace 3: Codex (테스트 작업)
      → Workspace 4: Gemini CLI (문서 작업)
```

81개 MCP 도구가 제공됩니다: 상태 조회, 워크스페이스/윈도우 관리, pane 조작, 텍스트 I/O, 브라우저 자동화, 고수준 런처, 세션 관리.

이것은 GEODE의 SubAgentManager와 비슷한 패턴입니다. 다만 GEODE는 LangGraph 안에서 서브에이전트를 스폰하고, cmux-agent-mcp는 터미널 레벨에서 독립 프로세스를 오케스트레이션합니다.

---

## 4. "API 콜을 우회한다"는 것의 의미

이것이 리서치의 핵심입니다. 두 가지 차원에서 이해해야 합니다.

### 4.1 차원 1: 구독 vs API — 과금 모델의 차이

Claude를 사용하는 두 가지 경로가 있습니다:

| 경로 | 인증 | 과금 | 사용처 |
|------|------|------|--------|
| **Anthropic API** | API Key | 토큰 당 과금 (Opus: $15/75 per 1M) | SDK 기반 애플리케이션 |
| **Claude Code CLI** | OAuth (Max 구독) | 월정액 ($100~$200) | 터미널 에이전트 |

Claude Code Max 구독($200/월)으로 CLI를 실행하면, **토큰 당 비용이 발생하지 않습니다.** cmux에서 Claude Code를 5개 병렬로 실행해도 월정액은 동일합니다.

이것이 "API 콜을 우회한다"의 1차적 의미입니다: **API 과금 경로를 거치지 않고 구독 기반으로 동일한 모델을 사용한다.**

### 4.2 차원 2: Proxy 생태계 — Max 구독을 API처럼 노출

커뮤니티에서 다수의 프록시 프로젝트가 등장했습니다:

| 프로젝트 | 방식 |
|---------|------|
| [claude-code-proxy](https://github.com/meaning-systems/claude-code-proxy) | Claude Code CLI를 OpenAI 호환 API로 노출 (localhost:8080) |
| [CLIProxyAPI](https://rogs.me/2026/02/use-your-claude-max-subscription-as-an-api-with-cliproxyapi/) | OAuth CLI 래퍼를 표준 API로 변환 |
| [opencode-claude-max-proxy](https://github.com/rynfar/opencode-claude-max-proxy) | Anthropic SDK를 브릿지하여 OpenCode에서 Max 사용 |

이 프록시들의 동작 원리:

```
외부 애플리케이션 (REODE, OpenClaw 등)
  → HTTP 요청 (OpenAI 호환 형식)
    → Proxy (localhost:8080)
      → Claude Code CLI (OAuth 인증)
        → Anthropic 서버 (Max 구독 과금)
```

**결과**: API 키 없이, 토큰 당 과금 없이, Max 구독만으로 어떤 애플리케이션이든 Claude를 사용할 수 있었습니다.

### 4.3 Anthropic의 대응 — 2026년 2월 차단

**중요**: Anthropic은 2026년 1월 9일부터 이 사용 패턴을 기술적으로 차단하기 시작했고, 2026년 2월 19일 공식적으로 약관을 업데이트했습니다.

> "OAuth tokens from Free, Pro, and Max plans are intended exclusively for Claude Code and claude.ai. Using OAuth tokens in any other product, tool, or service is not permitted."
>
> — [Anthropic 정책 업데이트 (2026.02.19)](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)

**현재 상태 (2026.03 기준)**: Max 구독의 OAuth 토큰을 Claude Code CLI 이외의 도구에서 사용하는 것은 약관 위반입니다. Proxy 프로젝트들은 대부분 비활성화되었거나 경고 문구를 추가했습니다.

### 4.4 합법적인 "우회" — cmux에서의 정상 사용

cmux 자체는 Proxy가 아닙니다. **터미널**입니다. cmux 안에서 Claude Code CLI를 실행하는 것은 Ghostty나 iTerm에서 실행하는 것과 동일합니다 — 완전히 합법적입니다.

```
cmux (터미널 인프라)
  └── Claude Code CLI (OAuth 인증, Max 구독) ← 정상 사용
       └── Anthropic 서버
```

따라서 "API 콜을 우회한다"의 정확한 해석은:

> **cmux를 하네스 인프라로 사용하여 Claude Code CLI를 다수 병렬 실행하면,
> API 키 기반 토큰 과금을 거치지 않고 Max 구독의 월정액 안에서 운영할 수 있다.
> 이것은 Claude Code CLI의 정상적인 사용이며, Proxy와 달리 약관을 위반하지 않는다.**

---

## 5. Agentmaxxing — 병렬 에이전트 운영 패턴

cmux의 실질적 사용 패턴인 [Agentmaxxing](https://vibecoding.app/blog/agentmaxxing)을 정리합니다.

### 5.1 워크플로우

```
Decompose → Launch → Review → Merge → (repeat)
```

1. **Decompose**: 작업을 독립적인 단위로 분해 (파일/모듈 경계 기준)
2. **Launch**: 각 작업을 별도 git worktree에서 별도 에이전트로 실행
3. **Review**: 에이전트가 완료하면 (알림 링) 결과물 검토
4. **Merge**: 검토 통과 시 main으로 병합

### 5.2 실질적 한계

| 제약 | 수치 | 근거 |
|------|------|------|
| 동시 에이전트 수 | 5~7개 | 랩탑 기준, 리뷰 병목 발생 |
| Claude Code Pro | 2~3개 | Rate limit 3배 소모 |
| Claude Code Max | 4~5개 | Rate limit 여유 있음 |
| 병렬화 ROI 기준 | 30분+ | 이하는 순차 실행이 효율적 |

### 5.3 비용 최적화: 프로바이더 혼합

```
cmux 워크스페이스 배치 예시:
├── WS 1-3: Claude Code (Max 구독, 로컬)
├── WS 4-5: Codex (클라우드, 별도 rate limit)
└── WS 6: Gemini CLI (무료 티어, 단순 작업)
```

서로 다른 프로바이더의 rate limit 풀이 분리되어 있으므로, 혼합 사용 시 전체 처리량을 극대화할 수 있습니다.

---

## 6. 하네스 엔지니어링과의 접점

### 6.1 GEODE/REODE/harness-for-real과의 매핑

| 하네스 기법 | 기존 구현 | cmux 대응 |
|------------|----------|-----------|
| 알림/관측 | Hook Observer (32 events) | 알림 링 + 사이드바 + OSC 시퀀스 |
| 병렬 실행 | SubAgentManager (MAX_CONCURRENT=5) | cmux-agent-mcp (81 tools) |
| 컨텍스트 표시 | Rich console UI | 사이드바 (branch, PR, port) |
| E2E 검증 | JavaAppStartTool (HTTP smoke) | 내장 브라우저 (스크립터블 API) |
| 래칫 게이트 | backpressure.sh / pre-commit-gate.sh | Claude Code hooks + cmux notify |
| 비용 제어 | budget_usd enforcement | 프로바이더 혼합 + 월정액 |

### 6.2 cmux가 풀지 못하는 것

cmux는 "Dumb Platform" 철학을 따릅니다 (Karpathy P8). 프리미티브만 제공하고 로직은 사용자에게 맡깁니다.

따라서 하네스 엔지니어링의 다음 기능들은 cmux 위에 **직접 구축**해야 합니다:

- **4-Phase FSM** (Socratic → Plan → Build → Verify) — cmux는 단계 전환 로직이 없습니다
- **래칫 게이트** (lint → type → test → commit) — Claude Code hooks로 구현 필요
- **회로 차단기** (stuck detection + recovery) — 스크립트로 별도 구현 필요
- **LEARNINGS.md 축적** — 파일 시스템 + 에이전트 프롬프트로 구현 필요
- **수렴 감지** — 에이전트 출력 모니터링 스크립트 필요

> cmux는 하네스의 **인프라 레이어**(Layer 1)입니다.
> 하네스의 **로직 레이어**(Layer 3)는 CLAUDE.md, hooks, skills, 스크립트에 있습니다.

---

## 7. 결론: cmux를 하네스 인프라로 채택할 때의 판단 기준

### 채택 이유 (O)

- macOS에서 다수의 AI 코딩 에이전트를 병렬 운영할 때
- 알림 시스템이 필요할 때 (tmux에는 없음)
- 내장 브라우저로 E2E 검증을 터미널과 통합할 때
- Claude Code Max 구독으로 API 비용을 고정하고 싶을 때
- cmux-agent-mcp로 에이전트 오케스트레이션을 자동화할 때

### 채택하지 않을 이유 (X)

- Linux/Windows 환경 (macOS 전용)
- 단일 에이전트 운영 (cmux의 가치가 줄어듦)
- 프로세스 레벨 격리가 필요할 때 (Docker/Sandbox 미제공)
- 세션 복구가 필수일 때 (live process state 미복원)

### 한 줄 요약

> cmux는 AI 코딩 에이전트의 **터미널 인프라**입니다. Max 구독 기반 Claude Code를 다수 병렬 실행하여 API 과금을 우회하고, 알림/사이드바/브라우저/소켓 API로 하네스를 위한 관측·제어 프리미티브를 제공합니다.

---

## Sources

- [manaflow-ai/cmux GitHub](https://github.com/manaflow-ai/cmux)
- [cmux 공식 문서](https://cmux.com/docs/getting-started)
- [The Zen of cmux](https://cmux.com/blog/zen-of-cmux)
- [Agentmaxxing: Run Multiple AI Agents in Parallel](https://vibecoding.app/blog/agentmaxxing)
- [cmux-agent-mcp](https://glama.ai/mcp/servers/multiagentcognition/cmux-agent-mcp)
- [claude-code-proxy](https://github.com/meaning-systems/claude-code-proxy)
- [CLIProxyAPI](https://rogs.me/2026/02/use-your-claude-max-subscription-as-an-api-with-cliproxyapi/)
- [Anthropic Bans Claude Subscription OAuth in Third-Party Apps](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)
- [CMUX Terminal Agent Command Center](https://www.mejba.me/blog/cmux-terminal-coding-agents)

---

*Source: `blog/research/cmux-harness-infrastructure.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
