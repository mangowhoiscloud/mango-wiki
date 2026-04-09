---
title: "Graceful Degradation — 프론티어 에이전트의 '실패해도 멈추지 않는' 설계"
type: reference
category: blog-post
tags: [blog, llm-resilience]
source: "blog/posts/llm-resilience/40-graceful-degradation-frontier-pattern.md"
created: 2026-04-08T00:00:00Z
---

# Graceful Degradation — 프론티어 에이전트의 "실패해도 멈추지 않는" 설계

> Date: 2026-03-21 | Author: geode-team | Tags: graceful-degradation, MCP, config, frontier, resilience, OpenClaw, Claude-Code

## 목차

1. 도입 — "11/14 서버 연결, 3건 실패. 시스템은 정상"
2. 프론티어 4종의 실패 대응 패턴
3. GEODE 실전: MCP 카탈로그 패키지명 오류 5건
4. 소크라틱 게이트로 "수정하지 않을 것" 결정
5. .env cascade는 왜 과잉 엔지니어링인가
6. 마무리 — 실패를 설계하는 체크리스트

---

## 1. 도입 — "11/14 서버 연결, 3건 실패. 시스템은 정상"

자율 에이전트 시스템에서 외부 의존성은 반드시 실패합니다. npm 패키지가 404를 반환하고, API 키가 만료되고, 서버가 타임아웃됩니다. 문제는 **실패 자체가 아니라 실패가 전체를 중단시키는가**입니다.

GEODE는 14개 MCP(Model Context Protocol) 서버를 동시에 관리합니다. 이번 세션에서 11개가 연결에 성공했고 3개가 실패했습니다. 하지만 사용자는 실패를 인지할 필요 없이 11개 서버의 86개 도구를 정상적으로 사용했습니다.

이 글에서는 프론티어 에이전트 시스템 4종(Claude Code, Codex, OpenClaw, autoresearch)에서 관찰한 **실패 대응 패턴**을 비교하고, "수정하지 않는 것"이 올바른 설계 판단인 경우를 다룹니다.

---

## 2. 프론티어 4종의 실패 대응 패턴

### 2.1 비교 테이블

| 시스템 | 외부 의존성 | 실패 대응 | 핵심 원칙 |
|--------|-----------|----------|----------|
| **Claude Code** | MCP 서버 N개 | 연결 실패 시 해당 서버 스킵, 나머지 정상 | 개별 격리 |
| **Codex** | 샌드박스 도구 | 도구 실패 → 에러 반환 → LLM이 대안 판단 | LLM 위임 |
| **OpenClaw** | 채널 플러그인 7+ | 채널 실패 → 해당 채널만 비활성, 나머지 정상 | 개별 격리 |
| **autoresearch** | 없음 (P1: 패키지 설치 금지) | 외부 의존성 자체를 제거 | 제약으로 해결 |

> 4종 모두 **"개별 실패가 전체를 중단시키지 않는다"**는 원칙을 공유합니다. 차이는 실패 후 복구를 누가 하느냐 — 시스템(Claude Code, OpenClaw) vs LLM(Codex) vs 애초에 실패 불가(autoresearch) — 입니다.

### 2.2 공통 패턴: 3단계 Graceful Degradation

```
Level 0: 정상 동작 (모든 의존성 연결)
Level 1: 부분 동작 (일부 의존성 실패, 나머지 정상)
Level 2: 최소 동작 (핵심 기능만 동작, 부가 기능 비활성)
Level 3: 안전 중단 (핵심 기능도 실패, 명시적 에러 + 상태 보존)
```

Claude Code는 MCP 서버가 전부 실패해도(Level 2) 내장 도구(Read, Write, Bash)로 작업을 계속합니다. GEODE도 동일합니다 — MCP가 전부 실패해도 46개 내장 도구로 파이프라인이 동작합니다.

### 2.3 OpenClaw의 Plugin 격리 패턴

OpenClaw의 채널 플러그인 구조가 가장 명확한 사례입니다.

```
Gateway
├── WhatsApp Plugin  ── OK ──→ 활성
├── Discord Plugin   ── FAIL ─→ 비활성 (로그만)
├── Telegram Plugin  ── OK ──→ 활성
└── Slack Plugin     ── OK ──→ 활성
```

**핵심**: 각 플러그인이 독립 생명주기를 가집니다. Discord가 실패해도 WhatsApp/Telegram/Slack은 영향을 받지 않습니다. 실패는 **로그**에만 기록되고 사용자에게 전파되지 않습니다.

---

## 3. GEODE 실전: MCP 카탈로그 패키지명 오류 5건

### 3.1 발견 과정

MCP 서버 14개를 연결 테스트한 결과, 키를 제공한 8개 서버 중 5개가 **npm 패키지명 오류**로 연결 실패했습니다.

```bash
npm error 404 Not Found - GET https://registry.npmjs.org/@anthropic%2fmcp-server-slack
npm error 404 '@anthropic/mcp-server-slack@*' could not be found
```

### 3.2 원인과 수정

| 카탈로그 기재 | 실제 패키지 | 원인 |
|-------------|-----------|------|
| `@anthropic/mcp-server-slack` | `@modelcontextprotocol/server-slack` | 네임스페이스 변경 |
| `@anthropic/mcp-server-google-maps` | `@modelcontextprotocol/server-google-maps` | 네임스페이스 변경 |
| `bielacki/igdb-mcp-server` | `igdb-mcp-server` | GitHub scope 불필요 |
| `langchain-ai/langsmith-mcp-server` | `langsmith-mcp-server` | GitHub scope 불필요 |
| `e2b-dev/mcp-server` | `@e2b/mcp-server` | 패키지명 변경 |

> MCP 생태계는 아직 초기 단계라 패키지 네임스페이스가 자주 변경됩니다. `@anthropic/` 네임스페이스가 `@modelcontextprotocol/`로 통합된 것이 대표적입니다.

### 3.3 추가 발견: env 키 이름 불일치

```python
# 카탈로그 기재
env_keys=("TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET")

# 실제 서버가 요구
"Missing IGDB credentials. Please set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET"
```

Slack 서버도 `SLACK_BOT_TOKEN`만 기재했지만, 실제로는 `SLACK_TEAM_ID`도 필수였습니다.

### 3.4 StdioMCPClient 연결 안정화

패키지명 수정 후에도 연결이 실패하는 서버가 있었습니다. 원인은 **npx가 패키지를 다운로드하는 동안 init 요청을 보내면 broken pipe가 발생**하는 것이었습니다.

```python
# 수정 전: 즉시 init 전송 → broken pipe
self._process = subprocess.Popen(...)
init_response = self._send_request("initialize", ...)  # 서버 아직 안 뜸

# 수정 후: 서버 시작 대기 + select 타임아웃
self._process = subprocess.Popen(...)
# 서버가 준비될 때까지 대기 (최대 10초)
while time.time() < wait_deadline:
    if self._process.poll() is not None:
        return False  # premature exit 감지
    time.sleep(0.5)
init_response = self._send_request("initialize", ...)
```

> `select()` 기반 읽기 타임아웃도 추가하여, mock 테스트에서는 `TypeError` fallback으로 기존 동작을 유지합니다.

수정 후 결과: **6/14 → 11/14 서버 연결 성공**.

---

## 4. 소크라틱 게이트로 "수정하지 않을 것" 결정

### 4.1 남은 실패 3건에 대한 소크라틱 5문

| 질문 | 답변 |
|------|------|
| Q1. 코드에 이미 있는가? | `_get_client()` 실패 → None → 해당 서버 스킵. **이미 구현** |
| Q2. 안 하면 깨지는가? | 11개 서버의 86개 도구가 정상 동작. **깨지지 않음** |
| Q3. 측정 가능한가? | 해당 없음 (수정 불필요) |

**판정: 수정하지 않음.** discord, fetch, youtube 3개 서버의 npm 패키지가 현재 환경과 호환되지 않는 것은 GEODE의 문제가 아닌 외부 패키지의 문제입니다.

### 4.2 왜 "수정하지 않는 것"이 올바른가

Karpathy P10(Simplicity Selection): **"코드 삭제 > 코드 추가"**. 실패하는 3개 서버를 위해 retry 로직, 대체 패키지 탐색, 호환성 레이어를 추가하면 복잡성만 늘어납니다. 현재의 graceful degradation이 프론티어 4종과 정확히 일치하는 패턴입니다.

```
추가 코드 0줄로 문제 해결 = 최선의 해결
```

---

## 5. .env cascade — 초기 판단 오류와 정정

### 5.1 초기 판단 (오류)

처음에는 "프론티어 4종이 환경변수만 사용하므로, `.env` cascade는 과잉 엔지니어링"이라고 결론 내렸습니다. shell profile에 `export`하라는 접근이었습니다.

**이 판단은 틀렸습니다.** 두 가지 오류가 있었습니다:

1. **프론티어 실측 부재**: 실제 코드베이스를 확인하지 않고 내장 지식만으로 판단
2. **사용자에게 떠넘기기**: 16개 API 키를 shell에 export하라는 건 비현실적

### 5.2 정정: 실제 프론티어 코드베이스 조사

| 시스템 | 글로벌 키 저장소 | 형식 |
|--------|---------------|------|
| **Claude Code** | `~/.claude/.credentials.json` | JSON + Keychain |
| **Codex CLI** | `~/.codex/auth.json` | JSON + Keyring |
| **Aider** | `~/.env` → `<repo>/.env` → `<cwd>/.env` | .env cascade |
| **Continue.dev** | `~/.continue/config.yaml` | YAML |
| **Cline/Roo** | OS Keychain (VS Code SecretStorage) | 암호화 |

> **6종 모두 글로벌 저장소가 있습니다.** "환경변수만 사용"은 사실이 아니었습니다.

### 5.3 올바른 해결 (구현 완료)

Aider 패턴을 따라 3-location cascade를 구현했습니다.

```
우선순위 (높은 → 낮은):
1. 환경변수 (os.environ)
2. CWD/.env (프로젝트별)
3. ~/.geode/.env (글로벌 fallback)
```

`~/.geode/.env`에 API 키를 한 번 저장하면, 어떤 디렉토리에서 GEODE를 실행해도 키에 접근 가능합니다. 프로젝트별 `.env`가 있으면 그것이 우선합니다.

### 5.4 교훈: P10은 "사용자에게 떠넘기기"가 아니다

Karpathy P10(Simplicity Selection)의 올바른 적용: **시스템 내부 복잡성을 줄이는 것**이지, **사용자에게 복잡성을 전가하는 것**이 아닙니다. `config.py`에 3줄 추가하는 것이 사용자에게 16개 환경변수를 export하게 하는 것보다 단순합니다.

---

## 6. 마무리

### 핵심 정리

| 항목 | 판단 | 근거 |
|------|------|------|
| MCP 패키지명 5건 오류 | 수정 | 실제 버그 (npm 404) |
| StdioMCPClient 타임아웃 | 수정 | 실제 버그 (broken pipe) |
| MCP 실패 3건 | **수정 안 함** | Graceful degradation이 정상 동작 |
| ~/.geode/.env cascade | **구현** | 프론티어 6종 모두 글로벌 저장소 보유 (초기 판단 정정) |

### Graceful Degradation 체크리스트

- [ ] 개별 외부 의존성 실패가 전체를 중단시키지 않는가
- [ ] 실패한 의존성이 로그에 기록되는가
- [ ] 사용자가 실패를 인지하지 않아도 핵심 기능이 동작하는가
- [ ] 실패 후 복구 경로가 있는가 (재연결, 대체 서비스, LLM 위임)
- [ ] "수정하지 않는 것"이 올바른 판단인지 소크라틱 게이트를 적용했는가

### 한 줄 요약

> Graceful degradation은 "실패를 방지하는 것"이 아니라 **"실패해도 계속 동작하게 설계하는 것"**입니다. 때로는 코드를 추가하지 않는 것이 최선의 엔지니어링입니다.

---

*Source: `blog/posts/llm-resilience/40-graceful-degradation-frontier-pattern.md` | Category: [[blog-llm-resilience]]*

## Related

- [[blog-llm-resilience]]
- [[blog-hub]]
- [[geode]]
- [[geode-llm-models]]
