---
title: Policy Chain
category: harness-safety
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/tools/policy.py:64-375"
  - "core/lifecycle/container.py:66-88"
external_refs:
  - url: "https://docs.openclaw.ai/concepts/architecture.md"
    pattern: "Policy Chain 6-layer"
---

# Policy Chain

도구 호출 가부를 6 레이어 우선순위로 결정. OpenClaw 패턴 차용 + GEODE 고유 모드/노드 레이어 추가.

## 6 레이어 (`core/tools/policy.py:64-375`)

| 레이어 | 책임 | priority |
|---|---|---|
| **L1 Profile** | 사용자 개인 선호 (e.g. "memory_save 항상 거부") | 10 |
| **L2 Organization** | 팀/조직 override (e.g. "특정 도구 회사 정책으로 차단") | 5 |
| **L3 Mode-based** | 파이프라인 모드 (dry_run / evaluation / scoring 별 도구 제한) | 20 |
| **L4 Agent-level** | 도구 위험도 분류 (SAFE / WRITE / DANGEROUS) | 30 |
| **L5 Node-scope** | 파이프라인 노드별 allowlist | 40 |
| **L6 Sub-agent** | sub-agent 자동승인 위임 | 50 |

priority 낮음 = 우선. **Profile (L1)** 이 다른 모든 레이어를 override 가능.

## 결정 흐름

```python
def is_allowed(tool_name: str, mode: str, agent_kind: str = "main") -> PolicyDecision:
    decisions = []
    for layer in self.layers:  # L1~L6 순서
        d = layer.evaluate(tool_name, mode, agent_kind)
        if d.is_explicit:    # 명시적 allow/deny
            decisions.append((layer.priority, d))
            break             # 첫 explicit 결정에서 stop
    if not decisions:
        return PolicyDecision.deny("no policy matched")
    return decisions[0][1]
```

`is_explicit=True` 인 가장 priority 낮은 결정이 winning.

## 빌더 (`core/lifecycle/container.py:66-88`)

```python
def build_default_policies():
    return PolicyChain([
        ProfilePolicy.from_file(PROFILE_TOML),
        OrgPolicy.from_file(ORG_TOML),
        ModeBasedPolicy(MODE_RULES),
        AgentLevelPolicy(SAFE_TOOLS, WRITE_TOOLS, DANGEROUS_TOOLS),
        NodeScopePolicy(NODE_ALLOWLISTS),
        SubAgentPolicy(),
    ])
```

`build_6layer_chain()` helper도 동일한 결과.

## PolicyAuditResult

```python
@dataclass
class PolicyAuditResult:
    tool: str
    decision: str       # "allow" / "deny" / "approve_required"
    layer: str          # 결정한 레이어 이름
    rationale: str
```

매 도구 호출에 대한 audit trail 생성. `core/agent/loop.py` 가 하기 hook으로 발화 — POLICY_DECISION_MADE.

## 사용자 override 예

`.geode/profile_policy.toml`:

```toml
[deny]
tools = ["computer", "run_bash"]   # 항상 차단

[allow]
tools = ["web_fetch"]               # 다른 레이어가 deny해도 통과

[approve_always]
tools = ["memory_save"]             # WRITE 등록과 무관하게 항상 명시 승인
```

## L4 — Agent-level (Tier 분류)

`core/agent/safety.py` 의 frozenset 들. 자세한 룰은 [[safety-tiers]].

## L6 — Sub-agent

sub-agent (Task tool) 가 호출하는 도구는 추가 검사:

```python
if agent_kind == "sub_agent":
    if tool_name in SUBAGENT_DENIED_TOOLS:  # manage_login, set_api_key, ...
        return PolicyDecision.deny("sub-agent denied")
    return PolicyDecision.auto_approve()    # 다른 도구는 자동 승인 (격리 효과)
```

main agent는 사용자 승인 필요한 도구도 sub-agent에서는 자동 승인 — 격리된 컨텍스트 활용.

## 다음

- [[approval]] — ApprovalWorkflow
- [[safety-tiers]] — SAFE/WRITE/DANGEROUS
- [[protocol]] — Tool 인터페이스
