---
title: Frontier Comparison
category: overview
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - ".claude/skills/frontier-harness-research/SKILL.md"
  - ".claude/skills/karpathy-patterns/SKILL.md"
  - ".claude/skills/openclaw-patterns/SKILL.md"
external_refs:
  - url: "https://docs.openclaw.ai/llms.txt"
  - url: "https://hermes-agent.nousresearch.com/docs/"
  - url: "https://docs.claude.com/en/docs/claude-code"
---

# Frontier Comparison

GEODE는 4개 frontier 시스템에서 패턴을 빌려 합성한다: **Claude Code**(harness), **Codex CLI**(sandbox), **OpenClaw**(gateway+policy), **autoresearch by Karpathy**(constraint-first agent). 가로 비교가 원칙(메모리 룰: feedback_horizontal_layout).

## 매트릭스

| 차원 | Claude Code | Codex CLI | OpenClaw | Hermes | autoresearch | **GEODE** |
|---|---|---|---|---|---|---|
| **목적** | 코딩 보조 | 코드 자동화 | 다중 채널 게이트 | self-learning agent | autonomous ML 실험 | 장기 자율 실행 |
| **분석 도메인** | code | code | chat 라우팅 | open-domain | ML loop | game IP (현재), 일반화 가능 |
| **메인 primitive** | while(tool_use) | sandbox+approve | gateway+lane | skill loop | branchless dumb platform | StateGraph + agentic loop |
| **메모리** | bash session + `~/.claude` | (없음) | per-channel store | persistent + skill catalog | program.md | 5-tier (Org/Project/Session/Vault/Breadcrumb) |
| **검증** | (없음) | sandbox | policy chain | (없음) | ratchet | G1-G4 + BiasBuster + Cross-LLM |
| **자동화 trigger** | hooks (manual) | (없음) | cron+standing orders | skill auto-generate | overnight loop | 58 events + scheduler |
| **다중 LLM** | Anthropic 단일 | OpenAI 단일 | 8+ providers | Anthropic 중심 | (단일) | Anthropic + Codex + PAYG + GLM (4) |
| **Sub-agent** | Task tool | (없음) | plugin | spawn+announce | (없음) | OpenClaw 패턴 빌림 (`core/agent/sub_agent.py`) |
| **Sandbox** | (없음) | OS-level | gateway 격리 | (없음) | constraint loop | Policy Chain 6-layer |

## 차용 패턴 (어떤 패턴을 어디서 빌렸나)

| 패턴 | 출처 | GEODE 위치 |
|---|---|---|
| while(tool_use) primitive | Claude Code | `core/agent/loop.py:162-682` |
| Sub-agent isolation | Claude Code (Task tool) + OpenClaw (Spawn+Announce) | `core/agent/sub_agent.py` + `core/orchestration/` |
| Sandbox-default | Codex CLI | Policy Chain L4 (Agent-level SAFE/WRITE/DANGEROUS) |
| Gateway-centric routing | OpenClaw | `core/server/supervised/slack_poller.py` (Slack 단일) |
| Policy Chain 6-layer | OpenClaw | `core/tools/policy.py:64-375` |
| Lane Queue (per-key serialize) | OpenClaw | `core/orchestration/lane_queue.py:29-80` |
| Plugin SDK | OpenClaw | `core/domains/port.py:18-140` (DomainPort) |
| Hook 4-tier maturity | OpenClaw | `docs/architecture/hook-system.md` (L1 Observe → L4 Autonomy) |
| Constraints-first design | Karpathy P1 | `CLAUDE.md:79-95` (CANNOT/CAN) |
| Ratchet mechanism | Karpathy P4 | `CLAUDE.md` Quality Gates 강제 |
| Context budget | Karpathy P5 | 5-tier memory + system prompt split |
| Single-file constraint | Karpathy | (적용 안 함 — 모놀리식 모듈 허용) |

## 차별점 (GEODE 고유)

위 어디에도 없는 것:

| 기능 | 위치 | 한 줄 |
|---|---|---|
| BiasBuster (6 bias 통계 + LLM) | `core/verification/biasbuster.py:24-100` | confirmation/recency/anchoring/position/verbosity/self_enhancement 검출 |
| Cause-Action Decision Tree | `plugins/game_ip/nodes/synthesizer.py:82-126` | 6 causes → 5 actions 매핑 |
| Calibration via Golden Set | `core/verification/calibration.py:1-80` | fixture 비교 PASS threshold 80.0 |
| Equivalence-class fallback | `core/auth/plan_registry.py:122-206` | provider 동치류 자동 탐색 (SUBSCRIPTION > PAYG) |
| ChatGPT Plus JWT 검증 | `core/auth/oauth_login.py:331` | `chatgpt_plan_type` claim 추출 |

## 결론

GEODE는 frontier 시스템의 *합성체*다 — 한 시스템에서 모두 가져오지 않고, 각 시스템의 잘 검증된 패턴만 골라 합성하면서 본인 영역(검증 게이트, 도메인 플러그인)을 더했다. Q5(`Socratic Gate`)에서 "3+ 시스템 동일 패턴인가?"를 검증 도구로 쓰는 이유다.
