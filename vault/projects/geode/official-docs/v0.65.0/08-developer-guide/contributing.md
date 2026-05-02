---
title: Contributing
category: developer-guide
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CLAUDE.md"
  - "GEODE.md"
external_refs:
---

# Contributing

GEODE에 코드 기여하려면 [[workflow|8-step workflow]] 와 [[testing|quality gates]] 통과 필수.

## 사전 조건

| | |
|---|---|
| 환경 | Python 3.12+, uv, git |
| Repo | clone or fork |
| 가이드 | CLAUDE.md (워크플로우), GEODE.md (런타임 정체성) 정독 |

## 흐름

```
1. Issue / Backlog 항목 확인 (또는 신규 제안)
2. git fetch origin → main/develop 동기 검증
3. worktree 할당 (.claude/worktrees/<task-name>, feature/<branch>)
4. GAP Audit (이미 존재하는지 grep/Explore)
5. Plan + Socratic Gate (Q1-Q5 통과)
6. Implement → 매 변경 후 quality gates
7. Verify (4 sub-step: completeness/correctness/cleanliness + 대규모 시 verification-team)
8. Docs-Sync (CHANGELOG + 4-loc 버전)
9. PR (HEREDOC, Summary/Why/Changes/Verification 4 섹션 필수)
10. CI 5/5 통과 → develop 머지
11. develop → main release PR (별도 사이클)
12. Rebuild (uv tool install -e . --force + serve restart)
```

## CANNOT 룰

CLAUDE.md:79-145 의 절대 금지 룰 — 위반 시 즉시 중지·교정. 핵심:

| 영역 | 룰 |
|---|---|
| Git | worktree 없이 작업 금지, main/develop 직접 push 금지 |
| Planning | bug/docs 외 Socratic Gate 없이 implement 금지 |
| Quality | lint/type/test fail 한 채 commit 금지 |
| PR | HEREDOC 없는 body 금지, "Why" 없는 PR 금지 |
| Docs | CHANGELOG 누락 금지, 4-loc 버전 미스매치 금지 |

## 코드 스타일

- **Python 3.12 typing** — `from __future__ import annotations` + PEP 604 union (`X | Y`)
- **ruff** — `uv run ruff format core/ tests/ plugins/` (auto-fix), `uv run ruff check ...` (lint)
- **mypy** — strict 수준. `# type: ignore` 남발 금지 — 타입 에러는 fix
- **주석 최소** — well-named identifiers + WHY 주석만 (CLAUDE.md guidance)
- **No emojis in prompts/REPL** (memory: feedback_no_emoji_in_prompts)

## 테스트

- **Unit / integration** — `tests/` 4380+ 케이스, `-m "not live"` 로 비-라이브
- **Live 테스트** — `-m live` 5개. 외부 API 호출 — *실행 사용자 명시 동의 필수* (memory: feedback_test_cost)
- **Regression test 필수** — bug fix는 fix 제거 시 fail 하는 테스트 동반

## PR Body

```markdown
## Summary
<1-3 bullet points>

## Why
<Problem statement>

## Changes
| File | Change |
|------|--------|

## Verification
- [ ] ruff check clean
- [ ] mypy clean
- [ ] pytest pass (count)
- [ ] E2E unchanged

## Reference
<Source: frontier codebase, PR, issue, etc.>
```

## CI 5 게이트

| Gate | 명령 |
|---|---|
| Lint & Format | `uv run ruff check ... && uv run ruff format --check ...` |
| Type Check | `uv run mypy core/ plugins/` |
| Test | `uv run pytest tests/ -m "not live"` |
| Security Scan | (의존성 + secret detection) |
| Gate | 종합 합격 |

## 다음

- [[workflow]] — 8-step 상세
- [[socratic-gate]] — Q1-Q5
- [[testing]] — Quality gates
- [[verification-team]] — 4 페르소나
