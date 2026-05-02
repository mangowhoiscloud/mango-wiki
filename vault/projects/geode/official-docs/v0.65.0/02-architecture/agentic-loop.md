---
title: Agentic Loop
category: architecture
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/agent/loop.py:162-682"
  - "core/agent/safety.py:11-100"
  - "core/agent/approval.py:34-200"
external_refs:
  - url: "https://docs.claude.com/en/docs/claude-code"
    pattern: "while(tool_use) primitive"
---

# Agentic Loop

`core/agent/loop.py:162-682` `AgenticLoop` 클래스가 GEODE의 자율 실행 primitive. Claude Code의 *while(tool_use)* 패턴을 그대로 채택하되, GEODE 고유의 hook/safety/memory 통합이 더해진 형태.

## 의사 코드

```python
def run(self, prompt: str) -> RunResult:
    messages = self._initial_messages(prompt)
    response = self.llm_adapter.invoke(messages)
    iter = 0
    while response.stop_reason == "tool_use" and iter < self.max_iterations:
        for tc in response.tool_calls:
            self._fire_hook(TOOL_USE_RECEIVED, tc)
            result = self.tool_executor.execute(tc)
            self._fire_hook(TOOL_RESULT_RECEIVED, result)
            messages.append({"role": "tool", "content": result})
        response = self.llm_adapter.invoke(messages)
        iter += 1
    return self._summarize(response, messages)
```

## 종료 조건

| `stop_reason` | 의미 |
|---|---|
| `end_turn` | LLM이 더 이상 도구 호출 불필요 |
| `max_tokens` | 출력 토큰 한도 도달 |
| (loop break) | `iter >= max_iterations` (기본값 설정 위치 확인 필요) |

## Hook 통합

각 turn에서 발화되는 이벤트 (`core/hooks/system.py:28-140` 의 58 events 중):

| 이벤트 | 시점 | 핸들러 예 |
|---|---|---|
| `AGENT_TURN_STARTED` | 사용자 입력 수신 | RunLog (P50) |
| `TOOL_USE_RECEIVED` | LLM이 도구 호출 결정 | Notification, Approval |
| `TOOL_APPROVAL_REQUESTED` | WRITE/DANGEROUS 도구 | ApprovalWorkflow |
| `TOOL_APPROVAL_GRANTED` / `_DENIED` | 사용자 응답 | RunLog |
| `TOOL_RESULT_RECEIVED` | 도구 실행 완료 | StuckDetector (P40), ContextAction |
| `AGENT_TURN_ENDED` | LLM 응답 완료 | TurnAutoMemory (P85), Journal |

## Safety 게이팅

도구 실행 전 4-단계 통과 필요 (`core/tools/policy.py:64-375` 참조):

1. **PolicyChain.is_allowed(tool, mode)** — 6-layer 정책 통과
2. **Tier 분류 검사** (`core/agent/safety.py`):
   - SAFE_TOOLS (27): 자동 승인
   - WRITE_TOOLS (16): ApprovalWorkflow
   - DANGEROUS_TOOLS (2): 항상 명시 승인
3. **Sub-agent 거부 목록** (`SUBAGENT_DENIED_TOOLS`) — sub-agent에서 호출 시 차단
4. **Auto-recovery 제외 목록** (`_EXCLUDED_TOOLS`) — error_recovery에서 자동 재시도 안 함

## Approval Flow

WRITE 도구 거부 시 fallback hint 제공 (`core/agent/approval.py:34-56`):

| 거부된 도구 | Fallback 힌트 |
|---|---|
| `memory_save` | "Try `memory_search` first" |
| `note_save` | "Try reading existing notes" |
| `profile_update` | "Use `profile_get` to inspect" |
| `manage_login` | "Run `/login` slash command" |

3회 연속 같은 도구 승인 → 자동 승인. 3회 연속 거부 → 자동 거부.

## 컨텍스트 관리

매 turn 마다:
- **Context overflow 5-layer guard** — 200K 토큰 한도 접근 시 단계적 압축
- **Cache control** — Anthropic 어댑터는 system block + 마지막 3 message에 `cache_control: ephemeral` 적용 (`core/llm/providers/anthropic.py:172-228`)
- **5-tier memory** — Organization → Project → Session → Vault → Breadcrumb 순서로 prompt에 합쳐짐

## 다음

- [[approval]] — Approval Workflow
- [[safety-tiers]] — 도구 위험도 분류
- [[5-tier-context]] — 메모리 계층
