---
title: Glossary
category: reference
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
external_refs:
---

# Glossary

| 용어 | 정의 | 위치 |
|---|---|---|
| **AgenticLoop** | `while(stop_reason == "tool_use")` primitive. LLM 호출 + 도구 실행 + 결과 누적 | `core/agent/loop.py:162-682` |
| **Analyst** | 도메인 파이프라인의 분석가 노드. game_ip는 4종 (game_mechanics/player_experience/growth_potential/discovery) | `plugins/game_ip/nodes/analysts/` |
| **Anti-Deception** | 가짜 성공 방지 룰셋. 테스트 삭제 / metric placeholder / 부분 구현 disguise 검출 | `CLAUDE.md:117-124`, `.claude/skills/anti-deception-checklist/` |
| **Approval Workflow** | WRITE/DANGEROUS 도구 호출 시 사용자 승인 + auto-approve/deny 임계값 | `core/agent/approval.py:34-200` |
| **BiasBuster** | 6종 LLM 편향 검출 (confirmation/recency/anchoring/position/verbosity/self_enhancement) | `core/verification/biasbuster.py:24-100` |
| **Breadcrumb (credential)** | LLM-readable 인증 노트. auth 실패 시 다음 turn 컨텍스트에 주입 | `core/auth/credential_breadcrumb.py:47-150` |
| **Cache_control (ephemeral)** | Anthropic 5분 prompt cache. v0.65.0에서 messages-level 4 슬롯 활용 | `core/llm/providers/anthropic.py:172-228` |
| **CANNOT/CAN** | GEODE 설계 dichotomy. 가드레일 우선, 자유는 그 다음 | `CLAUDE.md:79-145` |
| **ChatGPT-Account-ID** | OAuth JWT의 `chatgpt_account_id` 클레임. Codex API quota 식별 헤더 | `core/llm/providers/codex.py:37-51` |
| **Chronological recency** | LLM이 최근 데이터에 과의존하는 편향. BiasBuster의 recency_bias 검사 | `core/verification/biasbuster.py` |
| **CredentialType** | OAUTH(0) / TOKEN(1) / API_KEY(2). 우선순위 있는 enum | `core/auth/profiles.py:21-34` |
| **Cross-LLM verification** | 다른 모델로 일관성 cross-check. Krippendorff Alpha 0.67+ acceptable | `core/verification/cross_llm.py:1-80` |
| **DomainPort** | 16-method Protocol. 도메인 plugin이 구현해야 하는 인터페이스 | `core/domains/port.py:18-140` |
| **EligibilityResult** | profile 평가 verdict. eligible(bool) + reason(ProfileRejectReason) + detail | `core/auth/profiles.py:51-72` |
| **Equivalence class** | 같은 모델 family의 provider variant 묶음. SUBSCRIPTION 우선 정렬 | `core/auth/plan_registry.py:209-230` |
| **Frontier comparison** | 4 시스템 (Claude Code, Codex CLI, OpenClaw, autoresearch) 패턴 비교 | `.claude/skills/frontier-harness-research/` |
| **G1-G4 (Guardrails)** | Schema, Range, Grounding, Consistency 4단계 자동 검증 | `core/verification/guardrails.py:13-80` |
| **GAP Audit** | 구현 전·후 *이미 존재하는지* 검증 단계. workflow Step 1+4a | `CLAUDE.md:160-175` |
| **HookEvent** | 58 events enum. Pipeline/Node/Analysis/Verification/L4 Automation/Memory/LLM/Tool/Context/Session/Model/SubAgent/Recovery/Turn | `core/hooks/system.py:28-140` |
| **L4 Automation** | StuckDetector / DriftDetection / OutcomeTracking / Snapshot / Feedback / ModelRegistry | `core/automation/` |
| **Lane Queue** | Per-session-key serialization + global max-N concurrent | `core/orchestration/lane_queue.py:29-80` |
| **manage_login** | LLM-agentic 인증 진단/조작 도구. /login slash 명령의 tool counterpart | `core/cli/tool_handlers.py:882-955` |
| **MCP** | Model Context Protocol. 외부 stdio JSON-RPC 도구 서버 | `core/mcp/` |
| **PSM** | Propensity Score Matching. ATT(Average Treatment Effect) + Z-value + Rosenbaum Gamma | `plugins/game_ip/nodes/scoring.py` |
| **Plan** | SUBSCRIPTION/OAUTH_BORROWED/PAYG/CLOUD_PROVIDER 통합 dataclass | `core/auth/plans.py:56-82` |
| **PolicyChain** | 6-layer 도구 접근 제어. Profile / Org / Mode / Agent / Node / Sub-agent | `core/tools/policy.py:64-375` |
| **PROMPT_CACHE_BOUNDARY** | system prompt 의 STATIC/DYNAMIC 분리 마커 | `core/agent/system_prompt.py` |
| **PROVIDER_MISMATCH** | profile.provider ≠ requested provider. UI noise 표시 (실제 차단 아님) | `core/auth/profiles.py:44` |
| **Profile rotation** | 같은 plan 내 여러 profile LRU 순환. error 발생 시 cooldown | `core/auth/profile_rotator.py` |
| **Ratchet** | 한 번 통과한 quality gate는 절대 후퇴 안 함. Karpathy P4 | `CLAUDE.md` Quality Gates |
| **resolve_routing** | 모델 → (Plan, Profile) 4단계 탐색 함수 | `core/auth/plan_registry.py:122-206` |
| **SkillRegistry (런타임)** | 4-tier discovery (Bundled / Global / Project / Extra). 3-tier disclosure | `core/skills/skills.py:123-192` |
| **Skill (scaffold)** | `.claude/skills/*/SKILL.md` 24개 개발자용 patterns | `.claude/skills/` |
| **Socratic Gate** | Q1-Q5 5 질문. implement 시작 전 통과 필수 | `CLAUDE.md:180-188` |
| **State (LangGraph)** | 그래프 노드 간 전달되는 통합 상태 dict. reducer로 N→1 병합 | `core/graph.py` |
| **StuckDetector** | 7200초 이상 turn 진행 시 알림 + kill | `core/automation/` |
| **Tier (game_ip)** | S(80+), A(60-79), B(40-59), C(<40). final_score 기반 분류 | `plugins/game_ip/scoring_constants.py` |
| **Verification team** | Beck/Karpathy/Steinberger/Cherny 4 페르소나 cross-check | `.claude/skills/verification-team/` |
| **Worktree** | git worktree. 모든 코드 작업의 isolation unit. `.owner` 로 소유 표시 | `CLAUDE.md:144-159` |
