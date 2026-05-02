---
title: Thin CLI vs Serve Daemon
category: architecture
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/cli/__init__.py:987-1018"
  - "core/server/ipc_server/poller.py:1-90"
  - "core/cli/ipc_client.py:1-90"
external_refs:
---

# Thin CLI vs Serve Daemon

GEODE 실행은 두 프로세스로 분리된다 — *thin CLI* 가 입출력만 담당하고, *serve daemon* 이 AgenticLoop + MCP + memory 같은 무거운 상태를 보유한다.

## 분리 이유

| 문제 | 분리 전 | 분리 후 |
|---|---|---|
| 시작 시간 | 매 명령마다 ProfileStore + MCP + skills 부팅 (3-5초) | thin CLI 즉시 (50ms 이내), serve daemon 한 번만 부팅 |
| MCP 서버 종료 | 명령 종료마다 MCP 프로세스 죽임 → 매번 재시작 | serve daemon 살아있는 동안 MCP도 살아있음 |
| 세션 메모리 | 명령마다 새 컨텍스트 | serve daemon에 누적 |
| Hook 등록 | 매번 38+ handler 재등록 | 한 번만 |

## 흐름

```
[CLI] geode "summarize ..."
   │
   ├── ipc_client.start_serve_if_needed()
   │     └── serve daemon 살아있나 확인 (~/.geode/cli.sock)
   │     └── 없으면 새로 launch (background fork)
   │
   ├── ipc_client.connect_to_serve()
   │     └── Unix socket 연결 + JSON RPC
   │
   ├── send {"type": "prompt", "body": "summarize ..."}
   │
   ▼
[Serve] CLIPoller.handle_request()
   │
   ├── AgenticLoop.run(prompt)
   │     ├── (다중 turn iteration)
   │     ├── Tool 호출
   │     └── LLM 호출
   │
   ├── 매 청크마다 send {"type": "stream", "delta": "..."}
   │
   ├── 완료 시 send {"type": "result", "summary": "..."}
   │
   ▼
[CLI] 청크/결과 렌더링
   └── "exit" 시 socket close (serve daemon은 그대로 유지)
```

## Thin CLI (`core/cli/__init__.py:987-1018`)

```python
def main():
    args = parse_args()
    if args.subcommand == "serve":
        run_serve_daemon()       # 직접 daemon 모드
        return
    if not is_serve_running():
        start_serve_daemon_background()
    client = connect_to_serve()
    response = client.send_prompt(args.prompt)
    render(response)
```

핵심: `geode "..."` 는 90% IPC 클라이언트 코드. agentic loop은 serve 쪽에 있음.

## Serve Daemon (`core/server/ipc_server/poller.py:1-90`)

```python
class CLIPoller:
    def serve_forever(self):
        while True:
            conn = self._listen_socket.accept()
            request = json.loads(conn.recv(...))
            if request["type"] == "prompt":
                for delta in self._run_agentic(request["body"]):
                    conn.send(json.dumps({"type": "stream", "delta": delta}))
                conn.send(json.dumps({"type": "result", ...}))
            elif request["type"] == "command":   # /status, /clear, ...
                conn.send(json.dumps(self._handle_command(...)))
```

## 프로토콜 메시지

| Type | Direction | 용도 |
|---|---|---|
| `prompt` | C → S | 자연어 입력 |
| `command` | C → S | 슬래시 명령 |
| `exit` | C → S | 연결 종료 (daemon은 살아있음) |
| `stream` | S → C | 진행 중 청크 |
| `result` | S → C | 완료 결과 |
| `command_result` | S → C | 슬래시 명령 응답 |
| `error` | S → C | 오류 |

## v0.37.1 도입 (queue refactor + thin-only)

CHANGELOG에 따르면 v0.37.1에서 thin-only 패턴 정착. 그 이전엔 thin CLI도 일부 in-process 실행 코드가 남아있었음.

## 다음

- [[4-layer-stack]] — L3 Harness 책임
- [[lifecycle]] — `/stop` `/status`
- [[manage-login]] — manage_login 동작 흐름
