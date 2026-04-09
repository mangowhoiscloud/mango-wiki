---
title: "Streaming IPC Protocol — serve 프로세스의 UI를 thin client에 재현하기"
type: reference
category: blog-post
tags: [blog, architecture]
source: "blog/posts/architecture/streaming-ipc-protocol-design.md"
created: 2026-04-08T00:00:00Z
---

# Streaming IPC Protocol — serve 프로세스의 UI를 thin client에 재현하기

> Date: 2026-03-30 | Author: geode-team | Tags: agent-architecture, ipc, streaming, thin-client, protocol-design

## Table of Contents

1. [문제 발견 — "아무것도 안 나와요"](#1-문제-발견)
2. [root cause — `quiet=True`의 연쇄 효과](#2-root-cause)
3. [첫 번째 시도 — Raw Console Stream](#3-첫-번째-시도)
4. [색이 안 나온다 — ColorSystem=None](#4-색이-안-나온다)
5. [Spinner가 소실된다 — sys.stdout vs console._file](#5-spinner가-소실된다)
6. [Structured Events로의 전환](#6-structured-events로의-전환)
7. [트레이드오프 — Raw Stream vs Structured Events](#7-트레이드오프)
8. [교훈](#8-교훈)

---

## 1. 문제 발견

v0.37.0에서 thin-only 아키텍처로 전환한 직후였습니다. standalone REPL을 삭제하고 모든 실행을 `geode serve` 데몬으로 통합한 뒤, slash 명령어를 입력했습니다.

```
> /status
>
```

아무것도 안 나왔습니다. `/model`, `/schedule`, `/mcp` — 전부 빈 출력. 25개 이상의 slash 명령어가 전부 침묵했습니다.

원인은 단순했습니다. `_handle_command_on_server()`가 serve 프로세스에서 `_handle_command()`를 호출하면, 모든 `console.print()`가 serve의 stdout으로 갑니다. IPC 응답에는 `{"type": "command_result", "status": "ok"}` — 출력 없이 "성공했다"만 전달.

## 2. root cause — `quiet=True`의 연쇄 효과

slash 명령어는 `capture_output()` context manager로 해결했습니다. Rich Console의 `_file`을 StringIO로 바꿔서 출력을 캡처하고, IPC 응답에 포함시키는 방식.

하지만 더 큰 문제가 있었습니다. AgenticLoop의 전체 UI가 침묵했습니다.

```python
_MODE_DEFAULTS = {
    SessionMode.IPC: {
        "quiet": True,  # ← 이 한 줄이 모든 agentic UI를 죽임
    },
}
```

`quiet=True`는 다음을 전부 억제합니다:
- `● AgenticLoop` 헤더
- `▸ tool_name(args)` 도구 호출
- `✓ tool_name → result` 결과
- `✢ model · ↓in ↑out · $cost` 토큰 사용량
- `⟳ Context compacted: 45 → 12` 컨텍스트 이벤트

thin client에는 "Thinking..." spinner만 돌다가 최종 텍스트만 도착. 이전 REPL에서 보이던 실시간 tool call 흐름이 완전히 사라진 것입니다.

## 3. 첫 번째 시도 — Raw Console Stream

Frontier 사례를 조사했습니다:
- **Codex**: Cloud 모드에서 item-based streaming (typed events)
- **OpenClaw**: System Events Queue → WebSocket relay (250ms coalescing)
- **autoresearch**: `> run.log 2>&1` capture → `grep` extract (배치, 비실시간)

3/4 시스템이 "intermediate event를 observer에게 전달"하는 패턴을 공유했습니다. 방식만 다를 뿐.

가장 빠른 구현은 **Raw Console Stream**이었습니다:

```python
class _StreamingWriter:
    """console.print() 호출마다 socket으로 전송"""
    def write(self, text: str) -> int:
        payload = json.dumps({"type": "stream", "data": text}) + "\n"
        self._client.sendall(payload.encode("utf-8"))
        return len(text)

    def isatty(self) -> bool:
        return True  # Rich가 ANSI 스타일을 유지하도록
```

serve에서 `quiet=False`로 전환하고, `console._file`을 `_StreamingWriter`로 redirect. client는 stream 이벤트를 받아서 `sys.stdout.write(data)`.

이 접근은 **기존 agentic_ui.py 코드를 1줄도 변경하지 않고** thin client에서 전체 UI를 재현했습니다.

하지만 문제가 두 개 더 나타났습니다.

## 4. 색이 안 나온다 — ColorSystem=None

`geode serve`는 보통 `nohup ... > /dev/null 2>&1 &`이나 auto-start로 실행됩니다. 이때 `sys.stdout`은 DEVNULL.

Rich Console은 초기화 시 `_detect_color_system()`을 호출합니다:

```python
def _detect_color_system(self):
    if not self.is_terminal:
        return None  # ← stdout이 TTY가 아니면 색 없음
```

`_color_system = None`이면 Rich는 **모든 ANSI 스타일을 제거**하고 plain text만 출력합니다. `_force_terminal = True`를 나중에 설정해도 `_color_system`은 이미 None으로 고정.

해결: redirect 시 `_color_system`도 함께 override.

```python
@contextmanager
def redirect_console(target):
    old_color = console._color_system
    console._color_system = ColorSystem.TRUECOLOR  # 강제 활성화
    # ...
```

## 5. Spinner가 소실된다 — sys.stdout vs console._file

`TextSpinner`는 `console.print()`가 아닌 `sys.stdout.write()`를 직접 사용합니다:

```python
def _animate(self):
    while self._running:
        sys.stdout.write(f"\r\x1b[2K  {frame} {self._message}")
```

serve에서 `sys.stdout`은 DEVNULL. console을 redirect해도 spinner는 DEVNULL로 갑니다.

해결: `TextSpinner._out()`이 `console.file`을 따라가도록 수정.

```python
@staticmethod
def _out():
    target = console.file
    if target is not None and target is not sys.__stdout__:
        return target
    return sys.stdout
```

이 두 수정으로 Raw Console Stream은 완전히 동작했습니다. 하지만 한계가 보였습니다.

## 6. Structured Events로의 전환

Raw Stream의 한계:
- client가 "지금 이 텍스트가 tool call인지, token usage인지, spinner인지" 구분 불가
- per-tool spinner (실행 중 ⠋ → 완료 시 ✓ in-place 교체)를 구현하려면 client가 의미를 알아야 함
- ANSI escape sequence가 JSON을 통과하면서 terminal 호환성 문제 가능

사용자가 제안했습니다:

> "IPC 측은 시작과 종료 요청만 주고, thin CLI에서 그동안 스피닝을 주다가 완료되면 체크만 딱 뜨면 되지 않아?"

이 한 문장이 전체 설계를 바꿨습니다. serve는 **이벤트만 보내고**, client가 **직접 렌더링**하는 구조.

```json
{"type": "round_start", "round": 1}
{"type": "thinking_start", "model": "claude-opus-4-6", "round": 1}
{"type": "thinking_end"}
{"type": "tool_start", "id": 0, "name": "web_search", "args_preview": "query=\"AI\""}
{"type": "tool_end", "name": "web_search", "summary": "5 results", "duration_s": 2.1}
{"type": "tokens", "model": "opus-4.6", "input": 1200, "output": 350, "cost": 0.003}
{"type": "stream", "data": "..."}  // Rich Panel, Table은 raw 유지
{"type": "result", "text": "...", "rounds": 3}
```

12개 event type. client의 `EventRenderer`가 각각을 직접 ANSI로 렌더링:

```python
class EventRenderer:
    def on_event(self, event):
        handler = getattr(self, f"_handle_{event['type']}", None)
        if handler: handler(event)

    def _handle_tool_start(self, event):
        self._tool_tracker.on_tool_start(event)  # spinner 시작

    def _handle_tool_end(self, event):
        self._tool_tracker.on_tool_end(event)    # in-place ✓

    def _handle_tokens(self, event):
        # ✢ model · ↓1.2k ↑350 · $0.003
```

## 7. 트레이드오프 — Raw Stream vs Structured Events

| | Raw Stream | Structured Events |
|---|---|---|
| **구현 난이도** | 낮음 (redirect만) | 중간 (serve + client 양쪽) |
| **serve 코드 변경** | 0줄 | OperationLogger + AgenticLoop 수정 |
| **client 렌더링** | passthrough (write) | 직접 ANSI 제어 |
| **의미 인식** | 불가 | 가능 (event type별) |
| **per-tool spinner** | 불가능 | 가능 (ToolCallTracker) |
| **in-place update** | 불가능 | 가능 (ANSI cursor-up) |
| **Pipeline Rich Table** | 자연스러움 | raw stream fallback 필요 |
| **새 UI 추가** | serve만 수정 | serve event + client handler |

결론: **hybrid**. Structured events가 주 경로 (tool call, tokens, thinking, context). Rich Panel/Table은 raw stream 유지 (구조화 어렵고 불필요).

## 8. 교훈

1. **`quiet=True`는 feature flag가 아니라 kill switch였다.** 하나의 boolean이 전체 UI 계층을 끌 수 있다는 건, 그 UI가 적절히 계층화되지 않았다는 뜻이었습니다.

2. **serve 프로세스의 stdout은 DEVNULL이다.** 이건 당연한 건데 3번이나 다른 형태로 물렸습니다 (console output, color system, spinner). daemon 프로세스의 stdout 의존성을 전부 끊어야 합니다.

3. **"serve는 이벤트만, client가 렌더링"은 올바른 관심사 분리다.** Claude Code가 직접 렌더링하는 건 daemon이 없기 때문. daemon/client 분리가 있으면, 렌더링 책임도 분리해야 합니다.

4. **사용자의 한 문장이 아키텍처를 바꿨다.** "IPC 측은 시작과 종료만 주고 client에서 스피닝" — 이 제안이 Raw Stream에서 Structured Events로의 전환점이었습니다. 과도기(Raw Stream)는 필요했지만, 최종 형태는 사용자가 정의했습니다.

---

*Source: `blog/posts/architecture/streaming-ipc-protocol-design.md` | Category: [[blog-architecture]]*

## Related

- [[blog-architecture]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
