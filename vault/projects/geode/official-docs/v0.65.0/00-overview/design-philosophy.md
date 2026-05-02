---
title: Design Philosophy — CANNOT/CAN
category: overview
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CLAUDE.md:79-145"
  - "core/tools/policy.py:1-80"
  - ".claude/skills/karpathy-patterns/SKILL.md"
external_refs:
  - url: "https://docs.openclaw.ai/concepts/architecture.md"
    pattern: "Policy Chain (가드레일 우선 설계)"
---

# Design Philosophy — CANNOT before CAN

> **CANNOT (가드레일)** 이 **CAN (자유)** 보다 먼저 정의된다. 제약이 품질을 보장한다.
> *(CLAUDE.md:79)*

GEODE의 설계 의사결정은 모두 두 가지 표 — `CANNOT`(절대 금지)과 `CAN`(허용된 자유) — 으로 환원된다. 이는 Karpathy가 autoresearch 시리즈에서 정리한 P1-P10 원칙, OpenClaw의 Policy Chain, Codex CLI의 Sandbox 모델에서 공통으로 관찰되는 패턴이다.

## 왜 가드레일이 먼저인가

LLM은 자유롭게 두면 가짜 성공(deception)을 만들어낸다 — 테스트를 삭제해서 통과시키거나, 메트릭에 placeholder를 박아 마감을 맞추거나, 인접 코드를 마음대로 리팩토링한다. GEODE는 이 위험을 인정하고, **개발 워크플로 자체를 가드레일로 박는다**.

## CANNOT 표 (요약)

`CLAUDE.md:85-106` 에 전체 규칙이 박혀 있다. 핵심 카테고리:

| 영역 | 대표 규칙 |
|---|---|
| Git | worktree 없이 코드 작업 금지 / main·develop 직접 push 금지 (PR 필수) / 다른 세션의 worktree 삭제 금지 |
| Planning | bug·docs 외 Socratic Gate 없이 implement 시작 금지 |
| Quality | lint/type/test 실패한 채 commit 금지 / metric placeholder(XXXX) 금지 / `# type: ignore` 남발 금지 |
| Docs | code commit에 CHANGELOG 누락 금지 / `[Unreleased]` 채로 main 도달 금지 / 4-loc 버전 미스매치 금지 |
| PR | HEREDOC 없는 PR body 금지 / "Why" 없는 PR 금지 / CI 미통과 PR 머지 금지 |

## Wiring Verification — Anti-Disconnection (`CLAUDE.md:108-115`)

| 체크 | 의미 |
|---|---|
| **Read-Write parity** | context 주입 read 경로마다 write 경로(데이터 producer) 존재 여부 양끝 검증 |
| **Hook registration** | handler 정의 ≠ handler 발화. `bootstrap.py`에 등록 필수 |
| **ContextVar injection** | 모든 `get_*()` accessor마다 bootstrap에 `set_*()` 호출 매칭 |
| **Singleton lifecycle** | startup 시 만든 singleton이 mutable 상태 (OAuth token, config) 보유하면 refresh/invalidation 경로 존재 검증 |

## Refactoring Deception Prevention (`CLAUDE.md:117-124`)

| 위반 패턴 | 검출 |
|---|---|
| Partial implementation disguise | plan 항목 부분만 구현하고 완료 표시 |
| Stub disguise | extraction 완료라며 빈 모듈(`pass`만) 남김 |
| Original residue | 신구 위치에 동시 존재 (re-export만 허용) |
| Zero-context verification | 별도 에이전트가 plan + diff 보고 omission/stub 판정 |

## CAN 표 (`CLAUDE.md:126-137`)

CANNOT이 아닌 모든 것은 자유. 명시 자유:

- 단순 bug/docs 수정은 Plan 생략, worktree에서 바로 implement
- Plan 외 개선 발견 시 — 현재 작업 끝낸 후 다음 iteration에서 처리
- 변경 영역만 선택 테스트 → 끝에 전체 suite
- commit 메시지 한국어/영어 자유 (일관성만)
- 결과 동등하면 더 빠른 도구 자유 선택

## Frontier 출처

| 패턴 | 출처 |
|---|---|
| Constraints-first | Karpathy P1 (autoresearch) |
| Policy Chain (6-layer) | OpenClaw `core/tools/policy.py:1-80` 빌림 |
| Sandbox-as-default | Codex CLI |
| Sub-agent 격리 | Claude Code |

## 영향

가드레일은 *속도를 늦추지 않는다* — 오히려 LLM이 잘못된 방향으로 5분 갈 위험을 5초 만에 차단한다. v0.65.0의 `manage_login` 결함 수정([[manage-login]])은 이 검증 룰(Read-Write parity, Wiring Verification)을 통해 발견됐다.

## 다음

- [[workflow]] — 8-step workflow
- [[socratic-gate]] — Q1-Q5 게이트
- [[frontier-comparison]] — 패턴 차용 매트릭스
