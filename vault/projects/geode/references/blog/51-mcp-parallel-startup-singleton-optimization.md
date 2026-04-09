---
title: "MCP 병렬 시작 — 110초에서 15초로, 싱글턴과 ThreadPoolExecutor"
type: reference
category: blog-post
tags: [blog, tools-mcp]
source: "blog/posts/tools-mcp/51-mcp-parallel-startup-singleton-optimization.md"
created: 2026-04-08T00:00:00Z
---

# MCP 병렬 시작 — 110초에서 15초로, 싱글턴과 ThreadPoolExecutor

> 42개 MCP 서버 카탈로그, 11개 활성 연결, 86개 도구.
> 이 모든 것을 켜는 데 110초가 걸렸습니다.
> 싱글턴 패턴으로 좀비 프로세스를 근절하고,
> ThreadPoolExecutor로 부팅을 7배 빠르게 만든 기록입니다.

> Date: 2026-03-23 | Author: geode-team | Tags: mcp, optimization, singleton, threadpool, subprocess, startup

---

## 목차

1. 도입: MCP 부팅이 2분 걸리는 에이전트
2. 문제 분석: 순차 시작 + 다중 인스턴스
3. 해법 1 — 싱글턴으로 좀비 근절
4. 해법 2 — ThreadPoolExecutor 병렬 시작
5. MCP 아키텍처 전체 구조
6. 스레드 안전성 분석
7. 프론티어 비교와 Trade-off
8. 마무리

---

## 1. 도입: MCP 부팅이 2분 걸리는 에이전트

GEODE는 46개 내장 도구 외에 MCP(Model Context Protocol) 서버를 통해 86개 외부 도구를 사용합니다. Steam API로 게임 데이터를 가져오고, Brave Search로 웹을 검색하고, Slack으로 메시지를 보내고, Playwright로 브라우저를 조작합니다. 이 도구들은 각각 독립된 **Node.js 서브프로세스**로 실행됩니다.

문제는 시작 시간이었습니다. `geode serve`를 실행하면 Slack 메시지에 응답하기까지 **110초**를 기다려야 했습니다. 2분 가까이 부팅만 하는 에이전트. 이건 운영 가능한 수준이 아닙니다.

이 글은 두 가지 최적화로 부팅 시간을 **15초로 줄인 과정**을 기록합니다.

---

## 2. 문제 분석: 순차 시작 + 다중 인스턴스

### 병목 1: 순차 연결

각 MCP 서버는 `npx` 명령으로 Node.js 패키지를 실행합니다. 패키지 다운로드 + JSON-RPC 핸드셰이크까지 서버당 약 **10초**가 걸립니다.

```
startup() 호출
  → steam 연결 ............ 10초
  → fetch 연결 ............ 10초
  → brave-search 연결 ..... 10초
  → slack 연결 ............ 10초
  → playwright 연결 ....... 10초
  → ... (11개 서버)
  ────────────────────────
  합계: 11 × 10초 = 110초
```

`_connect_all()` 메서드가 서버 목록을 **순차적으로** 순회했습니다. 각 서버는 독립된 서브프로세스인데, 앞 서버의 연결이 끝나야 다음 서버를 시작했습니다.

### 병목 2: MCPServerManager 다중 인스턴스

`runtime.py`에서 MCPServerManager를 **4곳에서 독립 생성**하고 있었습니다.

```
GeodeRuntime.create()
  ├── _build_signal_adapter()       → MCPServerManager()  ← 인스턴스 A
  ├── _build_notification_adapter() → MCPServerManager()  ← 인스턴스 B
  ├── _build_calendar_adapter()     → MCPServerManager()  ← 인스턴스 C
  └── _build_gateway()              → MCPServerManager()  ← 인스턴스 D
```

같은 MCP 서버(예: Steam)가 인스턴스마다 별도 서브프로세스로 실행되었습니다. 11개 서버 × 4개 인스턴스 = 최대 **44개 프로세스**. 실제로 `ps aux | grep node | wc -l`을 실행하면 **54개 프로세스**가 확인되었고, 메모리 사용량은 **1.6GB**에 달했습니다.

두 번째 문제가 더 심각했습니다. SlackPoller가 사용하는 manager(인스턴스 D)와 NotificationAdapter가 사용하는 manager(인스턴스 B)가 서로 다른 객체였기 때문에, Poller가 연결한 Slack 서버를 NotificationAdapter가 인식하지 못했습니다.

---

## 3. 해법 1 — 싱글턴으로 좀비 근절

### 설계 결정

MCPServerManager는 프로세스 내에서 **단 하나만 존재**해야 합니다. 모든 어댑터(Signal, Notification, Calendar, Gateway)가 같은 인스턴스를 공유하면:

1. 같은 서버의 서브프로세스가 중복 실행되지 않습니다
2. 한 어댑터가 연결한 서버를 다른 어댑터도 사용할 수 있습니다
3. Shutdown 시 모든 서브프로세스를 한 곳에서 정리할 수 있습니다

### 구현

```python
# core/infrastructure/adapters/mcp/manager.py

_singleton_instance: MCPServerManager | None = None
_singleton_lock = __import__("threading").Lock()

def get_mcp_manager(
    config_path: Path | None = None,
    *,
    auto_startup: bool = False,
) -> MCPServerManager:
    """싱글턴 MCPServerManager 반환."""
    global _singleton_instance
    if _singleton_instance is not None:
        if auto_startup and not _singleton_instance._clients:
            _singleton_instance.startup()
        return _singleton_instance
    with _singleton_lock:
        if _singleton_instance is None:
            mgr = MCPServerManager(config_path=config_path)
            if auto_startup:
                mgr.startup()
            _singleton_instance = mgr
        return _singleton_instance
```

**Double-checked locking** 패턴입니다. 첫 번째 `if`는 Lock 없이 빠르게 통과하고, 경쟁 상태가 발생할 수 있는 생성 구간만 Lock으로 보호합니다.

`auto_startup` 파라미터가 핵심입니다. Signal/Notification/Calendar 어댑터는 `auto_startup=False`로 인스턴스만 가져갑니다. 실제 서버 연결은 Gateway 데몬이 `auto_startup=True`로 호출할 때 **한 번만** 발생합니다.

### 적용

```python
# runtime.py — 4곳 모두 동일한 팩토리 호출

# before: 독립 인스턴스 생성
manager = MCPServerManager()

# after: 싱글턴 팩토리
manager = get_mcp_manager()
```

이 한 줄의 변경으로 54개 좀비 프로세스가 11개로 줄었습니다.

---

## 4. 해법 2 — ThreadPoolExecutor 병렬 시작

### 핵심 관찰

각 MCP 서버는 **독립된 서브프로세스**입니다. stdin/stdout 파이프도 별개이고, 공유 상태도 없습니다. 서버 A의 연결이 서버 B에 영향을 주지 않습니다. 순차 실행할 이유가 없었습니다.

### Before: 순차 연결

```python
def _connect_all(self) -> int:
    """모든 서버를 순차적으로 연결."""
    connected = 0
    for server_name in self._servers:
        client = self._get_client(server_name)  # ~10초/서버
        if client is not None:
            connected += 1
    return connected
    # 총 소요: 11 × 10초 = 110초
```

### After: 병렬 연결

```python
def _connect_all(self) -> int:
    """모든 서버를 병렬로 연결.

    ThreadPoolExecutor로 MCP 서브프로세스 연결을 동시 실행.
    서버당 ~10초(npx 시작 + JSON-RPC 핸드셰이크)이므로
    병렬 실행 시 N×10초 → ~10-15초로 단축.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    server_names = list(self._servers.keys())
    if not server_names:
        return 0

    connected = 0
    max_workers = min(len(server_names), 8)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(self._get_client, name): name
            for name in server_names
        }
        for future in as_completed(futures):
            name = futures[future]
            try:
                client = future.result()
                if client is not None:
                    connected += 1
            except Exception:
                log.debug("MCP parallel connect failed: %s", name,
                          exc_info=True)

    return connected
    # 총 소요: max(10초) + 스케줄링 오버헤드 ≈ 15초
```

### max_workers=8의 이유

`min(len(server_names), 8)`로 최대 동시 스레드를 제한합니다.

| max_workers | 장점 | 단점 |
|-------------|------|------|
| 서버 수 전체 | 완전 병렬 | 파일 디스크립터 고갈, OS 부하 |
| 8 | 충분한 병렬성 | 9번째 서버부터 대기 |
| 4 | 보수적 | 불필요한 대기 |

11개 서버 기준으로 8개가 동시에 시작하고, 나머지 3개는 앞 스레드가 끝나는 대로 시작합니다. 파이프 2개(stdin/stdout) × 8개 스레드 = 16개 파일 디스크립터. OS 기본 한도(보통 256~1024)에 충분히 여유가 있습니다.

### 타이밍 분석

```
ThreadPoolExecutor(max_workers=8)
  Thread 1: steam ──────────── 10초
  Thread 2: fetch ──────────── 10초
  Thread 3: brave-search ───── 10초
  Thread 4: slack ──────────── 10초
  Thread 5: playwright ─────── 12초  ← npx 첫 다운로드
  Thread 6: sequential-think ─  8초
  Thread 7: arxiv ──────────── 10초
  Thread 8: linkedin ────────── 9초
  ─── 스레드 해제 후 ───
  Thread 1→ discord ────────── 10초  (steam 완료 후 재사용)
  Thread 6→ telegram ────────── 9초
  Thread 8→ memory ──────────── 8초
  ──────────────────────────────────
  총 소요: max(첫 8개 시간, 나머지 3개 시간) ≈ 15초
```

첫 실행은 npx 패키지 캐싱이 없어 12-15초, 캐시된 이후에는 **10초 이내**로 줄어듭니다.

---

## 5. MCP 아키텍처 전체 구조

병렬 시작은 최적화의 일부입니다. 전체 MCP 아키텍처를 조감하면 6개 레이어로 구성되어 있습니다.

```
┌────────────────────────────────────────────────────────┐
│ Layer 6: GEODE as MCP Server (core/mcp_server.py)      │
│          analyze_ip, quick_score, list_fixtures, ...    │
├────────────────────────────────────────────────────────┤
│ Layer 5: Domain Adapters (13개)                         │
│          Steam, Slack, Discord, Telegram, LinkedIn,     │
│          Calendar, Memory, Brave, Composite×3, Base     │
├────────────────────────────────────────────────────────┤
│ Layer 4: Catalog (catalog.py — 42 서버 엔트리)          │
│          search_catalog(): 이름/태그/설명 가중 검색      │
├────────────────────────────────────────────────────────┤
│ Layer 3: Registry (registry.py — Auto-Discovery)        │
│          DEFAULT_SERVERS(5) + AUTO_DISCOVER(22)          │
│          환경변수 게이트: API 키 있으면 자동 활성화       │
├────────────────────────────────────────────────────────┤
│ Layer 2: Client (stdio_client.py — JSON-RPC Transport)  │
│          subprocess spawn → handshake → tools/list       │
├────────────────────────────────────────────────────────┤
│ Layer 1: Manager (manager.py — Singleton Orchestrator)  │
│          load_config → _connect_all(parallel) → shutdown │
└────────────────────────────────────────────────────────┘
```

### Layer 3: Auto-Discovery 패턴

MCP 서버는 두 등급으로 분류됩니다.

```python
# 항상 활성 (환경변수 불필요)
DEFAULT_SERVERS = (
    "steam", "fetch", "sequential-thinking", "playwright", "arxiv",
)

# 환경변수가 있으면 자동 활성
AUTO_DISCOVER_SERVERS = (
    "brave-search",      # BRAVE_API_KEY
    "slack",             # SLACK_BOT_TOKEN + SLACK_TEAM_ID
    "github",            # GITHUB_PERSONAL_ACCESS_TOKEN
    "linkedin-reader",   # (키 불필요)
    # ... 18개 더
)
```

`~/.geode/.env`에 `BRAVE_API_KEY`를 넣으면 다음 기동 시 Brave Search 서버가 자동으로 연결됩니다. 코드 수정 없이 환경변수만으로 도구가 확장되는 구조입니다.

### Layer 2: 서브프로세스 핸드셰이크

MCP 클라이언트와 서버 사이의 연결 프로토콜입니다.

```
Client                          Server (npx subprocess)
  │                                │
  │  spawn(command, args, env)     │
  │ ─────────────────────────────► │  프로세스 시작
  │                                │
  │  initialize()                  │
  │  {protocolVersion, capabilities}│
  │ ─────────────────────────────► │
  │                                │
  │  notifications/initialized     │
  │ ◄───────────────────────────── │  준비 완료 신호
  │                                │
  │  tools/list                    │
  │ ─────────────────────────────► │
  │                                │
  │  [{name, description, schema}] │
  │ ◄───────────────────────────── │  도구 목록 캐싱
  │                                │
  │  tools/call(name, args)        │
  │ ─────────────────────────────► │  실제 도구 호출
  │  {content: [{text: "..."}]}    │
  │ ◄───────────────────────────── │
```

핸드셰이크가 완료되면 `tools/list` 결과를 캐싱합니다. 이후 도구 호출(`tools/call`)은 캐싱된 목록을 기반으로 라우팅됩니다.

### Layer 5: 도구 정규화

MCP 스펙은 camelCase(`inputSchema`), Anthropic API는 snake_case(`input_schema`)를 사용합니다. Manager가 자동으로 변환합니다.

```python
def _normalise_mcp_tool(raw: dict[str, Any]) -> dict[str, Any]:
    """MCP 도구를 Anthropic API 포맷으로 변환."""
    schema = raw.get("input_schema") or raw.get("inputSchema") or {}
    return {
        "name": raw.get("name", ""),
        "description": raw.get("description", ""),
        "input_schema": schema,
    }
```

이 정규화 덕분에 AgenticLoop는 내장 도구와 MCP 도구를 구분하지 않고 동일한 인터페이스로 사용합니다. LLM 입장에서도 46개 내장 도구와 86개 MCP 도구가 하나의 도구 목록으로 보입니다.

---

## 6. 스레드 안전성 분석

병렬 서브프로세스 시작은 왜 안전한가? 세 가지 관점에서 분석합니다.

### 6.1 독립된 서브프로세스

각 `StdioMCPClient`는 자체 `subprocess.Popen` 인스턴스를 가집니다. 프로세스 간 공유 상태가 없습니다.

```
Thread 1 → StdioMCPClient("steam")  → Popen(stdin_1, stdout_1)
Thread 2 → StdioMCPClient("fetch")  → Popen(stdin_2, stdout_2)
Thread 3 → StdioMCPClient("slack")  → Popen(stdin_3, stdout_3)
```

stdin/stdout 파이프가 스레드마다 독립이므로, JSON-RPC 메시지가 섞일 가능성이 없습니다.

### 6.2 dotenv_cache 초기화 시점

원래 `_dotenv_cache`는 `_resolve_env()` 메서드에서 lazy 초기화되었습니다. 두 스레드가 동시에 `_resolve_env()`를 호출하면 캐시가 중복 초기화될 수 있었습니다.

```python
# before: _resolve_env() 안에서 lazy 초기화 (경쟁 가능)
def _resolve_env(self, env_template):
    if not hasattr(self, "_dotenv_cache"):
        self._dotenv_cache = {}  # 두 스레드가 동시에 실행 가능

# after: __init__()에서 사전 초기화 (안전)
def __init__(self, config_path=None):
    self._dotenv_cache: dict[str, str | None] = {}
```

### 6.3 _clients 딕셔너리 쓰기

`_get_client()`는 연결 성공 시 `self._clients[server_name] = client`를 수행합니다. 서로 다른 key에 쓰므로 충돌이 없습니다. Python의 GIL이 dict 연산의 원자성을 보장합니다.

---

## 7. 프론티어 비교와 Trade-off

### MCP 시작 전략 비교

| 항목 | GEODE (현재) | Claude Code | Codex CLI |
|------|-------------|-------------|-----------|
| 시작 방식 | 병렬 (ThreadPool) | 온디맨드 (첫 호출 시) | 미지원 |
| 싱글턴 | 명시적 팩토리 | 프레임워크 레벨 | N/A |
| 서버 수 | 11 활성 / 42 카탈로그 | 사용자 설정 | N/A |
| 부팅 시간 | ~15초 | ~즉시 (지연 로딩) | N/A |
| 좀비 관리 | SIGTERM + atexit | 프레임워크 관리 | N/A |

Claude Code는 MCP 서버를 **온디맨드로 시작**합니다. 도구가 처음 호출될 때 서버를 연결하므로 부팅 시간이 사실상 0입니다. 대신 첫 호출이 10초 정도 지연됩니다.

GEODE가 사전 연결(eager startup)을 선택한 이유는 **Gateway 데몬** 특성 때문입니다. Slack 메시지에 대한 응답 지연은 사용자 체감에 직접 영향을 줍니다. 첫 메시지에서 10초 추가 지연이 발생하면 "봇이 안 되나?"로 오해할 수 있습니다.

### Graceful Shutdown

MCP 서버는 외부 프로세스이므로 정리하지 않으면 좀비가 됩니다. 2단계 종료를 구현했습니다.

```python
def close(self) -> None:
    """MCP 서버 서브프로세스 graceful 종료."""
    if self._process is not None:
        try:
            self._process.stdin.close()
            self._process.terminate()           # Phase 1: SIGTERM
            self._process.wait(timeout=5)       # 5초 대기
        except subprocess.TimeoutExpired:
            self._process.kill()                # Phase 2: SIGKILL
            self._process.wait(timeout=2)
```

`signal.SIGTERM` + `atexit.register`로 프로세스 종료 시에도 정리됩니다.

```python
def _install_signal_handlers(self) -> None:
    self._prev_sigterm = signal.getsignal(signal.SIGTERM)
    signal.signal(signal.SIGTERM, self._signal_shutdown)
    atexit.register(self._atexit_cleanup)
```

### asyncio를 쓰지 않은 이유

MCP 서버 연결은 I/O-bound 작업입니다. `asyncio.gather()`가 자연스러운 선택처럼 보이지만, GEODE의 AgenticLoop는 동기 코드 기반입니다. 비동기 이벤트 루프를 도입하면:

1. `startup()`을 호출하는 모든 코드가 `async`로 전환되어야 합니다
2. CLI, Runtime, 어댑터 전체에 async 전파가 발생합니다
3. 기존 `subprocess.Popen`을 `asyncio.create_subprocess_exec`로 교체해야 합니다

ThreadPoolExecutor는 기존 동기 코드를 **한 줄도 바꾸지 않고** 병렬화할 수 있었습니다.

---

## 8. 마무리

### 최적화 결과

| 지표 | Before | After | 개선 |
|------|--------|-------|------|
| 부팅 시간 | 110초 | 15초 | **7.3배** |
| MCP 프로세스 수 | 54개 | 11개 | **4.9배 감소** |
| 메모리 사용 | 1.6GB | ~400MB | **4배 감소** |
| 코드 변경량 | - | +45줄 | 싱글턴 + parallel |

### 핵심 원칙

1. **먼저 중복을 제거하라**: 병렬화보다 싱글턴이 먼저입니다. 중복 프로세스를 병렬로 시작하면 더 빨리 좀비가 늘어날 뿐입니다.

2. **독립성을 확인한 후 병렬화하라**: 각 서브프로세스가 독립적이라는 확인 없이 ThreadPoolExecutor를 적용하면 경쟁 조건이 발생합니다. stdin/stdout 파이프 독립성, 공유 상태 부재, dict 쓰기 안전성을 모두 확인한 후 적용했습니다.

3. **동기 코드에는 ThreadPoolExecutor**: asyncio 전파를 피하면서 I/O-bound 병렬화를 달성하는 가장 실용적인 방법입니다.

### 체크리스트

- [x] MCPServerManager 싱글턴 팩토리 (`get_mcp_manager()`)
- [x] ThreadPoolExecutor 병렬 연결 (`max_workers=8`)
- [x] `_dotenv_cache` __init__ 이동 (스레드 안전)
- [x] SIGTERM + atexit graceful shutdown
- [x] Auto-Discovery: 환경변수 기반 서버 자동 활성화
- [x] 도구 정규화: MCP camelCase → Anthropic snake_case
- [ ] 온디맨드 시작 옵션 (Claude Code 패턴)
- [ ] 서버 헬스체크 + 자동 재연결

---

*Source: `blog/posts/tools-mcp/51-mcp-parallel-startup-singleton-optimization.md` | Category: [[blog-tools-mcp]]*

## Related

- [[blog-tools-mcp]]
- [[blog-hub]]
- [[geode]]
- [[geode-tool-system]]
