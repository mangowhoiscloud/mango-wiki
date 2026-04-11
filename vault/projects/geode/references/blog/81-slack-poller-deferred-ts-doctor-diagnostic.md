---
title: "Slack 메시지가 씹히는 이유 — Deferred-TS 패턴과 Doctor 진단 도구"
type: reference
category: blog-post
tags: [blog, technical]
source: "blog/posts/technical/81-slack-poller-deferred-ts-doctor-diagnostic.md"
created: 2026-04-12T00:00:00Z
---

# Slack 메시지가 씹히는 이유 — Deferred-TS 패턴과 Doctor 진단 도구

> 폴링 기반 Slack 연동에서 메시지가 간헐적으로 누락되는 원인을 추적하고,
> Deferred-TS 패턴으로 수정한 뒤, 첫 유저를 위한 7-point 진단 도구를 만든 과정을 기록합니다.

> Date: 2026-04-12 | Author: geode-team | Tags: slack, polling, message-loss, diagnostic, doctor, gateway

---

## 목차

1. 증상: 응답이 오다가 안 온다
2. 원인 분석: 3가지 결함
3. Fix 1: Deferred-TS 패턴
4. Fix 2: App Mention 정규식
5. Doctor Slack: 7-point 진단 도구
6. 자연어 호출 — AgenticLoop tool 등록
7. 결과와 교훈

---

## 1. 증상: 응답이 오다가 안 온다

GEODE의 Slack 연동은 `geode serve`가 3초 주기로 Slack 채널을 폴링하는 구조입니다. 새 채널을 연결했을 때 처음에는 응답이 잘 오다가, 어느 순간부터 메시지가 씹히는 현상이 보고되었습니다.

핵심 질문: **같은 채널에서 같은 방식으로 멘션하는데 왜 되다가 안 되는가?**

---

## 2. 원인 분석: 3가지 결함

### 2.1 Pre-processing TS 갱신 (가장 위험)

```python
# BEFORE — 문제 코드
all_ts = [m.get("ts", "0") for m in messages if m.get("ts", "0") > oldest]
if all_ts:
    self._last_ts[channel_id] = max(all_ts)  # 처리 전에 ts 갱신!

for msg in messages:
    # ... 처리 ...
```

폴링이 A(18:00:01), B(18:00:02) 두 메시지를 가져오면:
1. `_last_ts`를 B의 ts로 **먼저** 갱신
2. A 처리 시작 (LLM 호출 30초)
3. A 처리 중 예외 발생 → for 루프 탈출
4. B는 영구 누락 — 다음 폴링에서 `oldest = B.ts`이므로 B 이후만 조회

> 처리 시간(5-30초)이 폴링 주기(3초)보다 길기 때문에, 처리 실패 시 ts가 이미 올라가 있어서 메시지가 영구 소실됩니다.

### 2.2 App Mention 정규식 누락

```python
# BEFORE — <@A...> 미매칭
if re.search(r"<@[UB][A-Z0-9]+>", content):
    return True
```

Slack은 멘션을 3가지 형태로 인코딩합니다:
- `<@U...>` — 유저 멘션 (인간 또는 봇 유저)
- `<@B...>` — 레거시 봇 멘션
- `<@A...>` — **앱 멘션** (워크스페이스에 설치된 Slack 앱)

`require_mention = true` 설정에서 `<@A...>` 형태가 매칭되지 않으면, 앱 멘션이 조용히 무시됩니다. 유저는 분명히 @GEODE를 태그했는데 반응이 없습니다.

### 2.3 첫 폴링 시 전체 스킵

```python
if not oldest:
    latest_ts = max(m.get("ts", "0") for m in messages)
    self._last_ts[channel_id] = latest_ts
    return  # 첫 폴에서 모든 메시지 무시
```

`serve` 재시작 시 `_last_ts`가 초기화되므로, 재시작 직후 첫 폴링에서 채널의 모든 기존 메시지를 시드로 스킵합니다. 이 자체는 정상이지만, 재시작 **직전에** 보낸 메시지가 첫 폴에 포함되면 씹힙니다.

---

## 3. Fix 1: Deferred-TS 패턴

핵심 원칙: **ts는 처리 성공 후에만 갱신한다.**

```python
# AFTER — Deferred-TS
new_messages = sorted(
    [m for m in messages if m.get("ts", "0") > oldest],
    key=lambda m: m.get("ts", "0"),  # oldest first
)

for msg in new_messages:
    ts = msg.get("ts", "")
    # ... bot 필터, 빈 메시지 스킵 ...

    try:
        response = self._manager.route_message(inbound)
        if response:
            self._send_response(channel_id, response, thread_ts=...)
    except Exception:
        log.warning("Failed to process ts=%s, will retry next poll", ts)
        break  # 실패 시 나머지 메시지 보존

    # 성공 후에만 ts 갱신
    self._last_ts[channel_id] = ts
```

> `break` 이후 `_last_ts`는 마지막 성공 메시지의 ts에 머물러 있으므로, 다음 폴링에서 실패한 메시지부터 다시 가져옵니다.

정렬도 추가했습니다. Slack API가 메시지를 최신순으로 반환하므로 `sorted(..., key=ts)`로 시간순 정렬하여 순차 처리를 보장합니다.

---

## 4. Fix 2: App Mention 정규식

```python
# BEFORE
re.search(r"<@[UB][A-Z0-9]+>", content)

# AFTER — A 추가
re.search(r"<@[UBA][A-Z0-9]+>", content)
```

`_is_mentioned()`과 `_strip_mentions()` 양쪽 모두 수정. `[UB]` → `[UBA]` 한 글자 추가로 앱 멘션 감지가 해소됩니다.

---

## 5. Doctor Slack: 7-point 진단 도구

메시지 누락 원인을 추적하는 과정에서, **유저가 스스로 연동 상태를 확인할 수 있는 도구**가 필요하다는 것을 깨달았습니다.

### 진단 항목

```
$ geode doctor slack

Slack Gateway Diagnostics
------------------------------
  PASS  SLACK_BOT_TOKEN: xoxb-1234...7890
  PASS  SLACK_TEAM_ID: T05XXXXXX
  PASS  token_validity: workspace=mango-ws, bot=geode
  PASS  bot_scopes: 5 scopes granted
  PASS  config.toml: .geode/config.toml
  PASS  binding:C0ALUA25DKK: require_mention=True
  PASS  geode_serve: PID 85152
  PASS  mcp_slack: MCP server-slack PID 85999
  PASS  ipc_socket: ~/.geode/cli.sock

Status: OPERATIONAL
```

### 7-point 체크 상세

| # | Check | Method | FAIL hint |
|---|-------|--------|-----------|
| 1 | `SLACK_BOT_TOKEN` | `os.environ` | "Add to ~/.geode/.env" |
| 2 | `SLACK_TEAM_ID` | `os.environ` | "Add to ~/.geode/.env" |
| 3 | Token validity | `slack.com/api/auth.test` | "Token expired or invalid" |
| 4 | Bot scopes | `x-oauth-scopes` response header | "Missing: chat:write, ..." |
| 5 | config.toml bindings | `tomllib.load()` + placeholder detection | "Replace C0XXXXXXXXX" |
| 6 | geode serve | `pgrep -f "geode serve"` | "Run: geode serve" |
| 7 | Slack MCP server | `pgrep -f "server-slack"` | "serve starts it automatically" |

> Scope 체크는 `auth.test` 응답의 `x-oauth-scopes` 헤더에서 추출합니다. required(`chat:write`, `channels:history`, `channels:read`)와 optional(`reactions:write`)을 분리하여, optional 누락은 WARN으로 표시합니다.

### Placeholder 감지

`config.toml.example`의 기본값 `C0XXXXXXXXX`를 그대로 사용하면 FAIL:

```
  FAIL  binding:C0XXXXXXXXX: channel_id=C0XXXXXXXXX, require_mention=True
       -> Replace C0XXXXXXXXX with actual channel ID
```

### Slack App Manifest URL

```python
def get_manifest_url() -> str:
    """Return Slack app creation URL with pre-filled manifest."""
    encoded = json.dumps(SLACK_APP_MANIFEST, separators=(",", ":"))
    return f"https://api.slack.com/apps?new_app=1&manifest_json={quote(encoded)}"
```

이 URL을 브라우저에서 열면 scope, 봇 이름, 설명이 미리 채워진 상태로 앱 생성 화면이 나타납니다. Install 한 번이면 끝.

---

## 6. 자연어 호출 — AgenticLoop tool 등록

`doctor_slack`을 tool #57로 `definitions.json`에 등록했습니다:

```json
{
  "name": "doctor_slack",
  "description": "Diagnose Slack gateway connection status. ... Use when the user asks about Slack connection status, or says \"슬랙 연결 상태\", \"check slack\", \"is slack working\".",
  "category": "gateway",
  "cost_tier": "free"
}
```

> `cost_tier: "free"`이므로 HITL 승인 없이 즉시 실행됩니다.

자연어 호출 경로:

```
유저: "슬랙이 왜 응답을 안해?"
  → AgenticLoop가 57개 tool description 스캔
  → "Slack connection status" 매칭 → doctor_slack 선택
  → run_doctor_slack() → 7-point 진단
  → FAIL 항목 기반으로 LLM이 원인 + 해결 방법 안내
```

CLI에서도 동일하게 동작합니다:

```bash
geode doctor slack
```

---

## 7. 결과와 교훈

### 수정 결과

| 항목 | Before | After |
|------|--------|-------|
| 처리 실패 시 메시지 | 영구 누락 | 다음 사이클 재시도 |
| App 멘션 (`<@A...>`) | 무시됨 | 정상 감지 |
| 연동 문제 진단 | 로그 수동 추적 | `geode doctor slack` 7-point 자동 진단 |
| 진단 접근성 | CLI only | CLI + 자연어 ("슬랙 상태 확인해") |

### 교훈

**1. 폴링 시스템에서 ts/offset 갱신 시점은 반드시 처리 성공 후여야 합니다.** "중복 방지"를 위해 먼저 갱신하면, 실패 시 데이터 소실로 이어집니다. 이 패턴은 Kafka consumer의 `auto.commit` 문제와 동일합니다 — `enable.auto.commit=false` + 수동 커밋이 안전합니다.

**2. Slack의 멘션 인코딩은 3가지입니다.** `<@U...>`, `<@B...>`, `<@A...>` — 문서에서 하나만 보고 구현하면 나머지가 누락됩니다. 정규식 테스트에 3가지 형태를 모두 포함해야 합니다.

**3. 진단 도구는 첫 유저 경험의 핵심입니다.** 설정이 잘못되어도 에러 메시지 없이 조용히 실패하는 것이 가장 나쁜 UX입니다. `doctor` 명령은 "뭐가 잘못됐는지"를 즉시 알려주고, "어떻게 고치는지"까지 hint로 제공합니다.

**4. 진단 도구를 tool로 등록하면 LLM이 자율적으로 호출합니다.** "슬랙이 안 돼"라는 모호한 질문에도 LLM이 `doctor_slack`을 선택하고, FAIL 항목을 기반으로 구체적인 해결 방법을 안내합니다. 사람이 로그를 뒤질 필요가 없습니다.

---

*Source: `blog/posts/technical/81-slack-poller-deferred-ts-doctor-diagnostic.md` | Category: [[blog-technical]]*

## Related

- [[blog-technical]]
- [[blog-hub]]
- [[geode]]
- [[geode-gateway]]
