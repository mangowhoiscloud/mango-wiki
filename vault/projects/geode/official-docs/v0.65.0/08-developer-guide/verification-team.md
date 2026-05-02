---
title: Verification Team
category: developer-guide
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - ".claude/skills/verification-team/SKILL.md:1-177"
external_refs:
---

# Verification Team

4 페르소나가 동시에 cross-check 하는 검증 패턴. 대규모 변경 (workflow Step 4d) 에 적용.

## 페르소나 4명

| 이름 | 영역 | 체크리스트 |
|---|---|---|
| **Kent Beck** | TDD / Simple Design | 테스트 우선, DRY, 4 룰 (테스트 통과 / 의도 표현 / 중복 제거 / 노드 최소) |
| **Andrej Karpathy** | Agent constraints | context budget, ratchet, P1-P10 원칙 (constraints-first) |
| **Peter Steinberger** | Gateway / Operations | Session Key 격리, Lane Queue, Plugin 확장성 |
| **Boris Cherny** | CLI agents | AgenticLoop 흐름, HITL 분류, sub-agent 격리, prompt clarity |

## Step 1d (연구 검증) vs Step 3v (구현 검증)

| Step | 시점 | 책임 |
|---|---|---|
| **1d** | GAP Audit 후 | 새 기능 plan이 frontier 시스템에서 검증된 패턴인지 |
| **3v** | Implement 후 | 구현이 4 페르소나 룰 위반 없는지 |

## 우선순위 분류

각 페르소나의 피드백은 P0/P1/P2 로 분류:

| Tier | 의미 | 액션 |
|---|---|---|
| P0 | 머지 차단 | 수정 없이는 PR 불가 |
| P1 | 머지 가능하나 fix-up commit 권고 | 같은 PR에 추가 commit |
| P2 | 후속 작업 | 별도 issue/PR로 추적 |

## v0.65.0 사례 — manage_login fix

규모가 작아 verification team Step 1d / 3v 생략 (단순 1줄 fix + 테스트). Q1-Q5 Socratic Gate 만 통과.

verification team이 발화하는 케이스 예:
- 4-layer 스택 변경
- 새 plugin domain 추가
- LLM provider 신규 등록
- 보안/인증 흐름 변경
- StateGraph 토폴로지 수정

## 호출 (CLAUDE.md 4d)

```
verification-team 스킬 invoke
  ├── Step 1d: 연구 페르소나 (Karpathy + Beck) — plan 검증
  └── Step 3v: 구현 페르소나 (Steinberger + Cherny) — diff 검증
```

각 페르소나 별 출력은 markdown 섹션으로 정리.

## anti-deception checklist 와의 관계

`.claude/skills/anti-deception-checklist/` 와 함께 호출됨. anti-deception은 *행위 자체*를 검사 (테스트 삭제, lint bypass, secret 노출), verification team은 *설계 품질*을 검사. 둘 다 통과해야 4d 완료.

## 다음

- [[workflow]] — 전체 8-step
- [[socratic-gate]] — Q1-Q5
- [[testing]] — Quality gates
