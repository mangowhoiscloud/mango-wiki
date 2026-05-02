---
title: Socratic Gate (Q1-Q5)
category: developer-guide
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CLAUDE.md:178-196"
external_refs:
---

# Socratic Gate (Q1-Q5)

implement 시작 전 통과 필수 5 질문. 단순 bug/docs 외 모든 변경에 적용.

## 의도

LLM은 plan을 받으면 *바로 코드를 친다*. Socratic Gate는 코드를 치기 전에 5 질문으로 plan을 흔들어 — 정말 필요한가? 정말 가장 단순한가? — 검증한다.

## Q1 — 코드에 이미 존재하는가?

> `grep` / `Explore` 로 검증. 발견되면 plan에서 *제거*.

대표 위반: "Add evaluator for X" plan을 받았는데 이미 `core/verification/X.py` 존재.

## Q2 — 안 하면 무엇이 깨지는가?

> 실제 시나리오. 답 없으면 *제거*.

대표 위반: "abstraction layer 추가" plan에 "코드가 더 깔끔해짐" 만 답하면 fail. "사용자가 X 케이스에서 Y가 안 되는데 Z 때문" 같은 구체 시나리오 필요.

## Q3 — 효과 측정은?

> 회귀 테스트 / 메트릭 / dry-run 출력. 측정 불가면 *연기 (Defer)*.

대표 사례: v0.65.0 manage_login fix는 `tests/test_manage_login_tool.py::TestVerdictPerOwnProvider` 가 측정 도구. fix 제거 시 fail이 재현되는지 검증 (anti-deception).

## Q4 — 가장 단순한 구현은?

> P10 Simplicity Selection. 최소 변경만 채택.

v0.65.0 manage_login fix는 1줄 (`if v.reason is ProfileRejectReason.PROVIDER_MISMATCH: continue`). credential_breadcrumb의 기존 패턴과 동일 — 새 추상화 안 만듦.

## Q5 — 3+ frontier 시스템에서 같은 패턴?

> Claude Code, Codex CLI, OpenClaw, autoresearch 4 시스템. 1개만이면 *필요성 재검증*.

대표 사례:
- ✓ "while(tool_use) primitive" — Claude Code + Codex CLI + OpenClaw 모두 채택
- ✓ "PROVIDER_MISMATCH 필터" — credential_breadcrumb (GEODE 자체) + OpenClaw auth-credential-semantics 비슷한 의도
- ✗ "독자적 verbose dataclass field naming" — 어디에도 없음 → 재검증

## 통과 후

5 모두 통과 → 구현 시작. 하나라도 실패 → 제거 / 연기 / 재계획.

## CANNOT 룰 매핑 (CLAUDE.md:94)

> "No starting implementation without Socratic Gate (except bugs/docs)"

위반 사례: plan 없이 바로 코드 시작. 이는 "이미 존재하는 거 다시 만들기" 와 "필요 없는 추상화 추가" 양쪽 위험 — 즉 LLM 에이전트가 *과잉 생산* 하는 것을 막는 핵심 가드레일.

## 다음

- [[workflow]] — 8-step workflow
- [[verification-team]] — 4 페르소나 cross-check
- [[testing]] — Quality gates
