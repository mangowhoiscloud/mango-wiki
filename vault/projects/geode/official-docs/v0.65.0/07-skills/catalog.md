---
title: Skill Catalog
category: skills
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - ".claude/skills/"
external_refs:
---

# Skill Catalog (24 scaffold)

`.claude/skills/` 의 24개 개발자용 scaffold 스킬. Claude Code 개발 세션에서 사용.

## GEODE 영역별

| Skill | Trigger | 책임 |
|---|---|---|
| `geode-pipeline` | pipeline, graph, topology, send api | StateGraph 패턴, 노드 contract |
| `geode-scoring` | score, psm, tier, rubric, formula | scoring 공식, 14-axis rubric |
| `geode-analysis` | analyst, evaluator, clean context | Analyst/Evaluator 패턴, prompts |
| `geode-verification` | guardrail, bias, cause, decision tree | G1-G4, BiasBuster, Decision Tree |
| `geode-e2e` | e2e, live test, langsmith, tracing | Live E2E 패턴, LangSmith 검증 |
| `geode-gitflow` | branch, git, pr, merge, commit | Gitflow 전략, PR template, CI fix loop |
| `geode-changelog` | changelog, release, version | CHANGELOG 관리, SemVer |
| `geode-serve` | serve, gateway, slack, binding | Slack Gateway 운영 + 디버깅 |

## 디자인 패턴

| Skill | Trigger | 출처 |
|---|---|---|
| `karpathy-patterns` | autoresearch, agenthub, ratchet, context budget | Karpathy P1-P10 |
| `openclaw-patterns` | gateway, session, binding, lane, plugin | OpenClaw 디자인 |
| `frontier-harness-research` | research, gap, frontier, harness, case study | 4-system 비교 연구 |
| `architecture-patterns` | clean architecture, hexagonal, DDD | 백엔드 아키텍처 |

## 검증 / 리뷰

| Skill | Trigger | 책임 |
|---|---|---|
| `verification-team` | verification, review, verify, inspect | 4 페르소나 cross-check |
| `anti-deception-checklist` | deception, fake success, regression | 가짜 성공 검출 |
| `code-review-quality` | quality, SOLID, dead code, resource leak | Python 품질 6-lens |
| `dependency-review` | dependency, import, layer, circular | 6-Layer 의존성 |
| `kent-beck-review` | kent beck, simple design, simplify | Simple Design 4-rule |
| `codebase-audit` | audit, dead code, refactor, god object | 코드 감사 + 리팩토링 |

## 디버깅 / 운영

| Skill | Trigger | 책임 |
|---|---|---|
| `agent-ops-debugging` | debugging, safe default, contextvar, dry-run | 자율 에이전트 운영 디버깅 |
| `model-onboarding` | (모델 추가) | LLM 모델 추가 체크리스트 |

## 작업 흐름

| Skill | Trigger | 책임 |
|---|---|---|
| `explore-reason-act` | explore, reason, root cause | 3-phase explore-reason-act |
| `tech-blog-writer` | blog, posting, tech blog | 기술 블로그 작성 |
| `workflow-orchestrator` | (작업 흐름 조율) | 메타 스킬 |

## 사용

Claude Code 세션에서 사용자가 자연어로 키워드 트리거:

```
사용자: "이 변경에 대해 verification-team 리뷰 부탁"
→ verification-team 스킬 invoke
→ 4 페르소나 (Beck/Karpathy/Steinberger/Cherny) 검증
```

## 추가 / 갱신

`.claude/skills/<name>/SKILL.md` 새로 만들면 자동 인식. 기존 스킬 갱신 시 frontmatter `updated:` 필드 갱신.

## 다음

- [[registry]] — 런타임 SkillRegistry
- [[skill-creator]] — 새 스킬 만들기
