---
title: "Streaming IPC — Thin Client에서 Agentic UI 재현하기"
type: reference
category: blog-post
tags: [blog, technical]
source: "blog/posts/technical/streaming-ipc-agentic-ui.md"
created: 2026-04-08T00:00:00Z
---

# Streaming IPC — Thin Client에서 Agentic UI 재현하기

> Date: 2026-03-30 | Author: geode-team | Tags: agent-architecture, ipc, streaming, thin-client, frontier-research

## Table of Contents

1. [문제: `quiet=True`의 대가](#1-문제-quiettrue의-대가)
2. [Frontier 사례 분석](#2-frontier-사례-분석)
3. [설계: Console → Socket Streaming](#3-설계-console--socket-streaming)
4. [구현: 4개 컴포넌트](#4-구현-4개-컴포넌트)
5. [Before / After 비교](#5-before--after-비교)
6. [Thread Safety 고려사항](#6-thread-safety-고려사항)

---

## 1. 문제: `quiet=True`의 대가

v0.37.0에서 thin-only 아키텍처로 전환하면서, IPC 모드의 `SessionMode.IPC`는 `quiet=True`로 설정되었습니다. 이유는 단순했습니다 — serve 프로세스의 stdout에 UI 출력이 나가면 안 되니까.

```python
# shared_services.py
_MODE_DEFAULTS = {
    SessionMode.IPC: {
        "hitl_level": 0,
        "quiet": True,  # ← 이것 때문에
        ...
    },
}
```

하지만 `quiet=True`는 AgenticLoop의 **모든 UI 출력을 억제**합니다:

| 억제된 UI | 역할 |
|-----------|------|
| `▸ tool_name(args)` | 도구 호출 실시간 표시 |
| `✓ tool_name → result` | 도구 결과 |
| `✢ model · ↓in ↑out · $cost` | LLM 토큰 사용량 |
| `⟳ Context compacted: 45 → 12` | 컨텍스트 압축 알림 |
| `● Plan: Berserk` | 계획 단계 표시 |

thin client는 "Thinking..." spinner만 보여주고, 수십 초 후에 최종 결과만 받았습니다. 이전 standalone REPL에서 보이던 실시간 tool call 흐름이 완전히 사라진 것입니다.

## 2. Frontier 사례 분석

구현 전, 4개 프론티어 하네스에서 동일 문제를 어떻게 해결하는지 조사했습니다.

| System | 패턴 | 핵심 |
|--------|------|------|
| **Claude Code** | Direct terminal rendering | daemon/client 분리 없음. CLI 자체가 실행 환경 |
| **Codex CLI** | Item-based streaming | Cloud 모드에서 `message`, `code_change` 등 typed event를 discrete item으로 전달 |
| **OpenClaw** | System Events Queue + WS | in-memory queue (max 20), 250ms coalescing, WebSocket으로 client에 relay |
| **autoresearch** | L1 Block → L2 Extract → L3 Summarize | `> run.log 2>&1` 전체 캡처 후 `grep`으로 metric만 추출 |

### 공통 패턴 (3/4 시스템)

실행 중 **intermediate event를 observer에게 전달**. 방식이 다를 뿐:
- Codex: structured JSON items
- OpenClaw: system events → WebSocket
- autoresearch: file capture → selective extraction

Claude Code만 예외 — thin client 패턴을 사용하지 않습니다.

### 채택 결정

| 패턴 | 결정 | 근거 |
|------|------|------|
| Codex item-based streaming | **Adapt** | 구조화된 JSON 대신 console output streaming (기존 UI 코드 변경 불필요) |
| OpenClaw system events | **Adapt** | Console write를 즉시 IPC relay |
| autoresearch L1 capture | **Adapt** | `quiet=False` + thread-local console redirect |

## 3. 설계: Console → Socket Streaming

핵심 원칙: **기존 `agentic_ui.py` 코드를 1줄도 변경하지 않고**, console redirect만으로 모든 UI를 thin client에 재현.

```
┌─ Thin Client ──────────────────────────┐
│  send_prompt("analyze Berserk")        │
│  ↓ spinner: "Thinking..."              │
│  ← stream: "● AgenticLoop"            │  ← spinner 멈추고 streaming 시작
│  ← stream: "▸ memory_search(...)"     │
│  ← stream: "✓ memory_search → ..."    │
│  ← stream: "✢ opus · ↓1.2k ↑350"     │
│  ← result: {text: "...", rounds: 3}   │  ← 최종 결과 (텍스트만 렌더링)
└────────────────────────────────────────┘
         │ Unix socket (line-delimited JSON)
┌────────┴───────────────────────────────┐
│ CLI Poller (serve)                     │
│  console._file = StreamingWriter(sock) │
│  loop._quiet = False                   │
│  loop.run(text)                        │
│  → console.print() 호출마다            │
│    socket으로 {"type":"stream"} 전송   │
└────────────────────────────────────────┘
```

### IPC Protocol 확장

기존 request-response에 `stream` 타입 추가:

```json
{"type": "stream", "data": "▸ analyze_ip(ip_name=\"Berserk\")\n"}
{"type": "stream", "data": "✓ analyze_ip → S · 81.2\n"}
{"type": "stream", "data": "✢ claude-opus-4-6 · ↓1.2k ↑350 · $0.003\n"}
{"type": "result", "text": "...", "rounds": 3, "tool_calls": [...]}
```

client는 `result` 타입이 올 때까지 `stream` 메시지를 stdout에 write.

## 4. 구현: 4개 컴포넌트

### 4.1 `_StreamingWriter` — Socket File Adapter

```python
class _StreamingWriter:
    """File-like object that relays console writes to a client socket."""

    def __init__(self, client: socket.socket) -> None:
        self._client = client

    def write(self, text: str) -> int:
        if not text:
            return 0
        payload = json.dumps({"type": "stream", "data": text}) + "\n"
        self._client.sendall(payload.encode("utf-8"))
        return len(text)

    def isatty(self) -> bool:
        return True  # Rich가 ANSI 스타일을 적용하도록
```

`isatty() → True`가 핵심입니다. Rich Console은 파일이 TTY가 아니면 스타일을 제거합니다. `True`를 반환하면 ANSI escape code가 보존되어 thin client에서 컬러 출력이 됩니다.

### 4.2 Server-side: `_run_prompt_streaming`

```python
def _run_prompt_streaming(self, text, loop, session_id, client):
    # 1. quiet=False로 전환 (agentic UI 활성화)
    loop._quiet = False
    loop._op_logger._quiet = False

    # 2. console을 StreamingWriter로 redirect
    writer = _StreamingWriter(client)
    console._file = writer
    console._force_terminal = True

    try:
        result = loop.run(text)
    finally:
        # 3. 복원
        console._file = old_file
        loop._quiet = old_quiet

    return {"type": "result", "text": result.text, ...}
```

### 4.3 Client-side: Streaming receiver

```python
def send_prompt(self, text, *, on_stream=None):
    self._send({"type": "prompt", "text": text})
    while True:
        response = self._recv()
        if response.get("type") == "stream":
            if on_stream:
                on_stream(response["data"])
            continue
        return response  # final result
```

### 4.4 Thin loop: Spinner → Stream 전환

```python
_spinner = TextSpinner("Thinking...")
_spinner.start()

def _on_stream(data):
    if not started:
        _spinner.stop()   # 첫 stream 이벤트에서 spinner 멈춤
    sys.stdout.write(data)

response = client.send_prompt(input, on_stream=_on_stream)
```

## 5. Before / After 비교

### Before (v0.37.1)

```
> Berserk IP에 대해 메모리에서 찾아봘
⠋ Thinking...
(... 30초 대기 ...)

Berserk는 S-tier입니다...

✢ claude-opus-4-6 · 1 rounds · 1 tools
```

### After (Streaming IPC)

```
> Berserk IP에 대해 메모리에서 찾아봐
⠋ Thinking...
● AgenticLoop
  ✢ claude-opus-4-6 · ↓46.6k ↑85 · $0.2349
  ⎿ ▸ memory_search(query="Berserk")
  ⎿ ✓ memory_search → # GEODE Project Memory...
  ✢ claude-opus-4-6 · ↓47.4k ↑367 · $0.2460

Berserk는 S-tier입니다. conversion_failure로 분류...
```

## 6. Thread Safety 고려사항

`console`은 global singleton입니다. `_file`을 바꾸면 다른 thread (Slack poller, scheduler)에도 영향을 줍니다.

현재 GEODE에서는 이것이 안전한 이유:

1. **CLI Poller는 single-client**: `listen(1)`, sequential accept loop — 동시에 2개 thin client가 연결되지 않음
2. **다른 poller는 `quiet=True`**: Gateway/Scheduler 모드는 항상 `quiet=True`로 console.print()를 호출하지 않음
3. **Prompt 실행 시간만 redirect**: `loop.run()` 호출 전에 redirect, 직후 복원. 시간 창이 최소화

더 robust한 접근이 필요하면 `threading.local()` 기반 per-thread file override를 console에 추가할 수 있지만, 현재 아키텍처에서는 불필요합니다.

---

## Checklist

- [x] `quiet=True` 문제 식별
- [x] 4 Frontier 사례 조사 (Claude Code, Codex, OpenClaw, autoresearch)
- [x] 3/4 공통 패턴 확인: intermediate event relay
- [x] `_StreamingWriter` 구현 (autoresearch L1 capture + OpenClaw event relay)
- [x] IPC protocol 확장 (`stream` type 추가)
- [x] Client-side streaming receiver + spinner 전환
- [x] 기존 `agentic_ui.py` 코드 변경 0줄
- [x] 3422 tests passed, lint/type 0 errors

---

*Source: `blog/posts/technical/streaming-ipc-agentic-ui.md` | Category: [[blog-technical]]*

## Related

- [[blog-technical]]
- [[blog-hub]]
- [[geode]]
- [[geode-agentic-loop]]
