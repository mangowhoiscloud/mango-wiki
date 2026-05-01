---
title: GEODE Scaffold — Production System
summary: Claude Code 기반 8-step 개발 워크플로우 스캐폴드. CANNOT/CAN 규칙, Quality Gates, GitFlow, CI Ratchet.
tags: [scaffold, workflow, claude-code, ci, gitflow]
sources: [raw/geode-docs/CLAUDE.md]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.9, inferred: 0.1 }
---

# GEODE Scaffold — Production System

GEODE의 코드를 생산하고 품질을 보장하는 **외부 제어 구조**. Claude Code + CLAUDE.md + 개발 Skills + CI Hooks로 구성.

## Two Control Layers

| Layer | 역할 | 구성 요소 |
|-------|------|----------|
| **Scaffold (생산)** | GEODE의 코드를 만드는 외부 하네스 | Claude Code, CLAUDE.md, 개발 Skills, CI Hooks |
| **Runtime (에이전트)** | 자율 실행하는 내부 시스템 | `while(tool_use)` loop, 56 tools, 20 Runtime Skills, 48 Hooks |

## CANNOT/CAN Rules

**CANNOT (가드레일)이 CAN(자유도)보다 먼저 온다.** (Karpathy P1)

### CANNOT — 절대 금지
- Git: worktree 없이 작업 / main·develop 직접 push / 타 세션 worktree 삭제
- 워크플로우: Plan 없이 구현 착수 (단순 수정 제외)
- 품질: lint/type/test 실패 상태 커밋 / live 테스트 무단 실행
- 문서: 코드 커밋에서 CHANGELOG 누락 / 버전 4곳 불일치
- PR: HEREDOC 미사용 / Why 근거 누락

### CAN — 허용된 자유도
- 단순 버그/문서 수정은 Plan 생략
- 변경 범위 해당 테스트만 선별 실행
- 커밋 메시지 한글/영어 자유

## 8-Step Workflow

```
0. Board + Worktree → 1. GAP Audit → 2. Plan + Socratic Gate
→ 3. Implement + Test → 4. Verify → 5. Docs-Sync
→ 6. PR & Merge → 7. Rebuild → 8. Progress Board
```

See [[geode-unified-scaffold]] for the unified Hook-Driven State Machine enforcement design.

## Quality Gates

| Gate | Command | Target |
|------|---------|--------|
| Lint | `uv run ruff check core/ tests/` | 0 errors |
| Type | `uv run mypy core/` | 0 errors |
| Test | `uv run pytest tests/ -m "not live"` | 3700+ pass |
| E2E | `uv run geode analyze "Cowboy Bebop" --dry-run` | A (68.4) |

## CI Ratchet (5-Job Gate)

모든 PR은 5개 CI 잡 통과 필수. 테스트 수는 단조 증가만 허용 (삭제 시 CI 거부).

| Job | 역할 |
|-----|------|
| pytest | 3700+ 테스트 실행 |
| mypy | Strict mode 타입 체킹 |
| ruff | 린트 + 포매팅 |
| import-order | 임포트 정렬 |
| test-count | 단조 증가 검증 (Ratchet P4) |

## GitFlow

```
feature/<task> ──PR──▸ develop ──PR──▸ main
```

Worktree lifecycle: `alloc → own(.owner) → execute(isolated) → free(worktree remove)`

## Docs-Sync (4곳 버전 동기화)

| 대상 | 파일 |
|------|------|
| CHANGELOG | `CHANGELOG.md` |
| CLAUDE.md | Version, Modules, Tests 수치 |
| README.md | 타이틀 버전, Highlights 수치 |
| pyproject.toml | `version = "x.y.z"` |

## 19 Development Skills

`.claude/skills/`에 위치. Scaffold가 GEODE 개발 시 사용하는 스킬:
- `geode-gitflow`, `geode-changelog`, `geode-verification`, `geode-pipeline`
- `explore-reason-act`, `anti-deception-checklist`, `verification-team`
- `karpathy-patterns`, `openclaw-patterns`, `kent-beck-review`
- `workflow-orchestrator` (unified scaffold)

## Related

- [[geode-architecture]] — 4-Layer Stack
- [[geode-unified-scaffold]] — Hook-Driven State Machine enforcement
- [[geode-hook-production-gap]] — Hook system GAP analysis
- [[hook-claude-code-comparison]] — Claude Code hooks 비교
