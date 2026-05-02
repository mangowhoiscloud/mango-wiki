---
title: 8-Step Workflow
category: developer-guide
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CLAUDE.md:139-308"
external_refs:
---

# 8-Step Workflow

GEODE 개발은 8 단계 워크플로우로 박혀 있다. CANNOT 룰이 각 단계에 매핑되어 위반 시 즉시 차단.

```
0. Board + Worktree
1. GAP Audit
2. Plan + Socratic Gate
3. Implement+Test
4. Verify (Implementation GAP Audit)
5. Docs-Sync
6. PR
7. Rebuild
8. Board
```

## Step 0 — Board + Worktree

```bash
git fetch origin
# main/develop 동기 검증
git worktree add .claude/worktrees/<task-name> -b feature/<branch> origin/develop
echo "session=$(date -Iseconds) task_id=<task-name>" > .claude/worktrees/<task-name>/.owner
```

`.owner` 는 gitignored (gitignore의 `/.owner` rule). worktree path 가 곧 checkout root. 다른 세션의 worktree 삭제 금지 (`.owner` mismatch 검사).

## Step 1 — GAP Audit

새 기능 구현 전에 *이미 존재하는지* 검증. plan 항목 각각에 대해:

```
grep -rn "<symbol>" core/ plugins/ tests/
```

3분류:

| 분류 | 액션 |
|---|---|
| Fully Implemented | plan에서 제거, `_done/` 으로 이동 |
| Partially Implemented | 빠진 부분만 구현 |
| Not Implemented | 구현 대상 |

## Step 2 — Plan + Socratic Gate

단순 bug/docs는 생략 가능. 그 외 모든 implement는 Q1-Q5 통과 필수.

| # | 질문 | Fail 시 |
|---|---|---|
| Q1 | 코드에 이미 존재하는가? | Remove |
| Q2 | 안 하면 무엇이 깨지는가? (실제 시나리오) | 답 없으면 Remove |
| Q3 | 효과 측정은? (테스트/메트릭/dry-run) | 측정 불가면 Defer |
| Q4 | 가장 단순한 구현은? (P10 Simplicity) | 최소 변경만 채택 |
| Q5 | 3+ frontier 시스템에서 같은 패턴? | 1개만이면 필요성 재검증 |

## Step 3 — Implement → Unit Verify

코드 변경 → 3 quality gate 반복:

```bash
uv run ruff check core/ tests/ plugins/      # 0 errors
uv run mypy core/ plugins/                    # 0 errors
uv run pytest tests/ -m "not live"            # 4380+ pass
```

Step 2에서 Q3 으로 정한 측정 도구 (회귀 테스트) 는 *fix 제거 시 fail* 하는지 검증해야 진짜 회귀 테스트 (anti-deception).

## Step 4 — Verify (Implementation GAP Audit)

4 sub-step:

| Sub | 검사 |
|---|---|
| 4a Completeness | Plan vs Diff cross-check (omission, stub disguise, partial impl, original residue) |
| 4b Correctness | quality gates + E2E (`uv run geode analyze "Cowboy Bebop" --dry-run` → A 68.4) |
| 4c Cleanliness | dead code, test deletion, lint bypass, secret 노출 |
| 4d Verification team | (대규모 변경만) `verification-team` + `anti-deception-checklist` 스킬 |

## Step 5 — Docs-Sync

| 동기 대상 | 검증 |
|---|---|
| 4-loc 버전 | CHANGELOG / CLAUDE.md / README.md (en+ko) / pyproject.toml |
| 메트릭 | Tests, Modules, Commands — 측정값 |
| uv.lock | self-package 버전 자동 추격 |

Versioning: New feature = MINOR, Bug fix = PATCH, Docs only = none.

## Step 6 — PR & Merge

`feature → develop → main` 흐름. HEREDOC PR body 필수. CI 5/5 (Gate / Lint / Security / Test / Type).

PR template 필수 섹션: Summary / Why / Changes / Verification. develop→main PR은 Summary + Verification만 약식 가능.

## Step 7 — Rebuild & Restart

main 머지 후:

```bash
kill $(ps aux | grep "geode serve" | grep -v grep | awk '{print $2}')
uv tool install -e . --force
uv sync
geode about    # 버전 검증
geode serve &
```

## Step 8 — Progress Board

main에서 board 업데이트. Backlog → In Progress → Done.

## 위반 시

CANNOT 룰 위반은 즉시 중지. 예: lint fail 상태로 commit 시도 → 차단. PR body HEREDOC 누락 → reviewer 피드백 + 재작성. 직접 main push 시도 → CI 거부 + revert.

## 다음

- [[socratic-gate]] — Q1-Q5 게이트 상세
- [[verification-team]] — 4 페르소나 검증
- [[testing]] — Quality gates
- [[contributing]] — 코드 기여 룰
