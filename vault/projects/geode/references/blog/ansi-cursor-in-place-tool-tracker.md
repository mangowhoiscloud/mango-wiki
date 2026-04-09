---
title: "ANSI Cursor로 Per-Tool Spinner 구현하기"
type: reference
category: blog-post
tags: [blog, technical]
source: "blog/posts/technical/ansi-cursor-in-place-tool-tracker.md"
created: 2026-04-08T00:00:00Z
---

# ANSI Cursor로 Per-Tool Spinner 구현하기

> Date: 2026-03-30 | Author: geode-team | Tags: terminal, ansi, ux, thin-client, tool-tracking

## Table of Contents

1. [요구사항 — 병렬 tool call의 실시간 상태](#1-요구사항)
2. [왜 Rich Live를 안 쓰나](#2-왜-rich-live를-안-쓰나)
3. [ANSI Cursor-Up 방식](#3-ansi-cursor-up)
4. [ToolCallTracker 구현](#4-toolcalltracker)
5. [IPC 이벤트와의 연결](#5-ipc-이벤트와의-연결)

---

## 1. 요구사항

LLM이 한 턴에 4개 도구를 병렬 호출하면:

```
▸ web_search(query="AI trends")          ⠋    ← 실행 중
▸ google_trends(ip_name="LangGraph")     ⠋    ← 실행 중
✓ search_jobs → 3 results                (1.3s) ← 완료
▸ arxiv_search(query="agents")           ⠋    ← 실행 중
```

각 줄이 독립적으로 spinner → ✓ 전환. 완료순이 입력순과 다름 (2번이 먼저 끝날 수 있음).

## 2. 왜 Rich Live를 안 쓰나

Rich의 `Live` context manager는 이 문제를 깔끔하게 풀 수 있습니다. 하지만 두 가지 제약:

1. **IPC 구조**: Rich Live는 `console` 객체에 직접 접근해야 함. thin client의 console과 serve의 console은 다른 프로세스.
2. **혼합 출력**: tool call 사이에 token usage (`✢`) 줄이 끼어들 수 있음. Live display와 일반 print의 혼합이 깨짐.

결론: **직접 ANSI 제어**.

## 3. ANSI Cursor-Up 방식

핵심 이스케이프 시퀀스:

| Code | 효과 |
|------|------|
| `\033[nA` | 커서를 n줄 위로 이동 |
| `\033[2K` | 현재 줄 전체 삭제 |
| `\r` | 커서를 줄 시작으로 |

4줄을 렌더링한 뒤 2번째 줄을 업데이트하려면:

```
1. \033[4A     ← 4줄 위로
2. line 1 출력 + \n
3. line 2 출력 (수정됨) + \n
4. line 3 출력 + \n
5. line 4 출력 + \n
```

`_redraw()` 메서드가 매번 **전체 블록을 다시 그립니다**. 개별 줄 업데이트보다 단순하고, race condition 없음.

## 4. ToolCallTracker 구현

```python
class ToolCallTracker:
    def __init__(self):
        self._tools: list[dict] = []   # [{name, args, done, duration, ...}]
        self._line_count = 0            # 현재 출력된 줄 수
        self._running = False           # spinner 스레드 활성 여부

    def on_tool_start(self, event):
        self._tools.append({...})
        self._redraw()
        if not self._running:
            # spinner 스레드 시작 (0.08s 간격 redraw)
            self._running = True
            Thread(target=self._animate, daemon=True).start()

    def on_tool_end(self, event):
        # name으로 찾아서 done=True 설정
        for t in self._tools:
            if t["name"] == name and not t["done"]:
                t["done"] = True
                t["duration"] = time.monotonic() - t["start_time"]
                break
        self._redraw()
        if all(t["done"] for t in self._tools):
            self._running = False  # spinner 종료

    def _redraw(self):
        # 이전 출력 지우기
        if self._line_count > 0:
            sys.stdout.write(f"\033[{self._line_count}A")

        # 각 tool 줄 렌더링
        for t in self._tools:
            if t["done"]:
                sys.stdout.write(f"\033[2K  ✓ {t['name']} → {t['summary']} ({t['duration']:.1f}s)\n")
            else:
                frame = FRAMES[int(time.monotonic() * 12) % 10]
                sys.stdout.write(f"\033[2K  ▸ {t['name']}({t['args']}) {frame}\n")

        self._line_count = len(self._tools)
```

핵심 설계 결정:

1. **전체 블록 redraw**: 개별 줄 업데이트 대신 전체를 매번 다시 그림. 코드 단순, 상태 관리 쉬움.
2. **spinner 스레드**: 0.08s (12.5 FPS) 간격으로 `_redraw()` 호출. braille dot 애니메이션.
3. **all done 감지**: `on_tool_end`에서 전체 완료 확인 → spinner 스레드 종료.
4. **threading.Lock**: `_tools` 리스트 접근 보호. `on_tool_start`/`on_tool_end`/`_animate` 3개 스레드 동시 접근 가능.

## 5. IPC 이벤트와의 연결

serve의 `OperationLogger`가 IPC writer를 감지하면 structured event 전송:

```python
# OperationLogger.log_tool_call()
writer = getattr(_ipc_writer_local, "writer", None)
if writer is not None:
    writer.send_event("tool_start", id=tool_id, name=name, args_preview=args_str)
    return True
# else: console.print (direct mode fallback)
```

client의 `EventRenderer`가 이벤트를 `ToolCallTracker`로 라우팅:

```python
class EventRenderer:
    def _handle_tool_start(self, event):
        self._tool_tracker.on_tool_start(event)

    def _handle_tool_end(self, event):
        self._tool_tracker.on_tool_end(event)
```

**stream vs event 경계**: tool call/result는 structured event. token usage, context event도 structured event. Rich Panel/Table (pipeline output)만 raw stream.

serve가 의미를 가진 이벤트를 보내고, client가 직접 ANSI로 렌더링하는 구조. daemon/client 분리에서도 Claude Code 수준의 terminal UX를 달성하는 방법입니다.

---

*Source: `blog/posts/technical/ansi-cursor-in-place-tool-tracker.md` | Category: [[blog-technical]]*

## Related

- [[blog-technical]]
- [[blog-hub]]
- [[geode]]
- [[geode-tool-system]]
