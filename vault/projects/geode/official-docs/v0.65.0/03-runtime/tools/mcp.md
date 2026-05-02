---
title: MCP Servers
category: runtime-tools
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/mcp/manager.py"
  - "core/mcp/registry.py"
external_refs:
  - url: "https://modelcontextprotocol.io/"
    pattern: "Model Context Protocol spec"
---

# MCP Servers

[Model Context Protocol](https://modelcontextprotocol.io/) — Anthropic이 표준화한 stdio JSON-RPC 도구 서버 인터페이스. GEODE는 외부 MCP 서버를 stdio fork하여 그들의 도구를 GEODE 도구 카탈로그에 합친다.

## MCPServerManager (`core/mcp/manager.py`)

```python
class MCPServerManager:
    def start(self, server_name: str) -> None: ...     # subprocess fork + handshake
    def stop(self, server_name: str) -> None: ...      # SIGTERM
    def list_tools(self, server_name: str) -> list: ... # JSON-RPC tools/list
    def call_tool(self, server_name: str, tool: str, args: dict) -> dict: ...
```

stdio JSON-RPC 프로토콜:

```
[GEODE] → server stdin: {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"X","arguments":{...}}}
[server] → server stdout: {"jsonrpc":"2.0","id":1,"result":{...}}
```

각 MCP 서버는 별도 subprocess. 시작 시 GEODE가 fork → handshake (`initialize` method) → tools/list 등록.

## MCPServerRegistry (`core/mcp/registry.py`)

Anthropic의 live registry API에서 사용 가능한 MCP 서버 목록 캐싱:

```python
registry.fetch_registry()         # 외부 API 호출 (TTL 24h)
registry.search_registry("slack") # 키워드 검색
```

오프라인 / API 실패 시 stale 캐시 사용 (`MCP_REGISTRY_CACHE` 경로).

## 등록 흐름

```
1. /mcp 슬래시 명령 또는 install_mcp_server tool
2. registry.search_registry("<keyword>") → 후보 목록
3. 사용자 선택 → manifest 다운로드
4. ~/.geode/mcp/<name>/ 에 저장
5. config.toml의 [mcp] 섹션에 등록
6. 다음 serve 재시작 시 manager.start() 자동 호출
```

## 도구 통합

MCP 서버의 도구들은 GEODE의 ToolRegistry에 prefix 추가하여 등록:

```
mcp__<server>__<tool>     # 예: mcp__slack__send_message
```

LLM이 호출 시 GEODE manager가 해당 server로 JSON-RPC 위임.

## Safety / Policy

MCP 도구도 [[policy-chain]] 6-layer 적용. 외부 서버이므로 보수적으로 처리:

- 기본 카테고리: WRITE 또는 DANGEROUS
- ApprovalWorkflow 필수
- sub-agent는 거부

## Lifecycle

| 이벤트 | 동작 |
|---|---|
| `geode serve` 시작 | 모든 등록 MCP 서버 fork |
| 서버 응답 timeout | restart (max 3회) |
| 서버 crash | restart (max 3회) → 그 후 disable |
| `geode /stop` | 모든 MCP 서버 SIGTERM |
| `geode /uninstall` | `~/.geode/mcp/` 삭제 |

## 다음

- [[protocol]] — Tool 인터페이스
- [[safety-tiers]] — 도구 위험도
- [[manage-login]] — install_mcp_server 도구
