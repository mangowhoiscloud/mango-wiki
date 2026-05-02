---
title: Slack Gateway
category: operations
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/server/supervised/slack_poller.py"
  - "core/server/"
external_refs:
---

# Slack Gateway

GEODE serve daemon이 Slack 메시지를 폴링 + 응답하는 단일 채널 게이트웨이. OpenClaw식 multi-channel은 비대상.

## 설정 (`.geode/config.toml`)

```toml
[gateway]
enabled = true

[[gateway.rules]]
type = "slack"
match = { channel = "C012ABC345", users = ["U0XXX"] }
target = { kind = "agentic_loop", model = "claude-sonnet-4-6" }
poll_interval_seconds = 3
dedup_window_seconds = 300
```

## 컴포넌트

| 컴포넌트 | 위치 | 책임 |
|---|---|---|
| `SlackPoller` | `core/server/supervised/slack_poller.py` | MCP 서버로 Slack 폴링 |
| `BasePoller` | (동일 디렉터리) | poll loop, dedup, error handling |
| `ChannelManager` | (동일) | binding rules 매칭 |
| `NotificationPort` | `core/notification/` | 응답 송신 |

## 흐름

```
SlackPoller 시작 (serve daemon 안 thread)
   │
   ├── poll_interval (3s) 마다:
   │     ├── MCP slack 서버에 conversations.history 호출
   │     ├── 새 message 필터 (dedup window 300s)
   │     ├── ChannelManager.match_rules(message) → target 결정
   │     ▼
   ├── target.kind == "agentic_loop":
   │     ├── AgenticLoop 호출 (격리된 sub-context)
   │     ├── 결과 stream
   │     ▼
   └── NotificationPort.send_slack(channel, response)
```

## Dedup

```python
seen = TTLCache(maxsize=1000, ttl=300)
if message.ts in seen:
    return  # already processed
seen[message.ts] = True
```

network glitch 시 같은 메시지 두 번 받아도 중복 처리 안 됨.

## MCP slack 서버 등록

```bash
geode "install Slack MCP server"
# → install_mcp_server tool 호출
# → ~/.geode/mcp/slack/ 에 설치
# → config.toml의 [mcp] 섹션 등록
```

## 인증

Slack OAuth — `~/.geode/auth.toml` 의 `[providers.slack]` 섹션. xoxb- bot token. MCP server가 사용.

## 디버깅

| 증상 | 확인 |
|---|---|
| 메시지 안 와 | `geode /status` — gateway enabled 확인 |
| 응답 없음 | `tail -f ~/.geode/serve.log` — agentic_loop 에러 확인 |
| 중복 응답 | dedup_window_seconds 너무 짧음 → 600+ 권장 |
| Slack 인증 실패 | `~/.geode/auth.toml` slack 토큰 만료 확인 |

geode-serve 스킬 참조.

## 다음

- [[debugging]] — 디버깅 일반
- [[mcp]] — MCP 서버 관리
- [[env-vars]] — gateway 관련 env
