---
title: Tool Protocol
category: runtime-tools
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/tools/base.py:34-68"
  - "core/tools/registry.py"
  - "core/tools/definitions.json"
external_refs:
---

# Tool Protocol

GEODE 도구는 단일 Protocol 인터페이스를 따른다. `core/tools/base.py:34-68`:

```python
@runtime_checkable
class Tool(Protocol):
    name: str
    description: str
    parameters: dict
    def execute(self, **kwargs) -> dict: ...
```

## 12 카테고리 (`VALID_CATEGORIES`)

| 카테고리 | 예 |
|---|---|
| `discovery` | search_ips, list_ips |
| `analysis` | analyze_ip, compare_ips |
| `memory` | memory_search, memory_save |
| `planning` | create_plan, approve_plan |
| `external` | web_fetch, general_web_search |
| `model` | switch_model, set_api_key, manage_login |
| `data` | generate_data, batch_analyze |
| `scheduling` | schedule_job |
| `profile` | profile_show, profile_update |
| `notification` | trigger_event |
| `calendar` | (예약) |
| `task` | rate_result, accept_result |

## Cost Tier

| Tier | 의미 |
|---|---|
| `cheap` | <100 토큰 |
| `medium` | 100-1000 토큰 |
| `expensive` | 1000+ 토큰 또는 외부 API 비용 |

## definitions.json

각 도구 메타데이터 SOT. 형식:

```json
{
  "name": "manage_login",
  "description": "Unified credentials/plans command...",
  "category": "model",
  "cost_tier": "cheap",
  "input_schema": {
    "type": "object",
    "properties": {
      "subcommand": {"type": "string", "enum": ["status", "add", "oauth", "set-key", "use", "route", "remove", "quota"]},
      "args": {"type": "string"}
    }
  }
}
```

## ToolRegistry (`core/tools/registry.py`)

도구 등록 + 조회 + Policy 통합:

```python
registry.register(tool)
registry.search(query)              # ToolSearchTool 메타-도구
registry.get_filtered(mode="...")   # PolicyChain.filter_tools 적용
```

ContextVar `_tool_executor_ctx` 로 활성 ToolExecutor 주입 (`set_tool_executor()` / `get_tool_executor()`).

## 다음

- [[safety-tiers]] — SAFE/WRITE/DANGEROUS 분류
- [[mcp]] — MCP 외부 도구
- [[policy-chain]] — 6-layer 접근 제어
